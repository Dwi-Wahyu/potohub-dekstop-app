import { cameraStore } from '$lib/camera.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';
import { uiConfig } from '$lib/stores/uiConfig.svelte';
import { getLiveviewTransformStyle } from '$lib/utils/shared';
import type {
  AdapterCategory,
  AdapterTemplate,
  BoothRuntimeAdapter,
  PaymentRuntimeState,
  SessionRuntimeState,
  SoftfileRuntimeState,
  TicketRuntimeState,
} from '@potohub/booth-ui';

export function createDesktopUiAdapter(params: {
  categories: AdapterCategory[];
  templates: AdapterTemplate[];
  frameSrc?: string;
  customTutorialImg?: string;
  payment?: PaymentRuntimeState;
  session?: SessionRuntimeState;
  ticket?: TicketRuntimeState;
  softfile?: SoftfileRuntimeState;
  callbacks?: BoothRuntimeAdapter['callbacks'];
}): BoothRuntimeAdapter {
  return {
    mode: 'runtime',
    boothName: uiConfig.config.boothName || 'POTOHUB',
    tagline: uiConfig.config.tagline || '',
    primaryColor: uiConfig.config.primaryColor,
    categories: params.categories,
    templates: params.templates,
    tutorialImageUrl: params.customTutorialImg || uiConfig.tutorialImageUrl || uiConfig.config.tutorialImageUrl || '',
    settings: {
      skipPayment: boothConfig.config.skipPayment,
      earlyPaymentPage: boothConfig.config.earlyPaymentPage,
      photoFilter: boothConfig.config.photoFilter,
      procedureTimeSecs: boothConfig.config.procedureTimeSecs,
      showStepIndicator: uiConfig.config.showStepIndicator,
    },
    resolveAssetUrl: (url) => uiConfig.resolveAssetUrl(url),
    payment: params.payment,
    session: params.session,
    ticket: params.ticket,
    softfile: params.softfile,
    liveview: {
      isActive: cameraStore.isLiveviewActive,
      cameraMode: cameraStore.cameraMode,
      status: cameraStore.status,
      errorMessage: cameraStore.errorMessage,
      frameSrc: params.frameSrc || '',
      stream: cameraStore.cameraMode === 'webcam' ? cameraStore.stream : null,
      transformCss: getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode),
      attachVideo: (node, stream) => {
        const activeStream = stream ?? cameraStore.stream;
        cameraStore.setVideoElement(node);
        if (activeStream && node.srcObject !== activeStream) {
          node.srcObject = activeStream;
          node.muted = true;
          node.playsInline = true;
          node.play().catch(() => {});
        }
        return {
          update(newStream: MediaStream | null) {
            const targetStream = newStream ?? cameraStore.stream;
            cameraStore.setVideoElement(node);
            if (targetStream) {
              if (node.srcObject !== targetStream) {
                node.srcObject = targetStream;
                node.muted = true;
                node.playsInline = true;
                node.play().catch(() => {});
              }
            } else {
              node.srcObject = null;
            }
          },
          destroy() {
            node.srcObject = null;
          },
        };
      },
    },
    callbacks: params.callbacks,
  };
}
