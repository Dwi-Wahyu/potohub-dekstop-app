import { invoke } from "@tauri-apps/api/core";
import { flushPrintQueue } from "./utils/printQueue";
import { boothConfig } from "./stores/boothConfig.svelte";

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
  paper_size: string;
  quality?: "standard" | "high";
  useSecondary?: boolean;
  targetPrinter?: string;
};

class PrinterStore {
  printers = $state<string[]>([]);
  selectedPrinter = $state<string | null>(null);
  secondaryPrinter = $state<string | null>(null);
  status = $state<PrinterStatus | null>(null);
  secondaryStatus = $state<PrinterStatus | null>(null);
  isPrinting = $state(false);
  isDetecting = $state(false);
  errorMessage = $state<string | null>(null);
  paperLimitAlert = $state(50);
  paperReminder = $state(true);

  private previousIsOnline: boolean | null = null;
  private previousSecondaryIsOnline: boolean | null = null;

  resolvePrinter(useSecondary?: boolean): string | null {
    if (useSecondary && this.secondaryPrinter) {
      return this.secondaryPrinter;
    }
    return this.selectedPrinter;
  }

  getPrinterStatus(useSecondary?: boolean): PrinterStatus | null {
    if (useSecondary && this.secondaryPrinter) {
      return this.secondaryStatus;
    }
    return this.status;
  }

  async loadPrinters() {
    this.isDetecting = true;
    try {
      this.errorMessage = null;
      this.printers = await invoke<string[]>("get_printer_list");

      const savedPrimary = boothConfig.config.primaryPrinter;
      const savedSecondary = boothConfig.config.secondaryPrinter;

      // Resolve primary printer
      if (savedPrimary && this.printers.includes(savedPrimary)) {
        this.selectedPrinter = savedPrimary;
      } else {
        const dnpPrinter = this.printers.find(
          (p) => p.toUpperCase().includes("DNP") || p.toUpperCase().includes("DS-RX1")
        );
        if (dnpPrinter) {
          this.selectedPrinter = dnpPrinter;
        } else if (this.printers.length > 0) {
          this.selectedPrinter = this.printers[0];
        } else {
          this.selectedPrinter = null;
        }

        if (this.selectedPrinter) {
          boothConfig.save({ primaryPrinter: this.selectedPrinter });
        }
      }

      // Resolve secondary printer
      if (
        savedSecondary &&
        this.printers.includes(savedSecondary) &&
        savedSecondary !== this.selectedPrinter
      ) {
        this.secondaryPrinter = savedSecondary;
      } else {
        this.secondaryPrinter = null;
        if (savedSecondary) {
          boothConfig.save({ secondaryPrinter: "" });
        }
      }

      if (this.selectedPrinter) {
        await this.refreshStatus();
        flushPrintQueue().catch((err) =>
          console.error("[PrinterStore] Initial queue flush error:", err)
        );
      } else {
        this.status = {
          is_ready: false,
          is_online: false,
          paper_remaining: undefined,
          paper_limit_alert: 50,
          printer_name: "",
          has_error: true,
          error_message: "Tidak ada printer terdeteksi",
        };
      }
    } catch (err) {
      this.errorMessage = String(err);
      this.status = {
        is_ready: false,
        is_online: false,
        paper_remaining: undefined,
        paper_limit_alert: 50,
        printer_name: "",
        has_error: true,
        error_message: String(err),
      };
    } finally {
      this.isDetecting = false;
    }
  }

  async refreshStatus() {
    let anyTransitionedToOnline = false;

    // Refresh primary printer status
    if (this.selectedPrinter) {
      try {
        const newStatus = await invoke<PrinterStatus>("get_printer_status", {
          printerName: this.selectedPrinter,
        });

        if (this.previousIsOnline === false && newStatus.is_online) {
          anyTransitionedToOnline = true;
        }
        this.previousIsOnline = newStatus.is_online;
        this.status = newStatus;
      } catch (err) {
        this.errorMessage = String(err);
      }
    } else {
      this.status = null;
    }

    // Refresh secondary printer status
    if (this.secondaryPrinter) {
      try {
        const newSecStatus = await invoke<PrinterStatus>("get_printer_status", {
          printerName: this.secondaryPrinter,
        });

        if (this.previousSecondaryIsOnline === false && newSecStatus.is_online) {
          anyTransitionedToOnline = true;
        }
        this.previousSecondaryIsOnline = newSecStatus.is_online;
        this.secondaryStatus = newSecStatus;
      } catch (err) {
        console.warn("[printerStore] Failed to query secondary printer status:", err);
      }
    } else {
      this.secondaryStatus = null;
    }

    if (anyTransitionedToOnline) {
      console.log("[printerStore] Printer transitioned OFFLINE -> ONLINE! Triggering flushPrintQueue...");
      flushPrintQueue().catch((err) =>
        console.error("[PrinterStore] Auto queue flush error:", err)
      );
    }
  }

  canPrint(copies: number = 1, useSecondary?: boolean): { ok: boolean; reason?: string } {
    const targetPrinter = this.resolvePrinter(useSecondary);
    if (!targetPrinter) {
      return {
        ok: false,
        reason: useSecondary
          ? "Secondary printer belum dipilih atau tidak tersedia"
          : "Primary printer belum dipilih",
      };
    }

    const st =
      useSecondary && this.secondaryPrinter === targetPrinter
        ? this.secondaryStatus
        : this.status;

    if (!st?.is_online) {
      return { ok: false, reason: `Printer '${targetPrinter}' offline atau tidak terhubung` };
    }
    if (!st?.is_ready) {
      return { ok: false, reason: `Printer '${targetPrinter}' mengalami error atau tidak siap` };
    }
    if (st?.paper_remaining !== undefined && st.paper_remaining < copies) {
      return { ok: false, reason: `Kertas printer '${targetPrinter}' tidak mencukupi` };
    }
    return { ok: true };
  }

  async print(imagePath: string, options: PrintOptions) {
    const targetPrinter = options.targetPrinter || this.resolvePrinter(options.useSecondary);
    if (!targetPrinter || this.isPrinting) return;
    this.isPrinting = true;
    this.errorMessage = null;
    try {
      await invoke("print_photo", {
        printerName: targetPrinter,
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
    const targetPrinter = options.targetPrinter || this.resolvePrinter(options.useSecondary);
    if (!targetPrinter || this.isPrinting) return;
    this.isPrinting = true;
    this.errorMessage = null;
    try {
      await invoke("print_photo_from_buffer", {
        printerName: targetPrinter,
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
