<script lang="ts">
  import {
    Crop,
    Image as ImageIcon,
    Maximize2,
    Move,
    SlidersHorizontal,
    Sparkles,
  } from '@lucide/svelte';
  import { uiConfig } from '$lib/stores/uiConfig.svelte';
  import type { CropVariant } from './PhotoCropModal.svelte';

  interface Props {
    variant: CropVariant;
    accent: string;
    onclick: () => void;
    disabled?: boolean;
  }

  let { variant, accent, onclick, disabled = false }: Props = $props();

  const STYLES: Record<
    CropVariant,
    { font: string; bg: string; color: string; border: string; radius: number; shadow: string; cls: string }
  > = {
    v1: {
      font: "'Plus Jakarta Sans', sans-serif",
      bg: '#ffffff',
      color: '#111117',
      border: 'none',
      radius: 999,
      shadow: '0 6px 20px rgba(0,0,0,0.35)',
      cls: '',
    },
    v2: {
      font: "'Nunito', sans-serif",
      bg: '#ffffff',
      color: '#000000',
      border: '3px solid #000000',
      radius: 999,
      shadow: '4px 4px 0 0 #000000',
      cls: 'uppercase tracking-widest active:translate-x-0.5 active:translate-y-0.5',
    },
    v3: {
      font: 'Inter, system-ui, sans-serif',
      bg: 'rgba(0,0,0,0.3)',
      color: '#ffffff',
      border: '1px solid rgba(255,255,255,0.2)',
      radius: 999,
      shadow: 'none',
      cls: 'uppercase tracking-widest',
    },
  };

  let s = $derived(STYLES[variant]);
  let cropBlock = $derived(
    uiConfig.resolvedDesignBlocks?.screens?.filter?.blocks?.find((b) => b.type === 'photo_crop_button'),
  );

  let blockVariant = $derived(cropBlock?.variant ?? '');
  let label = $derived(String(cropBlock?.props?.label ?? 'Crop'));
  let iconKey = $derived(String(cropBlock?.props?.icon ?? 'crop'));
  let iconPos = $derived<'left' | 'right'>(
    cropBlock?.props?.iconPosition === 'right' ? 'right' : 'left',
  );
  let iconSize = $derived(Number(cropBlock?.props?.iconSize ?? 15));
  let paddingX = $derived(Number(cropBlock?.props?.paddingX ?? 16));
  let paddingY = $derived(Number(cropBlock?.props?.paddingY ?? 10));
  let fontSize = $derived(Number(cropBlock?.style?.fontSize ?? 12));

  let resolvedBg = $derived.by(() => {
    if (cropBlock?.style?.bgColor) return cropBlock.style.bgColor;
    if (blockVariant === 'solid_pill') return cropBlock?.style?.accentColor || accent;
    if (blockVariant === 'outline_pill') return 'transparent';
    if (blockVariant === 'gradient_glow') {
      const a = cropBlock?.style?.accentColor || accent || '#6366f1';
      return `linear-gradient(135deg, ${a}, #1e1b4b)`;
    }
    return s.bg;
  });

  let resolvedColor = $derived.by(() => {
    if (cropBlock?.style?.color) return cropBlock.style.color;
    if (blockVariant === 'solid_pill' || blockVariant === 'gradient_glow') return '#ffffff';
    return s.color;
  });

  let resolvedIconColor = $derived(
    cropBlock?.style?.accentColor ?? (variant === 'v1' && !cropBlock?.style?.color ? accent : undefined),
  );

  let resolvedBorder = $derived.by(() => {
    const bw = cropBlock?.style?.borderWidth;
    const bc = cropBlock?.style?.borderColor;
    if (typeof bw === 'number' && bw > 0) {
      return `${bw}px solid ${bc || resolvedColor}`;
    }
    if (blockVariant === 'outline_pill') {
      return `2px solid ${bc || cropBlock?.style?.accentColor || resolvedColor}`;
    }
    if (blockVariant === 'v2_brutalist') {
      return `3px solid ${bc || '#000000'}`;
    }
    if (blockVariant === 'v3_glass') {
      return `1px solid ${bc || 'rgba(255,255,255,0.22)'}`;
    }
    if (bw === 0 && cropBlock) return 'none';
    return s.border;
  });

  let resolvedRadius = $derived(
    typeof cropBlock?.style?.borderRadius === 'number' ? cropBlock.style.borderRadius : s.radius,
  );

  let resolvedShadow = $derived.by(() => {
    const customShadow = cropBlock?.props?.shadow ?? cropBlock?.style?.shadow;
    if (typeof customShadow === 'string' && customShadow.trim().length > 0) return customShadow;
    if (blockVariant === 'v2_brutalist') return '4px 4px 0 0 #000000';
    if (blockVariant === 'gradient_glow') return '0 10px 26px rgba(99,102,241,0.45)';
    return s.shadow;
  });

  let buttonStyle = $derived(
    [
      `font-family: ${s.font}`,
      `background: ${resolvedBg}`,
      `color: ${resolvedColor}`,
      `border: ${resolvedBorder}`,
      `border-radius: ${resolvedRadius}px`,
      `box-shadow: ${resolvedShadow}`,
      `padding: ${paddingY}px ${paddingX}px`,
      `font-size: ${fontSize}px`,
    ].join('; '),
  );
</script>

{#snippet triggerIcon()}
  {#if iconKey === 'crop'}
    <Crop size={iconSize} strokeWidth={2.5} style={resolvedIconColor ? `color: ${resolvedIconColor};` : undefined} />
  {:else if iconKey === 'maximize'}
    <Maximize2 size={iconSize} strokeWidth={2.5} style={resolvedIconColor ? `color: ${resolvedIconColor};` : undefined} />
  {:else if iconKey === 'move'}
    <Move size={iconSize} strokeWidth={2.5} style={resolvedIconColor ? `color: ${resolvedIconColor};` : undefined} />
  {:else if iconKey === 'sliders'}
    <SlidersHorizontal size={iconSize} strokeWidth={2.5} style={resolvedIconColor ? `color: ${resolvedIconColor};` : undefined} />
  {:else if iconKey === 'sparkles'}
    <Sparkles size={iconSize} strokeWidth={2.5} style={resolvedIconColor ? `color: ${resolvedIconColor};` : undefined} />
  {:else if iconKey === 'image'}
    <ImageIcon size={iconSize} strokeWidth={2.5} style={resolvedIconColor ? `color: ${resolvedIconColor};` : undefined} />
  {/if}
{/snippet}

<button
  {onclick}
  {disabled}
  class="flex items-center justify-center gap-2 font-bold cursor-pointer transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:cursor-default {s.cls}"
  style={buttonStyle}
  aria-label={label || 'Crop foto'}
>
  {#if iconKey !== 'none' && iconPos === 'left'}
    {@render triggerIcon()}
  {/if}
  {#if label}
    <span>{label}</span>
  {/if}
  {#if iconKey !== 'none' && iconPos === 'right'}
    {@render triggerIcon()}
  {/if}
</button>
