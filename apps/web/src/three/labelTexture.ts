import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

export const LABEL_CACHE_SIZE = 500;

const FONT_PX = 28;
const PAD_X = 12;
const HEIGHT_PX = 44;
// Same stack as the UI: no web fonts in a closed network.
const FONT = `600 ${FONT_PX}px system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif`;

// Map iteration order is insertion order, so the first key is the least recently used.
const cache = new Map<string, CanvasTexture>();

function drawLabel(text: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let width = HEIGHT_PX;
  if (ctx) {
    ctx.font = FONT;
    width = Math.max(HEIGHT_PX, Math.ceil(ctx.measureText(text).width) + PAD_X * 2);
  }
  canvas.width = width;
  canvas.height = HEIGHT_PX;
  if (ctx) {
    // Resizing the canvas resets the context state.
    ctx.font = FONT;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    // roundRect is missing in older browsers; throwing here would break the render loop.
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(0, 0, width, HEIGHT_PX, 8);
      ctx.fill();
    } else {
      ctx.fillRect(0, 0, width, HEIGHT_PX);
    }
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, PAD_X, HEIGHT_PX / 2 + 1);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.userData.aspect = width / HEIGHT_PX;
  return texture;
}

/** Shared label texture for `text`; the cache owns it and disposes it on eviction. */
export function getLabelTexture(text: string): CanvasTexture {
  let texture = cache.get(text);
  if (texture) {
    cache.delete(text);
  } else {
    texture = drawLabel(text);
    if (cache.size >= LABEL_CACHE_SIZE) {
      const [oldest, evicted] = cache.entries().next().value!;
      cache.delete(oldest);
      evicted.dispose();
    }
  }
  cache.set(text, texture);
  return texture;
}

export function clearLabelTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
