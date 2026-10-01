import { invoke } from "@tauri-apps/api/core";
import { flushPrintQueue } from "./utils/printQueue";

export type PrinterStatus = {
  is_ready: boolean;
  is_online: boolean;
  paper_remaining?: number;
  paper_limit_alert?: number;
  printer_name: string;
  has_error: boolean;
  error_message?: string;
};

export type PrintOptions = {
  copies: number;
  paper_size: "4x6" | "6x8" | "2x6" | "6x6";
  quality: "standard" | "high";
};

class PrinterStore {
  printers = $state<string[]>([]);
  selectedPrinter = $state<string | null>(null);
  status = $state<PrinterStatus | null>(null);
  isPrinting = $state(false);
  errorMessage = $state<string | null>(null);
  paperLimitAlert = $state(50);
  paperReminder = $state(true);

  private previousIsOnline: boolean | null = null;

  async loadPrinters() {
    try {
      this.errorMessage = null;
      this.printers = await invoke<string[]>("get_printer_list");
      
      // Auto select DNP printer if available, otherwise default to first printer
      const dnpPrinter = this.printers.find(
        (p) => p.toUpperCase().includes("DNP") || p.toUpperCase().includes("DS-RX1")
      );
      if (dnpPrinter) {
        this.selectedPrinter = dnpPrinter;
      } else if (this.printers.length > 0 && !this.selectedPrinter) {
        this.selectedPrinter = this.printers[0];
      }

      if (this.selectedPrinter) {
        await this.refreshStatus();
        // Trigger print queue flush on app boot
        flushPrintQueue().catch((err) => console.error("[PrinterStore] Initial queue flush error:", err));
      }
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  async refreshStatus() {
    if (!this.selectedPrinter) return;
    try {
      const newStatus = await invoke<PrinterStatus>("get_printer_status", {
        printerName: this.selectedPrinter,
      });

      const transitionedToOnline = this.previousIsOnline === false && newStatus.is_online;
      this.previousIsOnline = newStatus.is_online;
      this.status = newStatus;

      if (transitionedToOnline) {
        console.log("[printerStore] Printer transitioned OFFLINE -> ONLINE! Triggering flushPrintQueue...");
        flushPrintQueue().catch((err) => console.error("[PrinterStore] Auto queue flush error:", err));
      }
    } catch (err) {
      this.errorMessage = String(err);
    }
  }

  canPrint(copies: number = 1): { ok: boolean; reason?: string } {
    if (!this.selectedPrinter) {
      return { ok: false, reason: "Printer belum dipilih" };
    }
    if (!this.status?.is_online) {
      return { ok: false, reason: "Printer offline atau tidak terhubung" };
    }
    if (!this.status?.is_ready) {
      return { ok: false, reason: "Printer mengalami error atau tidak siap" };
    }
    if (this.status?.paper_remaining !== undefined && this.status.paper_remaining < copies) {
      return { ok: false, reason: "Kertas printer tidak mencukupi" };
    }
    return { ok: true };
  }

  async print(imagePath: string, options: PrintOptions) {
    if (!this.selectedPrinter || this.isPrinting) return;
    this.isPrinting = true;
    this.errorMessage = null;
    try {
      await invoke("print_photo", {
        printerName: this.selectedPrinter,
        imagePath,
        copies: options.copies,
        paperSize: options.paper_size,
      });
    } catch (err) {
      this.errorMessage = String(err);
      throw err;
    } finally {
      this.isPrinting = false;
    }
  }

  async printFromBuffer(imageData: Uint8Array, options: PrintOptions) {
    if (!this.selectedPrinter || this.isPrinting) return;
    this.isPrinting = true;
    this.errorMessage = null;
    try {
      await invoke("print_photo_from_buffer", {
        printerName: this.selectedPrinter,
        imageData: Array.from(imageData),
        copies: options.copies,
        paperSize: options.paper_size,
      });
    } catch (err) {
      this.errorMessage = String(err);
      throw err;
    } finally {
      this.isPrinting = false;
    }
  }
}

export const printerStore = new PrinterStore();
