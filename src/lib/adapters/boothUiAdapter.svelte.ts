import { cameraStore } from '$lib/camera.svelte';
import { boothConfig } from '$lib/stores/boothConfig.svelte';
import { uiConfig } from '$lib/stores/uiConfig.svelte';
import { getLiveviewTransformStyle } from '$lib/utils/shared';
import type { AdapterCategory, AdapterTemplate, BoothRuntimeAdapter } from '@potohub/booth-ui';

export function createDesktopUiAdapter(params: {
  categories: AdapterCategory[];
  templates: AdapterTemplate[];
  frameSrc?: string;
  customTutorialImg?: string;
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
    liveview: {
      isActive: cameraStore.isLiveviewActive,
      cameraMode: cameraStore.cameraMode,
      frameSrc: params.frameSrc || '',
      stream: cameraStore.stream,
      transformCss: getLiveviewTransformStyle(boothConfig.config, cameraStore.cameraMode),
      attachVideo: (node, stream) => {
        cameraStore.setVideoElement(node);
        if (stream && node.srcObject !== stream) {
          node.srcObject = stream;
          node.muted = true;
          node.playsInline = true;
          node.play().catch(() => {});
        }
        return {
          update(newStream: MediaStream | null) {
            cameraStore.setVideoElement(node);
            if (newStream) {
              if (node.srcObject !== newStream) {
                node.srcObject = newStream;
                node.muted = true;
                node.playsInline = true;
                node.play().catch(() => {});
              }
            } else {
              node.srcObject = null;
            }
          },
          destroy() {
            cameraStore.setVideoElement(null);
            node.srcObject = null;
          },
        };
      },
    },
    callbacks: params.callbacks,
  };
}
