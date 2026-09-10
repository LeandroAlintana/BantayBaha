// media.js — privacy sanitization: EXIF removal via decode → re-encode
// Spec v2.1 §3.2: decode → transform → re-encode (not EXIF blacklist). Drops GPS, timestamp, make/model, orientation, etc.

/**
 * Sanitize an image blob by re-encoding through canvas.
 * Returns a new Blob (image/webp) with no EXIF. Falls back to original on failure.
 * Never throws — caller can safely await.
 */
export async function sanitizeImage(blob) {
  if (!blob || !(blob instanceof Blob)) return blob;
  if (!blob.type.startsWith('image/')) return blob;
  try {
    const bitmap = await loadBitmap(blob);
    const { width, height } = bitmap;
    // cap longest side to 1920 to keep upload small, preserve aspect
    const maxSide = 1920;
    let w = width, h = height;
    if (Math.max(w, h) > maxSide) {
      if (w > h) { h = Math.round(h * maxSide / w); w = maxSide; }
      else { w = Math.round(w * maxSide / h); h = maxSide; }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // drawImage handles orientation normalization via bitmap
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    const sanitized = await new Promise((res, rej) => {
      canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/webp', 0.85);
    });
    return sanitized;
  } catch {
    return blob;
  }
}

async function loadBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch {}
  }
  // fallback via <img>
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    // wrap Image as ImageBitmap-like for drawImage
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
