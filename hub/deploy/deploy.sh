#!/usr/bin/env bash
# Deploy the Mapper hub (digital twin + positioning) to a Linux server.
#
#   bash deploy/deploy.sh root@45.79.206.183          # serves on port 7000
#   bash deploy/deploy.sh root@45.79.206.183 8000     # or another port
#
# One SSH connection, so you type the password once. Uploads this folder (without
# node_modules) and runs deploy/remote-setup.sh on the server, which installs Node if
# needed and runs the hub as a systemd service at http://<server>:<port>/.
set -euo pipefail

TARGET="${1:?usage: bash deploy/deploy.sh user@host [port]}"
PORT="${2:-7000}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "Uploading $HERE to $TARGET:/opt/mapper-hub ..."
tar -C "$HERE" --exclude=node_modules --exclude=.git -czf - . |
  ssh -o ServerAliveInterval=15 "$TARGET" \
    'set -e; S=""; [ "$(id -u)" -eq 0 ] || S=sudo;
     $S mkdir -p /opt/mapper-hub.new && $S tar -xzf - -C /opt/mapper-hub.new &&
     $S env PORT='"$PORT"' bash /opt/mapper-hub.new/deploy/remote-setup.sh'
