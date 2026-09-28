// Positioning benchmark: a person walks a loop at 0.8 m/s, 1 Hz reports, 5 cm range noise,
// with anchor dropouts and occasional non-line-of-sight (reflected, too long) ranges.
// Run: node test/tracker.test.mjs
import fs from 'node:fs';
import { Tracker } from '../src/tracker.js';

const cfg = JSON.parse(fs.readFileSync(new URL('../config/room.json', import.meta.url), 'utf8'));
const gauss = () => {
  const u = Math.random() || 1e-9, v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const LOOP = [[1, 1], [3.1, 1], [3.1, 3.3], [1, 3.3]];
const legs = LOOP.map((a, i) => {
  const b = LOOP[(i + 1) % LOOP.length];
  return { a, b, L: Math.hypot(b[0] - a[0], b[1] - a[1]) };
});
const total = legs.reduce((s, l) => s + l.L, 0);
function at(d) {
  d %= total;
  for (const l of legs) {
    if (d <= l.L) {
      const k = d / l.L;
      return [l.a[0] + (l.b[0] - l.a[0]) * k, l.a[1] + (l.b[1] - l.a[1]) * k];
    }
    d -= l.L;
  }
}
const pct = (a, q) => a[Math.min(a.length - 1, Math.floor(a.length * q))];

let failed = false;
// [dropout, NLOS rate, p95 limit]. Regression guards, measured 2026-09-28: clean 0.16m p95,
// 5% NLOS (+0.8-1.8m) 0.76m, 20% dropouts 0.74m. 20% dropouts is harsher than the node produces (it keeps
// a range for 1.5s), so it is reported with a looser limit.
for (const [drop, nlos, limit] of [[0.05, 0, 0.3], [0.05, 0.05, 0.9], [0.2, 0, 0.9]]) {
  const t = new Tracker(cfg);
  const errs = [];
  for (let s = 0; s < 1500; s++) {
    const [x, z] = at(s * 0.8);
    const U = cfg.anchors.map((a) => {
      if (Math.random() < drop) return 0;
      const d = Math.hypot(a.x - x, a.y - cfg.tagHeight, a.z - z) + gauss() * 0.05;
      return +(d + (Math.random() < nlos ? 0.8 + Math.random() : 0)).toFixed(2);
    });
    const p = t.ingest({ I: 1, G: 1, M: 1, U }, 1e6 + s * 1000);
    if (p.x !== null && s > 5) errs.push(Math.hypot(p.x - x, p.z - z));
  }
  errs.sort((a, b) => a - b);
  const med = pct(errs, 0.5), p95 = pct(errs, 0.95), max = errs.at(-1);
  console.log(`walking, ${drop * 100}% dropouts, ${nlos * 100}% NLOS: median ${med.toFixed(3)} m, p95 ${p95.toFixed(3)} m, max ${max.toFixed(3)} m`);
  if (p95 > limit) failed = true;
}

const t = new Tracker(cfg);
const still = [];
for (let s = 0; s < 120; s++) {
  const U = cfg.anchors.map((a) => +(Math.hypot(a.x - 2, a.y - cfg.tagHeight, a.z - 1.2) + gauss() * 0.05).toFixed(2));
  const p = t.ingest({ I: 1, G: 1, M: 0, U }, 1e6 + s * 1000);
  if (s > 5) still.push(Math.hypot(p.x - 2, p.z - 1.2));
}
still.sort((a, b) => a - b);
console.log(`standing still: median ${pct(still, 0.5).toFixed(3)} m, max ${still.at(-1).toFixed(3)} m`);
if (pct(still, 0.5) > 0.1) failed = true;

// Collapsed: tag near the floor (G=0). Positions must stay right - this is when they matter.
const tl = new Tracker(cfg);
const down = [];
for (let s = 0; s < 40; s++) {
  const U = cfg.anchors.map((a) => +(Math.hypot(a.x - 2.4, a.y - (cfg.tagHeightLying ?? 0.25), a.z - 3.3) + gauss() * 0.05).toFixed(2));
  const p = tl.ingest({ I: 1, G: 0, M: 0, U }, 1e6 + s * 1000);
  if (s > 5) down.push(Math.hypot(p.x - 2.4, p.z - 3.3));
}
down.sort((a, b) => a - b);
console.log(`lying on the floor: median ${pct(down, 0.5).toFixed(3)} m, max ${down.at(-1).toFixed(3)} m`);
if (pct(down, 0.5) > 0.12) failed = true;

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
