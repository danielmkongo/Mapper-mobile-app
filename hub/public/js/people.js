// Tracked people in the twin: animated figure, status ring, accuracy disc, trail, label.
//
// The hub sends a filtered position about once a second. The figure is played back
// PLAYBACK_DELAY behind live, interpolating between real fixes: it walks exactly the path the
// tracker computed - around the table, not through it - at a steady pace, instead of
// chasing the newest fix in a straight line and cutting every corner.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const STATUS_COLORS = { ok: 0x3ddc97, warn: 0xffb020, critical: 0xff4d4f, offline: 0x7d8794 };
const PLAYBACK_DELAY = 1100; // ms, just over one report interval

const PERSON_TINTS = [0xff7a1a, 0x2fa8ff, 0xb66dff, 0x28d7b4, 0xffd23c, 0xff5fa2];

let template = null;
let clips = null;

export async function loadAvatar(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  template = gltf.scene;
  clips = gltf.animations;
  // Normalise to 1.75m tall, feet on the floor.
  const box = new THREE.Box3().setFromObject(template);
  const h = box.max.y - box.min.y;
  template.scale.setScalar(1.75 / h);
  template.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned bounds are stale; tiny cost for 1-10 people
    }
  });
}

export class Person {
  constructor(scene, data, index) {
    this.id = data.id;
    this.tint = PERSON_TINTS[index % PERSON_TINTS.length];
    this.root = new THREE.Group();
    this.pose = new THREE.Group(); // tilts to lie the figure down
    this.root.add(this.pose);
    scene.add(this.root);

    // figure
    this.model = SkeletonUtils.clone(template);
    this.materials = [];
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.transparent = true;
      if (/Joints/i.test(o.material.name)) o.material.color.setHex(this.tint);
      else o.material.color.setHex(0x3a3f47);
      o.material.roughness = 0.45;
      o.material.metalness = 0.15;
      this.materials.push(o.material);
    });
    this.pose.add(this.model);
    this.mixer = new THREE.AnimationMixer(this.model);
    const clip = (n) => THREE.AnimationClip.findByName(clips, n);
    this.idle = this.mixer.clipAction(clip('idle'));
    this.walk = this.mixer.clipAction(clip('walk'));
    this.idle.play();
    this.walk.play();
    this.walk.setEffectiveWeight(0);

    // floor status ring + accuracy disc
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.4, 64),
      new THREE.MeshBasicMaterial({ color: STATUS_COLORS.ok, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.012;
    this.root.add(this.ring);
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({ color: this.tint, transparent: true, opacity: 0.12, depthWrite: false }),
    );
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.01;
    this.root.add(this.disc);
    this.pulse = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.44, 64),
      new THREE.MeshBasicMaterial({ color: STATUS_COLORS.critical, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    this.pulse.rotation.x = -Math.PI / 2;
    this.pulse.position.y = 0.014;
    this.root.add(this.pulse);

    // trail (world space, so it lives on the scene not the root)
    this.trailGeo = new THREE.BufferGeometry();
    this.trail = new THREE.Line(this.trailGeo, new THREE.LineBasicMaterial({
      color: this.tint, transparent: true, opacity: 0.55, depthWrite: false,
    }));
    this.trail.renderOrder = 2;
    scene.add(this.trail);

    // label
    this.labelEl = document.createElement('div');
    this.labelEl.className = 'tag';
    this.label = new CSS2DObject(this.labelEl);
    this.label.position.set(0, 2.05, 0);
    this.root.add(this.label);
    this.labelEl.addEventListener('click', () => this.onClick?.(this.id));

    this.samples = []; // {t, x, z} fixes to play back
    this.speed = 0;
    this.heading = 0;
    this.lie = 0;
    this.placed = false;
    this.data = data;
    this.update(data, performance.now());
  }

  update(data, now) {
    this.data = data;
    this.receivedAt = now;
    if (data.x !== null) {
      const last = this.samples[this.samples.length - 1];
      if (!last || last.x !== data.x || last.z !== data.z || now - last.t > 900) {
        this.samples.push({ t: now, x: data.x, z: data.z });
        if (this.samples.length > 12) this.samples.shift();
      }
      if (!this.placed) {
        this.root.position.set(data.x, 0, data.z);
        this.placed = true;
      }
    }
    this.root.visible = this.placed;
    this.trail.visible = this.placed;

    const pts = (data.trail || []).map(([x, z]) => new THREE.Vector3(x, 0.015, z));
    this.trailGeo.setFromPoints(pts);

    const color = data.offline ? STATUS_COLORS.offline : STATUS_COLORS[data.level];
    this.ring.material.color.setHex(color);
    this.disc.scale.setScalar(Math.max(0.35, data.accuracy || 0.35));

    const status = data.offline ? 'Signal lost'
      : data.alerts.length ? data.alerts[0].text
      : data.posture === 'lying' ? 'Lying down'
      : data.moving ? 'Moving' : 'Standing';
    this.labelEl.dataset.level = data.offline ? 'offline' : data.level;
    this.labelEl.innerHTML =
      `<span class="tag-dot" style="--tint:#${this.tint.toString(16).padStart(6, '0')}"></span>` +
      `<span class="tag-name">${escapeHtml(data.name)}</span>` +
      `<span class="tag-status">${escapeHtml(status)}</span>`;
  }

  tick(dt, now) {
    const d = this.data;
    // Where the person was PLAYBACK_DELAY ago, interpolated between the two fixes around it.
    const rt = now - PLAYBACK_DELAY;
    const S = this.samples;
    let goalX = this.root.position.x, goalZ = this.root.position.z;
    if (S.length) {
      if (rt <= S[0].t) { goalX = S[0].x; goalZ = S[0].z; }
      else if (rt >= S[S.length - 1].t) { goalX = S[S.length - 1].x; goalZ = S[S.length - 1].z; }
      else {
        for (let i = 1; i < S.length; i++) {
          if (S[i].t >= rt) {
            const a = S[i - 1], b = S[i], k = (rt - a.t) / (b.t - a.t);
            goalX = a.x + (b.x - a.x) * k;
            goalZ = a.z + (b.z - a.z) * k;
            break;
          }
        }
      }
    }

    const p = this.root.position;
    const k = 1 - Math.exp(-dt * 12); // light smoothing only; the path itself is already smooth
    const nx = p.x + (goalX - p.x) * k;
    const nz = p.z + (goalZ - p.z) * k;
    const stepV = Math.hypot(nx - p.x, nz - p.z) / Math.max(dt, 1e-3);
    this.speed += (stepV - this.speed) * (1 - Math.exp(-dt * 6));
    if (stepV > 0.06 && this.lie < 0.1) {
      const want = Math.atan2(nx - p.x, nz - p.z);
      let diff = want - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * (1 - Math.exp(-dt * 7));
    }
    p.x = nx;
    p.z = nz;
    this.pose.rotation.y = this.heading;

    // lie down / stand up
    const lying = d.posture === 'lying' ? 1 : 0;
    this.lie += (lying - this.lie) * (1 - Math.exp(-dt * 3));
    this.pose.rotation.x = -this.lie * (Math.PI / 2);
    this.pose.position.y = this.lie * 0.16;

    // blend idle <-> walk by actual ground speed, and match stride to speed
    const w = THREE.MathUtils.clamp(this.speed / 0.45, 0, 1) * (1 - this.lie);
    this.walk.setEffectiveWeight(w);
    this.idle.setEffectiveWeight(1 - w);
    this.walk.timeScale = THREE.MathUtils.clamp(this.speed / 1.15, 0.55, 1.4);
    this.mixer.update(dt);

    // fade out a figure we have lost
    const alpha = d.offline ? 0.35 : 1;
    for (const m of this.materials) m.opacity += (alpha - m.opacity) * 0.1;

    // critical: expanding red pulse on the floor
    if (!d.offline && d.level === 'critical') {
      const ph = (now / 900) % 1;
      this.pulse.scale.setScalar(1 + ph * 2.2);
      this.pulse.material.opacity = 0.85 * (1 - ph);
    } else {
      this.pulse.material.opacity = 0;
    }
  }

  dispose(scene) {
    scene.remove(this.root);
    scene.remove(this.trail);
    this.labelEl.remove();
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
