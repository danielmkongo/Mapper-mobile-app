// Procedural textures, drawn on canvases so the twin needs no image assets and works
// offline (mines, basements). Each returns a THREE.CanvasTexture ready for PBR use.
import * as THREE from 'three';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Cheap deterministic value noise.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function once(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// ---------------------------------------------------------------------------
// Floor: glossy white porcelain, marble veins, 60cm tiles with thin grout lines.
// ---------------------------------------------------------------------------
export function marbleTiles(roomX, roomZ) {
  return once('marble', () => {
    const TILE = 0.6, PX = 512; // px per tile
    const tilesX = 4, tilesZ = 4; // texture covers 4x4 tiles, repeated
    const [c, g] = canvas(PX * tilesX, PX * tilesZ);
    const r = rng(7);
    g.fillStyle = '#eef0f1';
    g.fillRect(0, 0, c.width, c.height);

    for (let ty = 0; ty < tilesZ; ty++) {
      for (let tx = 0; tx < tilesX; tx++) {
        const ox = tx * PX, oy = ty * PX;
        g.save();
        g.beginPath();
        g.rect(ox, oy, PX, PX);
        g.clip();
        // subtle per-tile tone shift
        g.fillStyle = `rgba(${200 + r() * 20},${205 + r() * 20},${212 + r() * 20},0.18)`;
        g.fillRect(ox, oy, PX, PX);
        // veins: wandering polylines, a few bold, many hairline
        const veins = 5 + Math.floor(r() * 5);
        for (let v = 0; v < veins; v++) {
          let x = ox + r() * PX, y = oy + r() * PX;
          let a = r() * Math.PI * 2;
          const bold = r() < 0.3;
          g.strokeStyle = bold ? 'rgba(40,52,78,0.55)' : 'rgba(60,72,98,0.28)';
          g.lineWidth = bold ? 1.6 + r() * 1.4 : 0.6 + r() * 0.6;
          g.beginPath();
          g.moveTo(x, y);
          const steps = 40 + r() * 60;
          for (let s = 0; s < steps; s++) {
            a += (r() - 0.5) * 0.9;
            x += Math.cos(a) * 7;
            y += Math.sin(a) * 7;
            g.lineTo(x, y);
            if (r() < 0.04) { // branch
              g.moveTo(x, y);
              a += (r() - 0.5) * 2;
            }
          }
          g.stroke();
        }
        g.restore();
        // grout
        g.strokeStyle = 'rgba(150,155,160,0.9)';
        g.lineWidth = 2;
        g.strokeRect(ox + 1, oy + 1, PX - 2, PX - 2);
      }
    }
    const t = tex(c, { repeat: [roomX / (TILE * tilesX), roomZ / (TILE * tilesZ)] });
    return t;
  });
}

// ---------------------------------------------------------------------------
// Wood laminate (desk and table tops): pale oak with long straight grain.
// ---------------------------------------------------------------------------
export function oak() {
  return once('oak', () => {
    const [c, g] = canvas(1024, 1024);
    const r = rng(11);
    const grad = g.createLinearGradient(0, 0, 0, 1024);
    grad.addColorStop(0, '#e2d2b4');
    grad.addColorStop(1, '#d8c5a3');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 1024);
    for (let i = 0; i < 520; i++) {
      const y = r() * 1024;
      g.strokeStyle = `rgba(${140 + r() * 40},${110 + r() * 30},${70 + r() * 20},${0.06 + r() * 0.14})`;
      g.lineWidth = 0.5 + r() * 2.2;
      g.beginPath();
      g.moveTo(0, y);
      let yy = y;
      for (let x = 0; x <= 1024; x += 32) {
        yy += (r() - 0.5) * 2.2;
        g.lineTo(x, yy);
      }
      g.stroke();
    }
    return tex(c, { repeat: [1, 1] });
  });
}

