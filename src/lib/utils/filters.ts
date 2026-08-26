export interface Filter {
  id: string;
  label: string;
  css: string;
}

export const FILTERS: Filter[] = [
  { id: 'none', label: 'Original', css: 'none' },
  { id: 'bw', label: 'B&W', css: 'grayscale(100%)' },
  { id: 'sepia', label: 'Sepia', css: 'sepia(80%)' },
  { id: 'vivid', label: 'Vivid', css: 'saturate(180%) contrast(110%)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(30deg) saturate(120%)' },
  { id: 'warm', label: 'Warm', css: 'sepia(30%) saturate(140%) brightness(105%)' },
  { id: 'retro', label: 'Retro', css: 'contrast(125%) sepia(30%)' },
  { id: 'fade', label: 'Fade', css: 'brightness(115%) contrast(85%) saturate(80%)' },
  { id: 'noir', label: 'Noir', css: 'grayscale(100%) contrast(130%) brightness(90%)' }
];

export function getFilterClass(filterId: string): string {
  const map: Record<string, string> = {
    none: '',
    bw: 'grayscale',
    sepia: 'sepia',
    vivid: 'saturate-150',
    retro: 'contrast-125 sepia-[.3]',
    cool: 'hue-rotate-15',
    warm: 'brightness-110 sepia-[.2]',
    fade: 'brightness-110 opacity-90',
    noir: 'grayscale contrast-125'
  };
  return map[filterId] ?? '';
}
