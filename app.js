const video = document.getElementById('video');
const liveCanvas = document.getElementById('live-canvas');
const liveCtx = liveCanvas.getContext('2d', { willReadFrequently: true });
const offCanvas = document.createElement('canvas');
const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
const photoCanvas = document.getElementById('photo-canvas');
const photoCtx = photoCanvas.getContext('2d', { willReadFrequently: true });

const app = document.getElementById('app');
const crtShell = document.getElementById('crt-shell');
const shutter = document.getElementById('shutter');
const processing = document.getElementById('processing');
const activeFilterEl = document.getElementById('active-filter');
const timestampEl = document.getElementById('timestamp');

const liveFilterButtons = document.getElementById('live-filter-buttons');
const aiFilterButtons = document.getElementById('ai-filter-buttons');
const overlayButtons = document.getElementById('overlay-buttons');

const liveFilters = [
  { id: 'velvia', name: 'Fuji Velvia' },
  { id: 'provia', name: 'Fuji Provia' },
  { id: 'superia', name: 'Superia 400' },
  { id: 'eterna', name: 'Eterna Cinema' },
  { id: 'pastel', name: 'Pastel Film' },
  { id: 'nokia', name: 'Nokia 2005' },
];

const aiFilters = [
  { id: 'anime', name: 'AI Anime Portrait' },
  { id: 'cyberpunk', name: 'AI Cyberpunk Neon' },
  { id: 'dreamy', name: 'AI Dreamy Polaroid' },
  { id: 'magazine', name: 'AI 90s Magazine Cover' },
  { id: 'clay', name: 'AI Clay / Toy Face' },
  { id: 'game', name: 'AI Retro Game Character' },
];

let activeLive = 'velvia';
let overlays = { grain: true, dust: false, leak: false, timestamp: false };
let stream;
let frame = 0;
let capturedDataUrl = '';

const addButtons = (target, items, onClick, selected) => {
  target.innerHTML = '';
  items.forEach((item) => {
    const btn = document.createElement('button');
    btn.textContent = item.name;
    btn.dataset.id = item.id;
    if (item.id === selected) btn.classList.add('active');
    btn.addEventListener('click', () => onClick(item.id));
    target.appendChild(btn);
  });
};

addButtons(liveFilterButtons, liveFilters, (id) => {
  activeLive = id;
  activeFilterEl.textContent = liveFilters.find((f) => f.id === id).name.toUpperCase();
  [...liveFilterButtons.querySelectorAll('button')].forEach((b) => b.classList.toggle('active', b.dataset.id === id));
}, activeLive);

addButtons(aiFilterButtons, aiFilters, applyAiFilter, '');

overlayButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-overlay]');
  if (!btn) return;
  const key = btn.dataset.overlay;
  overlays[key] = !overlays[key];
  btn.classList.toggle('active', overlays[key]);
});

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play();
    resizeCanvases();
    requestAnimationFrame(renderLive);
  } catch (error) {
    activeFilterEl.textContent = 'CAMERA BLOCKED';
    console.error(error);
  }
}

function resizeCanvases() {
  const w = 640;
  const h = 480;
  liveCanvas.width = w;
  liveCanvas.height = h;
  offCanvas.width = w;
  offCanvas.height = h;
  photoCanvas.width = w;
  photoCanvas.height = h;
}

function renderLive() {
  if (!video.videoWidth) return requestAnimationFrame(renderLive);
  frame++;

  offCtx.drawImage(video, 0, 0, offCanvas.width, offCanvas.height);
  const imageData = offCtx.getImageData(0, 0, offCanvas.width, offCanvas.height);
  applyLiveFilter(imageData, activeLive);
  if (overlays.grain) addGrain(imageData, 17);
  if (overlays.dust && frame % 2 === 0) addDust(imageData, 24);
  if (overlays.leak) addLeak(imageData, frame);
  offCtx.putImageData(imageData, 0, 0);

  liveCtx.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  liveCtx.drawImage(offCanvas, 0, 0, liveCanvas.width, liveCanvas.height);

  if (overlays.timestamp) {
    const now = new Date();
    timestampEl.textContent = now.toLocaleString();
  } else {
    timestampEl.textContent = '';
  }

  requestAnimationFrame(renderLive);
}

function applyLiveFilter(imageData, filter) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    if (filter === 'velvia') {
      r *= 1.18; g *= 1.1; b *= 1.08;
      [r, g, b] = vibrance(r, g, b, 1.12);
    } else if (filter === 'provia') {
      r *= 1.03; g *= 1.02; b *= 1.02;
    } else if (filter === 'superia') {
      r *= 0.96; g *= 1.07; b *= 0.98;
      const grain = (Math.random() - 0.5) * 16;
      r += grain; g += grain; b += grain;
    } else if (filter === 'eterna') {
      const l = (r + g + b) / 3;
      r = r * 0.9 + l * 0.2;
      g = g * 0.95 + l * 0.15;
      b = b * 1.03 + l * 0.1;
    } else if (filter === 'pastel') {
      r = r * 0.95 + 18;
      g = g * 0.97 + 14;
      b = b * 1.04 + 12;
    } else if (filter === 'nokia') {
      const l = (r + g + b) / 3;
      r = l * 0.95;
      g = l;
      b = l * 1.05;
      if (i % 24 === 0) {
        r += (Math.random() - 0.5) * 28;
        g += (Math.random() - 0.5) * 28;
      }
    }
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }

  if (filter === 'nokia') {
    const scale = 0.22;
    const w = imageData.width;
    const h = imageData.height;
    const tiny = document.createElement('canvas');
    tiny.width = Math.floor(w * scale);
    tiny.height = Math.floor(h * scale);
    tiny.getContext('2d').putImageData(imageData, 0, 0);
    offCtx.imageSmoothingEnabled = false;
    offCtx.clearRect(0, 0, w, h);
    offCtx.drawImage(tiny, 0, 0, tiny.width, tiny.height, 0, 0, w, h);
    const pix = offCtx.getImageData(0, 0, w, h);
    imageData.data.set(pix.data);
    offCtx.imageSmoothingEnabled = true;
  }
}