// ---------------------------------------------------------------------------
// The orange sliding panels: reddish sapele veneer with vertical flame grain.
// ---------------------------------------------------------------------------
export function sapele() {
  return once('sapele', () => {
    const [c, g] = canvas(512, 1024);
    const r = rng(23);
    g.fillStyle = '#c9603c';
    g.fillRect(0, 0, 512, 1024);
    for (let i = 0; i < 380; i++) {
      const x = r() * 512;
      g.strokeStyle = `rgba(${120 + r() * 60},${40 + r() * 30},${20 + r() * 20},${0.08 + r() * 0.18})`;
      g.lineWidth = 0.6 + r() * 2.5;
      g.beginPath();
      let xx = x;
      g.moveTo(xx, 0);
      for (let y = 0; y <= 1024; y += 24) {
        xx += (r() - 0.5) * 3;
        g.lineTo(xx, y);
      }
      g.stroke();
    }
    // soft sheen band
    const sh = g.createLinearGradient(0, 0, 512, 0);
    sh.addColorStop(0, 'rgba(255,190,150,0)');
    sh.addColorStop(0.5, 'rgba(255,190,150,0.12)');
    sh.addColorStop(1, 'rgba(255,190,150,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, 512, 1024);
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Suspended ceiling: 600mm mineral tiles with fine speckle, white T-bar grid.
// ---------------------------------------------------------------------------
export function ceilingTiles(roomX, roomZ) {
  return once('ceiling', () => {
    const [c, g] = canvas(512, 512);
    const r = rng(5);
    g.fillStyle = '#f3f4f2';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(120,120,115,${r() * 0.12})`;
      g.fillRect(r() * 512, r() * 512, 1.2, 1.2);
    }
    g.strokeStyle = '#2b2b2b';
    g.lineWidth = 5;
    g.strokeRect(0, 0, 512, 512);
    return tex(c, { repeat: [roomX / 0.6, roomZ / 0.6] });
  });
}

// ---------------------------------------------------------------------------
// Mesh office-chair back: black mesh with the horizontal ribbing from the photos.
// Returned as an alpha map (white = solid).
// ---------------------------------------------------------------------------
export function meshBack() {
  return once('meshBack', () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = '#555';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#fff';
    for (let y = 8; y < 256; y += 22) g.fillRect(0, y, 256, 9);
    g.fillRect(0, 0, 14, 256);
    g.fillRect(242, 0, 14, 256);
    return tex(c, { srgb: false });
  });
}

// ---------------------------------------------------------------------------
// Whiteboard: the team's task tree, in red / green / blue marker.
// ---------------------------------------------------------------------------
export function whiteboard() {
  return once('whiteboard', () => {
    const [c, g] = canvas(1024, 640);
    g.fillStyle = '#fbfbf8';
    g.fillRect(0, 0, 1024, 640);
    g.strokeStyle = '#c7372f';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(40, 70); g.lineTo(984, 70);
    g.moveTo(512, 40); g.lineTo(512, 600);
    g.moveTo(40, 470); g.lineTo(984, 470);
    g.stroke();
    const r = rng(3);
    const colors = ['#1b6e3a', '#1f3f9a', '#c7372f'];
    g.font = '28px "Segoe Print", "Comic Sans MS", cursive';
    const titles = [['To Be Done this Mid Month', 60, 58], ['Items Addressing on Meeting', 540, 58]];
    g.fillStyle = '#1f3f9a';
    titles.forEach(([t, x, y]) => g.fillText(t, x, y));
    const words = ['MajiLink', 'Mi-Tech', 'Payment Gateway', 'CarbonLink', 'ATC', 'Design', 'Review', 'Order', 'Testing', 'Video'];
    for (let col = 0; col < 2; col++) {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = colors[Math.floor(r() * 3)];
        const x = 60 + col * 480 + (i % 2) * 150, y = 120 + i * 44;
        g.fillText(words[Math.floor(r() * words.length)], x, y);
        g.beginPath();
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 2;
        g.moveTo(x - 14, y - 26); g.lineTo(x - 22, y - 26); g.lineTo(x - 22, y + 4); g.lineTo(x - 14, y + 4);
        g.stroke();
      }
    }
    g.fillStyle = '#c7372f';
    g.fillText('Name = Task Lead', 60, 520);
    return tex(c, { repeat: [1, 1] });
  });
}

// ---------------------------------------------------------------------------
// Terminal on the window-desk monitor.
// ---------------------------------------------------------------------------
export function terminal() {
  return once('terminal', () => {
    const [c, g] = canvas(512, 320);
    g.fillStyle = '#0c1117';
    g.fillRect(0, 0, 512, 320);
    g.font = '11px Consolas, monospace';
    const r = rng(9);
    for (let i = 0; i < 26; i++) {
      g.fillStyle = r() < 0.2 ? '#6fd0ff' : r() < 0.3 ? '#9bf09b' : '#c8d3df';
      let line = '';
      const n = 10 + r() * 60;
      for (let k = 0; k < n; k++) line += r() < 0.15 ? ' ' : String.fromCharCode(97 + Math.floor(r() * 26));
      g.fillText(line, 10, 16 + i * 11.6);
    }
    return tex(c);
  });
}

// ---------------------------------------------------------------------------
// Patient-monitor screen: live ECG / SpO2 / resp traces. Call update() each frame.
// ---------------------------------------------------------------------------
export function vitalsScreen(seed = 1) {
  const [c, g] = canvas(256, 192);
  const t = tex(c);
  const r = rng(seed);
  const hr = 64 + Math.floor(r() * 30);
  let phase = r() * 10;
  const traces = [
    { color: '#3cff7a', y: 40, f: (p) => ecg(p) },
    { color: '#39d0ff', y: 90, f: (p) => Math.sin(p * 6.3) * 0.5 + Math.sin(p * 12.6) * 0.15 },
    { color: '#ffd23c', y: 140, f: (p) => Math.sin(p * 1.6) * 0.8 },
  ];
  function ecg(p) {
    const x = p % 1;
    if (x < 0.05) return Math.sin(x / 0.05 * Math.PI) * 0.15;
    if (x > 0.1 && x < 0.13) return -0.2;
    if (x >= 0.13 && x < 0.16) return 1.6;
    if (x >= 0.16 && x < 0.19) return -0.5;
    if (x > 0.3 && x < 0.42) return Math.sin((x - 0.3) / 0.12 * Math.PI) * 0.3;
    return 0;
  }
  let last = 0;
  t.update = (time) => {
    if (time - last < 60) return; // ~16fps is plenty for a tiny screen
    last = time;
    phase = time / 1000;
    g.fillStyle = '#05070a';
    g.fillRect(0, 0, 256, 192);
    traces.forEach((tr) => {
      g.strokeStyle = tr.color;
      g.lineWidth = 2;
      g.beginPath();
      for (let x = 0; x < 190; x += 2) {
        const p = phase * (hr / 60) - (190 - x) / 190 * 2.2;
        const y = tr.y - tr.f(p) * 16;
        x === 0 ? g.moveTo(x + 4, y) : g.lineTo(x + 4, y);
      }
      g.stroke();
    });
    g.font = 'bold 26px Arial';
    g.fillStyle = '#3cff7a';
    g.fillText(String(hr), 204, 50);
    g.fillStyle = '#39d0ff';
    g.fillText('98', 204, 100);
    g.fillStyle = '#ffd23c';
    g.fillText('16', 204, 150);
    t.needsUpdate = true;
  };
  t.update(0);
  return t;
}

// ---------------------------------------------------------------------------
// The view out of the window: sunset over mid-rise blocks, like the photos.
// Drawn big and unlit so it reads as bright daylight behind the glass.
// ---------------------------------------------------------------------------
export function citySunset() {
  return once('city', () => {
    const W = 2048, H = 1024;
    const [c, g] = canvas(W, H);
    const r = rng(42);
    const sky = g.createLinearGradient(0, 0, 0, H * 0.75);
    sky.addColorStop(0, '#5d7ea6');
    sky.addColorStop(0.35, '#c59a93');
    sky.addColorStop(0.62, '#f2a86a');
    sky.addColorStop(0.8, '#ffd6a0');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // sun glow
    const sun = g.createRadialGradient(W * 0.3, H * 0.62, 10, W * 0.3, H * 0.62, 420);
    sun.addColorStop(0, 'rgba(255,240,200,0.95)');
    sun.addColorStop(0.2, 'rgba(255,200,140,0.5)');
    sun.addColorStop(1, 'rgba(255,170,110,0)');
    g.fillStyle = sun;
    g.fillRect(0, 0, W, H);
    // clouds
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(255,${190 + r() * 40},${170 + r() * 40},${0.08 + r() * 0.12})`;
      const x = r() * W, y = r() * H * 0.45, w = 120 + r() * 400;
      g.beginPath();
      g.ellipse(x, y, w, 10 + r() * 22, 0, 0, Math.PI * 2);
      g.fill();
    }
    // far skyline
    const drawRow = (base, minH, maxH, col, winProb) => {
      let x = -20;
      while (x < W) {
        const w = 60 + r() * 160, h = minH + r() * (maxH - minH);
        g.fillStyle = col;
        g.fillRect(x, base - h, w, h + 400);
        for (let wy = base - h + 12; wy < base - 10; wy += 22)
          for (let wx = x + 8; wx < x + w - 10; wx += 18)
            if (r() < winProb) {
              g.fillStyle = r() < 0.5 ? 'rgba(255,214,150,0.85)' : 'rgba(40,40,50,0.5)';
              g.fillRect(wx, wy, 9, 12);
            }
        x += w + r() * 14;
      }
    };
    drawRow(H * 0.72, 60, 200, '#7a6a78', 0.12);
    drawRow(H * 0.8, 120, 330, '#5a4d57', 0.18);
    // near building: brick-red frame block with balconies and AC units (right of photos)
    g.fillStyle = '#8c5a4c';
    g.fillRect(W * 0.62, H * 0.18, W * 0.3, H);
    for (let fy = H * 0.22; fy < H; fy += 90) {
      for (let fx = W * 0.64; fx < W * 0.9; fx += 120) {
        g.fillStyle = '#e7c9a8';
        g.fillRect(fx, fy, 70, 60);
        g.fillStyle = '#f4f4f0'; // AC unit
        g.fillRect(fx + 76, fy + 30, 34, 26);
        g.fillStyle = '#9a9a9a';
        g.beginPath();
        g.arc(fx + 93, fy + 43, 9, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = '#3a2a28'; // balcony rail
      g.fillRect(W * 0.62, fy + 64, W * 0.3, 5);
    }
    // haze
    const hz = g.createLinearGradient(0, H * 0.55, 0, H);
    hz.addColorStop(0, 'rgba(255,190,150,0)');
    hz.addColorStop(1, 'rgba(255,190,150,0.25)');
    g.fillStyle = hz;
    g.fillRect(0, H * 0.55, W, H * 0.45);
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// ---------------------------------------------------------------------------
// AC cassette grille and linear diffuser slots (alpha-free, colour only).
// ---------------------------------------------------------------------------
export function grille(lines = 28, dark = '#9ea1a3', light = '#eef0ee') {
  return once(`grille${lines}${dark}`, () => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = light;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = dark;
    for (let i = 0; i < lines; i++) g.fillRect(0, (i + 0.5) * (256 / lines), 256, 256 / lines / 2.4);
    return tex(c);
  });
}
