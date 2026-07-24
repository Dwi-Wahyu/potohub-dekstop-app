import { invoke } from "@tauri-apps/api/core";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export type DeviceInfo = {
  manufacturer?: string;
  productname?: string;
  serialnumber?: string;
  firmwareversion?: string;
};

class CameraStore {
  status = $state<ConnectionStatus>("idle");
  errorMessage = $state<string | null>(null);
  device = $state<DeviceInfo | null>(null);
  cameraBaseUrl = $state<string | null>(null);

  isCapturing = $state(false);
  isLiveviewActive = $state(false);

  async connect(ip: string, port: number) {
    this.status = "connecting";
    this.errorMessage = null;
    try {
      this.device = await invoke<DeviceInfo>("connect_camera", { ip, port });
      this.cameraBaseUrl = await invoke<string>("get_camera_base_url");
      this.status = "connected";
    } catch (err) {
      this.status = "error";
      this.errorMessage = String(err);
    }
  }

  async disconnect() {
    await invoke("disconnect_camera");
    this.status = "idle";
    this.device = null;
    this.cameraBaseUrl = null;
    this.isLiveviewActive = false;
  }

  async capture() {
    if (this.status !== "connected" || this.isCapturing) return;
    this.isCapturing = true;
    this.errorMessage = null;
    try {
      await invoke("capture_photo");
    } catch (err) {
      this.errorMessage = String(err);
    } finally {
      this.isCapturing = false;
    }
  }

  async setSetting(key: string, value: string) {
    try {
      await invoke("set_camera_setting", { key, value });
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  async getSetting(key: string) {
    return invoke<{ value: string; ability: string[] }>("get_camera_setting", {
      key,
    });
  }

  async startLiveview() {
    if (this.status !== "connected") return;
    try {
      await invoke("start_liveview");
      this.isLiveviewActive = true;
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  async stopLiveview() {
    try {
      await invoke("stop_liveview");
    } finally {
      this.isLiveviewActive = false;
    }
  }
}

export const cameraStore = new CameraStore();
