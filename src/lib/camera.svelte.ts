import { invoke } from "@tauri-apps/api/core";
import { getCameraPreset } from "$lib/db/local";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type DeviceInfo = {
  manufacturer?: string;
  productname?: string;
};

export type DetectedCamera = { model: string; port: string };

class CameraStore {
  status = $state<ConnectionStatus>("idle");
  errorMessage = $state<string | null>(null);
  device = $state<DeviceInfo | null>(null);
  cameraMode = $state<"usb" | "webcam" | "demo">("usb");
  cameraBaseUrl = $state<string>("http://192.168.1.100:8080");

  detectedCameras = $state<DetectedCamera[]>([]);
  isDetecting = $state(false);
  detectError = $state<string | null>(null);

  isCapturing = $state(false);
  isLiveviewActive = $state(false);
  private currentLiveviewUrl: string | null = null;
  stream = $state<MediaStream | null>(null);
  private videoElement: HTMLVideoElement | null = null;
  private recorder: MediaRecorder | null = null;
  private clipChunks: { blob: Blob; timestamp: number }[] = [];
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

  async connect(mode: "usb" | "webcam" | "demo" = "usb") {
    if (this.status === "connecting") return;

    if (mode === "usb") {
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
    this.cameraMode = mode;

    if (mode === "usb") {
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
        this.status = "error";
        this.errorMessage = this.formatError(err);
      }
    } else if (mode === "webcam") {
      try {
        const testStream = await navigator.mediaDevices.getUserMedia({ video: true });
        testStream.getTracks().forEach(t => t.stop());
        
        this.device = {
          manufacturer: "Internal/USB Webcam",
          productname: "Webcam Perangkat Laptop"
        };
        this.status = "connected";
      } catch (err) {
        this.status = "error";
        this.errorMessage = "Gagal mengakses kamera laptop: " + String(err);
      }
    } else if (mode === "demo") {
      this.device = {
        manufacturer: "PotoHub",
        productname: "Demo / Mock Camera Mode"
      };
      this.status = "connected";
    }
  }

  async disconnect() {
    this.errorMessage = null;
    this.stopWebcamRecorder();
    if (this.cameraMode === "usb") {
      try {
        await invoke("disconnect_camera");
      } catch {}
    } else {
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
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
        if (!this.videoElement) {
          throw new Error("Liveview video element tidak aktif");
        }
        const bytes = await this.captureWebcamFrame(this.videoElement);
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

  async startLiveview(videoEl?: HTMLVideoElement | null) {
    if (this.status !== "connected") return;
    this.errorMessage = null;
    if (this.cameraMode === "usb") {
      try {
        await invoke("start_liveview");
        this.isLiveviewActive = true;
      } catch (err) {
        this.errorMessage = String(err);
      }
    } else if (this.cameraMode === "webcam") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false
        });
        this.stream = stream;
        this.isLiveviewActive = true;
        this.startWebcamRecorder(stream);
        if (videoEl) {
          videoEl.srcObject = stream;
          videoEl.muted = true;
          videoEl.playsInline = true;
          await videoEl.play();
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
    this.stopWebcamRecorder();
    if (this.cameraMode === "usb") {
      try {
        await invoke("stop_liveview");
      } catch {}
    } else {
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
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

  private startWebcamRecorder(stream: MediaStream) {
    this.clipChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    this.recorder = new MediaRecorder(stream, { mimeType });
    this.recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.clipChunks.push({ blob: e.data, timestamp: Date.now() });
        const cutoff = Date.now() - this.RING_BUFFER_MS;
        this.clipChunks = this.clipChunks.filter((c) => c.timestamp >= cutoff);
      }
    };
    this.recorder.start(250);
  }

  private stopWebcamRecorder() {
    if (this.recorder && this.recorder.state !== 'inactive') {
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
   * lalu potong chunk yang timestamp-nya masuk window dan gabung jadi 1 Blob webm/mp4.
   */
  async extractLiveviewClip(captureTs: number, preSecs: number, postSecs: number): Promise<Blob | null> {
    if (this.cameraMode !== 'webcam') {
      return this.extractLiveviewClipNonWebcam(captureTs, preSecs, postSecs);
    }
    await new Promise((r) => setTimeout(r, postSecs * 1000 + 150));
    const from = captureTs - preSecs * 1000;
    const to = captureTs + postSecs * 1000;
    const parts = this.clipChunks
      .filter((c) => c.timestamp >= from && c.timestamp <= to)
      .map((c) => c.blob);
    if (parts.length === 0) return null;
    return new Blob(parts, { type: 'video/webm' });
  }

  private async extractLiveviewClipNonWebcam(
    captureTs: number,
    preSecs: number,
    postSecs: number
  ): Promise<Blob | null> {
    if (this.cameraMode === 'usb') {
      await new Promise((r) => setTimeout(r, postSecs * 1000 + 150));
      try {
        const encoded = await invoke<number[]>('extract_and_encode_liveview_clip', {
          captureTsMs: captureTs,
          preMs: Math.round(preSecs * 1000),
          postMs: Math.round(postSecs * 1000),
        });
        return new Blob([new Uint8Array(encoded)], { type: 'video/mp4' });
      } catch (err) {
        console.warn('[liveview] Gagal extract & encode klip liveview:', err);
        return null;
      }
    }
    if (this.cameraMode === 'demo') {
      return this.extractDemoLiveviewClip();
    }
    return null;
  }

  private async extractDemoLiveviewClip(): Promise<Blob | null> {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const stream = (canvas as any).captureStream ? (canvas as any).captureStream(10) : null;
    if (!stream) return null;
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
    });
    recorder.start();
    const start = Date.now();
    const draw = () => {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, 640, 480);
      ctx.fillStyle = '#3b82f6';
      const t = Date.now() * 0.005;
      ctx.beginPath();
      ctx.arc(320 + Math.sin(t) * 80, 240, 30, 0, Math.PI * 2);
      ctx.fill();
      if (Date.now() - start < 2500) {
        requestAnimationFrame(draw);
      } else {
        if (recorder.state !== 'inactive') recorder.stop();
      }
    };
    draw();
    return done;
  }

  private async captureWebcamFrame(video: HTMLVideoElement): Promise<Uint8Array | null> {
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 960;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(new Uint8Array(reader.result as ArrayBuffer));
        };
        reader.readAsArrayBuffer(blob);
      }, "image/jpeg", 0.92);
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
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(new Uint8Array(reader.result as ArrayBuffer));
        };
        reader.readAsArrayBuffer(blob);
      }, "image/jpeg", 0.92);
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
      canvas.toBlob((blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        const url = URL.createObjectURL(blob);
        this.cleanupLiveviewUrl();
        this.currentLiveviewUrl = url;
        resolve(url);
      }, "image/jpeg", 0.7);
    });
  }
}

export const cameraStore = new CameraStore();
