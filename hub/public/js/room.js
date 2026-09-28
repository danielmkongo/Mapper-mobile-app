// The lab, modelled from the site photos.
//
// Frame: origin on the floor in the north-west corner. x runs east along the window
// wall, z runs south into the room, y is up. Metres throughout.
//
//   north (z=0)   floor-to-ceiling window, long workbench with monitor + PC tower
//   east  (x=X)   pale green wall, whiteboard, bench of patient monitors
//   south (z=Z)   orange sapele sliding panels in dark frames
//   west  (x=0)   doorway + electric meter, frosted glass partition, foam corner
//   centre        octagonal meeting table, mesh office chairs and sled chairs
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as T from './textures.js';

const M = {}; // shared materials, created once

function materials(size) {
  if (M.ready) return M;
  const std = (o) => new THREE.MeshStandardMaterial(o);
  M.wall = std({ color: 0xdfe7d6, roughness: 0.92 });
  M.floor = new THREE.MeshPhysicalMaterial({
    map: T.marbleTiles(size.x, size.z), roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.12,
  });
  M.ceiling = std({ map: T.ceilingTiles(size.x, size.z), roughness: 0.95 });
  M.frame = std({ color: 0x2a221d, roughness: 0.38, metalness: 0.55 });
  M.steel = std({ color: 0x15171a, roughness: 0.45, metalness: 0.6 });
  M.chrome = std({ color: 0xd9dde2, roughness: 0.12, metalness: 1.0 });
  M.oak = std({ map: T.oak(), roughness: 0.42 });
  M.oakEdge = std({ color: 0x3a342e, roughness: 0.5 });
  M.sapele = std({ map: T.sapele(), roughness: 0.38 });
  M.glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, transmission: 1, roughness: 0.03, thickness: 0.01, ior: 1.5,
    transparent: true, opacity: 1, envMapIntensity: 0.6,
  });
  M.frosted = new THREE.MeshPhysicalMaterial({
    color: 0xf4f6f7, transmission: 0.82, roughness: 0.55, thickness: 0.02, transparent: true,
  });
  M.blackPlastic = std({ color: 0x141414, roughness: 0.55 });
  M.fabric = std({ color: 0x1b1c1f, roughness: 0.95 });
  M.whitePlastic = std({ color: 0xf1f2f0, roughness: 0.35 });
  M.skirting = std({ color: 0xe9ecee, roughness: 0.3 });
  M.foam = std({ color: 0x1c1a19, roughness: 1 });
  M.door = std({ color: 0xb49a78, roughness: 0.5 });
  M.ready = true;
  return M;
}

function mesh(geo, mat, x, y, z, { cast = true, receive = true, ry = 0 } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const box = (w, h, d, mat, x, y, z, opts) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, opts);
const rbox = (w, h, d, r, mat, x, y, z, opts) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z, opts);
const cyl = (rt, rb, h, seg, mat, x, y, z, opts) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, opts);

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

// Black steel frame table/bench with a laminate top.
function bench(g, x, z, w, d, h, ry = 0, shelf = true) {
  const b = new THREE.Group();
  b.add(box(w, 0.025, d, M.oak, 0, h - 0.0125, 0));
  b.add(box(w, 0.026, d + 0.004, M.oakEdge, 0, h - 0.0125, 0, { cast: false })); // edge band
  b.children[1].scale.set(1.002, 0.9, 1);
  const legT = 0.035;
  for (const sx of [-1, 1]) for (const sz of [-1, 1])
    b.add(box(legT, h - 0.025, legT, M.steel, sx * (w / 2 - 0.04), (h - 0.025) / 2, sz * (d / 2 - 0.04)));
  b.add(box(w - 0.08, 0.03, legT, M.steel, 0, h - 0.06, d / 2 - 0.04));
  b.add(box(w - 0.08, 0.03, legT, M.steel, 0, h - 0.06, -d / 2 + 0.04));
  if (shelf) b.add(box(w - 0.1, 0.02, d - 0.12, M.steel, 0, 0.16, 0));
  b.position.set(x, 0, z);
  b.rotation.y = ry;
  g.add(b);
  return b;
}

