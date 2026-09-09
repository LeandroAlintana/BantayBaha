import { initializeCamera } from './camera.js';
import { getReporterSession, supabase } from './supabase.js';

const toast = document.querySelector('.toast');
let toastTimer;

function notify(message, link) {
  toast.textContent = '';
  toast.append(document.createTextNode(message));
  if (link) {
    const a = document.createElement('a');
    a.href = link.href;
    a.textContent = link.text;
    a.style.cssText = 'color:#fff;text-decoration:underline;margin-left:8px';
    toast.append(a);
  }
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 6000);
}

document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
  document.querySelectorAll('.chip').forEach(item => {
    item.classList.remove('selected');
    item.setAttribute('aria-pressed', 'false');
  });
  chip.classList.add('selected');
  chip.setAttribute('aria-pressed', 'true');
}));

document.querySelectorAll('.sev-block').forEach((block, index) => block.addEventListener('click', () => {
  document.querySelectorAll('.sev-block').forEach((item, itemIndex) => item.setAttribute('aria-pressed', String(itemIndex <= index)));
}));

const camera = initializeCamera();

// ponytail: drag pin only, geocode if users complain
// ISAT-U campus center (approx OSM) — see seed/map/critical_sites.coords.json
let pinLat = 10.715500, pinLng = 122.566400;
const coordsEl = document.getElementById('pin-coords');
function updateCoords(lat, lng) { pinLat = lat; pinLng = lng; if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} — drag to adjust`; }
let pinMap, pinMarker;
function initPinMap(lat, lng) {
  if (pinMap) return;
  pinMap = L.map('pin-map', { zoomControl: false, maxZoom: 19 }).setView([lat, lng], 18);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19, maxNativeZoom: 19 }).addTo(pinMap);
  pinMarker = L.marker([lat, lng], { draggable: true }).addTo(pinMap);
  pinMarker.on('dragend', () => { const p = pinMarker.getLatLng(); updateCoords(p.lat, p.lng); });
  pinMap.on('click', e => { pinMarker.setLatLng(e.latlng); updateCoords(e.latlng.lat, e.latlng.lng); });
  updateCoords(lat, lng);
  setTimeout(() => pinMap.invalidateSize(), 200);
}
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    p => initPinMap(p.coords.latitude, p.coords.longitude),
    () => initPinMap(pinLat, pinLng),
    { enableHighAccuracy: true, timeout: 5000 }
  );
} else initPinMap(pinLat, pinLng);
// handle hidden phone-screen on load
const pinMapEl = document.getElementById('pin-map');
if (pinMapEl) {
  const obs = new ResizeObserver(() => { if (pinMap) pinMap.invalidateSize(); });
  obs.observe(pinMapEl);
}

document.querySelector('.submit-btn').addEventListener('click', async event => {
  const button = event.currentTarget;
  const photo = camera.getCapturedPhoto();
  const hazardType = document.querySelector('.chip.selected').textContent.trim();
  const landmark = document.getElementById('landmark')?.value.trim() || null;
  // severity fallback per spec §B.4 if no photo or manual not set
  let severity = document.querySelectorAll('.sev-block[aria-pressed="true"]').length;
  if (!severity) severity = hazardType.toLowerCase().includes('trash') ? 2 : 3;

  button.disabled = true;
  button.textContent = 'Submitting…';
  try {
    const session = await getReporterSession();
    let photoPath = null;
    if (photo) {
      const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
      photoPath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('report-photos')
        .upload(photoPath, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
    }

    const genTid = 'TRK-' + Math.random().toString(36).slice(2,6).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase().slice(0,2);
    const { data, error: reportError } = await supabase.from('reports').insert({
      tracking_id: genTid,
      hazard_type: hazardType,
      severity,
      photo_path: photoPath,
      ai_summary: photo ? 'Pending analysis' : `Photo-less report — ${hazardType} heuristic`,
      lat: pinLat,
      lng: pinLng,
      landmark
    }).select('tracking_id').single();
    if (reportError) throw reportError;

    const tid = data?.tracking_id ?? genTid;
    const link = { href: `pages/tracking.html?id=${encodeURIComponent(tid)}`, text: '→ Check My Report' };
    notify(`Report ${tid} received`, link);
  } catch (error) {
    console.error(error);
    notify(error.message || 'Unable to submit the report. Please try again.');
  } finally {
    button.disabled = false;
    button.textContent = 'Submit report';
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
