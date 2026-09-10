import { supabase } from './supabase.js';

// ISAT-U campus center (approx OSM) — see seed/map/critical_sites.coords.json
const map = L.map('admin-map', { maxZoom: 19 }).setView([10.715500, 122.566400], 18);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19, maxNativeZoom: 19 }).addTo(map);
const markers = {};
const color = s => s > 70 ? '#B5652E' : s >= 40 ? '#3E6E8E' : '#89A896';
const statusColor = (st, score) => st === 'In Progress' ? '#D4A017' : color(score);

async function load() {
  const { data: clusters, error } = await supabase.from('clusters').select('*').neq('status', 'Cleared').order('priority_score', { ascending: false });
  if (error) { console.error(error); return; }
  if (!clusters) return;
  // counters
  const crit = clusters.filter(c => c.priority_score > 70).length;
  const mod = clusters.filter(c => c.priority_score >= 40 && c.priority_score <= 70).length;
  const low = clusters.filter(c => c.priority_score < 40).length;
  const elCrit = document.getElementById('m-critical');
  const elMod = document.getElementById('m-moderate');
  const elLow = document.getElementById('m-low');
  const elTotal = document.getElementById('m-total');
  if (elCrit) elCrit.textContent = crit;
  if (elMod) elMod.textContent = mod;
  if (elLow) elLow.textContent = low;
  if (elTotal) elTotal.textContent = clusters.length;
  const mono = document.querySelector('.map-panel .mono');
  if (mono) mono.textContent = `${clusters.length} clusters shown`;
  // map pins
  const ids = new Set(clusters.map(c => c.id));
  Object.keys(markers).forEach(id => { if (!ids.has(id)) { map.removeLayer(markers[id]); delete markers[id]; } });
  clusters.forEach(c => {
    if (c.lat == null || c.lng == null) return;
    const col = statusColor(c.status, c.priority_score);
    const icon = L.divIcon({ html: `<div style="width:14px;height:14px;background:${col};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)"></div>`, className: '', iconSize: [14, 14] });
    if (markers[c.id]) { markers[c.id].setLatLng([c.lat, c.lng]); markers[c.id].setIcon(icon); }
    else { markers[c.id] = L.marker([c.lat, c.lng], { icon }).addTo(map).on('click', () => openDrawer(c)); }
  });
  // queue (desktop + mobile)
  const list = document.getElementById('queue-list');
  const mList = document.getElementById('mobile-queue-list');
  const mCount = document.getElementById('mobile-queue-count');
  const desktopHtml = !clusters.length
    ? '<div style="padding:24px;text-align:center;color:#5C6B64;font-size:13px">No open clusters — submit a report to seed the queue.</div>'
    : clusters.map((c, i) => `
    <div class="queue-item" data-id="${c.id}" style="cursor:pointer" onclick="window._openDrawer('${c.id}')">
      <div class="queue-rank">${String(i + 1).padStart(2, '0')}</div>
      <div class="queue-severity-bar" style="background:${color(c.priority_score)}"></div>
      <div class="queue-body">
        <div class="queue-title-row"><h3>${c.hazard_type}</h3><span class="queue-score" style="color:${color(c.priority_score)}">${c.priority_score ?? '—'}</span></div>
        <div class="queue-meta">${c.report_count} reports · ${c.status} · ${new Date(c.created_at).toLocaleDateString()}</div>
        <span class="status-pill ${c.status === 'Pending' ? 'status-new' : c.status === 'In Progress' ? 'status-verified' : 'status-assigned'}">${c.status.toUpperCase()}</span>
      </div>
    </div>`).join('');
  const mobileHtml = !clusters.length
    ? desktopHtml
    : clusters.map((c, i) => `
    <div class="queue-item" data-id="${c.id}" style="cursor:default">
      <div class="queue-rank">${String(i + 1).padStart(2, '0')}</div>
      <div class="queue-severity-bar" style="background:${color(c.priority_score)}"></div>
      <div class="queue-body">
        <div class="queue-title-row"><h3>${c.hazard_type}</h3><span class="queue-score" style="color:${color(c.priority_score)}">${c.priority_score ?? '—'}</span></div>
        <div class="queue-meta">${c.report_count} reports · ${c.status} · ${new Date(c.created_at).toLocaleDateString()}</div>
        <span class="status-pill ${c.status === 'Pending' ? 'status-new' : c.status === 'In Progress' ? 'status-verified' : 'status-assigned'}">${c.status.toUpperCase()}</span>
      </div>
    </div>`).join('');
  if (list) list.innerHTML = desktopHtml;
  if (mList) mList.innerHTML = mobileHtml;
  if (mCount) mCount.textContent = `${clusters.length} open`;
  window._clusters = Object.fromEntries(clusters.map(c => [c.id, c]));
}

