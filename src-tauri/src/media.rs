use image::codecs::gif::{GifEncoder, Repeat};
use image::{Frame, ImageBuffer, Rgba};
use std::io::{Cursor, Write};
use tauri_plugin_shell::ShellExt;

#[tauri::command]
pub async fn fetch_image_as_data_url(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("Gagal download gambar (HTTP {})", resp.status()));
    }

    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/png")
        .to_string();

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    use base64::Engine;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", content_type, b64))
}

#[tauri::command]
pub async fn encode_photos_to_gif(
    photos: Vec<Vec<u8>>,
    frame_delay_ms: u32,
) -> Result<Vec<u8>, String> {
    if photos.is_empty() {
        return Err("Daftar foto kosong".to_string());
    }

    let mut buf: Vec<u8> = Vec::new();
    {
        let mut encoder = GifEncoder::new(Cursor::new(&mut buf));
        encoder
            .set_repeat(Repeat::Infinite)
            .map_err(|e| e.to_string())?;

        for jpeg_bytes in photos {
            let img = image::load_from_memory(&jpeg_bytes).map_err(|e| e.to_string())?;
            let resized = img.resize(480, 720, image::imageops::FilterType::Lanczos3);
            let rgba: ImageBuffer<Rgba<u8>, Vec<u8>> = resized.to_rgba8();
            let frame = Frame::from_parts(
                rgba,
                0,
                0,
                image::Delay::from_saturating_duration(std::time::Duration::from_millis(
                    frame_delay_ms as u64,
                )),
            );
            encoder.encode_frame(frame).map_err(|e| e.to_string())?;
        }
    }
    Ok(buf)
}

pub async fn encode_jpeg_frames_to_video_internal(
    app: &tauri::AppHandle,
    frames: Vec<Vec<u8>>,
    fps: u32,
) -> Result<Vec<u8>, String> {
    if frames.is_empty() {
        return Err("Daftar frame kosong".to_string());
    }

    let tmp_dir = std::env::temp_dir().join(format!("liveview_clip_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;

    for (i, frame) in frames.iter().enumerate() {
        let path = tmp_dir.join(format!("f_{:04}.jpg", i));
        std::fs::File::create(&path)
            .and_then(|mut f| f.write_all(frame))
            .map_err(|e| e.to_string())?;
    }

    let out_path = tmp_dir.join("clip.mp4");
    let input_pattern = tmp_dir.join("f_%04d.jpg");

    let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?;
    let output = sidecar
        .args([
            "-y",
            "-framerate",
            &fps.to_string(),
            "-i",
            input_pattern.to_str().unwrap(),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            out_path.to_str().unwrap(),
        ])
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(bytes)
}

#[tauri::command]
pub async fn encode_jpeg_frames_to_video(
    app: tauri::AppHandle,
    frames: Vec<Vec<u8>>,
    fps: u32,
) -> Result<Vec<u8>, String> {
    encode_jpeg_frames_to_video_internal(&app, frames, fps).await
}

#[tauri::command]
pub async fn compose_template_video(
    app: tauri::AppHandle,
    clips: Vec<Vec<u8>>,
    slot_rects: Vec<(f64, f64, f64, f64)>,
    canvas_width: u32,
    canvas_height: u32,
    background_jpeg: Option<Vec<u8>>,
) -> Result<Vec<u8>, String> {
    if clips.is_empty() {
        return Err("Tidak ada klip untuk digabung".to_string());
    }
    if clips.len() != slot_rects.len() {
        return Err("Jumlah klip tidak sesuai jumlah slot template".to_string());
    }

    let tmp_dir = std::env::temp_dir().join(format!("compose_{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;

    let canvas_w = (canvas_width / 2) * 2;
    let canvas_h = (canvas_height / 2) * 2;

    let mut input_args: Vec<String> = Vec::new();
    let mut filter = String::new();
    let mut clip_index_offset = 0;

    if let Some(bg_bytes) = background_jpeg {
        let bg_path = tmp_dir.join("bg.png");
        std::fs::write(&bg_path, bg_bytes).map_err(|e| e.to_string())?;
        input_args.push("-loop".into());
        input_args.push("1".into());
        input_args.push("-i".into());
        input_args.push(bg_path.to_str().unwrap().into());
        filter.push_str(&format!(
            "[0:v]scale={}:{}[base];",
            canvas_w, canvas_h
        ));
        clip_index_offset = 1;
    } else {
        filter.push_str(&format!(
            "color=c=white:s={}x{}[base];",
            canvas_w, canvas_h
        ));
    }

    for (i, clip) in clips.iter().enumerate() {
        let p = tmp_dir.join(format!("clip_{}.mp4", i));
        std::fs::write(&p, clip).map_err(|e| e.to_string())?;
        input_args.push("-i".into());
        input_args.push(p.to_str().unwrap().into());
    }

    let mut last_label = "base".to_string();
    let total_slots = slot_rects.len();

    for (i, (x, y, w, h)) in slot_rects.iter().enumerate() {
        let input_idx = i + clip_index_offset;
        let scaled_label = format!("v{}", i);
        let sw = (((*w as i32) / 2) * 2).max(2);
        let sh = (((*h as i32) / 2) * 2).max(2);
        let sx = *x as i32;
        let sy = *y as i32;

        filter.push_str(&format!(
            "[{}:v]scale={}:{}:force_original_aspect_ratio=increase,crop={}:{},setsar=1,setpts=PTS-STARTPTS[{}];",
            input_idx,
            sw,
            sh,
            sw,
            sh,
            scaled_label
        ));
        let next_label = format!("tmp{}", i);
        let shortest_str = if i == total_slots - 1 {
            ":shortest=1"
        } else {
            ""
        };
        filter.push_str(&format!(
            "[{}][{}]overlay={}:{}{}[{}];",
            last_label, scaled_label, sx, sy, shortest_str, next_label
        ));
        last_label = next_label;
    }

    // Remove the trailing semicolon from the last filter if present
    if filter.ends_with(';') {
        filter.pop();
    }

    let out_path = tmp_dir.join("final.mp4");
    let sidecar = app.shell().sidecar("ffmpeg").map_err(|e| e.to_string())?;

    let mut args: Vec<String> = vec!["-y".into()];
    args.extend(input_args);
    args.extend([
        "-filter_complex".into(),
        filter,
        "-map".into(),
        format!("[{}]", last_label),
        "-c:v".into(),
        "libx264".into(),
        "-pix_fmt".into(),
        "yuv420p".into(),
        "-movflags".into(),
        "+faststart".into(),
        out_path.to_str().unwrap().into(),
    ]);

    let output = sidecar
        .args(args)
        .output()
        .await
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr).to_string();
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return Err(err_msg);
    }

    let bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&tmp_dir);
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_encode_photos_to_gif() {
        // Create 2 simple mock RGB images and convert to JPEG bytes
        let mut photos = Vec::new();
        for color in [[255u8, 0, 0], [0, 255u8, 0]] {
            let img: image::RgbImage = image::ImageBuffer::from_pixel(100, 100, image::Rgb(color));
            let mut jpeg_buf = Vec::new();
            image::codecs::jpeg::JpegEncoder::new(&mut jpeg_buf)
                .encode_image(&img)
                .unwrap();
            photos.push(jpeg_buf);
        }

        let gif_bytes = encode_photos_to_gif(photos, 200).await.unwrap();
        assert!(!gif_bytes.is_empty());
        // Verify GIF header starts with "GIF89a" or "GIF87a"
        assert_eq!(&gif_bytes[0..3], b"GIF");
    }
}
