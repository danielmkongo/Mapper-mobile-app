// Mapper hub
//
//   nodes --LoRa--> gateway --MQTT /mapper/data--> [ this hub ] --SSE--> digital twin / app
//                                                        \--MQTT /mapper/pos--> anything else (Unity...)
//
// Browsers cannot speak plain MQTT (TCP 1883), and every screen should agree on where a
// person is - so positioning happens once, here, and the result is streamed out.
//
//   node server.js            live data from the broker in config/room.json
//   node server.js --demo     simulated people (no hardware needed)
//   PORT=8080 node server.js  change the web port (default 8080)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';
import { Tracker } from './src/tracker.js';
import { startDemo } from './src/demo.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(ROOT, 'config', 'room.json');
const PORT = Number(process.env.PORT || 8080);
const DEMO = process.argv.includes('--demo');

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const tracker = new Tracker(config);

// ---------------------------------------------------------------------------
// Input: MQTT (or the simulator)
// ---------------------------------------------------------------------------
const link = { source: DEMO ? 'demo' : 'mqtt', connected: DEMO, lastMessage: 0, broker: config.mqtt.url };
let mqttClient = null;

function ingest(text) {
  link.lastMessage = Date.now();
  // Gateways have historically forwarded the LoRa framing (~...^) and sometimes glued
  // two packets together - accept every {...} object in the payload.
  const objects = text.match(/\{[^{}]*\}/g) || [];
  for (const raw of objects) {
    try {
      const person = tracker.ingest(JSON.parse(raw), Date.now());
      if (person && mqttClient?.connected && config.mqtt.publishTopic) {
        mqttClient.publish(config.mqtt.publishTopic, JSON.stringify(tracker.publicPerson(person)));
      }
    } catch (e) {
      console.warn('bad packet:', raw, e.message);
    }
  }
  broadcast();
}

if (DEMO) {
  console.log('demo mode: simulating people');
  startDemo(config, ingest);
} else {
  mqttClient = mqtt.connect(config.mqtt.url, {
    clientId: `mapper-hub-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 3000,
    connectTimeout: 8000,
  });
  mqttClient.on('connect', () => {
    link.connected = true;
    console.log(`mqtt connected ${config.mqtt.url}, subscribing ${config.mqtt.topic}`);
    mqttClient.subscribe(config.mqtt.topic);
    broadcast();
  });
  mqttClient.on('close', () => {
    if (link.connected) console.log('mqtt disconnected');
    link.connected = false;
    broadcast();
  });
  mqttClient.on('error', (e) => console.warn('mqtt error:', e.message));
  mqttClient.on('message', (_topic, buf) => ingest(buf.toString('utf8')));
}

// ---------------------------------------------------------------------------
// Output: Server-Sent Events
// ---------------------------------------------------------------------------
const clients = new Set();

function snapshot() {
  return { type: 'state', t: Date.now(), link, ...tracker.snapshot(Date.now()) };
}

function broadcast() {
  const msg = `data: ${JSON.stringify(snapshot())}\n\n`;
  for (const res of clients) res.write(msg);
}

// Alerts and "offline" are time-based, so re-evaluate even when nothing arrives.
setInterval(broadcast, 1000);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

const STATIC_ROOTS = [
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
  ['/', path.join(ROOT, 'public')],
];

function serveStatic(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  for (const [prefix, dir] of STATIC_ROOTS) {
    if (!url.startsWith(prefix)) continue;
    let file = path.join(dir, url.slice(prefix.length));
    if (!file.startsWith(dir)) break; // no ../ escapes
    if (url.endsWith('/')) file = path.join(file, 'index.html');
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': prefix === '/vendor/three/' ? 'max-age=86400' : 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
      return;
    }
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (url === '/api/config') {
    res.writeHead(200, { 'Content-Type': TYPES['.json'], 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(tracker.publicConfig()));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Mapper hub on http://localhost:${PORT}  (${DEMO ? 'demo' : config.mqtt.url})`);
});
