import { supabase } from './supabase.js';

// ISAT-U campus center (approx OSM) — see seed/map/critical_sites.coords.json
const map = L.map('admin-map', { maxZoom: 19 }).setView([10.715500, 122.566400], 18);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19, maxNativeZoom: 19 }).addTo(map);
const markers = {};
const color = s => s > 70 ? '#B5652E' : s >= 40 ? '#3E6E8E' : '#89A896';
const statusColor = (st, score) => st === 'In Progress' ? '#D4A017' : color(score);

async function load() {
  const { data: clusters, error } = await supabase.from('clusters').select('*').neq('status', 'Cleared').neq('status', 'Quarantined').order('priority_score', { ascending: false });
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
  const { data: reports } = await supabase.from('reports').select('photo_path,created_at,landmark,tracking_id,ai_summary,severity').eq('cluster_id', c.id).order('created_at', { ascending: false }).limit(3);
  const r = reports?.[0];
  let photoUrl = '';
  if (r?.photo_path) {
    const { data } = supabase.storage.from('report-photos').getPublicUrl(r.photo_path);
    photoUrl = data.publicUrl;
  }
  const { data: events } = await supabase.from('status_events').select('*').eq('cluster_id', c.id).order('at', { ascending: true });
  const sevLabel = c.severity===3?'HIGH':c.severity===2?'MEDIUM':c.severity===1?'LOW':c.severity;
  const isQuarantined = c.status === 'Quarantined';
  const card = document.getElementById('drawer-card');
  if (!card) return;
  const timeline = [];
  timeline.push({ label: 'Report submitted', at: c.created_at, dot: '#2F6E63' });
  (events||[]).forEach(ev=>{
    const label = ev.to_status==='In Progress'?'Crew dispatched':ev.to_status==='Cleared'?'Resolved':ev.to_status==='Quarantined'?'Flagged for review':ev.to_status;
    timeline.push({ label: `${ev.from_status} → ${label}`, at: ev.at, dot: ev.to_status==='Quarantined'?'#856404':ev.to_status==='Cleared'?'#89A896':'#3E6E8E', actor: ev.actor });
  });
  const tlHtml = timeline.map((t,i)=>{
    const d = new Date(t.at).toLocaleString();
    const isLast = i===timeline.length-1 && timeline.length>1;
    return `<li style="display:flex;gap:10px;padding-bottom:${i===timeline.length-1?'0':'12px'};position:relative">
      <span style="width:10px;height:10px;border-radius:50%;margin-top:4px;flex-shrink:0;background:${t.dot};border:2px solid #fff;box-shadow:0 0 0 1px #B7AF94"></span>
      <div><div style="font-size:13px;font-weight:600">${t.label}${t.actor?` <span style="font-weight:400;color:#5C6B64">· ${t.actor}</span>`:''}</div><div style="font-size:11px;color:#5C6B64;font-family:'IBM Plex Mono',monospace">${d}</div></div>
    </li>`;
  }).join('');
  card.innerHTML = `
    <h3 style="margin:0 0 4px">${c.hazard_type} — ${c.priority_score ?? '—'}</h3>
    <div style="font-size:12px;color:#5C6B64">${c.report_count} reports · severity ${sevLabel} (${c.severity}) · <span style="font-weight:600;color:${isQuarantined?'#856404':'inherit'}">${c.status}</span></div>
    ${isQuarantined ? `<div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:#FFF3CD;border:1px solid #FFE69C;font-size:12px;color:#856404">Quarantined — spam/irrelevant, hidden from queue. Tracking shows “Under verification”.</div>` : ''}
    ${photoUrl ? `<img src="${photoUrl}" style="width:100%;border-radius:8px;margin:12px 0;max-height:220px;object-fit:cover" onerror="this.style.display='none'">` : '<div style="margin:12px 0;padding:12px;border-radius:8px;background:#E9EDE8;color:#5C6B64;font-size:12px;text-align:center">No photo — landmark only</div>'}
    <div style="font-size:12px">📍 ${c.lat?.toFixed(5) ?? '—'}, ${c.lng?.toFixed(5) ?? '—'} ${r?.landmark ? `· ${r.landmark}` : ''}</div>
    ${r?.tracking_id ? `<div style="font-size:11px;color:#5C6B64;margin-top:4px">tracking: ${r.tracking_id}</div>` : ''}
    <div style="margin-top:12px;padding:10px 12px;background:#F4F6F2;border:1px solid #B7AF94;border-radius:8px">
      <div style="font-size:10.5px;color:#5C6B64;letter-spacing:.04em">AI SUMMARY</div>
      <div style="font-size:13px;line-height:1.5;margin-top:4px">${(r?.ai_summary || c.ai_summary || '—').replace(/</g,'&lt;')}</div>
      ${r?.ai_summary && r.ai_summary!==c.ai_summary ? `<div style="font-size:11px;color:#5C6B64;margin-top:6px">Latest report rationale shown · cluster severity is max across reports</div>` : ''}
    </div>
    <div style="margin-top:14px">
      <div style="font-size:10.5px;color:#5C6B64;letter-spacing:.04em;margin-bottom:8px">STATUS HISTORY</div>
      <ul style="list-style:none;margin:0;padding:0">${tlHtml}</ul>
    </div>
    ${reports && reports.length>1 ? `<div style="margin-top:12px;font-size:11px;color:#5C6B64">${reports.length} recent reports in this cluster · ${reports.map(x=>x.tracking_id).join(', ')}</div>` : ''}
    <details style="margin-top:12px;padding:10px 12px;background:#fff;border:1px solid #B7AF94;border-radius:8px">
      <summary style="cursor:pointer;font-size:12px;font-weight:600">Edit metadata (admin)</summary>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
        <label style="font-size:11px;color:#5C6B64">Hazard type <select id="edit-hazard" style="width:100%;margin-top:4px;padding:8px;border-radius:6px;border:1px solid #B7AF94"><option ${c.hazard_type==='Clogged drain'?'selected':''}>Clogged drain</option><option ${c.hazard_type==='Trash buildup'?'selected':''}>Trash buildup</option><option ${c.hazard_type==='Standing water'?'selected':''}>Standing water</option></select></label>
        <div style="display:flex;gap:8px"><label style="flex:1;font-size:11px;color:#5C6B64">Lat <input id="edit-lat" type="number" step="0.000001" value="${c.lat ?? ''}" style="width:100%;margin-top:4px;padding:8px;border-radius:6px;border:1px solid #B7AF94"></label><label style="flex:1;font-size:11px;color:#5C6B64">Lng <input id="edit-lng" type="number" step="0.000001" value="${c.lng ?? ''}" style="width:100%;margin-top:4px;padding:8px;border-radius:6px;border:1px solid #B7AF94"></label></div>
        <button onclick="window.saveClusterMeta('${c.id}')" style="padding:9px;border-radius:8px;border:none;background:#1B2E28;color:#fff;cursor:pointer">Save changes</button>
        <div style="font-size:10.5px;color:#5C6B64">Edits logged in status_events. Pin moves on next load.</div>
      </div>
    </details>
    <div style="display:flex;gap:8px;margin-top:14px">
      ${c.status === 'Pending' ? `<button onclick="window.updateStatus('${c.id}','In Progress')" style="flex:1;padding:10px;border-radius:8px;border:none;background:#3E6E8E;color:#fff;cursor:pointer">→ In Progress</button>` : ''}
      ${c.status === 'In Progress' ? `<button onclick="window.updateStatus('${c.id}','Cleared')" style="flex:1;padding:10px;border-radius:8px;border:none;background:#89A896;color:#fff;cursor:pointer">→ Cleared</button>` : ''}
      ${isQuarantined ? `<button onclick="window.updateStatus('${c.id}','Pending')" style="flex:1;padding:10px;border-radius:8px;border:none;background:#B5652E;color:#fff;cursor:pointer">Restore to Pending</button>` : ''}
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

window.saveClusterMeta = async (id) => {
  const hazard = document.getElementById('edit-hazard')?.value?.trim();
  const lat = parseFloat(document.getElementById('edit-lat')?.value);
  const lng = parseFloat(document.getElementById('edit-lng')?.value);
  const patch = {};
  if (hazard) patch.hazard_type = hazard;
  if (Number.isFinite(lat)) patch.lat = lat;
  if (Number.isFinite(lng)) patch.lng = lng;
  if (!Object.keys(patch).length) return;
  const prev = window._clusters[id];
  const { error } = await supabase.from('clusters').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert(error.message); return; }
  const changes = [];
  if (patch.hazard_type && patch.hazard_type !== prev?.hazard_type) changes.push(`hazard ${prev.hazard_type}→${patch.hazard_type}`);
  if (Number.isFinite(patch.lat) || Number.isFinite(patch.lng)) changes.push(`pin ${prev.lat?.toFixed(5)},${prev.lng?.toFixed(5)} → ${patch.lat ?? prev.lat},${patch.lng ?? prev.lng}`);
  { const { error: _e } = await supabase.from('status_events').insert({ cluster_id: id, from_status: prev?.status ?? 'Pending', to_status: prev?.status ?? 'Pending', actor: `admin edit: ${changes.join('; ') || 'metadata'}` }); if (_e) console.warn(_e.message); }
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
