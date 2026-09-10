export function initializeCamera() {
  const viewfinder = document.querySelector('.viewfinder');
  const preview = document.querySelector('.camera-preview');
  const capturedPhoto = document.querySelector('.captured-photo');
  const trigger = document.querySelector('.viewfinder-icon');
  const fileInput = document.querySelector('.camera-input');
  const retake = document.querySelector('.retake-btn');
  let stream;
  let capturedPhotoBlob = null;

  function stopCamera() {
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    preview.srcObject = null;
    viewfinder.classList.remove('camera-active');
  }

  function showPhoto(source) {
    stopCamera();
    capturedPhoto.src = source;
    viewfinder.classList.add('has-photo');
    trigger.setAttribute('aria-label', 'Replace photo');
  }

  async function captureFrame() {
    const canvas = document.createElement('canvas');
    canvas.width = preview.videoWidth;
    canvas.height = preview.videoHeight;
    canvas.getContext('2d').drawImage(preview, 0, 0);
    capturedPhotoBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (capturedPhotoBlob) showPhoto(URL.createObjectURL(capturedPhotoBlob));
  }

  async function openCamera() {
    if (viewfinder.classList.contains('camera-active')) {
      await captureFrame();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return fileInput.click();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      capturedPhoto.removeAttribute('src');
      preview.srcObject = stream;
      viewfinder.classList.remove('has-photo');
      viewfinder.classList.add('camera-active');
      trigger.setAttribute('aria-label', 'Take photo');
    } catch {
      fileInput.click();
    }
  }

  trigger.addEventListener('click', openCamera);
  // volume up → shutter (best-effort: many browsers block volume keys, fallback to Enter/Space)
  window.addEventListener('keydown', e => {
    if (e.key === 'AudioVolumeUp' || e.key === 'VolumeUp' || e.code === 'AudioVolumeUp') {
      e.preventDefault();
      if (viewfinder.classList.contains('camera-active') || !capturedPhotoBlob) openCamera();
    }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body && viewfinder.classList.contains('camera-active')) {
      e.preventDefault();
      openCamera();
    }
  });
  // hint
  const hint = document.querySelector('.camera-hint');
  if (hint) hint.textContent = 'Tap or press Volume Up to take photo';
  retake.addEventListener('click', () => {
    viewfinder.classList.remove('has-photo');
    capturedPhoto.removeAttribute('src');
    capturedPhotoBlob = null;
    openCamera();
  });
  fileInput.addEventListener('change', event => {
    const file = event.target.files[0];
    if (file) {
      capturedPhotoBlob = file;
      showPhoto(URL.createObjectURL(file));
    }
  });
  window.addEventListener('pagehide', stopCamera);

  return { getCapturedPhoto: () => capturedPhotoBlob };
}
