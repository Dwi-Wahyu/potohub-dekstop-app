<script lang="ts">
  /**
   * Step indicator (stepper) — shared between V2 (editorial hitam/putih) and
   * V3 (film-strip merah) layouts. Desktop is the source of truth; the
   * admin-dashboard preview must render the same indicator for the same
   * template_variant + ui_step.
   *
   * Props:
   *  - labels: step labels (V2) or step keys (V3, rendered as numbers/dots)
   *  - activeIndex: index of the current step
   *  - variant: 'v2' (pill labels) | 'v3' (numbered circles)
   */
  interface Props {
    labels: string[];
    activeIndex: number;
    variant?: 'v2' | 'v3';
  }

  let { labels, activeIndex, variant = 'v2' }: Props = $props();
</script>

{#if variant === 'v2'}
  <!-- V2 editorial stepper: black/white pills -->
  <div class="flex items-center gap-1">
    {#each labels as label, i}
      {@const isActive = i === activeIndex}
      {@const isDone = i < activeIndex}
      {@const pillClass = `px-4 py-1.5 rounded-full border-2 font-['Nunito',sans-serif] font-bold text-xs transition-all whitespace-nowrap ${
        isActive
          ? 'bg-[#C7EED8] text-black border-black shadow-[4px_4px_0_0_rgba(0,0,0,1)]'
          : isDone
            ? 'bg-black text-white border-black'
            : 'bg-transparent text-black/40 border-black/30'
      }`}
      {@const connectorClass = `w-6 h-px border-t border-black mx-0.5 ${isDone ? 'opacity-100' : 'opacity-30'}`}
      <div class="flex items-center">
        <div class={pillClass}>
          {#if isDone}✓ {/if}{label}
        </div>
        {#if i < labels.length - 1}
          <div class={connectorClass}></div>
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <!-- V3 film-strip stepper: numbered circles -->
  <div class="flex items-center gap-1.5">
    {#each labels as label, i}
      {@const isActive = i === activeIndex}
      {@const isDone = i < activeIndex}
      {@const dotClass = `w-7 h-7 rounded-full text-[9px] font-black flex items-center justify-center border-2 transition-all ${
        isDone
          ? 'bg-[#FFC107] border-[#FFC107] text-black'
          : isActive
            ? 'bg-white border-white text-[#CD1C33]'
            : 'bg-transparent border-white/30 text-white/40'
      }`}
      {@const connectorClass = `w-6 h-[2px] rounded-full ${isDone ? 'bg-[#FFC107]' : 'bg-white/20'}`}
      <div class="flex items-center gap-1.5">
        <div class={dotClass}>
          {#if isDone}✓{:else}{i + 1}{/if}
        </div>
        {#if i < labels.length - 1}
          <div class={connectorClass}></div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
