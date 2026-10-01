#!/usr/bin/env bash
# Directcut — pull latest and restart the API under pm2.
# Full first-time setup (pm2 install, Traefik route) is documented in DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")"

git pull --ff-only
cd server
npm ci --omit=dev
cd ../web
npm ci
npm run build   # the API serves web/dist — without this the UI goes stale
cd ..

if pm2 describe directcut > /dev/null 2>&1; then
  pm2 restart directcut --update-env
else
  pm2 start ecosystem.config.cjs
  pm2 save
fi

sleep 1
curl -sf http://127.0.0.1:3456/health > /dev/null && echo "directcut healthy" || {
  echo "health check FAILED — see: pm2 logs directcut"
  exit 1
}
