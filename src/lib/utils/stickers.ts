export const EMOJI_LIST = [
  '😍', '💕', '❤️', '🥰', '💖', '💗', '😘', '🤩',
  '🌟', '✨', '⭐', '🌙', '🌈', '🌸', '🌺', '🌻',
  '🎉', '🎊', '🎀', '🎶', '🎤', '🎸', '🏆', '👑',
  '🔥', '💯', '💎', '🍀', '🦋', '🌴', '😂', '🥳',
  '😎', '😇', '🤗', '🥺', '😜', '🫶', '💫', '🎈'
];

const EMOJI_STORE_KEY = (id: string) => `booth_emojis_${id}`;

export function loadBoothEmojis(boothId: string): string[] {
  try {
    const r = localStorage.getItem(EMOJI_STORE_KEY(boothId));
    if (r) {
      const parsed = JSON.parse(r);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [...EMOJI_LIST];
}

export function saveBoothEmojis(boothId: string, list: string[]) {
  try {
    localStorage.setItem(EMOJI_STORE_KEY(boothId), JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save booth emojis:', e);
  }
}

export interface Sticker {
  id: number;
  emoji: string;
  x: number;
  y: number;
}
