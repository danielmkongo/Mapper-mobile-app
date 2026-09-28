// Simulated nodes. Produces exactly what safe_node sends (noisy slant distances to the
// anchors, posture, motion), and feeds it through the same pipeline as live MQTT - so
// demo mode also exercises the real positioning code.

const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

// Walkways that keep clear of the furniture (see room.js): along the window bench, down
// the monitor bench, past the orange panels and back up the doorway side.
const LOOP = [
  [1.4, 1.1], [2.3, 0.98], [3.1, 1.02], [3.1, 2.3], [3.0, 3.42],
  [2.1, 3.45], [1.0, 3.4], [0.7, 2.5], [0.8, 1.7],
];

function makeWalker({ id, path, speed, pauses, fallAt }) {
  let seg = 0, t = 0, x = path[0][0], z = path[0][1];
  let pauseLeft = 0, fallLeft = 0, elapsed = 0;
  return {
    id,
    step(dt) {
      elapsed += dt;
      if (fallAt && elapsed % fallAt.every > fallAt.every - fallAt.duration && fallLeft <= 0) {
        fallLeft = fallAt.duration;
      }
      if (fallLeft > 0) {
        fallLeft -= dt;
        return { x, z, lying: true, moving: false };
      }
      if (pauseLeft > 0) {
        pauseLeft -= dt;
        return { x, z, lying: false, moving: false };
      }
      let [ax, az] = path[seg];
      let [bx, bz] = path[(seg + 1) % path.length];
      t += (speed * dt) / Math.hypot(bx - ax, bz - az);
      if (t >= 1) {
        // carry the leftover distance onto the next leg (no teleport back to its start)
        const over = (t - 1) * Math.hypot(bx - ax, bz - az);
        seg = (seg + 1) % path.length;
        [ax, az] = path[seg];
        [bx, bz] = path[(seg + 1) % path.length];
        t = over / Math.hypot(bx - ax, bz - az);
        if (pauses.includes(seg)) pauseLeft = 3 + Math.random() * 4;
      }
      x = ax + (bx - ax) * t;
      z = az + (bz - az) * t;
      return { x, z, lying: false, moving: true };
    },
  };
}

export function startDemo(config, ingest) {
  const walkers = [
    makeWalker({ id: 5, path: LOOP, speed: 0.75, pauses: [2, 5], fallAt: { every: 75, duration: 16 } }),
    // working at the window bench monitor, shifting between it and the laptop
    makeWalker({
      id: 7,
      path: [[0.85, 0.82], [1.55, 0.82]],
      speed: 0.3,
      pauses: [0, 1],
    }),
  ];
  // Give the demo people names if the config does not.
  config.people = { '5': { name: 'Daniel', role: 'Engineer' }, '7': { name: 'Amina', role: 'Technician' }, ...config.people };

  const TICK = 1000; // same cadence as the real node
  setInterval(() => {
    for (const w of walkers) {
      const s = w.step(TICK / 1000);
      const tagY = s.lying ? 0.25 : config.tagHeight;
      const U = config.anchors.map((a) => {
        if (Math.random() < 0.04) return 0; // occasional missed range, like the real link
        const d = Math.hypot(a.x - s.x, a.y - tagY, a.z - s.z);
        return +(d + gauss() * 0.05).toFixed(2);
      });
      ingest(JSON.stringify({
        I: w.id,
        T: 26 + Math.round(Math.random()),
        P: 1011,
        G: s.lying ? 0 : 1,
        M: s.moving ? 1 : 0,
        U,
      }));
    }
  }, TICK);
}
