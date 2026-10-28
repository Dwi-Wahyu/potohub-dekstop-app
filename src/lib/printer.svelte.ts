import { invoke } from "@tauri-apps/api/core";
import { flushPrintQueue } from "./utils/printQueue";
import { boothConfig } from "./stores/boothConfig.svelte";

export type PrinterStatus = {
  is_ready: boolean;
  is_online: boolean;
  is_printing?: boolean;
  active_jobs?: number;
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

const PHYSICAL_PRINT_MS_PER_COPY = 12_000;
const POST_SPOOL_MIN_MS_PER_COPY = 10_000;
const MAX_SPOOL_WAIT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

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
        const dnpPrinter = this.printers.find((p) => {
          const u = p.toUpperCase();
          return (
            u.includes("DNP") ||
            u.includes("DS-RX1") ||
            u.includes("RX1") ||
            u.includes("CITIZEN") ||
            u.includes("PHOTO PRINTER")
          );
        });
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
        flushPrintQueue({ force: false }).catch((err) =>
          console.error("[PrinterStore] Initial queue flush error:", err)
        );
      } else {
        this.status = {
          is_ready: false,
          is_online: false,
          is_printing: false,
          active_jobs: 0,
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
        is_printing: false,
        active_jobs: 0,
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
      flushPrintQueue({ force: false }).catch((err) =>
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

  /**
   * Menunggu hingga proses cetak benar-benar selesai di antrean OS Spooler
   * ditambah durasi mekanis cetak fisik printer foto (agar tidak langsung dinyatakan
   * selesai saat data baru masuk spooler atau saat printer baru menyala/warming up).
   */
  async waitForPrintCompletion(options?: {
    copies?: number;
    useSecondary?: boolean;
    targetPrinter?: string;
    signal?: AbortSignal;
  }): Promise<{ completed: boolean; error?: string }> {
    const copies = Math.max(1, options?.copies ?? 1);
    const targetPrinter = options?.targetPrinter || this.resolvePrinter(options?.useSecondary);
    const signal = options?.signal;

    if (!targetPrinter) {
      return { completed: false, error: "Printer tidak ditemukan" };
    }

    const startTime = Date.now();
    this.isPrinting = true;

    try {
      // Beri jeda awal singkat agar OS Print Spooler mendaftarkan job yang baru dikirim
      await sleepWithAbort(800, signal);
      if (signal?.aborted) return { completed: false };

      // Fase 1: Tunggu sampai printer online/ready dan antrean job di OS Spooler selesai ditransfer
      // (Jika printer baru menyala / warming up, job akan tertahan di spooler selama printer inisialisasi)
      let spoolCleared = false;
      let lastErrorMsg: string | undefined;

      while (Date.now() - startTime < MAX_SPOOL_WAIT_MS) {
        if (signal?.aborted) return { completed: false };

        let currentStatus: PrinterStatus | null = null;
        try {
          currentStatus = await invoke<PrinterStatus>("get_printer_status", {
            printerName: targetPrinter,
          });
          if (options?.useSecondary && this.secondaryPrinter === targetPrinter) {
            this.secondaryStatus = currentStatus;
          } else {
            this.status = currentStatus;
          }
        } catch (err) {
          console.warn("[printerStore] Gagal cek status saat menunggu print:", err);
        }

        if (currentStatus) {
          if (!currentStatus.is_online || currentStatus.has_error) {
            lastErrorMsg =
              currentStatus.error_message ||
              `Printer '${targetPrinter}' belum siap atau sedang inisialisasi`;
          } else {
            const jobStillActive =
              Boolean(currentStatus.is_printing) || (currentStatus.active_jobs ?? 0) > 0;
            if (!jobStillActive) {
              spoolCleared = true;
              break;
            }
          }
        }

        await sleepWithAbort(POLL_INTERVAL_MS, signal);
      }

      if (signal?.aborted) return { completed: false };
      if (!spoolCleared) {
        return {
          completed: false,
          error: lastErrorMsg || `Waktu tunggu cetak pada printer '${targetPrinter}' habis`,
        };
      }

      // Fase 2: Setelah data keluar dari OS Spooler (masuk ke RAM buffer printer),
      // printer thermal/foto masih membutuhkan waktu mekanis untuk mencetak Y-M-C-O & memotong kertas.
      const spoolClearedTime = Date.now();
      const elapsedSoFar = spoolClearedTime - startTime;
      const minTotalMs = copies * PHYSICAL_PRINT_MS_PER_COPY;
      const minPostSpoolMs = copies * POST_SPOOL_MIN_MS_PER_COPY;
      const remainingMechanicalMs = Math.max(minTotalMs - elapsedSoFar, minPostSpoolMs);

      const mechanicalEndTime = Date.now() + remainingMechanicalMs;
      while (Date.now() < mechanicalEndTime) {
        if (signal?.aborted) return { completed: false };

        const waitStep = Math.min(POLL_INTERVAL_MS, mechanicalEndTime - Date.now());
        if (waitStep > 0) {
          await sleepWithAbort(waitStep, signal);
        }
        if (signal?.aborted) return { completed: false };

        try {
          const currentStatus = await invoke<PrinterStatus>("get_printer_status", {
            printerName: targetPrinter,
          });
          if (options?.useSecondary && this.secondaryPrinter === targetPrinter) {
            this.secondaryStatus = currentStatus;
          } else {
            this.status = currentStatus;
          }

          if (!currentStatus.is_online || currentStatus.has_error) {
            return {
              completed: false,
              error:
                currentStatus.error_message ||
                `Printer '${targetPrinter}' mengalami kendala saat mencetak`,
            };
          }
        } catch {
          // Abaikan error transien saat polling fase mekanis
        }
      }

      return { completed: true };
    } finally {
      this.isPrinting = false;
    }
  }

  async openPrinterProperties(printerName?: string | null) {
    const target = printerName || this.selectedPrinter;
    if (!target) return;
    try {
      await invoke("open_printer_properties", {
        printerName: target,
      });
    } catch (err) {
      console.error("[printerStore] Failed to open printer properties:", err);
      this.errorMessage = String(err);
      throw err;
    }
  }
}

export const printerStore = new PrinterStore();
