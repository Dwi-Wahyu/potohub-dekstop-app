import { invoke } from "@tauri-apps/api/core";
import { getCameraPreset } from "$lib/db/local";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type DeviceInfo = {
  manufacturer?: string;
  productname?: string;
};

export type DetectedCamera = { model: string; port: string };

declare const __DEV_WEBCAM__: boolean | undefined;

/**
 * Cek apakah mode pengembang / dev webcam aktif:
 * 1. Build define __DEV_WEBCAM__ (dari CLI arg `--development` pada `vite dev`)
 * 2. Environment variable VITE_ENABLE_DEV_WEBCAM dari `.env`
 * 3. URL search params `?dev=true`, `?webcam=true`, atau `?development=true`
 * 4. LocalStorage flag 'potohub_dev_webcam'
 */
export function isDevWebcamEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (typeof __DEV_WEBCAM__ !== "undefined" && __DEV_WEBCAM__) return true;
  } catch {}
  try {
    if (
      import.meta.env?.VITE_ENABLE_DEV_WEBCAM === "true" ||
      import.meta.env?.VITE_DEV_WEBCAM === "true"
    ) {
      return true;
    }
  } catch {}
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get("dev") === "true" ||
      params.get("webcam") === "true" ||
      params.get("development") === "true"
    ) {
      return true;
    }
  } catch {}
  try {
    if (localStorage.getItem("potohub_dev_webcam") === "true") {
      return true;
    }
  } catch {}
  return false;
}

class CameraStore {
  status = $state<ConnectionStatus>("idle");
  errorMessage = $state<string | null>(null);
  device = $state<DeviceInfo | null>(null);
  cameraMode = $state<"usb" | "webcam" | "demo">(isDevWebcamEnabled() ? "webcam" : "usb");
  cameraBaseUrl = $state<string>("http://192.168.1.100:8080");

  detectedCameras = $state<DetectedCamera[]>([]);
  isDetecting = $state(false);
  detectError = $state<string | null>(null);

  isCapturing = $state(false);
  isLiveviewActive = $state(false);
  private currentLiveviewUrl: string | null = null;
  stream = $state<MediaStream | null>(null);
  private videoElement: HTMLVideoElement | null = null;
  private offscreenVideo: HTMLVideoElement | null = null;

  isDevMode = $state<boolean>(isDevWebcamEnabled());
  private connectingPromise: Promise<void> | null = null;

  private recorder: MediaRecorder | null = null;
  private clipChunks: { blob: Blob; timestamp: number }[] = [];
  private frameBuffer: { data: number[]; timestamp: number }[] = [];
  private frameCaptureInterval: ReturnType<typeof setInterval> | null = null;
  private readonly RING_BUFFER_MS = 8000;

  private formatError(err: unknown): string {
    if (typeof err === "string") return err;
    if (err && typeof err === "object") {
      const values = Object.values(err);
      if (values.length > 0 && typeof values[0] === "string") {
        return values[0];
      }
      return JSON.stringify(err);
    }
    return String(err);
  }

  /**
   * Cek apakah aplikasi berjalan dalam mode development.
   * Memeriksa client flags dan memanggil Tauri command `is_development_mode`.
   */
  async checkDevMode(): Promise<boolean> {
    if (this.isDevMode) return true;
    let enabled = isDevWebcamEnabled();
    if (!enabled) {
      try {
        enabled = await invoke<boolean>("is_development_mode");
      } catch {}
    }
    this.isDevMode = enabled;
    return enabled;
  }

  /**
   * Deteksi kamera USB yang terpasang (setara `gphoto2 --auto-detect`).
   * Non-invasive — tidak membuka sesi kamera, aman dipanggil berulang (mis. tombol Refresh).
   */
  async detect() {
    this.isDetecting = true;
    this.detectError = null;
    try {
      this.detectedCameras = await invoke<DetectedCamera[]>("detect_camera");
    } catch (err) {
      this.detectError = this.formatError(err);
      this.detectedCameras = [];
    } finally {
      this.isDetecting = false;
    }
  }

