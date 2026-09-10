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
    // best-effort face blur (spec v2.1 §3.3) — never blocks submit
    await blurFaces(canvas, ctx, w, h).catch(()=>{});
    const sanitized = await new Promise((res, rej) => {
      canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/webp', 0.85);
    });
    return sanitized;
  } catch {
    return blob;
  }
}

async function blurFaces(canvas, ctx, w, h) {
  if (typeof window === 'undefined' || !('FaceDetector' in window)) return;
  try {
    const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
    // timeout 1.5s — don't stall submit
    const faces = await Promise.race([
      detector.detect(canvas),
      new Promise((_, rej) => setTimeout(() => rej(new Error('face timeout')), 1500))
    ]);
    if (!faces || !faces.length) return;
    for (const face of faces) {
      const box = face.boundingBox;
      const expand = 0.15;
      let x = box.x - box.width * expand / 2;
      let y = box.y - box.height * expand / 2;
      let fw = box.width * (1 + expand);
      let fh = box.height * (1 + expand);
      x = Math.max(0, x); y = Math.max(0, y);
      fw = Math.min(w - x, fw); fh = Math.min(h - y, fh);
      if (fw < 4 || fh < 4) continue;
      // copy face region to temp, then draw back blurred
      const temp = document.createElement('canvas');
      temp.width = Math.round(fw); temp.height = Math.round(fh);
      const tctx = temp.getContext('2d');
      tctx.drawImage(canvas, x, y, fw, fh, 0, 0, fw, fh);
      ctx.save();
      ctx.filter = 'blur(16px)';
      ctx.drawImage(temp, 0, 0, fw, fh, x, y, fw, fh);
      ctx.restore();
      // extra pixelation pass for stronger privacy
      const small = 10;
      const p = document.createElement('canvas');
      p.width = small; p.height = Math.round(small * fh / fw);
      const pctx = p.getContext('2d');
      pctx.drawImage(temp, 0, 0, small, p.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(p, 0, 0, small, p.height, x, y, fw, fh);
      ctx.imageSmoothingEnabled = true;
    }
  } catch {}
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
