// YouTube tints the playing row of a playlist with a muted colour taken from the video's artwork.
// It only exposes that colour when a YouTube playlist is open, so Cue derives its own:
// the dominant hue of the thumbnail and how colourful it is. theme.css turns that into the
// row background and index colour for the light and dark themes.
import { CSSProperties, useEffect, useState } from 'react';

export interface Tint {
  hue: number;
  saturation: number;
}

const cache = new Map<string, Promise<Tint | null>>();

// The image is fetched and decoded as a bitmap rather than drawn from an <img>: Firefox taints
// a canvas that a content script fills from a cross-origin image, but never a decoded blob.
async function measure(videoId: string): Promise<Tint | null> {
  try {
    const response = await fetch(`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`, { credentials: 'omit' });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob(), { resizeWidth: 32, resizeHeight: 18 });
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, 32, 18);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, 32, 18);
    // Average hue as a vector weighted by chroma, so grey and black pixels don't pull it.
    let x = 0;
    let y = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const chroma = max - Math.min(r, g, b);
      if (chroma === 0) continue;
      const h = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
      const angle = (h * Math.PI) / 3;
      x += Math.cos(angle) * chroma;
      y += Math.sin(angle) * chroma;
    }
    const pixels = data.length / 4;
    const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    const saturation = Math.min(1, (Math.hypot(x, y) / pixels) * 2.5);
    return { hue: Math.round(hue), saturation: Math.round(saturation * 100) };
  } catch {
    return null;
  }
}

export function useTint(videoId: string | null | undefined): Tint | null {
  const [tint, setTint] = useState<Tint | null>(null);
  useEffect(() => {
    if (!videoId) return setTint(null);
    let cancelled = false;
    if (!cache.has(videoId)) cache.set(videoId, measure(videoId));
    cache.get(videoId)!.then((t) => !cancelled && setTint(t));
    return () => {
      cancelled = true;
    };
  }, [videoId]);
  return tint;
}

export const tintStyle = (tint: Tint | null): CSSProperties | undefined =>
  tint ? ({ '--tint-h': tint.hue, '--tint-s': `${tint.saturation}%` } as CSSProperties) : undefined;
