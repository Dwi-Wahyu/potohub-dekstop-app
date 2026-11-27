<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { FrameScreen, type AdapterCategory, type AdapterTemplate, type DesignBlocksDocument } from '@potohub/booth-ui';
  import { cameraStore } from '$lib/camera.svelte';
  import { fetchCategories, fetchTemplates, requireActiveBoothId } from '$lib/api/boothClient';
  import { cachedFetch } from '$lib/utils/offlineCache';
  import { preloadAndResolveTemplateAssets } from '$lib/utils/templateComposite';
  import { createDesktopUiAdapter } from '$lib/adapters/boothUiAdapter.svelte';

  interface Props {
    doc: DesignBlocksDocument;
    onSelectFrame: (frameId: string, price: number) => void;
    onBack: () => void;
  }

  let { doc, onSelectFrame, onBack }: Props = $props();

  let categoriesData = $state<AdapterCategory[]>([]);
  let templatesData = $state<AdapterTemplate[]>([]);
  let frameSrc = $state('');
  let liveviewInterval: ReturnType<typeof setInterval> | null = null;

  let shouldRunLiveview = $derived(
    doc.screens.frame.blocks.some(
      (b) => b.type === 'frame_live_preview' && b.visible !== false && b.props?.showLiveCamera !== false,
    ),
  );
  let liveviewStarted = false;

  onMount(async () => {
    const catalogPromise = (async () => {
      try {
        const boothId = await requireActiveBoothId();
        await cachedFetch(
          `categories:${boothId}`,
          () => fetchCategories(boothId),
          (d) => {
            categoriesData = d;
            preloadAndResolveTemplateAssets(templatesData as any, d);
          },
        );
        await cachedFetch(
          `templates:${boothId}`,
          () => fetchTemplates(boothId),
          (d) => {
            templatesData = d;
            preloadAndResolveTemplateAssets(d, categoriesData as any);
          },
        );
      } catch (err) {
        console.error('[KioskFrameWrapper] Failed to load catalog:', err);
      }
    })();

    if (shouldRunLiveview) {
      liveviewStarted = true;
      await cameraStore.checkDevMode();
      if ((cameraStore.isDevMode || cameraStore.cameraMode === 'webcam') && cameraStore.cameraMode !== 'demo') {
        cameraStore.cameraMode = 'webcam';
      }
      await cameraStore.startLiveview(null);
      if (cameraStore.cameraMode === 'usb' || cameraStore.cameraMode === 'demo') {
        const firstFrame = await cameraStore.getLiveviewFrame();
        if (firstFrame) frameSrc = firstFrame;
        let fetching = false;
        liveviewInterval = setInterval(async () => {
          if (fetching) return;
          fetching = true;
          try {
            const url = await cameraStore.getLiveviewFrame();
            if (url) frameSrc = url;
          } finally {
            fetching = false;
          }
        }, 150);
      }
    }

    await catalogPromise;
  });

  onDestroy(() => {
    if (liveviewInterval) clearInterval(liveviewInterval);
    if (liveviewStarted) {
      cameraStore.stopLiveview();
    }
  });

  let adapter = $derived(
    createDesktopUiAdapter({
      categories: categoriesData,
      templates: templatesData,
      frameSrc,
      callbacks: {
        onBack,
        onSelectFrame: ({ frameId, price }) => onSelectFrame(frameId, price),
      },
    }),
  );
</script>

<div class="w-full h-full">
  <FrameScreen {doc} {adapter} enableAutoCountdown={true} />
</div>
