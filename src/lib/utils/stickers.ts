export const EMOJI_LIST = [
  "😍",
  "💕",
  "❤️",
  "🥰",
  "💖",
  "💗",
  "😘",
  "🤩",
  "🌟",
  "✨",
  "⭐",
  "🌙",
  "🌈",
  "🌸",
  "🌺",
  "🌻",
  "🎉",
  "🎊",
  "🎀",
  "🎶",
  "🎤",
  "🎸",
  "🏆",
  "👑",
  "🔥",
  "💯",
  "💎",
  "🍀",
  "🦋",
  "🌴",
  "😂",
  "🥳",
  "😎",
  "😇",
  "🤗",
  "🥺",
  "😜",
  "🫶",
  "💫",
  "🎈",
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
    console.error("Failed to save booth emojis:", e);
  }
}

export type StickerType = "emoji" | "image";

export interface Sticker {
  id: number;
  type: StickerType;
  emoji?: string; // Digunakan jika type === 'emoji'
  imageUrl?: string; // URL gambar dari DB/R2 jika type === 'image'
  x: number; // Posisi X (persentase %)
  y: number; // Posisi Y (persentase %)
  width?: number; // Opsional: Lebar kustom (%)
  height?: number; // Opsional: Tinggi kustom (%)
  rotation?: number; // Opsional: Derajat rotasi stiker
}
