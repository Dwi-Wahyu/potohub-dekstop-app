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

class BoothFlowStore {
  step = $state<BoothStep>("welcome");
  countdown = $state<number | null>(null);
  isFlashActive = $state(false);
  photosTaken = $state<string[]>([]); // dataURL / blob URL tiap jepretan
  liveviewClips = $state<(string | null)[]>([]); // blob URL video per slot, index selaras photosTaken
  selectedFrameId = $state<string | null>(null);
  selectedFilterId = $state<string>("none");
  printQty = $state(1);
  sessionCode = $state<string | null>(null);
  sessionId = $state<string | null>(null);
  stickersChoosen = $state<StickersChoosen[]>([]);
  stickers = $state<Sticker[]>([]);
  compositeStripUrl = $state<string | null>(null);
  sessionGifUrl = $state<string | null>(null);
  sessionVideoUrl = $state<string | null>(null);
  isGeneratingGif = $state<boolean>(false);
  isGeneratingVideo = $state<boolean>(false);

  goTo(step: BoothStep) {
    this.step = step;
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
    this.photosTaken = [];
    this.liveviewClips = [];
    this.selectedFrameId = null;
    this.selectedFilterId = "none";
    this.printQty = 1;
    this.sessionCode = null;
    this.sessionId = null;
    this.stickersChoosen = [];
    this.stickers = [];
    this.compositeStripUrl = null;
    this.sessionGifUrl = null;
    this.sessionVideoUrl = null;
    this.isGeneratingGif = false;
    this.isGeneratingVideo = false;
  }
}

export const boothFlow = new BoothFlowStore();