function focusCluster(id) {
  const c = window._clusters[id];
  if (!c || c.lat == null || c.lng == null) return;
  map.flyTo([c.lat, c.lng], Math.min(map.getZoom(), 19), { duration: 0.6 });
  const m = markers[id];
  if (m) { m.openPopup?.(); setTimeout(() => m.getElement()?.classList.add('pulse'), 0); }
  // highlight queue row
  document.querySelectorAll('.queue-item.selected').forEach(el => el.classList.remove('selected'));
  const row = document.querySelector(`.queue-item[data-id="${id}"]`);
  if (row) row.classList.add('selected');
  openDrawer(c);
}
window._openDrawer = id => focusCluster(id);

async function openDrawer(c) {
  const { data: reports } = await supabase.from('reports').select('photo_path,created_at,landmark,tracking_id').eq('cluster_id', c.id).order('created_at', { ascending: false }).limit(1);
  const r = reports?.[0];
  let photoUrl = '';
  if (r?.photo_path) {
    const { data } = supabase.storage.from('report-photos').getPublicUrl(r.photo_path);
    photoUrl = data.publicUrl;
  }
  const card = document.getElementById('drawer-card');
  if (!card) return;
  card.innerHTML = `
    <h3 style="margin:0 0 8px">${c.hazard_type} — ${c.priority_score ?? '—'}</h3>
    <div style="font-size:12px;color:#5C6B64">${c.report_count} reports · severity ${c.severity} · ${c.status}</div>
    ${photoUrl ? `<img src="${photoUrl}" style="width:100%;border-radius:8px;margin:12px 0;max-height:220px;object-fit:cover" onerror="this.style.display='none'">` : ''}
    <div style="font-size:12px">📍 ${c.lat?.toFixed(5) ?? '—'}, ${c.lng?.toFixed(5) ?? '—'} ${r?.landmark ? `· ${r.landmark}` : ''}</div>
    ${r?.tracking_id ? `<div style="font-size:11px;color:#5C6B64;margin-top:4px">tracking: ${r.tracking_id}</div>` : ''}
    <div style="display:flex;gap:8px;margin-top:14px">
      ${c.status === 'Pending' ? `<button onclick="window.updateStatus('${c.id}','In Progress')" style="flex:1;padding:10px;border-radius:8px;border:none;background:#3E6E8E;color:#fff;cursor:pointer">→ In Progress</button>` : ''}
      ${c.status === 'In Progress' ? `<button onclick="window.updateStatus('${c.id}','Cleared')" style="flex:1;padding:10px;border-radius:8px;border:none;background:#89A896;color:#fff;cursor:pointer">→ Cleared</button>` : ''}
      <button onclick="document.getElementById('drawer').style.display='none'" style="padding:10px 14px;border-radius:8px;border:1px solid var(--sand-line);background:#fff;cursor:pointer">Close</button>
    </div>`;
  document.getElementById('drawer').style.display = 'block';
}

window.updateStatus = async (id, to) => {
  const from = window._clusters[id]?.status ?? 'Pending';
  const { error } = await supabase.from('clusters').update({ status: to, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert(error.message); return; }
  await supabase.from('status_events').insert({ cluster_id: id, from_status: from, to_status: to, actor: 'admin' });
  document.getElementById('drawer').style.display = 'none';
  load();
};

let lastReportAt = null;
async function updateMT3D() {
  const { data } = await supabase.from('reports').select('created_at').order('created_at', { ascending: false }).limit(1);
  if (data?.[0]) lastReportAt = new Date(data[0].created_at);
  const el = document.getElementById('mt3d');
  if (!el || !lastReportAt) return;
  const sec = Math.floor((Date.now() - lastReportAt) / 1000);
  const label = sec < 60 ? `${sec}s` : `${Math.floor(sec/60)}m ${sec%60}s`;
  el.textContent = `MT3D ${label} since last report`;
  el.style.color = sec < 60 ? 'var(--teal-dark)' : sec < 300 ? '#B5652E' : '#8B0000';
}
function updateSubtitle() {
  const sub = document.getElementById('dash-subtitle');
  if (sub) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    // keep MT3D span intact
    const mt3d = document.getElementById('mt3d')?.outerHTML ?? '';
    sub.innerHTML = `Updated ${time} · West Visayas Campus, main grounds · ${mt3d}`;
  }
}

load();
updateMT3D();
updateSubtitle();
setInterval(load, 5000);
setInterval(updateMT3D, 1000);
setInterval(updateSubtitle, 30000);
setTimeout(() => map.invalidateSize(), 300);
// ponytail: polling 5s, realtime when traffic grows
