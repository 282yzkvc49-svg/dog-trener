// Уменьшение фото перед сохранением: длинная сторона до 1280 px, JPEG ~0.8, контроль размера.

export const MAX_SIDE = 1280;
export const MAX_BYTES = 900 * 1024;

export async function resizePhoto(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('Это не изображение.');
  const bitmap = await loadImage(file);
  let { width, height } = bitmap;
  const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
  width = Math.round(width * scale);
  height = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось обработать фото.');
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);
  let quality = 0.82;
  let blob = await toBlob(canvas, quality);
  while (blob.size > MAX_BYTES && quality > 0.45) {
    quality -= 0.12;
    blob = await toBlob(canvas, quality);
  }
  if (blob.size > MAX_BYTES * 1.5) throw new Error('Фото слишком большое даже после сжатия.');
  return { blob, width, height };
}

function toBlob(canvas: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось сжать фото.'))), 'image/jpeg', q));
}

async function loadImage(file: File): Promise<{ width: number; height: number } & CanvasImageSource> {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file); } catch { /* HEIC и др. — пробуем через <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight });
  } catch {
    throw new Error('Не удалось открыть фото. Попробуйте другой снимок.');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
