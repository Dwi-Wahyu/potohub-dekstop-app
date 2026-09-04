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

export function resolveFilterCss(filterIdOrCss?: string): string {
  if (!filterIdOrCss || filterIdOrCss === 'none' || filterIdOrCss === 'Original') {
    return 'none';
  }

  // Check direct match in FILTERS by id (case-insensitive) or label
  const filter = FILTERS.find(
    (f) => f.id.toLowerCase() === filterIdOrCss.toLowerCase() || f.label.toLowerCase() === filterIdOrCss.toLowerCase()
  );
  if (filter) {
    return filter.css;
  }

  // Handle V2 / V3 aliases or custom filter names
  const normalized = filterIdOrCss.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'bw' || normalized === 'blackandwhite') {
    return 'grayscale(100%)';
  }
  if (normalized === 'sepia') {
    return 'sepia(80%)';
  }
  if (normalized === 'cool') {
    return 'hue-rotate(30deg) saturate(120%)';
  }
  if (normalized === 'warm') {
    return 'sepia(30%) saturate(140%) brightness(105%)';
  }
  if (normalized === 'noir') {
    return 'grayscale(100%) contrast(130%) brightness(90%)';
  }
  if (normalized === 'vivid') {
    return 'saturate(180%) contrast(110%)';
  }
  if (normalized === 'retro') {
    return 'contrast(125%) sepia(30%)';
  }
  if (normalized === 'fade') {
    return 'brightness(115%) contrast(85%) saturate(80%)';
  }

  // If it already looks like a valid CSS filter function expression
  if (/grayscale|sepia|saturate|hue-rotate|brightness|contrast|blur|opacity/.test(filterIdOrCss)) {
    return filterIdOrCss;
  }

  return 'none';
}

export function applyFilterToCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  filterIdOrCss?: string
) {
  if (!filterIdOrCss || filterIdOrCss === 'none' || filterIdOrCss === 'Original') return;

  const normalized = filterIdOrCss.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized === 'none' || normalized === 'original') return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  if (normalized === 'bw' || normalized === 'blackandwhite' || normalized === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = g;
    }
  } else if (normalized === 'sepia') {
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
      data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
      data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
    }
  } else if (normalized === 'vivid') {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * 1.8;
      g = gray + (g - gray) * 1.8;
      b = gray + (b - gray) * 1.8;
      r = (r - 128) * 1.1 + 128;
      g = (g - 128) * 1.1 + 128;
      b = (b - 128) * 1.1 + 128;
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }
  } else if (normalized === 'cool') {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * 1.2;
      g = gray + (g - gray) * 1.2 + 5;
      b = gray + (b - gray) * 1.2 + 20;
      data[i] = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }
  } else if (normalized === 'warm') {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] * 1.05, g = data[i + 1] * 1.05, b = data[i + 2] * 1.05;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * 1.4;
      g = gray + (g - gray) * 1.4;
      b = gray + (b - gray) * 1.4;
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      data[i] = Math.min(255, Math.max(0, r * 0.7 + sr * 0.3));
      data[i + 1] = Math.min(255, Math.max(0, g * 0.7 + sg * 0.3));
      data[i + 2] = Math.min(255, Math.max(0, b * 0.7 + sb * 0.3));
    }
  } else if (normalized === 'retro') {
    for (let i = 0; i < data.length; i += 4) {
      let r = (data[i] - 128) * 1.25 + 128;
      let g = (data[i + 1] - 128) * 1.25 + 128;
      let b = (data[i + 2] - 128) * 1.25 + 128;
      const sr = r * 0.393 + g * 0.769 + b * 0.189;
      const sg = r * 0.349 + g * 0.686 + b * 0.168;
      const sb = r * 0.272 + g * 0.534 + b * 0.131;
      data[i] = Math.min(255, Math.max(0, r * 0.7 + sr * 0.3));
      data[i + 1] = Math.min(255, Math.max(0, g * 0.7 + sg * 0.3));
      data[i + 2] = Math.min(255, Math.max(0, b * 0.7 + sb * 0.3));
    }
  } else if (normalized === 'fade') {
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] * 1.15, g = data[i + 1] * 1.15, b = data[i + 2] * 1.15;
      r = (r - 128) * 0.85 + 128;
      g = (g - 128) * 0.85 + 128;
      b = (b - 128) * 0.85 + 128;
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      data[i] = Math.min(255, Math.max(0, gray + (r - gray) * 0.8));
      data[i + 1] = Math.min(255, Math.max(0, gray + (g - gray) * 0.8));
      data[i + 2] = Math.min(255, Math.max(0, gray + (b - gray) * 0.8));
    }
  } else if (normalized === 'noir') {
    for (let i = 0; i < data.length; i += 4) {
      let gray = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) * 0.9;
      gray = (gray - 128) * 1.3 + 128;
      const val = Math.min(255, Math.max(0, gray));
      data[i] = data[i + 1] = data[i + 2] = val;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