function applyAiFilter(id) {
  if (!capturedDataUrl) return;
  processing.classList.add('active');
  processing.textContent = 'Processing…';

  setTimeout(() => {
    const img = new Image();
    img.onload = () => {
      photoCtx.clearRect(0, 0, photoCanvas.width, photoCanvas.height);
      photoCtx.drawImage(img, 0, 0, photoCanvas.width, photoCanvas.height);
      const im = photoCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
      applyAiPixels(im, id);
      photoCtx.putImageData(im, 0, 0);
      capturedDataUrl = photoCanvas.toDataURL('image/png');
      processing.classList.remove('active');
      processing.textContent = aiFilters.find((f) => f.id === id)?.name ?? 'Done';
      [...aiFilterButtons.querySelectorAll('button')].forEach((b) => b.classList.toggle('active', b.dataset.id === id));
    };
    img.src = capturedDataUrl;
  }, 900);
}

function applyAiPixels(imageData, id) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const l = (r + g + b) / 3;
    if (id === 'anime') { r = r * 1.2 + 15; g = g * 1.05 + 8; b = b * 1.18 + 18; }
    if (id === 'cyberpunk') { r = l * 0.7; g = g * 0.8; b = b * 1.45 + 32; }
    if (id === 'dreamy') { r = r * 1.08 + 22; g = g * 1.05 + 16; b = b * 1.08 + 18; }
    if (id === 'magazine') { r = r * 1.22; g = g * 0.98; b = b * 0.95; }
    if (id === 'clay') { r = l * 1.05 + 28; g = l * .97 + 20; b = l * .9 + 14; }
    if (id === 'game') {
      const q = 32;
      r = Math.round(r / q) * q;
      g = Math.round(g / q) * q;
      b = Math.round(b / q) * q;
    }
    d[i] = clamp(r); d[i + 1] = clamp(g); d[i + 2] = clamp(b);
  }
}

function vibrance(r, g, b, strength) {
  const avg = (r + g + b) / 3;
  return [avg + (r - avg) * strength, avg + (g - avg) * strength, avg + (b - avg) * strength];
}

function addGrain(imageData, amount) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
}

function addDust(imageData, count) {
  const d = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  for (let k = 0; k < count; k++) {
    const x = (Math.random() * w) | 0;
    const y = (Math.random() * h) | 0;
    const i = (y * w + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = 255;
  }
}

function addLeak(imageData, tick) {
  const d = imageData.data;
  const w = imageData.width;
  const h = imageData.height;
  const cx = (Math.sin(tick / 80) * 0.5 + 0.5) * w;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dist = Math.abs(x - cx) / w;
      if (dist < 0.22) {
        const boost = (0.22 - dist) * 90;
        d[i] = clamp(d[i] + boost);
        d[i + 1] = clamp(d[i + 1] + boost * 0.4);
      }
    }
  }
}

function clamp(v) { return Math.max(0, Math.min(255, v)); }

function playShutter() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'square';
  osc.frequency.value = 165;
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(ac.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.2, ac.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.14);
  osc.stop(ac.currentTime + 0.16);
}

shutter.addEventListener('click', () => {
  playShutter();
  document.body.classList.add('flash');
  setTimeout(() => document.body.classList.remove('flash'), 220);

  photoCtx.drawImage(liveCanvas, 0, 0, photoCanvas.width, photoCanvas.height);
  capturedDataUrl = photoCanvas.toDataURL('image/png');
  crtShell.classList.add('printing');
  app.classList.add('captured');
  setTimeout(() => crtShell.classList.remove('printing'), 1200);
  processing.textContent = 'Ready';
});

document.getElementById('retake').addEventListener('click', () => {
  app.classList.remove('captured');
  capturedDataUrl = '';
  processing.textContent = 'Processing…';
  [...aiFilterButtons.querySelectorAll('button')].forEach((b) => b.classList.remove('active'));
});

function download(type) {
  if (!capturedDataUrl) return;
  const link = document.createElement('a');
  link.href = type === 'jpg' ? photoCanvas.toDataURL('image/jpeg', 0.95) : capturedDataUrl;
  link.download = `retroclick-${Date.now()}.${type}`;
  link.click();
}

document.getElementById('download-png').addEventListener('click', () => download('png'));
document.getElementById('download-jpg').addEventListener('click', () => download('jpg'));

document.getElementById('share-x').href =
  `https://twitter.com/intent/tweet?text=${encodeURIComponent('Shot this in a CRT x Polaroid retro booth ✨ #retroclick')}`;

startCamera();