function octagonTable(g, x, z) {
  const t = new THREE.Group();
  const R = 0.8, h = 0.75;
  const top = mesh(new THREE.CylinderGeometry(R, R, 0.03, 8), M.oak, 0, h - 0.015, 0);
  top.rotation.y = Math.PI / 8;
  t.add(top);
  const edge = mesh(new THREE.CylinderGeometry(R + 0.004, R + 0.004, 0.022, 8, 1, true), M.oakEdge, 0, h - 0.015, 0);
  edge.rotation.y = Math.PI / 8;
  t.add(edge);
  // two crossed steel frames (the photo shows square-section legs splayed from centre)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const lx = Math.cos(a) * 0.55, lz = Math.sin(a) * 0.55;
    t.add(box(0.04, h - 0.03, 0.04, M.steel, lx, (h - 0.03) / 2, lz));
    const rail = box(0.55, 0.03, 0.03, M.steel, lx / 2, h - 0.06, lz / 2);
    rail.rotation.y = -a;
    t.add(rail);
    const foot = box(0.55, 0.025, 0.03, M.steel, lx / 2, 0.02, lz / 2);
    foot.rotation.y = -a;
    t.add(foot);
  }
  t.add(cyl(0.05, 0.05, 0.2, 16, M.steel, 0, 0.35, 0)); // centre hub
  t.position.set(x, 0, z);
  g.add(t);
  return t;
}

// Mesh high-back office chair with headrest and 5-star chrome base.
function officeChair(g, x, z, ry) {
  const c = new THREE.Group();
  // base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = box(0.32, 0.03, 0.045, M.chrome, Math.cos(a) * 0.16, 0.07, Math.sin(a) * 0.16);
    arm.rotation.y = -a;
    c.add(arm);
    c.add(mesh(new THREE.SphereGeometry(0.028, 12, 8), M.blackPlastic, Math.cos(a) * 0.31, 0.03, Math.sin(a) * 0.31));
  }
  c.add(cyl(0.022, 0.022, 0.32, 16, M.chrome, 0, 0.24, 0));
  c.add(cyl(0.032, 0.032, 0.12, 16, M.blackPlastic, 0, 0.14, 0));
  // seat
  c.add(rbox(0.5, 0.08, 0.48, 0.03, M.fabric, 0, 0.47, 0));
  c.add(box(0.44, 0.025, 0.42, M.blackPlastic, 0, 0.42, 0));
  // back: mesh panel (alpha ribbing) in a plastic frame
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0x16171a, roughness: 0.8, alphaMap: T.meshBack(), transparent: true, side: THREE.DoubleSide,
  });
  const back = mesh(new THREE.PlaneGeometry(0.44, 0.55), meshMat, 0, 0.84, 0.26, { receive: false });
  back.rotation.x = -0.12;
  c.add(back);
  const frameGeo = new THREE.TorusGeometry(0.25, 0.012, 8, 32);
  const f = mesh(frameGeo, M.blackPlastic, 0, 0.84, 0.26);
  f.scale.set(0.9, 1.12, 1);
  f.rotation.x = -0.12;
  c.add(f);
  c.add(box(0.05, 0.36, 0.03, M.blackPlastic, 0, 0.62, 0.25)); // spine
  // headrest
  const head = rbox(0.28, 0.12, 0.06, 0.03, M.fabric, 0, 1.22, 0.31);
  head.rotation.x = -0.18;
  c.add(head);
  c.add(box(0.03, 0.16, 0.02, M.blackPlastic, 0, 1.12, 0.3));
  // arms
  for (const s of [-1, 1]) {
    c.add(box(0.035, 0.2, 0.035, M.blackPlastic, s * 0.26, 0.58, 0.02));
    c.add(rbox(0.06, 0.03, 0.26, 0.012, M.blackPlastic, s * 0.26, 0.69, 0.0));
  }
  c.position.set(x, 0, z);
  c.rotation.y = ry;
  g.add(c);
  return c;
}

