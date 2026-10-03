<script lang="ts">
  import { Crop } from '@lucide/svelte';
  import type { CropVariant } from './PhotoCropModal.svelte';

  interface Props {
    variant: CropVariant;
    accent: string;
    onclick: () => void;
    disabled?: boolean;
  }

  let { variant, accent, onclick, disabled = false }: Props = $props();

  const STYLES: Record<CropVariant, { font: string; style: string; cls: string }> = {
    v1: {
      font: "'Plus Jakarta Sans', sans-serif",
      style: 'background: #fff; color: #111117; border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,0.35); border: none;',
      cls: ''
    },
    v2: {
      font: "'Nunito', sans-serif",
      style: 'background: #fff; color: #000; border: 3px solid #000; border-radius: 999px; box-shadow: 4px 4px 0 0 #000;',
      cls: 'uppercase tracking-widest active:translate-x-0.5 active:translate-y-0.5'
    },
    v3: {
      font: 'Inter, system-ui, sans-serif',
      style: 'background: rgba(0,0,0,0.3); color: #fff; border-radius: 999px; border: 1px solid rgba(255,255,255,0.2);',
      cls: 'uppercase tracking-widest'
    }
  };

  let s = $derived(STYLES[variant]);
</script>

<button
  {onclick}
  {disabled}
  class="flex items-center gap-2 px-4 py-2.5 text-xs font-bold cursor-pointer transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-40 disabled:cursor-default {s.cls}"
  style="font-family: {s.font}; {s.style}"
  aria-label="Crop foto"
>
  <Crop size={15} strokeWidth={2.5} style={variant === 'v1' ? `color: ${accent};` : undefined} />
  Crop
</button>
