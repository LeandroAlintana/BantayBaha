import { supabase } from './supabase.js';

// ISAT-U campus center (approx OSM) — see seed/map/critical_sites.coords.json
const map = L.map('admin-map', { maxZoom: 19 }).setView([10.715500, 122.566400], 18);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM', maxZoom: 19, maxNativeZoom: 19 }).addTo(map);
const markers = {};
const color = s => s > 70 ? '#B5652E' : s >= 40 ? '#3E6E8E' : '#89A896';
const statusColor = (st, score) => {
  if (st === 'In Progress') return '#D4A017';
  if (st === 'Cleared') return '#89A896';
  if (st === 'Quarantined') return '#9AA0A6';
  return color(score);
};

async function load() {
  const { data: clusters, error } = await supabase.from('clusters').select('*').not('status', 'in', '("Cleared","Quarantined")').order('priority_score', { ascending: false });
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
  // map pins — sync state: Pending (score color), In Progress (amber), Cleared/Quarantined filtered out
  const ids = new Set(clusters.map(c => c.id));
  Object.keys(markers).forEach(id => { if (!ids.has(id)) { map.removeLayer(markers[id]); delete markers[id]; } });
  clusters.forEach(c => {
    if (c.lat == null || c.lng == null) return;
    const col = statusColor(c.status, c.priority_score);
    const isInProgress = c.status === 'In Progress';
    const icon = L.divIcon({ html: `<div style="width:14px;height:14px;background:${col};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)${isInProgress ? ';animation:pulse 1.5s infinite' : ''}"></div>`, className: '', iconSize: [14, 14] });
    if (markers[c.id]) {
      markers[c.id].setLatLng([c.lat, c.lng]);
      markers[c.id].setIcon(icon);
      // keep click handler fresh with latest c
      markers[c.id].off('click');
      markers[c.id].on('click', () => openDrawer(c));
    } else { markers[c.id] = L.marker([c.lat, c.lng], { icon }).addTo(map).on('click', () => openDrawer(c)); }
  });
  // queue (desktop + mobile)
  const list = document.getElementById('queue-list');
  const mList = document.getElementById('mobile-queue-list');
  const mCount = document.getElementById('mobile-queue-count');
  const pillClass = (st) => st === 'Pending' ? 'status-new' : st === 'In Progress' ? 'status-verified' : 'status-assigned';
  const barColor = (c) => statusColor(c.status, c.priority_score);
  const desktopHtml = !clusters.length
    ? '<div style="padding:24px;text-align:center;color:#5C6B64;font-size:13px">No open clusters — submit a report to seed the queue.</div>'
    : clusters.map((c, i) => `
    <div class="queue-item" data-id="${c.id}" data-status="${c.status}" style="cursor:pointer" onclick="window._openDrawer('${c.id}')">
      <div class="queue-rank">${String(i + 1).padStart(2, '0')}</div>
      <div class="queue-severity-bar" style="background:${barColor(c)}"></div>
      <div class="queue-body">
        <div class="queue-title-row"><h3>${c.hazard_type}</h3><span class="queue-score" style="color:${barColor(c)}">${c.priority_score ?? '—'}</span></div>
        <div class="queue-meta">${c.report_count} reports · ${c.status} · ${new Date(c.created_at).toLocaleDateString()}</div>
        <span class="status-pill ${pillClass(c.status)}">${c.status.toUpperCase()}</span>
      </div>
    </div>`).join('');
  const mobileHtml = !clusters.length
    ? desktopHtml
    : clusters.map((c, i) => `
    <div class="queue-item" data-id="${c.id}" data-status="${c.status}" style="cursor:default">
      <div class="queue-rank">${String(i + 1).padStart(2, '0')}</div>
      <div class="queue-severity-bar" style="background:${barColor(c)}"></div>
      <div class="queue-body">
        <div class="queue-title-row"><h3>${c.hazard_type}</h3><span class="queue-score" style="color:${barColor(c)}">${c.priority_score ?? '—'}</span></div>
        <div class="queue-meta">${c.report_count} reports · ${c.status} · ${new Date(c.created_at).toLocaleDateString()}</div>
        <span class="status-pill ${pillClass(c.status)}">${c.status.toUpperCase()}</span>
      </div>
    </div>`).join('');
  if (list) list.innerHTML = desktopHtml;
  if (mList) mList.innerHTML = mobileHtml;
  if (mCount) mCount.textContent = `${clusters.length} open`;
  window._clusters = Object.fromEntries(clusters.map(c => [c.id, c]));
  // verification queue: NEEDS_REVIEW reports (spec v2.1 §7)
  try {
    const { data: reviewReports } = await supabase.from('reports').select('id,tracking_id,hazard_type,created_at,moderation_status,cluster_id').eq('moderation_status','NEEDS_REVIEW').order('created_at', { ascending: false }).limit(20);
    const vList = document.getElementById('verification-list');
    if (vList) {
      if (!reviewReports || !reviewReports.length) vList.innerHTML = '<div style="padding:16px;text-align:center;color:#5C6B64;font-size:12px">No reports awaiting review.</div>';
      else vList.innerHTML = reviewReports.map(r => `<div class="queue-item" style="cursor:pointer" onclick="window._openDrawer('${r.cluster_id ?? ''}')"><div class="queue-rank">⚠</div><div class="queue-severity-bar" style="background:#856404"></div><div class="queue-body"><div class="queue-title-row"><h3>${r.hazard_type}</h3><span class="queue-score" style="color:#856404">${r.tracking_id}</span></div><div class="queue-meta">Needs review · ${new Date(r.created_at).toLocaleDateString()}</div></div></div>`).join('');
    }
  } catch {}
  // also fetch quarantined count for panel subtitle
  try {
    const { count: qCount } = await supabase.from('reports').select('id', { count: 'exact', head: true }).eq('moderation_status','QUARANTINED');
    const vMono = document.querySelector('#verification-panel .mono');
    if (vMono && typeof qCount === 'number') vMono.textContent = `${qCount} quarantined · verification`;
  } catch {}
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
  const { data: reports } = await supabase.from('reports').select('photo_path,created_at,landmark,tracking_id,ai_summary,severity,moderation_status,evidence_status').eq('cluster_id', c.id).order('created_at', { ascending: false }).limit(3);
  const r = reports?.[0];
  let photoUrl = '';
  if (r?.photo_path) {
    const { data } = supabase.storage.from('report-photos').getPublicUrl(r.photo_path);
    photoUrl = data.publicUrl;
  }
  const { data: events } = await supabase.from('status_events').select('*').eq('cluster_id', c.id).order('at', { ascending: true });
  const { data: obs } = await supabase.from('vision_observations').select('*').eq('report_id', r?.id ?? '').order('created_at', { ascending: false }).limit(1);
  const o = obs?.[0];
  const sevLabel = c.severity===3?'HIGH':c.severity===2?'MEDIUM':c.severity===1?'LOW':c.severity;
  const isQuarantined = c.status === 'Quarantined';
  const modStatus = r?.moderation_status ?? 'NORMAL';
  const isReview = modStatus === 'NEEDS_REVIEW';
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
    <div style="font-size:12px;color:#5C6B64">${c.report_count} reports · severity ${sevLabel} (${c.severity}) · <span style="font-weight:600;color:${isQuarantined?'#856404':isReview?'#856404':'inherit'}">${c.status}</span> ${isReview ? `<span style="background:#FFF3CD;border:1px solid #FFE69C;color:#856404;padding:2px 6px;border-radius:10px;font-size:10px">⚠ Needs review</span>` : ''}</div>
    ${isQuarantined ? `<div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:#FFF3CD;border:1px solid #FFE69C;font-size:12px;color:#856404">Quarantined — spam/irrelevant, hidden from queue. Tracking shows “Under verification”.</div>` : ''}
    ${isReview ? `<div style="margin-top:10px;padding:8px 10px;border-radius:8px;background:#FFF3CD;border:1px solid #FFE69C;font-size:12px;color:#856404">⚠ Needs review — hazard could not be clearly confirmed. Verify before dispatch.</div>` : ''}
    ${photoUrl ? `<img src="${photoUrl}" style="width:100%;border-radius:8px;margin:12px 0;max-height:220px;object-fit:cover" onerror="this.style.display='none'">` : '<div style="margin:12px 0;padding:12px;border-radius:8px;background:#E9EDE8;color:#5C6B64;font-size:12px;text-align:center">No photo — landmark only</div>'}
    <div style="font-size:12px">📍 ${c.lat?.toFixed(5) ?? '—'}, ${c.lng?.toFixed(5) ?? '—'} ${r?.landmark ? `· ${r.landmark}` : ''}</div>
    ${r?.tracking_id ? `<div style="font-size:11px;color:#5C6B64;margin-top:4px">tracking: ${r.tracking_id}</div>` : ''}
    <div style="font-size:11px;color:#5C6B64;margin-top:4px">Evidence: ${r?.evidence_status ?? 'PHOTO'} · Moderation: ${modStatus}</div>
    ${o ? `<div style="margin-top:10px;padding:10px 12px;background:#EFF3ED;border:1px solid #B7AF94;border-radius:8px"><div style="font-size:10.5px;color:#5C6B64;letter-spacing:.04em">AI OBSERVATION</div><div style="font-size:12px;margin-top:4px">Match: <b>${o.hazard_match}</b> · Type: ${o.hazard_type} · Evidence: ${o.evidence_strength} · Quality: ${o.image_quality}</div><div style="font-size:12px;color:#5C6B64;margin-top:4px">${(o.observations||[]).join(' · ').replace(/</g,'&lt;')}</div><div style="font-size:11px;color:#5C6B64;margin-top:4px">Spam: ${o.possible_spam} · Review: ${o.needs_human_review ? 'yes' : 'no'} · State: ${o.moderation_state}</div></div>` : ''}
    <div style="margin-top:12px;padding:10px 12px;background:#F4F6F2;border:1px solid #B7AF94;border-radius:8px">
      <div style="font-size:10.5px;color:#5C6B64;letter-spacing:.04em">AI SUMMARY (system-derived severity)</div>
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
  // optimistic UI: update pin + queue immediately
  const optimistic = window._clusters[id];
  if (optimistic) {
    optimistic.status = to;
    const col = statusColor(to, optimistic.priority_score);
    const m = markers[id];
    if (m) {
      const icon = L.divIcon({ html: `<div style="width:14px;height:14px;background:${col};border:2px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,.3)${to==='In Progress'?';animation:pulse 1.5s infinite':''}"></div>`, className: '', iconSize: [14, 14] });
      m.setIcon(icon);
    }
    const row = document.querySelector(`.queue-item[data-id="${id}"]`);
    if (row) {
      row.dataset.status = to;
      const bar = row.querySelector('.queue-severity-bar');
      const score = row.querySelector('.queue-score');
      const pill = row.querySelector('.status-pill');
      const meta = row.querySelector('.queue-meta');
      if (bar) bar.style.background = col;
      if (score) score.style.color = col;
      if (pill) { pill.textContent = to.toUpperCase(); pill.className = 'status-pill ' + (to==='Pending'?'status-new':to==='In Progress'?'status-verified':'status-assigned'); }
      if (meta) meta.textContent = `${optimistic.report_count} reports · ${to} · ${new Date(optimistic.created_at).toLocaleDateString()}`;
    }
  }
  const { error } = await supabase.from('clusters').update({ status: to, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { alert(error.message); load(); return; }
  { const { error: _e } = await supabase.from('status_events').insert({ cluster_id: id, from_status: from, to_status: to, actor: 'admin' }); if (_e) console.warn(_e.message); }
  document.getElementById('drawer').style.display = 'none';
  // Cleared should disappear from map/queue per spec: red → amber → gone
  if (to === 'Cleared') {
    const m = markers[id];
    if (m) { try { map.removeLayer(m); } catch {} delete markers[id]; }
    const row = document.querySelector(`.queue-item[data-id="${id}"]`);
    if (row) row.remove();
    delete window._clusters[id];
  }
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
