#!/usr/bin/env bash
# Runs ON THE SERVER (as root), started by deploy.sh. Safe to re-run: it updates the
# app in place and keeps the server's config/room.json (anchor positions measured on site).
# The hub serves the twin itself on PORT - no nginx or other web server involved.
set -euo pipefail

APP=/opt/mapper-hub
NEW=/opt/mapper-hub.new
PORT=${PORT:-7000}

say() { printf '\n== %s\n' "$*"; }

# ---- Node.js ---------------------------------------------------------------
need_node=1
if command -v node >/dev/null; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$major" -ge 18 ] && need_node=0
fi
if [ "$need_node" -eq 1 ]; then
  say "Installing Node.js 20"
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi
say "Node $(node -v)"

# ---- app files -------------------------------------------------------------
say "Installing the hub in $APP"
id mapper >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin mapper
# Keep the live room config if one is already there (anchor positions measured on site).
if [ -f "$APP/config/room.json" ]; then
  cp "$APP/config/room.json" "$NEW/config/room.json"
  echo "kept existing config/room.json"
fi
rm -rf "$APP.old"
[ -d "$APP" ] && mv "$APP" "$APP.old"
mv "$NEW" "$APP"
cd "$APP"
npm ci --omit=dev --no-audit --no-fund
chown -R mapper:mapper "$APP"

# ---- service ---------------------------------------------------------------
say "Service"
cat >/etc/systemd/system/mapper-hub.service <<EOF
[Unit]
Description=Mapper hub (indoor tracking positions + digital twin)
After=network-online.target
Wants=network-online.target

[Service]
User=mapper
WorkingDirectory=$APP
Environment=PORT=$PORT
Environment=HOST=0.0.0.0
ExecStart=$(command -v node) server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now mapper-hub
systemctl restart mapper-hub
sleep 2
systemctl --no-pager --lines=5 status mapper-hub || true
curl -fsS "http://127.0.0.1:$PORT/api/config" >/dev/null && echo "hub answering on 127.0.0.1:$PORT"

# ---- firewall ---------------------------------------------------------------
say "Firewall"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow "$PORT/tcp" >/dev/null && echo "ufw: opened $PORT/tcp"
else
  echo "ufw not active - nothing to open on the server itself"
fi

IP=$(curl -fsS -m 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
say "Done: open http://$IP:$PORT/"
echo "If it does not load from outside, open TCP $PORT in your hosting provider's firewall too."
