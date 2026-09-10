import { initializeCamera } from './camera.js';
import { getReporterSession, supabase } from './supabase.js';
import { heuristicVision, callVisionEdge } from './vision.js';

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
const gpsChip = document.querySelector('.gps-chip span:last-child');
let criticalSites = [];
supabase.from('critical_sites').select('name,lat,lng').then(({data})=>{ if(data) criticalSites=data; updateGpsChip(pinLat,pinLng); });
function nearestSite(lat,lng){
  if(!criticalSites.length) return null;
  let best=null, bestD=Infinity;
  for(const s of criticalSites){
    const d = Math.hypot((s.lat-lat)*111000, (s.lng-lng)*111000*Math.cos(lat*Math.PI/180));
    if(d<bestD){ bestD=d; best={...s, dist:d}; }
  }
  return bestD<120 ? best : null;
}
function updateGpsChip(lat,lng){
  if(!gpsChip) return;
  const site = nearestSite(lat,lng);
  const label = site ? `${site.name.toUpperCase()} · ${lat.toFixed(4)}, ${lng.toFixed(4)}` : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  gpsChip.textContent = label;
}
function updateCoords(lat, lng) { pinLat = lat; pinLng = lng; if (coordsEl) coordsEl.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)} — drag to adjust`; updateGpsChip(lat,lng); }
let pinMap, pinMarker;
const pinDots = {};
function dotColor(s){ return s>70?'#B5652E':s>=40?'#3E6E8E':'#89A896'; }
function refreshPinDots(clusters){
  if(!pinMap) return;
  const ids = new Set(clusters.map(c=>c.id));
  Object.keys(pinDots).forEach(id=>{ if(!ids.has(id)){ pinMap.removeLayer(pinDots[id]); delete pinDots[id]; }});
  clusters.forEach(c=>{
    if(c.lat==null||c.lng==null) return;
    const col = c.status==='In Progress' ? '#D4A017' : dotColor(c.priority_score);
    const icon = L.divIcon({ html:`<div style="width:10px;height:10px;background:${col};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`, className:'', iconSize:[10,10] });
    if(pinDots[c.id]){ pinDots[c.id].setLatLng([c.lat,c.lng]); pinDots[c.id].setIcon(icon); }
    else { pinDots[c.id]=L.marker([c.lat,c.lng],{icon, interactive:false, keyboard:false}).addTo(pinMap); }
  });
}
function initPinMap(lat, lng) {
  if (pinMap) return;
  pinMap = L.map('pin-map', { zoomControl: false, maxZoom: 19 }).setView([lat, lng], 18);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19, maxNativeZoom: 19 }).addTo(pinMap);
  pinMarker = L.marker([lat, lng], { draggable: true, zIndexOffset: 1000 }).addTo(pinMap);
  pinMarker.on('dragend', () => { const p = pinMarker.getLatLng(); updateCoords(p.lat, p.lng); });
  pinMap.on('click', e => { pinMarker.setLatLng(e.latlng); updateCoords(e.latlng.lat, e.latlng.lng); });
  updateCoords(lat, lng);
  setTimeout(() => pinMap.invalidateSize(), 200);
  // load dots
  supabase.from('clusters').select('id,lat,lng,priority_score,status').neq('status','Cleared').then(({data})=>{ if(data) refreshPinDots(data); });
  setInterval(()=> supabase.from('clusters').select('id,lat,lng,priority_score,status').neq('status','Cleared').then(({data})=>{ if(data) refreshPinDots(data); }), 5000);
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

// ponytail: offline queue — save if signal drops, flush on online
const QUEUE_KEY = 'bantaybaha-queue';
function getQueue(){ try{ return JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]'); }catch{ return []; } }
function saveQueue(q){ localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); }
async function blobToBase64(blob){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(blob); });
}
async function flushQueue(){
  const q = getQueue();
  if(!q.length || !navigator.onLine) return;
  for(const item of [...q]){
    try{
      const session = await getReporterSession();
      let photoPath = null;
      if(item.photoBase64){
        const res = await fetch(item.photoBase64);
        const blob = await res.blob();
        const ext = item.photoType==='image/png'?'png':item.photoType==='image/webp'?'webp':'jpg';
        photoPath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('report-photos').upload(photoPath, blob, { contentType: item.photoType||'image/jpeg', upsert:false });
        if(upErr) throw upErr;
      }
      const { error } = await supabase.from('reports').insert({
        tracking_id: item.genTid, hazard_type: item.hazardType, severity: item.severity,
        photo_path: photoPath, ai_summary: item.ai_summary, lat: item.lat, lng: item.lng, landmark: item.landmark
      });
      if(error) throw error;
      saveQueue(getQueue().filter(x=>x.genTid!==item.genTid));
      notify(`Queued report ${item.genTid} sent`, { href:`pages/tracking.html?id=${encodeURIComponent(item.genTid)}`, text:'→ Check' });
    }catch(e){ console.error('flush fail', e); break; }
  }
}
window.addEventListener('online', flushQueue);
flushQueue();
if(getQueue().length) notify(`${getQueue().length} report(s) queued offline — will send when online`);

