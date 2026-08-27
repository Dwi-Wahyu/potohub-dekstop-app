export type BoothStep =
  | 'welcome'
  | 'tutorial'
  | 'payment'
  | 'ticket'
  | 'frame'
  | 'print_qty'
  | 'session'
  | 'filter'
  | 'customize'
  | 'loading'
  | 'download';

class BoothFlowStore {
  step = $state<BoothStep>('welcome');
  countdown = $state<number | null>(null);
  isFlashActive = $state(false);
  photosTaken = $state<string[]>([]); // dataURL / blob URL tiap jepretan
  liveviewClips = $state<(string | null)[]>([]); // blob URL video per slot, index selaras photosTaken
  selectedFrameId = $state<string | null>(null);
  selectedFilterId = $state<string>('none');
  printQty = $state(1);
  sessionCode = $state<string | null>(null);
  sessionId = $state<string | null>(null);

  goTo(step: BoothStep) {
    this.step = step;
  }

  reset() {
    this.step = 'welcome';
    this.countdown = null;
    this.isFlashActive = false;
    this.photosTaken = [];
    this.liveviewClips = [];
    this.selectedFrameId = null;
    this.selectedFilterId = 'none';
    this.printQty = 1;
    this.sessionCode = null;
    this.sessionId = null;
  }
}

export const boothFlow = new BoothFlowStore();