// Stackable black shell chair on a chrome sled base.
function sledChair(g, x, z, ry) {
  const c = new THREE.Group();
  const tube = (pts) => {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    return mesh(new THREE.TubeGeometry(curve, 40, 0.011, 8), M.chrome, 0, 0, 0);
  };
  for (const s of [-1, 1]) {
    c.add(tube([[s * 0.22, 0.44, -0.22], [s * 0.22, 0.02, -0.26], [s * 0.22, 0.01, 0.2], [s * 0.21, 0.44, 0.22], [s * 0.2, 0.86, 0.26]]));
  }
  c.add(rbox(0.46, 0.05, 0.44, 0.02, M.fabric, 0, 0.46, 0));
  const back = rbox(0.44, 0.34, 0.03, 0.02, M.blackPlastic, 0, 0.72, 0.24);
  back.rotation.x = -0.1;
  c.add(back);
  c.position.set(x, 0, z);
  c.rotation.y = ry;
  g.add(c);
  return c;
}

function patientMonitor(g, x, y, z, ry, seed, screens) {
  const m = new THREE.Group();
  m.add(rbox(0.34, 0.28, 0.14, 0.03, M.whitePlastic, 0, 0.14, 0));
  m.add(rbox(0.1, 0.24, 0.12, 0.02, M.whitePlastic, 0.2, 0.12, 0)); // side module
  const screenTex = T.vitalsScreen(seed);
  screens.push(screenTex);
  const screen = mesh(new THREE.PlaneGeometry(0.27, 0.2),
    new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }), -0.01, 0.15, 0.0705, { cast: false });
  m.add(screen);
  m.add(box(0.08, 0.02, 0.02, M.whitePlastic, 0, 0.3, 0)); // handle
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
}

function deskMonitor(g, x, y, z, ry) {
  const m = new THREE.Group();
  m.add(box(0.2, 0.012, 0.16, M.steel, 0, 0.006, 0));
  m.add(box(0.04, 0.34, 0.03, M.steel, 0, 0.18, 0.04));
  m.add(rbox(0.56, 0.34, 0.03, 0.006, M.blackPlastic, 0, 0.4, 0));
  m.add(mesh(new THREE.PlaneGeometry(0.535, 0.31),
    new THREE.MeshBasicMaterial({ map: T.terminal(), toneMapped: false }), 0, 0.4, -0.0155, { cast: false, ry: Math.PI }));
  m.position.set(x, y, z);
  m.rotation.y = ry;
  g.add(m);
}