document.querySelector('.submit-btn').addEventListener('click', async event => {
  const button = event.currentTarget;
  const photo = camera.getCapturedPhoto();
  const hazardType = document.querySelector('.chip.selected').textContent.trim();
  const landmark = document.getElementById('landmark')?.value.trim() || null;
  const aiNote = document.querySelector('.ai-note');
  // vision: try Edge Function, fallback to heuristic (§B.4)
  let vision = heuristicVision(hazardType);
  let severity = document.querySelectorAll('.sev-block[aria-pressed="true"]').length;
  // if manual not touched, use vision
  const manualTouched = document.querySelector('.sev-block[aria-pressed="true"]')?.classList.contains('on3') || severity !== 2;
  if (!manualTouched || !severity) severity = vision.severity;
  const overlay = document.getElementById('submit-overlay');
  const overlayText = document.getElementById('overlay-text');
  const overlaySub = document.getElementById('overlay-sub');
  function showOverlay(t, sub){ if(overlay){ overlay.style.display='flex'; if(overlayText) overlayText.textContent=t; if(overlaySub) overlaySub.textContent=sub||''; } }
  function hideOverlay(){ if(overlay) overlay.style.display='none'; }

  // live AI READ update
  if (aiNote) aiNote.innerHTML = `<b>AI READ</b> — ${vision.rationale} · Estimated severity: <strong>${vision.severity} / 3</strong> <span style="opacity:.6">(${Math.round(vision.confidence*100)}%)</span>`;

  button.disabled = true;
  button.textContent = 'Submitting…';
  showOverlay('Analyzing photo…', 'Vision model checking severity');
  try {
    // vision call before upload (so overlay shows progress)
    if (photo) {
      if (overlayText) overlayText.textContent = 'Analyzing photo…';
      const edge = await callVisionEdge(supabase, photo);
      if (edge) { vision = edge; severity = edge.severity; if (aiNote) aiNote.innerHTML = `<b>AI READ</b> — ${edge.rationale} · Estimated severity: <strong>${edge.severity} / 3</strong> <span style="opacity:.6">(${Math.round(edge.confidence*100)}%)</span>`; }
      if (overlayText) overlayText.textContent = edge ? `Vision: ${edge.rationale.slice(0,40)}` : 'Vision fallback — uploading…';
    }
    const session = await getReporterSession();
    let photoPath = null;
    if (photo) {
      if (overlaySub) overlaySub.textContent = 'Uploading photo…';
      const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
      photoPath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('report-photos')
        .upload(photoPath, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
    }
    if (overlaySub) overlaySub.textContent = 'Saving report…';

    const genTid = 'TRK-' + Math.random().toString(36).slice(2,6).toUpperCase() + Math.random().toString(36).slice(2,6).toUpperCase().slice(0,2);
    const { data, error: reportError } = await supabase.from('reports').insert({
      tracking_id: genTid,
      hazard_type: hazardType,
      severity,
      photo_path: photoPath,
      ai_summary: vision.rationale,
      lat: pinLat,
      lng: pinLng,
      landmark
    }).select('tracking_id').single();
    if (reportError) throw reportError;

    const tid = data?.tracking_id ?? genTid;
    hideOverlay();
    const link = { href: `pages/tracking.html?id=${encodeURIComponent(tid)}`, text: '→ Check My Report' };
    notify(`Report ${tid} received`, link);
  } catch (error) {
    hideOverlay();
    console.error(error);
    // offline fallback: queue locally
    if (!navigator.onLine || /Failed to fetch|NetworkError|Load failed/i.test(String(error.message||''))) {
      const photoBase64 = photo ? await blobToBase64(photo).catch(()=>null) : null;
      const queued = { genTid, hazardType, severity, ai_summary: vision.rationale, lat: pinLat, lng: pinLng, landmark, photoBase64, photoType: photo?.type||null };
      const q = getQueue(); q.push(queued); saveQueue(q);
      notify(`Offline — report ${genTid} queued, will send when online`);
      return;
    }
    notify(error.message || 'Unable to submit the report. Please try again.');
  } finally {
    button.disabled = false;
    button.textContent = 'Submit report';
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(() => {}));
}