  /**
   * Mengambil MediaStream webcam dengan resolusi ideal, dengan fallback graceful
   * jika webcam perangkat tidak mendukung constraint spesifik (mis. 720p/480p).
   */
  private async getWebcamStream(): Promise<MediaStream> {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: "user",
        },
        audio: false,
      });
    } catch (err) {
      console.warn("[CameraStore] Fallback ke resolusi standar kamera:", err);
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }
  }

  async connect(mode: "usb" | "webcam" | "demo" = "usb"): Promise<void> {
    if (this.status === "connecting" && this.connectingPromise) {
      return this.connectingPromise;
    }
    const target = mode ?? this.cameraMode;
    if (
      this.status === "connected" &&
      target === this.cameraMode &&
      (this.cameraMode !== "webcam" || (this.stream && this.stream.active))
    ) {
      return;
    }

    this.connectingPromise = this.internalConnect(target);
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  private async internalConnect(mode: "usb" | "webcam" | "demo"): Promise<void> {
    await this.checkDevMode();

    let targetMode = mode;
    // Jika developer mengaktifkan VITE_ENABLE_DEV_WEBCAM / dev mode dan target masih 'usb',
    // cek apakah ada DSLR fisik yang sudah terhubung. Jika tidak, langsung alihkan ke webcam
    // agar UI tidak freeze atau menunggu timeout GPhoto2 autodetect yang lambat.
    if (this.isDevMode && targetMode === "usb") {
      let isUsbReady = false;
      try {
        isUsbReady = await invoke<boolean>("is_camera_connected").catch(() => false);
      } catch {}
      if (!isUsbReady) {
        console.info("[CameraStore] Dev webcam aktif & tidak ada DSLR terhubung, beralih langsung ke webcam.");
        targetMode = "webcam";
      }
    }

    if (targetMode === "usb") {
      try {
        const isConnected = await invoke<boolean>("is_camera_connected").catch(() => false);
        if (isConnected) {
          this.status = "connected";
          this.cameraMode = "usb";
          if (!this.device) {
            this.device = await invoke<DeviceInfo>("connect_camera").catch(() => null);
          }
          return;
        }
      } catch {}
    }

    this.status = "connecting";
    this.errorMessage = null;
    this.cameraMode = targetMode;

    if (targetMode === "usb") {
      try {
        await invoke("disconnect_camera").catch(() => {});
        this.device = await invoke<DeviceInfo>("connect_camera");
        this.status = "connected";

        const model = this.device?.manufacturer ?? this.device?.productname;
        if (model) {
          const preset = await getCameraPreset(model);
          if (preset) {
            await this.setSetting("iso", preset.iso);
            await this.setSetting("tv", preset.shutterSpeed);
            await this.setSetting("av", preset.aperture);
          }
        }
      } catch (err) {
        // Jika mode development aktif dan koneksi USB DSLR gagal, fallback otomatis ke webcam laptop
        if (this.isDevMode) {
          console.warn(
            "[CameraStore] Mode pengembang aktif & tidak ada DSLR USB, beralih sementara ke webcam laptop."
          );
          this.status = "idle";
          return this.internalConnect("webcam");
        }
        this.status = "error";
        this.errorMessage = this.formatError(err);
      }
    } else if (targetMode === "webcam") {
      try {
        const stream = await this.getWebcamStream();
        this.stream = stream;
        this.initOffscreenVideo(stream);
        this.startWebcamRecordingPipeline(stream);

        this.device = {
          manufacturer: "Laptop / USB Webcam (Dev)",
          productname: "Webcam Kamera Terhubung",
        };
        this.status = "connected";
      } catch (err) {
        this.status = "error";
        this.errorMessage = "Gagal mengakses kamera laptop: " + String(err);
      }
    } else if (targetMode === "demo") {
      this.device = {
        manufacturer: "PotoHub",
        productname: "Demo / Mock Camera Mode",
      };
      this.status = "connected";
    }
  }

  async disconnect() {
    this.errorMessage = null;
    this.stopWebcamRecordingPipeline();
    if (this.cameraMode === "usb") {
      try {
        await invoke("disconnect_camera");
      } catch {}
    } else {
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      if (this.offscreenVideo) {
        this.offscreenVideo.srcObject = null;
        if (this.offscreenVideo.parentNode) {
          this.offscreenVideo.parentNode.removeChild(this.offscreenVideo);
        }
        this.offscreenVideo = null;
      }
      this.videoElement = null;
    }
    this.status = "idle";
    this.device = null;
    this.isLiveviewActive = false;
    this.cleanupLiveviewUrl();
  }

  async capture(): Promise<Uint8Array | null> {
    if (this.status !== "connected" || this.isCapturing) return null;
    this.isCapturing = true;
    this.errorMessage = null;
    try {
      if (this.cameraMode === "usb") {
        const bytes = await invoke<number[]>("capture_photo");
        return new Uint8Array(bytes);
      } else if (this.cameraMode === "webcam") {
        const bytes = await this.captureWebcamFrame();
        return bytes;
      } else {
        const bytes = await this.captureDemoFrame();
        return bytes;
      }
    } catch (err) {
      this.errorMessage = String(err);
      return null;
    } finally {
      this.isCapturing = false;
    }
  }

  async setSetting(key: string, value: string) {
    if (this.cameraMode !== "usb") return;
    try {
      await invoke("set_camera_setting", { key, value });
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  async getSetting(key: string) {
    if (this.cameraMode !== "usb") {
      return { value: "", ability: [] };
    }
    return invoke<{ value: string; ability: string[] }>("get_camera_setting", {
      key,
    });
  }

  setVideoElement(el: HTMLVideoElement | null) {
    if (el) {
      this.videoElement = el;
      if (this.stream && el.srcObject !== this.stream) {
        el.srcObject = this.stream;
        el.muted = true;
        el.playsInline = true;
        el.play().catch(() => {});
      }
    } else if (this.videoElement === el) {
      this.videoElement = null;
    }
  }

  async startLiveview(videoEl?: HTMLVideoElement | null) {
    if (this.status === "idle" || this.status === "error") {
      await this.connect(this.isDevMode ? "webcam" : this.cameraMode);
    } else if (this.status === "connecting" && this.connectingPromise) {
      await this.connectingPromise;
    }
    if (this.status !== "connected") return;
    this.errorMessage = null;
    if (videoEl) {
      this.videoElement = videoEl;
    }
    if (this.cameraMode === "usb") {
      try {
        await invoke("start_liveview");
        this.isLiveviewActive = true;
      } catch (err) {
        this.errorMessage = String(err);
      }
    } else if (this.cameraMode === "webcam") {
      try {
        if (
          !this.stream ||
          !this.stream.active ||
          this.stream.getVideoTracks().every((t) => t.readyState === "ended")
        ) {
          this.stream = await this.getWebcamStream();
        }
        this.initOffscreenVideo(this.stream);
        this.startWebcamRecordingPipeline(this.stream);
        this.isLiveviewActive = true;

        if (videoEl) {
          videoEl.srcObject = this.stream;
          videoEl.muted = true;
          videoEl.playsInline = true;
          await videoEl.play().catch(() => {});
          this.videoElement = videoEl;
        }
      } catch (err) {
        this.errorMessage = "Gagal memulai liveview kamera laptop: " + String(err);
      }
    } else if (this.cameraMode === "demo") {
      this.isLiveviewActive = true;
    }
  }

  async stopLiveview() {
    this.errorMessage = null;
    this.stopWebcamRecordingPipeline();
    if (this.cameraMode === "usb") {
      try {
        await invoke("stop_liveview");
      } catch {}
    } else {
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      if (this.offscreenVideo) {
        this.offscreenVideo.srcObject = null;
        if (this.offscreenVideo.parentNode) {
          this.offscreenVideo.parentNode.removeChild(this.offscreenVideo);
        }
        this.offscreenVideo = null;
      }
      if (this.videoElement) {
        this.videoElement.srcObject = null;
        this.videoElement = null;
      }
    }
    this.isLiveviewActive = false;
    this.cleanupLiveviewUrl();
  }

  async getLiveviewFrame(): Promise<string | null> {
    if (this.status !== "connected") return null;
    if (this.cameraMode === "usb") {
      try {
        const bytes = await invoke<number[]>("get_liveview_frame");
        const blob = new Blob([new Uint8Array(bytes)], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        this.cleanupLiveviewUrl();
        this.currentLiveviewUrl = url;
        return url;
      } catch {
        return null;
      }
    } else if (this.cameraMode === "webcam") {
      const video =
        this.videoElement && this.videoElement.videoWidth > 0
          ? this.videoElement
          : this.offscreenVideo;
      if (video && video.videoWidth > 0) {
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, 640, 480);
          return canvas.toDataURL("image/jpeg", 0.7);
        }
      }
      return null;
    } else if (this.cameraMode === "demo") {
      const url = await this.getDemoLiveviewFrame();
      return url;
    }
    return null;
  }

  private cleanupLiveviewUrl() {
    if (this.currentLiveviewUrl) {
      const oldUrl = this.currentLiveviewUrl;
      setTimeout(() => {
        try {
          URL.revokeObjectURL(oldUrl);
        } catch {}
      }, 500);
      this.currentLiveviewUrl = null;
    }
  }

  private initOffscreenVideo(stream: MediaStream) {
    if (!this.offscreenVideo && typeof document !== "undefined") {
      this.offscreenVideo = document.createElement("video");
      this.offscreenVideo.muted = true;
      this.offscreenVideo.playsInline = true;
      this.offscreenVideo.autoplay = true;
      this.offscreenVideo.style.position = "fixed";
      this.offscreenVideo.style.top = "-9999px";
      this.offscreenVideo.style.left = "-9999px";
      this.offscreenVideo.style.width = "640px";
      this.offscreenVideo.style.height = "480px";
      this.offscreenVideo.style.opacity = "0";
      this.offscreenVideo.style.pointerEvents = "none";
      document.body.appendChild(this.offscreenVideo);
    }
    if (this.offscreenVideo) {
      this.offscreenVideo.srcObject = stream;
      this.offscreenVideo.play().catch(() => {});
    }
  }

  private startWebcamRecordingPipeline(stream: MediaStream) {
    this.stopWebcamRecordingPipeline();

    // 1. Buffer frame JPEG berkala (~8 FPS) untuk encode MP4 via Tauri ffmpeg sidecar
    this.frameBuffer = [];
    const canvas = document.createElement("canvas");
    const targetW = 640;
    const targetH = 480;
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");

    this.frameCaptureInterval = setInterval(() => {
      const video =
        this.videoElement && this.videoElement.videoWidth > 0
          ? this.videoElement
          : this.offscreenVideo;

      if (video && video.videoWidth > 0 && ctx) {
        ctx.drawImage(video, 0, 0, targetW, targetH);
        canvas.toBlob(
          async (blob) => {
            if (!blob) return;
            const buf = await blob.arrayBuffer();
            const now = Date.now();
            this.frameBuffer.push({
              data: Array.from(new Uint8Array(buf)),
              timestamp: now,
            });
            const cutoff = now - this.RING_BUFFER_MS;
            this.frameBuffer = this.frameBuffer.filter((f) => f.timestamp >= cutoff);
          },
          "image/jpeg",
          0.7
        );
      }
    }, 125);

    // 2. MediaRecorder fallback
    try {
      this.clipChunks = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";
      this.recorder = new MediaRecorder(stream, { mimeType });
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.clipChunks.push({ blob: e.data, timestamp: Date.now() });
          const cutoff = Date.now() - this.RING_BUFFER_MS;
          this.clipChunks = this.clipChunks.filter((c) => c.timestamp >= cutoff);
        }
      };
      this.recorder.start(250);
    } catch (e) {
      console.warn("[CameraStore] MediaRecorder tidak tersedia:", e);
    }
  }

  private stopWebcamRecordingPipeline() {
    if (this.frameCaptureInterval) {
      clearInterval(this.frameCaptureInterval);
      this.frameCaptureInterval = null;
    }
    this.frameBuffer = [];

    if (this.recorder && this.recorder.state !== "inactive") {
      try {
        this.recorder.stop();
      } catch {}
    }
    this.recorder = null;
    this.clipChunks = [];
  }

  /**
   * Dipanggil dari runCaptureSequence() tepat setelah shutter/capture terjadi.
   * Menunggu `postSecs` detik supaya buffer terisi window "setelah" capture,
   * lalu potong frame yang timestamp-nya masuk window dan encode jadi MP4 (atau gabung WebM).
   */
  async extractLiveviewClip(
    captureTs: number,
    preSecs: number,
    postSecs: number
  ): Promise<Blob | null> {
    if (this.cameraMode === "webcam") {
      await new Promise((r) => setTimeout(r, postSecs * 1000 + 150));
      const from = captureTs - preSecs * 1000;
      const to = captureTs + postSecs * 1000;

      // 1. Encode frame JPEG via Rust ffmpeg -> Menghasilkan MP4 valid untuk composite video
      const matchedFrames = this.frameBuffer
        .filter((f) => f.timestamp >= from && f.timestamp <= to)
        .map((f) => f.data);

      if (matchedFrames.length >= 4) {
        try {
          const fps =
            matchedFrames.length <= 12
              ? Math.max(4, Math.floor(matchedFrames.length / 2))
              : 8;
          const encoded = await invoke<number[]>("encode_jpeg_frames_to_video", {
            frames: matchedFrames,
            fps,
          });
          return new Blob([new Uint8Array(encoded)], { type: "video/mp4" });
        } catch (err) {
          console.warn(
            "[CameraStore] Encode webcam JPEG buffer ke MP4 via Rust gagal, mencoba fallback MediaRecorder:",
            err
          );
        }
      }

      // 2. Fallback MediaRecorder WebM jika frame buffer tidak cukup
      const parts = this.clipChunks
        .filter((c) => c.timestamp >= from && c.timestamp <= to)
        .map((c) => c.blob);
      if (parts.length > 0) {
        return new Blob(parts, { type: "video/webm" });
      }

      // 3. Fallback demo clip
      return this.extractDemoLiveviewClip();
    }

    return this.extractLiveviewClipNonWebcam(captureTs, preSecs, postSecs);
  }

  private async extractLiveviewClipNonWebcam(
    captureTs: number,
    preSecs: number,
    postSecs: number
  ): Promise<Blob | null> {
    if (this.cameraMode === "usb") {
      await new Promise((r) => setTimeout(r, postSecs * 1000 + 150));
      try {
        const encoded = await invoke<number[]>("extract_and_encode_liveview_clip", {
          captureTsMs: captureTs,
          preMs: Math.round(preSecs * 1000),
          postMs: Math.round(postSecs * 1000),
        });
        return new Blob([new Uint8Array(encoded)], { type: "video/mp4" });
      } catch (err) {
        console.warn("[liveview] Gagal extract & encode klip liveview:", err);
        return null;
      }
    }
    if (this.cameraMode === "demo") {
      return this.extractDemoLiveviewClip();
    }
    return null;
  }

  private async extractDemoLiveviewClip(): Promise<Blob | null> {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const stream = (canvas as any).captureStream
      ? (canvas as any).captureStream(10)
      : null;
    if (!stream) return null;
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
      ? "video/webm;codecs=vp8"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
    });
    recorder.start();
    const start = Date.now();
    const draw = () => {
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = "#3b82f6";
      const t = Date.now() * 0.005;
      ctx.beginPath();
      ctx.arc(320 + Math.sin(t) * 80, 240, 30, 0, Math.PI * 2);
      ctx.fill();
      if (Date.now() - start < 2500) {
        requestAnimationFrame(draw);
      } else {
        if (recorder.state !== "inactive") recorder.stop();
      }
    };
    draw();
    return done;
  }

  private async captureWebcamFrame(): Promise<Uint8Array | null> {
    // 1. Coba ImageCapture API untuk resolusi tertinggi sensor kamera
    const track = this.stream?.getVideoTracks()[0];
    if (track && typeof window !== "undefined" && "ImageCapture" in window) {
      try {
        const ic = new (window as any).ImageCapture(track);
        const blob: Blob = await ic.takePhoto();
        const arrayBuf = await blob.arrayBuffer();
        return new Uint8Array(arrayBuf);
      } catch (e) {
        console.warn("[CameraStore] ImageCapture takePhoto fallback ke canvas:", e);
      }
    }

    // 2. Fallback: Ambil snapshot langsung dari video stream (offscreen atau live element)
    const video =
      this.videoElement && this.videoElement.videoWidth > 0
        ? this.videoElement
        : this.offscreenVideo;

    if (!video || video.videoWidth === 0) {
      if (video) {
        await new Promise<void>((resolve) => {
          const onLoaded = () => {
            video.removeEventListener("loadeddata", onLoaded);
            resolve();
          };
          video.addEventListener("loadeddata", onLoaded);
          setTimeout(resolve, 800);
        });
      }
    }

    if (!video || video.videoWidth === 0) {
      throw new Error("Frame webcam belum siap atau video element tidak aktif");
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Gagal inisialisasi context 2D canvas");

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(new Uint8Array(reader.result as ArrayBuffer));
          };
          reader.readAsArrayBuffer(blob);
        },
        "image/jpeg",
        0.95
      );
    });
  }

  private async captureDemoFrame(): Promise<Uint8Array | null> {
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 960;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const gradient = ctx.createLinearGradient(0, 0, 1280, 960);
    gradient.addColorStop(0, "#1e3a8a");
    gradient.addColorStop(1, "#3b82f6");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1280, 960);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("PotoHub Demo Camera Frame", 640, 480);

    ctx.font = "24px sans-serif";
    ctx.fillText(new Date().toLocaleString(), 640, 540);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(new Uint8Array(reader.result as ArrayBuffer));
          };
          reader.readAsArrayBuffer(blob);
        },
        "image/jpeg",
        0.92
      );
    });
  }

  private async getDemoLiveviewFrame(): Promise<string | null> {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, 640, 480);

    ctx.fillStyle = "#3b82f6";
    ctx.beginPath();
    const time = Date.now() * 0.005;
    ctx.arc(320 + Math.sin(time) * 100, 240 + Math.cos(time) * 50, 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Liveview Demo Active...", 320, 240);

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          const url = URL.createObjectURL(blob);
          this.cleanupLiveviewUrl();
          this.currentLiveviewUrl = url;
          resolve(url);
        },
        "image/jpeg",
        0.7
      );
    });
  }
}

export const cameraStore = new CameraStore();
