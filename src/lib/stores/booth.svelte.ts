import type { Sticker } from '$lib/utils/stickers';

export type BoothStep =
  | "welcome"
  | "tutorial"
  | "payment"
  | "ticket"
  | "frame"
  | "print_qty"
  | "session"
  | "filter"
  | "customize"
  | "loading"
  | "download";

export type StickersChoosen = {
  url: string;
  x: number;
  y: number;
};

// Crop per foto (pan & zoom) dari modal Crop di step filter.
// x/y: pergeseran relatif terhadap ukuran slot (0.1 = 10% lebar/tinggi slot),
// zoom: 1 (cover) s/d 3. Dipakai identik oleh preview CSS dan templateComposite.
export type PhotoTransform = {
  x: number;
  y: number;
  zoom: number;
};

export const IDENTITY_TRANSFORM: PhotoTransform = { x: 0, y: 0, zoom: 1 };

class BoothFlowStore {
  step = $state<BoothStep>("welcome");
  countdown = $state<number | null>(null);
  isFlashActive = $state(false);
  isCapturingCamera = $state(false);
  captureMessage = $state<string | null>(null);
  photosTaken = $state<string[]>([]); // dataURL / blob URL tiap jepretan
  liveviewClips = $state<(string | null)[]>([]); // blob URL video per slot, index selaras photosTaken
  selectedFrameId = $state<string | null>(null);
  selectedFilterId = $state<string>("none");
  printQty = $state(1);
  paymentMethod = $state<'Cashless' | 'Ticket'>('Ticket');
  sessionCode = $state<string | null>(null);
  sessionId = $state<string | null>(null);
  stickersChoosen = $state<StickersChoosen[]>([]);
  stickers = $state<Sticker[]>([]);
  compositeStripUrl = $state<string | null>(null);
  sessionGifUrl = $state<string | null>(null);
  sessionVideoUrl = $state<string | null>(null);
  isGeneratingGif = $state<boolean>(false);
  isGeneratingVideo = $state<boolean>(false);
  // Dikunci per URL foto (bukan index slot) supaya retake otomatis membuang crop lama
  photoTransforms = $state<Record<string, PhotoTransform>>({});

  goTo(step: BoothStep) {
    this.step = step;
  }

  getPhotoTransform(photoSrc: string | null | undefined): PhotoTransform {
    if (!photoSrc) return IDENTITY_TRANSFORM;
    return this.photoTransforms[photoSrc] ?? IDENTITY_TRANSFORM;
  }

  setPhotoTransform(photoSrc: string, transform: PhotoTransform) {
    this.photoTransforms = { ...this.photoTransforms, [photoSrc]: transform };
  }

  reset() {
    if (this.sessionGifUrl && this.sessionGifUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.sessionGifUrl); } catch {}
    }
    if (this.sessionVideoUrl && this.sessionVideoUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.sessionVideoUrl); } catch {}
    }
    this.step = "welcome";
    this.countdown = null;
    this.isFlashActive = false;
    this.isCapturingCamera = false;
    this.captureMessage = null;
    this.photosTaken = [];
    this.liveviewClips = [];
    this.selectedFrameId = null;
    this.selectedFilterId = "none";
    this.printQty = 1;
    this.paymentMethod = 'Ticket';
    this.sessionCode = null;
    this.sessionId = null;
    this.stickersChoosen = [];
    this.stickers = [];
    this.compositeStripUrl = null;
    this.sessionGifUrl = null;
    this.sessionVideoUrl = null;
    this.isGeneratingGif = false;
    this.isGeneratingVideo = false;
    this.photoTransforms = {};

    // Hapus checkpoint sesi aktif saat sesi di-reset kembali ke welcome
    if (typeof window !== 'undefined') {
      import('$lib/utils/activeSessionCheckpoint').then(({ clearActiveCheckpoint }) => {
        void clearActiveCheckpoint();
      }).catch(() => {});
    }

    // Trigger idle queue processor otomatis saat kembali ke layar standby awal
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        import('$lib/utils/idleCoordinator').then(({ checkAndFlushQueuesIfIdle }) => {
          void checkAndFlushQueuesIfIdle();
        });
      }, 500);
    }
  }
}

export const boothFlow = new BoothFlowStore();
