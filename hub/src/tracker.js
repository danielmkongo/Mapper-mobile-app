// Positioning and status for every tracked person.
//
// Packet from a node (see safe_node): {"I":5,"T":27,"P":1012,"G":1,"M":0,"U":[dA,dB,dC]}
//   I id, T temperature C, P pressure hPa, G posture (1 standing, 0 lying), M moving,
//   U slant distances to anchors A/B/C in metres (0 = no fresh reading).

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class Tracker {
  constructor(config) {
    this.config = config;
    this.people = new Map();
    // Anchor health: when each anchor last contributed a distance.
    this.anchorSeen = config.anchors.map(() => 0);
  }

  publicConfig() {
    const { name, size, anchors, tagHeight, tagHeightLying, people, alerts } = this.config;
    return { name, size, anchors, tagHeight, tagHeightLying, people, alerts };
  }

  // -------------------------------------------------------------------------
  ingest(pkt, now) {
    if (typeof pkt.I !== 'number') return null;
    const id = String(pkt.I);
    let p = this.people.get(id);
    if (!p) {
      const meta = this.config.people?.[id] || {};
      p = {
        id,
        name: meta.name || `Person ${id}`,
        role: meta.role || '',
        x: null, z: null, vx: 0, vz: 0,
        accuracy: null,
        posture: 'standing', moving: false,
        temp: null, pressure: null,
        ranges: [0, 0, 0],
        lastSeen: 0, lastFix: 0,
        lyingSince: 0, stillSince: now,
        trail: [],
      };
      this.people.set(id, p);
    }

    const dt = p.lastSeen ? clamp((now - p.lastSeen) / 1000, 0.05, 5) : 1;
    p.lastSeen = now;

    const standing = pkt.G !== 0;
    if (!standing && p.posture !== 'lying') p.lyingSince = now;
    p.posture = standing ? 'standing' : 'lying';

    const moving = pkt.M === 1;
    if (moving || !p.moving) {
      if (moving) p.stillSince = now;
    }
    p.moving = moving;
    if (typeof pkt.T === 'number' && pkt.T !== 0) p.temp = pkt.T;
    if (typeof pkt.P === 'number' && pkt.P !== 0) p.pressure = pkt.P;

    const U = Array.isArray(pkt.U) ? pkt.U : [];
    p.ranges = this.config.anchors.map((_, i) => (Number(U[i]) > 0 ? Number(U[i]) : 0));
    p.ranges.forEach((r, i) => { if (r > 0) this.anchorSeen[i] = now; });

    this.track(p, dt, now);
    return p;
  }

  // -------------------------------------------------------------------------
  // Least-squares trilateration (Gauss-Newton) on the floor plane. Starts and re-acquires
  // the tracking filter; routine updates go through track().
  solve(ranges, prior, lying = false) {
    const { size } = this.config;
    const obs = this.observations(ranges, lying);
    if (obs.length < 2) return null;

    let x = prior ? prior.x : obs.reduce((s, o) => s + o.x, 0) / obs.length;
    let z = prior ? prior.z : obs.reduce((s, o) => s + o.z, 0) / obs.length;
    if (!prior) { x += 0.3; z += 0.3; } // start off the anchors' centroid line

    for (let iter = 0; iter < 20; iter++) {
      let jtj00 = 0, jtj01 = 0, jtj11 = 0, jtr0 = 0, jtr1 = 0;
      for (const o of obs) {
        const dx = x - o.x, dz = z - o.z;
        const dist = Math.max(Math.hypot(dx, dz), 1e-4);
        const r = dist - o.h;
        const jx = dx / dist, jz = dz / dist;
        jtj00 += jx * jx; jtj01 += jx * jz; jtj11 += jz * jz;
        jtr0 += jx * r; jtr1 += jz * r;
      }
      // Levenberg damping keeps the 2-anchor (rank-deficient) case stable.
      const lam = 1e-3;
      const a00 = jtj00 + lam, a11 = jtj11 + lam, det = a00 * a11 - jtj01 * jtj01;
      if (Math.abs(det) < 1e-9) break;
      const sx = (a11 * jtr0 - jtj01 * jtr1) / det;
      const sz = (a00 * jtr1 - jtj01 * jtr0) / det;
      x -= sx; z -= sz;
      if (Math.hypot(sx, sz) < 1e-4) break;
    }

    let rss = 0;
    for (const o of obs) rss += (Math.hypot(x - o.x, z - o.z) - o.h) ** 2;
    const rms = Math.sqrt(rss / obs.length);

    const m = 0.15; // keep the marker inside the walls
    return {
      x: clamp(x, m, size.x - m),
      z: clamp(z, m, size.z - m),
      // Two anchors cannot tell a good fix from a lucky one: report it as coarse.
      accuracy: obs.length >= 3 ? clamp(0.1 + rms, 0.1, 2) : 0.8,
      anchors: obs.length,
    };
  }

  // Horizontal range to each anchor that reported. UWB measures the slant distance from a
  // ceiling-height anchor to a chest-height tag; projecting it onto the floor plane first
  // keeps positions from being pulled toward the anchors.
  // Tag height follows posture: chest height standing, near the floor lying down. Getting
  // this wrong costs metres exactly when it matters most - someone who has collapsed.
  observations(ranges, lying = false) {
    const { anchors } = this.config;
    const tagHeight = lying ? this.config.tagHeightLying ?? 0.25 : this.config.tagHeight;
    const obs = [];
    anchors.forEach((a, i) => {
      const d = ranges[i];
      if (!(d > 0)) return;
      const dh = a.y - tagHeight;
      obs.push({ i, x: a.x, z: a.z, h: Math.sqrt(Math.max(d * d - dh * dh, 0.0025)) });
    });
    return obs;
  }

  // Constant-velocity Kalman filter over least-squares fixes. State [x, z, vx, vz].
  //
  // With all three anchors, trilaterate and feed the fix in, trusted according to how well
  // its ranges agree (a reflected, non-line-of-sight range shows up as a poor fit and gets
  // down-weighted). With fewer, do not guess: two circles cross at two mirror points and A/B
  // share the window wall, so a 2-anchor "fix" can be metres off. Coast on the motion model
  // for that second instead. The node's IMU flag pins velocity to zero when the wearer is
  // still, which removes the slow drift UWB jitter causes on a standing person.
  track(p, dt, now) {
    const { size } = this.config;
    const lying = p.posture === 'lying';
    const obs = this.observations(p.ranges, lying);
    const Q_ACC = 1.5; // process noise, (m/s^2)^2 - people stop and turn

    if (!p.kf) {
      if (obs.length < 3) return; // wait for an unambiguous first fix
      const f = this.solve(p.ranges, null, lying);
      p.kf = { s: [f.x, f.z, 0, 0], P: diag([0.05, 0.05, 1, 1]) };
    }
    const kf = p.kf;

    // ---- predict ----
    const [x, z, vx, vz] = kf.s;
    kf.s = [x + vx * dt, z + vz * dt, vx, vz];
    const F = [[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]];
    const dt2 = dt * dt, dt3 = dt2 * dt, dt4 = dt3 * dt;
    const Q = [
      [dt4 / 4, 0, dt3 / 2, 0], [0, dt4 / 4, 0, dt3 / 2],
      [dt3 / 2, 0, dt2, 0], [0, dt3 / 2, 0, dt2],
    ].map((r) => r.map((v) => v * Q_ACC));
    kf.P = add(mul(mul(F, kf.P), transpose(F)), Q);
    if (!p.moving) { // zero-velocity update
      kf.s[2] = kf.s[3] = 0;
      for (let k = 0; k < 4; k++) { kf.P[2][k] = kf.P[k][2] = 0; kf.P[3][k] = kf.P[k][3] = 0; }
      kf.P[2][2] = kf.P[3][3] = 0.01;
    }

    // ---- update ----
    let used = 0, fitErr = 0;
    let soft = obs.length === 2 ? obs : null;
    let f = obs.length >= 3 ? this.solve(p.ranges, { x: kf.s[0], z: kf.s[1] }, lying) : null;
    if (f) {
      // A reflected (non-line-of-sight) range is always too long. With only one spare range
      // the least-squares fit often absorbs it into a wrong-but-consistent position, so judge
      // each range against the prediction too: one range far too long while the other two
      // agree, or a fit that simply does not close, means drop the longest and use the rest.
      const excess = obs.map((o) => o.h - Math.hypot(kf.s[0] - o.x, kf.s[1] - o.z));
      const worst = excess.indexOf(Math.max(...excess));
      const othersAgree = excess.every((e, k) => k === worst || Math.abs(e) < 0.3);
      const oneTooLong = excess[worst] > 0.5 && othersAgree;
      if (oneTooLong || f.accuracy - 0.1 > 0.25) {
        soft = obs.filter((_, k) => k !== worst);
        f = null;
      }
    }
    if (f) {
      const rms = f.accuracy - 0.1; // solve() reports 0.1 + rms of the range residuals
      const sigma = 0.07 + 1.5 * rms;
      const R = sigma * sigma;
      const y = [f.x - kf.s[0], f.z - kf.s[1]];

      // Lost track (e.g. carried out and back in): two clean fixes in a row far from the
      // filter mean the filter is wrong, not the fixes. Re-acquire.
      const far = Math.hypot(y[0], y[1]) > 1.5 && rms < 0.2;
      p.disagree = far ? (p.disagree || 0) + 1 : 0;
      if (p.disagree >= 2) {
        p.kf = { s: [f.x, f.z, 0, 0], P: diag([0.05, 0.05, 1, 1]) };
        p.disagree = 0;
      } else {
        // H = [I 0]: S = P_pos + R, K = P[:, pos] S^-1  (2x2 inverse by hand)
        const P = kf.P;
        const s00 = P[0][0] + R, s01 = P[0][1], s10 = P[1][0], s11 = P[1][1] + R;
        const det = s00 * s11 - s01 * s10;
        const i00 = s11 / det, i01 = -s01 / det, i10 = -s10 / det, i11 = s00 / det;
        const K = P.map((row) => [row[0] * i00 + row[1] * i10, row[0] * i01 + row[1] * i11]);
        kf.s = kf.s.map((v, k) => v + K[k][0] * y[0] + K[k][1] * y[1]);
        kf.P = P.map((row, r) => row.map((v, c) => v - (K[r][0] * P[0][c] + K[r][1] * P[1][c])));
      }
      used = obs.length;
      fitErr = rms;
    } else if (soft) {
      // Two ranges: feed each one in as a range (extended Kalman update), softly weighted.
      // This pulls the estimate along the directions two anchors do constrain without ever
      // choosing between their two mirror-image intersections.
      for (const o of soft) {
        const ex = kf.s[0] - o.x, ez = kf.s[1] - o.z;
        const dist = Math.max(Math.hypot(ex, ez), 0.05);
        const y = o.h - dist;
        const H = [ex / dist, ez / dist];
        const PH = kf.P.map((row) => row[0] * H[0] + row[1] * H[1]);
        const inflate = Math.abs(y) > 0.3 ? (y / 0.3) ** 2 : 1; // robust: outliers pull less
        const S = H[0] * PH[0] + H[1] * PH[1] + 0.12 * 0.12 * inflate;
        const K = PH.map((v) => v / S);
        kf.s = kf.s.map((v, k) => v + K[k] * y);
        kf.P = kf.P.map((row, r) => row.map((v, c) => v - K[r] * PH[c]));
      }
      used = 2;
    }

    // Keep the estimate inside the walls. Hitting a wall almost always means the filter took
    // the mirror solution of two anchors on a common wall (A and B both sit on the window
    // wall), so stop pushing into it and loosen the position so the next 3-anchor reading
    // pulls it straight back.
    const m = 0.15;
    const lim = [[m, size.x - m], [m, size.z - m]];
    for (const k of [0, 1]) {
      const v = p.kf.s[k];
      if (v < lim[k][0] || v > lim[k][1]) {
        p.kf.s[k] = clamp(v, lim[k][0], lim[k][1]);
        p.kf.s[k + 2] = 0;
        p.kf.P[k][k] = Math.max(p.kf.P[k][k], 0.5);
      }
    }
    p.kf.s[2] = clamp(p.kf.s[2], -2, 2);
    p.kf.s[3] = clamp(p.kf.s[3], -2, 2);
    [p.x, p.z, p.vx, p.vz] = p.kf.s;
    // ~95% radius from the position covariance, widened by how badly the ranges agreed
    const sd = Math.sqrt(Math.max(p.kf.P[0][0], p.kf.P[1][1]));
    p.accuracy = clamp(2 * sd + fitErr, 0.1, 3);
    p.anchorsUsed = used;
    p.lastFix = now;
    p.trail.push([+p.x.toFixed(2), +p.z.toFixed(2)]);
    if (p.trail.length > 40) p.trail.shift();
  }

  // -------------------------------------------------------------------------
  statusOf(p, now) {
    const a = this.config.alerts;
    const alerts = [];
    const offline = now - p.lastSeen > a.offlineSeconds * 1000;
    if (offline) alerts.push({ level: 'warn', code: 'offline', text: 'Signal lost' });
    if (!offline && p.posture === 'lying' && now - p.lyingSince > a.manDownSeconds * 1000)
      alerts.push({ level: 'critical', code: 'man-down', text: 'Man down' });
    if (!offline && !p.moving && now - p.stillSince > a.stillSeconds * 1000)
      alerts.push({ level: 'warn', code: 'still', text: 'No movement' });
    if (p.temp !== null && p.temp >= a.highTempC)
      alerts.push({ level: 'critical', code: 'heat', text: `High temperature ${p.temp}°C` });
    const level = alerts.some((x) => x.level === 'critical') ? 'critical' : alerts.length ? 'warn' : 'ok';
    return { offline, alerts, level };
  }

  publicPerson(p, now = Date.now()) {
    const s = this.statusOf(p, now);
    return {
      id: p.id, name: p.name, role: p.role,
      x: p.x === null ? null : +p.x.toFixed(3),
      z: p.z === null ? null : +p.z.toFixed(3),
      vx: +p.vx.toFixed(3), vz: +p.vz.toFixed(3),
      accuracy: p.accuracy === null ? null : +p.accuracy.toFixed(2),
      anchorsUsed: p.anchorsUsed || 0,
      posture: p.posture, moving: p.moving,
      temp: p.temp, pressure: p.pressure,
      ranges: p.ranges,
      lastSeen: p.lastSeen,
      lyingFor: p.posture === 'lying' ? Math.round((now - p.lyingSince) / 1000) : 0,
      stillFor: p.moving ? 0 : Math.round((now - p.stillSince) / 1000),
      trail: p.trail,
      ...s,
    };
  }

  snapshot(now) {
    return {
      people: [...this.people.values()].map((p) => this.publicPerson(p, now)),
      anchors: this.config.anchors.map((a, i) => ({
        id: a.id,
        online: now - this.anchorSeen[i] < 10000,
        lastSeen: this.anchorSeen[i],
      })),
    };
  }
}

// --- tiny dense-matrix helpers for the 4x4 filter ---
function diag(v) { return v.map((x, i) => v.map((_, j) => (i === j ? x : 0))); }
function transpose(A) { return A[0].map((_, j) => A.map((r) => r[j])); }
function mul(A, B) { return A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0))); }
function add(A, B) { return A.map((r, i) => r.map((v, j) => v + B[i][j])); }
