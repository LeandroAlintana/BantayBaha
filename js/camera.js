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
  // tap viewfinder to shutter when camera is live (reliable fallback — volume keys are OS-blocked on iOS/most Android)
  viewfinder.addEventListener('click', e => {
    if (e.target.closest('.retake-btn') || e.target.closest('.viewfinder-icon')) return;
    if (viewfinder.classList.contains('camera-active')) {
      e.preventDefault();
      captureFrame();
    }
  });
  function isVolumeShutter(e){
    const k = e.key || '', c = e.code || '', kc = e.keyCode || e.which || 0;
    return k === 'AudioVolumeUp' || k === 'VolumeUp' || k === 'AudioVolumeDown' || k === 'VolumeDown' ||
           c === 'AudioVolumeUp' || c === 'AudioVolumeDown' || k === 'Camera' || c === 'Camera' ||
           kc === 175 || kc === 176 || kc === 24 || kc === 25 || kc === 27;
  }
  function handleShutterKey(e){
    if (isVolumeShutter(e)) {
      // best-effort: iOS never fires, Android Chrome often blocks — prevent system volume change when we can
      try { e.preventDefault(); } catch {}
      if (viewfinder.classList.contains('camera-active') || !capturedPhotoBlob) openCamera();
      return true;
    }
    const kc = e.keyCode || e.which || 0;
    const isEnterSpace = e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.code === 'Enter' || kc === 13 || kc === 32;
    if (isEnterSpace && viewfinder.classList.contains('camera-active') && (document.activeElement === document.body || document.activeElement === trigger || viewfinder.contains(document.activeElement))) {
      try { e.preventDefault(); } catch {}
      openCamera();
      return true;
    }
    return false;
  }
  window.addEventListener('keydown', handleShutterKey, { capture: true });
  window.addEventListener('keyup', handleShutterKey, { capture: true });
  // hint — honest about OS limitation
  const hint = document.querySelector('.camera-hint');
  if (hint) hint.textContent = 'Tap shutter or viewfinder • Volume Up / Enter if supported';
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
