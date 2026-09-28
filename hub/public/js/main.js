// Mapper Live - digital twin + operations console.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildRoom, zoneAt } from './room.js';
import { loadAvatar, Person, STATUS_COLORS, escapeHtml } from './people.js';

const $ = (id) => document.getElementById(id);
// The hub serves this page, at the site root locally or under a path behind nginx
// (e.g. /mapper/), so every request is relative to where the page was loaded from.
const HUB = new URL('.', location.href).href.replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Settings a viewer can change, remembered per device.
// ---------------------------------------------------------------------------
const prefs = (() => {
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(innerWidth, innerHeight) < 820;
  const defaults = { hq: !phone, trails: true, ranges: false };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('mapper.prefs') || '{}'); } catch { /* private mode */ }
  const p = { ...defaults, ...saved };
  // ?hq=0 / ?hq=1 overrides, e.g. for a wall display or a weak tablet
  const q = new URLSearchParams(location.search);
  if (q.has('hq')) p.hq = q.get('hq') !== '0';
  return p;
})();
const savePrefs = () => { try { localStorage.setItem('mapper.prefs', JSON.stringify(prefs)); } catch { /* private mode */ } };

// ---------------------------------------------------------------------------
async function main() {
  const config = await (await fetch(`${HUB}/api/config`)).json();
  const { x: X, z: Z, height: H } = config.size;
  $('siteName').textContent = `${config.name} · ${X} × ${Z} m`;

  // ---- renderer ----
  const stage = $('stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, prefs.hq ? 2 : 1.25));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.setSize(innerWidth, innerHeight);
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
  stage.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1016);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxDistance = 14;
  controls.minDistance = 1.2;
  controls.maxPolarAngle = Math.PI * 0.49;

  // ---- light ----
  // Late sun through the window wall: warm, low, long mullion shadows across the floor.
  const sun = new THREE.DirectionalLight(0xffb47d, 3.4);
  sun.position.set(X * 0.3 - 2.2, 2.3, -5.2);
  sun.target.position.set(X * 0.55, 0, Z * 0.55);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 16 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x6b5a4a, 0.55));

  const room = buildRoom(scene, config);
  // Ceiling LEDs and the bulb: soft warm-white fill. The central bulb casts shadows so
  // people ground themselves on the floor even away from the sun patch.
  room.lamps.forEach((p, i) => {
    const l = new THREE.PointLight(0xfff0dc, i === 2 ? 5 : 7, 0, 2);
    l.position.copy(p);
    if (i === 2) {
      l.castShadow = true;
      l.shadow.mapSize.set(1024, 1024);
      l.shadow.bias = -0.002;
      l.shadow.radius = 6;
    }
    scene.add(l);
  });

  // ---- anchors ----
  const anchorViews = config.anchors.map((a) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.05), new THREE.MeshStandardMaterial({ color: 0xf2f3f1, roughness: 0.4 }));
    body.castShadow = true;
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.3 }));
    ant.position.y = 0.11;
    const ledMat = new THREE.MeshBasicMaterial({ color: STATUS_COLORS.offline, toneMapped: false });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), ledMat);
    led.position.set(0, 0.03, 0.027);
    g.add(body, ant, led);
    g.position.set(a.x, a.y, a.z);
    g.lookAt(X / 2, a.y, Z / 2);
    const el = document.createElement('div');
    el.className = 'anchor-tag';
    el.textContent = a.id;
    const tag = new CSS2DObject(el);
    tag.position.set(0, 0.2, 0);
    g.add(tag);
    scene.add(g);
    // horizontal range circle (at tag height) for the "Ranges" overlay
    const circle = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => {
        const t = (i / 96) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
      })),
      new THREE.LineDashedMaterial({ color: 0x3fc6ff, dashSize: 0.08, gapSize: 0.05, transparent: true, opacity: 0.85 }),
    );
    circle.computeLineDistances();
    circle.position.set(a.x, 0.02, a.z);
    circle.visible = false;
    scene.add(circle);
    return { anchor: a, ledMat, circle };
  });

  // ---- post-processing ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.5, thickness: 1.2, scale: 1.1, samples: 16 });
  gtao.blendIntensity = 0.9;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());

  // ---- people ----
  await loadAvatar(`${HUB}/models/Xbot.glb`);
  const people = new Map();
  let selected = null;
  let latest = null;

  // ---- camera views ----
  const views = {
    orbit: () => {
      controls.enableRotate = true;
      room.outside.visible = true;
      flyTo(new THREE.Vector3(-1.9, 4.3, Z + 2.9), new THREE.Vector3(X * 0.52, 0.6, Z * 0.45));
    },
    plan: () => {
      controls.enableRotate = false;
      room.outside.visible = false;
      flyTo(new THREE.Vector3(X / 2, 8.2, Z / 2 + 0.01), new THREE.Vector3(X / 2, 0, Z / 2));
    },
    follow: () => { controls.enableRotate = true; room.outside.visible = true; },
  };
  let view = 'orbit';
  let fly = null;
  function flyTo(pos, target, ms = 900) {
    fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms };
  }
  camera.position.set(-1.9, 4.3, Z + 2.9);
  controls.target.set(X * 0.52, 0.6, Z * 0.45);

  function setView(v) {
    view = v;
    document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === v)));
    if (v === 'follow' && !selected && people.size) select(people.keys().next().value);
    views[v]();
  }
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  function applyToggles() {
    document.querySelectorAll('[data-toggle]').forEach((b) => b.setAttribute('aria-pressed', String(!!prefs[b.dataset.toggle])));
    renderer.setPixelRatio(Math.min(devicePixelRatio, prefs.hq ? 2 : 1.25));
    renderer.shadowMap.enabled = true;
    sun.shadow.mapSize.set(prefs.hq ? 2048 : 1024, prefs.hq ? 2048 : 1024);
    composer.setPixelRatio(renderer.getPixelRatio());
    for (const p of people.values()) p.trail.visible = prefs.trails && p.placed;
  }
  document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
    prefs[b.dataset.toggle] = !prefs[b.dataset.toggle];
    savePrefs();
    applyToggles();
  }));
  applyToggles();

  function select(id) {
    selected = selected === id && view !== 'follow' ? null : id;
    renderPanel();
  }

  // ---- panel UI ----
  const tintOf = (id) => {
    const p = people.get(id);
    return p ? `#${p.tint.toString(16).padStart(6, '0')}` : '#888';
  };
  const chipFor = (d) => {
    if (d.offline) return ['Offline', 'var(--offline)'];
    if (d.level === 'critical') return [d.alerts[0].text, 'var(--crit)'];
    if (d.level === 'warn') return [d.alerts[0].text, 'var(--warn)'];
    return [d.posture === 'lying' ? 'Lying' : d.moving ? 'Moving' : 'OK', 'var(--ok)'];
  };
  const ago = (t) => {
    if (!t) return 'never';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ${s % 60}s ago`;
  };

  function renderPanel() {
    if (!latest) return;
    const list = [...latest.people].sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
    const crit = list.filter((d) => d.level === 'critical' && !d.offline).length;
    $('counts').textContent = `${list.filter((d) => !d.offline).length}/${list.length} online${crit ? ` · ${crit} alert` : ''}`;
    $('people').innerHTML = list.length ? list.map((d) => {
      const [chip, c] = chipFor(d);
      const where = d.x === null ? 'Position unknown' : `Near the ${zoneAt(d.x, d.z)} · ${ago(d.lastSeen)}`;
      return `<button class="card" data-id="${d.id}" data-level="${d.offline ? 'offline' : d.level}" aria-pressed="${d.id === selected}">
        <span class="card-dot" style="--tint:${tintOf(d.id)}"></span>
        <span><div class="card-name">${escapeHtml(d.name)}</div><div class="card-role">${escapeHtml(d.role || `Node ${d.id}`)}</div></span>
        <span class="chip" style="--c:${c}">${escapeHtml(chip)}</span>
        <div class="card-stats">
          <div class="stat"><div class="stat-k">Posture</div><div class="stat-v">${d.posture === 'lying' ? `Lying ${d.lyingFor}s` : 'Upright'}</div></div>
          <div class="stat"><div class="stat-k">Temp</div><div class="stat-v">${d.temp ?? '–'}${d.temp ? ' °C' : ''}</div></div>
          <div class="stat"><div class="stat-k">Fix</div><div class="stat-v">${d.accuracy ? `±${d.accuracy.toFixed(1)} m` : '–'} · ${d.anchorsUsed}/3</div></div>
          <div class="stat"><div class="stat-k">Link</div><div class="stat-v" data-weak="${d.link !== null && d.link < 0.8}">${d.link === null ? '–' : `${Math.round(d.link * 100)}%`}</div></div>
        </div>
        <div class="card-where">${escapeHtml(where)}</div>
      </button>`;
    }).join('') : `<div class="empty">No one is being tracked yet. People appear here as soon as their node reports in.</div>`;
    $('anchors').innerHTML = latest.anchors.map((a) =>
      `<div class="anchor" data-online="${a.online}"><span class="dot"></span>${a.id} ${a.online ? 'ok' : 'silent'}</div>`).join('');
  }
  const rank = (d) => (d.offline ? 0 : d.level === 'critical' ? 3 : d.level === 'warn' ? 2 : 1);

  $('people').addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    select(card.dataset.id);
    if (selected) setView('follow');
  });
  $('panelGrip').addEventListener('click', () => $('panel').classList.toggle('collapsed'));

  function renderAlert() {
    const worst = latest.people
      .filter((d) => !d.offline && d.alerts.length)
      .sort((a, b) => rank(b) - rank(a))[0];
    const banner = $('alertBanner');
    if (!worst) { banner.hidden = true; return; }
    const al = worst.alerts[0];
    banner.hidden = false;
    banner.dataset.level = al.level;
    $('alertTitle').textContent = `${al.text} — ${worst.name}`;
    const where = worst.x === null ? 'position unknown' : `near the ${zoneAt(worst.x, worst.z)} (${worst.x.toFixed(1)}, ${worst.z.toFixed(1)} m)`;
    const how = al.code === 'man-down' ? `Lying still for ${worst.lyingFor}s` : al.code === 'still' ? `No movement for ${worst.stillFor}s` : al.text;
    $('alertDetail').textContent = `${how}, ${where}`;
    $('alertLocate').onclick = () => { selected = worst.id; setView('follow'); renderPanel(); };
  }

  function renderLink(s) {
    const pill = $('linkPill');
    const fresh = s.link.lastMessage && Date.now() - s.link.lastMessage < 10000;
    let state, text;
    if (s.link.source === 'demo') { state = 'demo'; text = 'Demo data'; }
    else if (!s.link.connected) { state = 'down'; text = 'Broker offline'; }
    else if (fresh) { state = 'live'; text = 'Live'; }
    else { state = 'connecting'; text = 'Waiting for nodes'; }
    pill.dataset.state = state;
    $('linkText').textContent = text;
  }

  // ---- live data ----
  function onState(s) {
    latest = s;
    const now = performance.now();
    const seen = new Set();
    s.people.forEach((d) => {
      seen.add(d.id);
      let p = people.get(d.id);
      if (!p) {
        p = new Person(scene, d, people.size);
        p.onClick = (id) => { selected = id; setView('follow'); renderPanel(); };
        people.set(d.id, p);
      } else {
        p.update(d, now);
      }
      p.trail.visible = prefs.trails && p.placed;
    });
    for (const [id, p] of people) if (!seen.has(id)) { p.dispose(scene); people.delete(id); }
    s.anchors.forEach((a, i) => anchorViews[i]?.ledMat.color.setHex(a.online ? STATUS_COLORS.ok : STATUS_COLORS.offline));
    renderLink(s);
    renderPanel();
    renderAlert();
  }

  let es;
  function connect() {
    es = new EventSource(`${HUB}/events`);
    es.onmessage = (e) => onState(JSON.parse(e.data));
    es.onerror = () => {
      $('linkPill').dataset.state = 'down';
      $('linkText').textContent = 'Hub offline';
    };
  }
  connect();

  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString([], { hour12: false }); }, 1000);

  // ---- frame loop ----
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const now = performance.now();

    for (const p of people.values()) p.tick(dt, now);
    room.screens.forEach((t) => t.update(now));

    // ranges overlay for the selected (or only) person
    const focus = people.get(selected) || (people.size === 1 ? [...people.values()][0] : null);
    anchorViews.forEach((av, i) => {
      const r = focus?.data.ranges?.[i] || 0;
      const dh = av.anchor.y - config.tagHeight;
      const h = r > 0 ? Math.sqrt(Math.max(r * r - dh * dh, 0.0025)) : 0;
      av.circle.visible = prefs.ranges && h > 0;
      if (h > 0) av.circle.scale.setScalar(h);
    });

    // camera
    if (fly) {
      const k = Math.min((now - fly.start) / fly.ms, 1);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (k >= 1) fly = null;
    } else if (view === 'follow' && people.get(selected)) {
      const p = people.get(selected);
      tmp.set(p.root.position.x, 0.9, p.root.position.z);
      const back = new THREE.Vector3(-Math.sin(p.heading) * 2.4, 1.6, -Math.cos(p.heading) * 2.4);
      camera.position.lerp(tmp.clone().add(back), 1 - Math.exp(-dt * 2.5));
      controls.target.lerp(tmp, 1 - Math.exp(-dt * 5));
    }
    controls.update();

    // dollhouse cutaway: hide shell pieces between the camera and the room
    for (const s of room.shells) {
      s.group.visible = tmp.copy(camera.position).sub(s.p).dot(s.n) < 0.05;
    }

    if (prefs.hq) composer.render(dt);
    else renderer.render(scene, camera);
    labels.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();

  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    labels.setSize(innerWidth, innerHeight);
  });

  $('loader').classList.add('done');
}

main().catch((e) => {
  console.error(e);
  $('loader').innerHTML = `<div>Could not start the twin: ${escapeHtml(e.message)}</div>`;
});
