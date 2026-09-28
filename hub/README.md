# Mapper hub

Live indoor tracking for the Mapper system: it turns the nodes' UWB distances into positions and shows them in a 3D digital twin of the room.

```
node (UWB tag) --LoRa--> gateway --MQTT /mapper/data--> hub --> browser / phone (twin + console)
                                                          \--> MQTT /mapper/pos (Unity, anything else)
```

## Run it

```bash
npm install
npm start          # live: subscribes to the broker in config/room.json
npm run demo       # simulated people, no hardware needed
npm test           # positioning accuracy benchmark
```

Open http://localhost:8080. On a phone on the same network, open `http://<pc-ip>:8080` and use "Add to Home screen". It installs as an app. Add `?hq=0` for weak devices or `?hq=1` to force full quality.

## Why a hub

- **Browsers can't connect to the broker directly.** It only speaks MQTT over TCP (port 1883), and browsers can only use WebSockets. The hub bridges the two and streams to browsers with Server-Sent Events.
- **Every screen should agree.** Positioning happens once, here, instead of separately in each client. It is also republished on `/mapper/pos` for Unity or anything else.

## Configure the room

All site setup is in [config/room.json](config/room.json):

| field | meaning |
|---|---|
| `size` | room in metres: `x` along the window wall, `z` into the room, `height` |
| `anchors` | A, B, C positions, measured from the floor in the window/orange-panel corner |
| `tagHeight` / `tagHeightLying` | where the node sits on the body standing / lying (m) |
| `people` | node id → name and role shown in the app |
| `alerts` | seconds before *man down*, *no movement*, *signal lost*; heat threshold |

**Measure the anchors.** The positions in the file are placeholders at the ceiling corners, and accuracy depends on them. Use a tape from the corner and record x, height and z for each.

## Positioning

Implemented in [src/tracker.js](src/tracker.js) and checked by [test/tracker.test.mjs](test/tracker.test.mjs). Measured on a simulated walk with 5 cm range noise:

| scenario | median | 95th pct |
|---|---|---|
| walking, 5% range dropouts | 6 cm | 16 cm |
| walking, 5% reflected ranges (+0.8–1.8 m) | 7 cm | 0.8 m |
| standing still | 5.5 cm | – |
| lying on the floor | 7.5 cm | – |

How it works:

- **Floor projection.** Each slant distance (anchor near the ceiling to a tag on the body) is projected onto the floor. The tag height follows posture, so it drops to the floor when a person lies down.
- **Three anchors.** Least-squares trilateration feeds a constant-velocity Kalman filter. Each fix is weighted by how well its three ranges agree.
- **Two anchors.** The ranges go in as soft extended-Kalman range updates. This avoids choosing between the two mirror-image intersections, since A and B share the window wall.
- **Reflected ranges.** A range much longer than predicted, or a fix that doesn't close, is dropped. The other ranges still count.
- **Motion from the IMU.** The node's motion flag pins velocity to zero while the person is still, which removes jitter drift.
- **Lost track.** Two clean fixes in a row far from the filter re-acquire the track.

## Alerts

| alert | level | trigger |
|---|---|---|
| Man down | critical | lying for `manDownSeconds` |
| High temperature | critical | ≥ `highTempC` |
| No movement | warn | IMU still for `stillSeconds` |
| Signal lost | warn | no report for `offlineSeconds` |

The console shows the most severe alert as a banner with the person's location, for example "near the meeting table (2.4, 3.3 m)", and a **Locate** button that flies the camera to them.

## The twin

`public/`: Three.js, no build step. [room.js](public/js/room.js) models the lab from site photos: window wall with the city at sunset, orange sapele panels, frosted partition and doorway, octagonal table, mesh chairs, the monitor bench, the ceiling.

All textures are generated in code in [textures.js](public/js/textures.js), so the app works fully offline apart from the web fonts. Rendering uses PBR materials, sun and bulb shadows, GTAO ambient occlusion and ACES tone mapping. Walls between the camera and the room hide automatically.

Views:

- **3D:** orbit around the room.
- **Plan:** top-down.
- **Follow:** tracks the selected person.

The avatar is `Xbot.glb` from the three.js examples (a Mixamo character). Figures play back about one second behind live, so they walk the tracked path instead of cutting corners.

## Deploying on the broker server

The server at 45.79.206.183 already runs nginx. Run the hub there (`PORT=8080 npm start`, under pm2 or systemd) and proxy it:

```nginx
location /mapper/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_buffering off;          # required for the live event stream
    proxy_read_timeout 1h;
}
```
