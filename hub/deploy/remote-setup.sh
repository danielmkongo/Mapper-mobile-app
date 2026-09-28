#!/usr/bin/env bash
# Runs ON THE SERVER (as root), started by deploy.sh. Safe to re-run: every step checks
# before it changes anything, and nginx is only reloaded if its config test passes.
set -euo pipefail

APP=/opt/mapper-hub
NEW=/opt/mapper-hub.new
PORT=8080

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
Environment=HOST=127.0.0.1
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

# ---- nginx -----------------------------------------------------------------
say "nginx"
SNIPPET=/etc/nginx/snippets/mapper-hub.conf
mkdir -p /etc/nginx/snippets
cat >"$SNIPPET" <<EOF
# Mapper hub - added by mapper-hub/deploy/remote-setup.sh
location = /mapper { return 301 /mapper/; }
location /mapper/ {
    proxy_pass http://127.0.0.1:$PORT/;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header Connection '';
    proxy_buffering off;        # the live event stream must not be buffered
    proxy_cache off;
    proxy_read_timeout 1h;
}
EOF

# Include the snippet in every enabled server block that listens on port 80, once.
# Backups go OUTSIDE sites-enabled: nginx loads every file in there, backups included.
BACKUP=/etc/nginx/mapper-backup
mkdir -p "$BACKUP"
changed=0
for f in /etc/nginx/sites-enabled/*; do
  [ -f "$f" ] || continue
  grep -q 'snippets/mapper-hub.conf' "$f" && continue
  grep -Eq 'listen[^;]*\b80\b' "$f" || continue
  b="$BACKUP/$(basename "$f")"
  cp -L "$f" "$b"
  # insert after the first "listen ... 80" line (inside that server block)
  awk '{print} /listen[^;]*[^0-9]80[^0-9]/ && !done {print "    include snippets/mapper-hub.conf;"; done=1}' "$b" >"$f.tmp-mapper"
  cat "$f.tmp-mapper" >"$f"   # write through a symlink to sites-available, keep the link
  rm -f "$f.tmp-mapper"
  echo "added include to $f (backup: $b)"
  changed=1
done

if nginx -t; then
  systemctl reload nginx
  echo "nginx reloaded"
else
  echo "nginx config test FAILED - restoring the previous config"
  for b in "$BACKUP"/*; do [ -f "$b" ] && cat "$b" >"/etc/nginx/sites-enabled/$(basename "$b")"; done
  nginx -t && systemctl reload nginx
  exit 1
fi
if ! grep -rqs 'snippets/mapper-hub.conf' /etc/nginx/; then
  echo "Could not find a port-80 server block in /etc/nginx/sites-enabled to add /mapper/ to."
  echo "Add this line inside your port-80 server { } block, then run: nginx -t && systemctl reload nginx"
  echo "    include snippets/mapper-hub.conf;"
fi

IP=$(hostname -I | awk '{print $1}')
say "Done: open http://$IP/mapper/"