// ---------------------------------------------------------------------------
// Room shell
// ---------------------------------------------------------------------------
export function buildRoom(scene, config) {
  const { x: X, z: Z, height: H } = config.size;
  materials(config.size);
  const g = new THREE.Group();
  g.name = 'room';
  scene.add(g);
  const screens = [];

  // floor / ceiling
  const floor = mesh(new THREE.PlaneGeometry(X, Z), M.floor, X / 2, 0, Z / 2, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);
  // Each enclosing surface is its own group so the viewer can cut away whichever ones
  // stand between the camera and the room (dollhouse view).
  const north = new THREE.Group(), east = new THREE.Group(), ceilG = new THREE.Group();
  const ceil = mesh(new THREE.PlaneGeometry(X, Z), M.ceiling, X / 2, H, Z / 2, { cast: false });
  ceil.rotation.x = Math.PI / 2;
  ceilG.add(ceil);

  // -------- north: window wall --------
  const sill = 0.12;
  north.add(box(X, sill, 0.08, M.frame, X / 2, sill / 2, -0.02));
  const win = mesh(new THREE.PlaneGeometry(X, H - sill - 0.05), M.glass, X / 2, sill + (H - sill - 0.05) / 2, 0, { cast: false, receive: false });
  north.add(win);
  const mullions = [0, 0.95, 1.85, 2.65, 3.3, X];
  mullions.forEach((mx) => north.add(box(0.06, H, 0.1, M.frame, mx, H / 2, 0)));
  north.add(box(X, 0.06, 0.1, M.frame, X / 2, 2.25, 0));
  north.add(box(X, 0.05, 0.1, M.frame, X / 2, H - 0.025, 0));
  // glass door frame inside the window run (photos show a door-height transom)
  north.add(box(0.05, 2.1, 0.1, M.frame, 1.25, 1.05, 0));
  north.add(box(0.05, 2.1, 0.1, M.frame, 1.8, 1.05, 0));

  // outside view: unlit, bright, far enough for parallax
  // A curved panorama (not a flat board) so it holds up from any angle through the glass.
  const panoGeo = new THREE.CylinderGeometry(9, 9, 11, 64, 1, true, -Math.PI * 0.42, Math.PI * 0.84);
  // Opaque on purpose: transmissive glass only refracts opaque objects behind it.
  const view = mesh(panoGeo, new THREE.MeshBasicMaterial({ map: T.citySunset(), side: THREE.BackSide, toneMapped: false }),
    X / 2, 3.0, Z / 2, { cast: false, receive: false, ry: Math.PI });
  north.add(view);
  // a balcony slab just outside, gives the depth cue seen in the photos
  north.add(box(X + 2, 0.12, 1.4, new THREE.MeshStandardMaterial({ color: 0x8b8680, roughness: 0.9 }), X / 2, -0.25, -0.9, { cast: false }));

  // -------- east: green wall --------
  const eastWall = mesh(new THREE.PlaneGeometry(Z, H), M.wall, X, H / 2, Z / 2, { cast: false, ry: -Math.PI / 2 });
  east.add(eastWall);
  east.add(box(0.012, 0.08, Z, M.skirting, X - 0.006, 0.04, Z / 2));
  // whiteboard near the window corner
  east.add(box(0.03, 0.62, 0.98, new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.7, roughness: 0.3 }), X - 0.015, 1.72, 0.9));
  const wb = mesh(new THREE.PlaneGeometry(0.94, 0.58), new THREE.MeshStandardMaterial({ map: T.whiteboard(), roughness: 0.18 }),
    X - 0.032, 1.72, 0.9, { cast: false, ry: -Math.PI / 2 });
  east.add(wb);
  east.add(box(0.05, 0.02, 0.6, M.frame, X - 0.04, 1.41, 0.9)); // marker tray

  // -------- south: orange sliding panels --------
  const south = new THREE.Group();
  const panelW = X / 3;
  for (let i = 0; i < 3; i++) {
    const px = panelW * (i + 0.5);
    south.add(box(panelW - 0.06, H - 0.1, 0.03, M.sapele, px, (H - 0.1) / 2 + 0.05, Z - 0.04 - (i % 2) * 0.04));
    south.add(box(0.05, H, 0.07, M.frame, panelW * i, H / 2, Z - 0.035));
  }
  south.add(box(0.05, H, 0.07, M.frame, X, H / 2, Z - 0.035));
  south.add(box(X, 0.06, 0.1, M.frame, X / 2, H - 0.03, Z - 0.05));
  south.add(box(X, 0.05, 0.1, M.frame, X / 2, 0.025, Z - 0.05));
  g.add(east, south);

  // -------- west: partition, meter, doorway, foam corner --------
  const west = new THREE.Group();
  const outside = new THREE.Group(); // beyond the walls: hidden in the plan view
  west.add(outside);
  const doorZ0 = 2.75, doorZ1 = 3.65; // doorway at the south end
  // solid wall piece around the door
  west.add(box(0.1, H, 0.55, M.wall, -0.05, H / 2, 0.275)); // foam corner pier
  west.add(box(0.1, H, Z - doorZ1, M.wall, -0.05, H / 2, (doorZ1 + Z) / 2));
  west.add(box(0.1, H - 2.1, doorZ1 - doorZ0, M.wall, -0.05, 2.1 + (H - 2.1) / 2, (doorZ0 + doorZ1) / 2));
  west.add(box(0.12, H, 0.08, M.frame, -0.04, H / 2, doorZ0));
  west.add(box(0.12, H, 0.08, M.frame, -0.04, H / 2, doorZ1));
  west.add(box(0.12, 0.08, doorZ1 - doorZ0, M.frame, -0.04, 2.1, (doorZ0 + doorZ1) / 2));
  // the corridor beyond the door, dim
  outside.add(box(1.4, H, 1.6, new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.9, side: THREE.BackSide }),
    -0.8, H / 2, (doorZ0 + doorZ1) / 2, { cast: false }));
  // door leaf, swung open into the corridor
  const leaf = box(0.04, 2.04, 0.88, M.door, -0.45, 1.02, doorZ0 + 0.05);
  leaf.rotation.y = Math.PI / 2.3;
  leaf.position.set(-0.42, 1.02, doorZ0 + 0.35);
  outside.add(leaf);
  // frosted partition over the rest of the west side, in bronze frames
  const pz0 = 0.55, pz1 = doorZ0 - 0.2;
  west.add(box(0.1, H, pz1 - (doorZ0 - 0.2) + 0.2, M.wall, -0.05, H / 2, (pz1 + doorZ0) / 2)); // meter pier
  const pane = mesh(new THREE.PlaneGeometry(pz1 - pz0, H - 0.1), M.frosted, 0, H / 2, (pz0 + pz1) / 2, { cast: false, ry: Math.PI / 2 });
  west.add(pane);
  // behind the frosted glass: the office next door, shapes blurred by the frost
  outside.add(box(0.5, 1.9, 0.9, new THREE.MeshStandardMaterial({ color: 0xc9a27a, roughness: 0.8 }), -0.6, 0.95, 1.9, { cast: false }));
  outside.add(box(0.3, 0.35, 0.4, new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.8 }), -0.6, 2.05, 1.7, { cast: false }));
  [pz0, (pz0 + pz1) / 2, pz1].forEach((z) => west.add(box(0.07, H, 0.06, M.frame, 0, H / 2, z)));
  [0.05, 1.3, H - 0.05].forEach((y) => west.add(box(0.07, 0.06, pz1 - pz0, M.frame, 0, y, (pz0 + pz1) / 2)));
  // acoustic foam on the pier next to the window
  const foamGeo = new THREE.ConeGeometry(0.045, 0.05, 4);
  for (let fy = 0.9; fy < 2.5; fy += 0.08)
    for (let fz = 0.06; fz < 0.5; fz += 0.08) {
      const f = mesh(foamGeo, M.foam, 0.02, fy, fz, { cast: false });
      f.rotation.z = -Math.PI / 2;
      f.rotation.x = Math.PI / 4;
      west.add(f);
    }
  // certificates
  [[1.65, 0.2], [1.35, 0.2]].forEach(([y, z]) =>
    west.add(box(0.02, 0.26, 0.2, new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6 }), 0.01, y, z + 0.1)));
  // prepaid electricity meter + cable
  west.add(rbox(0.04, 0.26, 0.14, 0.01, new THREE.MeshStandardMaterial({ color: 0xcfd2cf, roughness: 0.5 }), 0.02, 1.62, doorZ0 - 0.1));
  west.add(box(0.005, 0.06, 0.08, new THREE.MeshStandardMaterial({ color: 0x4d6b57, roughness: 0.3 }), 0.042, 1.68, doorZ0 - 0.1, { cast: false }));
  west.add(cyl(0.004, 0.004, H - 1.75, 6, new THREE.MeshStandardMaterial({ color: 0xeeeeee }), 0.02, 1.75 + (H - 1.75) / 2, doorZ0 - 0.06));
  g.add(west, north);

  // -------- ceiling fixtures --------
  const cassette = new THREE.Group();
  cassette.add(rbox(0.95, 0.06, 0.95, 0.02, M.whitePlastic, 0, 0, 0));
  const grilleMat = new THREE.MeshStandardMaterial({ map: T.grille(28), roughness: 0.6 });
  const gr = mesh(new THREE.PlaneGeometry(0.42, 0.42), grilleMat, 0, -0.031, 0, { cast: false });
  gr.rotation.x = Math.PI / 2;
  cassette.add(gr);
  for (let i = 0; i < 4; i++) { // louvres
    const v = box(0.62, 0.012, 0.07, new THREE.MeshStandardMaterial({ color: 0xd9c9a8, roughness: 0.5 }), 0, -0.035, 0.37);
    const pivot = new THREE.Group();
    pivot.add(v);
    pivot.rotation.y = (i * Math.PI) / 2;
    cassette.add(pivot);
  }
  cassette.position.set(1.4, H - 0.03, 2.55);
  ceilG.add(cassette);
  g.add(ceilG);

  const lamps = [];
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 2.2 });
  [[0.8, 1.2], [3.0, 2.9]].forEach(([lx, lz]) => {
    ceilG.add(cyl(0.16, 0.16, 0.04, 40, M.whitePlastic, lx, H - 0.02, lz, { cast: false }));
    ceilG.add(cyl(0.135, 0.135, 0.005, 40, ledMat, lx, H - 0.042, lz, { cast: false }));
    lamps.push(new THREE.Vector3(lx, H - 0.06, lz));
  });
  // hanging bulb
  ceilG.add(cyl(0.004, 0.004, 0.14, 6, M.whitePlastic, 2.25, H - 0.07, 1.55, { cast: false }));
  ceilG.add(mesh(new THREE.SphereGeometry(0.045, 20, 14),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d6, emissiveIntensity: 3 }), 2.25, H - 0.18, 1.55, { cast: false }));
  lamps.push(new THREE.Vector3(2.25, H - 0.2, 1.55));
  // smoke detector + linear diffusers
  ceilG.add(cyl(0.06, 0.07, 0.04, 24, new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.6 }), 2.85, H - 0.02, 0.95, { cast: false }));
  const diffMat = new THREE.MeshStandardMaterial({ map: T.grille(8, '#5a4a44', '#e7e2dc'), roughness: 0.7 });
  [[1.6, 0.75, 1.2, 0.3], [3.2, 3.2, 0.3, 1.0]].forEach(([dx, dz, w, d]) => {
    const p = mesh(new THREE.PlaneGeometry(w, d), diffMat, dx, H - 0.002, dz, { cast: false });
    p.rotation.x = Math.PI / 2;
    ceilG.add(p);
  });

  // -------- furniture --------
  // window workbench with the lab monitor, PC tower and drone parts
  bench(g, 1.75, 0.34, 3.1, 0.55, 0.9);
  deskMonitor(g, 0.9, 0.9, 0.3, Math.PI);
  g.add(box(0.2, 0.45, 0.42, M.blackPlastic, 0.55, 0.225, 0.36));
  g.add(box(0.22, 0.03, 0.3, M.blackPlastic, 1.6, 0.91, 0.3)); // laptop base
  const lid = box(0.22, 0.01, 0.3, M.blackPlastic, 1.6, 1.05, 0.16);
  lid.rotation.x = -1.2;
  g.add(lid);
  g.add(box(0.12, 0.22, 0.12, M.whitePlastic, 2.9, 1.01, 0.25)); // router
  g.add(box(0.5, 0.06, 0.3, new THREE.MeshStandardMaterial({ color: 0x2c3a52, roughness: 0.6 }), 2.2, 0.19, 0.36)); // parts on shelf

  // east bench with patient monitors and soldering station
  bench(g, 3.66, 2.05, 2.3, 0.6, 0.78, Math.PI / 2);
  patientMonitor(g, 3.72, 0.78, 1.25, -Math.PI / 2, 1, screens);
  patientMonitor(g, 3.72, 0.78, 1.78, -Math.PI / 2, 2, screens);
  g.add(box(0.14, 0.08, 0.1, new THREE.MeshStandardMaterial({ color: 0xd8672c, roughness: 0.5 }), 3.6, 0.82, 2.5)); // multimeter
  g.add(cyl(0.05, 0.06, 0.03, 20, M.blackPlastic, 3.6, 0.795, 2.8));
  const iron = cyl(0.006, 0.006, 0.26, 8, M.chrome, 3.6, 0.93, 2.8);
  iron.rotation.z = 0.5;
  g.add(iron);

  // central meeting table and chairs
  // Chairs tucked in, leaving the walkways people actually use: along the window bench,
  // down the monitor bench, past the orange panels and out to the doorway.
  const TX = 2.1, TZ = 2.25;
  octagonTable(g, TX, TZ);
  const seat = (a, d) => [TX + Math.cos(a) * d, TZ + Math.sin(a) * d, -a - Math.PI / 2];
  [[-2.5, 0.9], [-1.0, 0.9], [0.85, 0.9], [2.4, 0.9]].forEach(([a, d]) => officeChair(g, ...seat(a, d)));
  [[1.65, 0.92], [3.1, 0.92]].forEach(([a, d]) => sledChair(g, ...seat(a, d)));
  // backpack on the west sled chair
  const [bpx, bpz] = seat(3.1, 1.02);
  g.add(rbox(0.3, 0.42, 0.18, 0.06, new THREE.MeshStandardMaterial({ color: 0x241f22, roughness: 0.9 }), bpx, 0.72, bpz));
  // cardboard box of parts by the east bench (seen in the photos)
  g.add(box(0.45, 0.32, 0.35, new THREE.MeshStandardMaterial({ color: 0xa57b4f, roughness: 0.9 }), 3.4, 0.16, 3.35));

  // Cutaway: each shell piece hides when the camera is on its outer side.
  // (point on the surface, outward normal)
  const shells = [
    { group: north, p: new THREE.Vector3(X / 2, 0, 0), n: new THREE.Vector3(0, 0, -1) },
    { group: east, p: new THREE.Vector3(X, 0, Z / 2), n: new THREE.Vector3(1, 0, 0) },
    { group: south, p: new THREE.Vector3(X / 2, 0, Z), n: new THREE.Vector3(0, 0, 1) },
    { group: west, p: new THREE.Vector3(0, 0, Z / 2), n: new THREE.Vector3(-1, 0, 0) },
    { group: ceilG, p: new THREE.Vector3(X / 2, H, Z / 2), n: new THREE.Vector3(0, 1, 0) },
  ];

  return { group: g, lamps, screens, shells, outside };
}

// ---------------------------------------------------------------------------
// Named zones, used to say *where* someone is in plain words ("by the window bench").
// ---------------------------------------------------------------------------
export const ZONES = [
  { name: 'window bench', x: 1.75, z: 0.9, r: 1.3 },
  { name: 'meeting table', x: 2.1, z: 2.25, r: 1.2 },
  { name: 'monitor bench', x: 3.3, z: 1.6, r: 0.9 },
  { name: 'doorway', x: 0.5, z: 3.2, r: 0.8 },
  { name: 'orange panels', x: 2.0, z: 3.3, r: 1.0 },
  { name: 'partition', x: 0.5, z: 1.6, r: 0.8 },
];

export function zoneAt(x, z) {
  let best = ZONES[0], bestD = Infinity;
  for (const zn of ZONES) {
    const d = Math.hypot(x - zn.x, z - zn.z) / zn.r;
    if (d < bestD) { bestD = d; best = zn; }
  }
  return best.name;
}
