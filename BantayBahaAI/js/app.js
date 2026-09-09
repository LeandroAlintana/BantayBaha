import { initializeCamera } from './camera.js';
import { getReporterSession, supabase } from './supabase.js';

const toast = document.querySelector('.toast');
let toastTimer;

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3600);
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

document.querySelector('.submit-btn').addEventListener('click', async event => {
  const button = event.currentTarget;
  const photo = camera.getCapturedPhoto();
  if (!photo) {
    notify('Take or choose a photo before submitting your report.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Submitting…';
  try {
    const session = await getReporterSession();
    const extension = photo.type === 'image/png' ? 'png' : photo.type === 'image/webp' ? 'webp' : 'jpg';
    const photoPath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('report-photos')
      .upload(photoPath, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
    if (uploadError) throw uploadError;

    const severity = document.querySelectorAll('.sev-block[aria-pressed="true"]').length;
    const { error: reportError } = await supabase.from('reports').insert({
      issue_type: document.querySelector('.chip.selected').textContent.trim(),
      severity,
      photo_path: photoPath,
      ai_summary: 'Pending analysis'
    });
    if (reportError) throw reportError;

    notify('Report received — it is now in the campus priority queue.');
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
