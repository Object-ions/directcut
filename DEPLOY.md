# Deploying Directcut

Directcut is a single Node process (port 3456) that serves the API, the built SPA,
and `/media/*`. Deploying it anywhere comes down to three steps:

1. Run the server under a process manager (pm2, systemd, Docker).
2. Put a TLS-terminating reverse proxy in front of it (Traefik, Nginx, Caddy).
3. Set `PUBLIC_BASE_URL` in `server/.env` to your public origin.

For a local run, none of that is needed — see the README quickstart.

## 1. Run the server

### pm2 (what `deploy.sh` assumes)

```bash
npm install -g pm2
git clone https://github.com/Object-ions/directcut.git && cd directcut
cd server && npm ci --omit=dev && cp .env.example .env  # set PUBLIC_BASE_URL
cd ../web && npm ci && npm run build                    # build the SPA the API serves
cd .. && pm2 start ecosystem.config.cjs                 # name: directcut
pm2 save
pm2 startup   # run the printed command for boot persistence
pm2 logs directcut --lines 20   # shows the one-time setup code
```

Then open your domain in a browser (after step 2) and finish the setup screen:
password, OpenRouter key, and the **setup code** from the log. (Or skip the
browser setup by putting `APP_SECRET` and `OPENROUTER_API_KEY` in `server/.env`.)

Re-deploying after code changes: `./deploy.sh` (pulls, installs, rebuilds the
SPA, restarts, health-checks).

Useful: `pm2 status` · `pm2 logs directcut` · `pm2 restart directcut` (after `.env` edits).

### systemd (alternative)

```ini
[Unit]
Description=directcut
After=network.target

[Service]
WorkingDirectory=/opt/directcut/server
ExecStart=/usr/bin/node index.js
Restart=always
User=directcut

[Install]
WantedBy=multi-user.target
```

## 2. Reverse proxy + TLS

Point your proxy at `127.0.0.1:3456` and terminate TLS in front of it. The
server listens on 127.0.0.1 by default, which is exactly right when the proxy
runs on the same host. Only set `HOST=0.0.0.0` if the proxy lives elsewhere
(e.g. a Docker bridge), and then keep port 3456 firewalled so only the proxy
can reach it. The server trusts one proxy hop's `X-Forwarded-For`, so never
expose port 3456 directly to the internet. Allow request bodies of at least 25 MB (uploads are capped at 20 MB).

### Nginx + certbot

```nginx
server {
    listen 80;
    server_name directcut.example.com;
    client_max_body_size 25m;
    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

then `certbot --nginx -d directcut.example.com`.

### Caddy

```
directcut.example.com {
    reverse_proxy 127.0.0.1:3456
}
```

### Traefik (worked example: host-networked Traefik in Docker)

If your edge is a Dockerized Traefik that discovers routes via container
labels, an additive socat sidecar registers the route without touching any
shared config:

```yaml
# docker-compose.yml for a tiny "directcut-proxy" project
services:
  directcut-proxy:
    image: alpine/socat
    restart: unless-stopped
    command: tcp-listen:3456,fork,reuseaddr tcp-connect:host.docker.internal:3456
    extra_hosts:
      - host.docker.internal:host-gateway
    labels:
      - traefik.enable=true
      - traefik.http.routers.directcut.rule=Host(`directcut.example.com`)
      - traefik.http.routers.directcut.entrypoints=websecure
      - traefik.http.routers.directcut.tls=true
      - traefik.http.routers.directcut.tls.certresolver=letsencrypt
      - traefik.http.services.directcut.loadbalancer.server.port=3456
```

With this setup the server must listen beyond loopback (`HOST=0.0.0.0`) so
the sidecar can reach it; firewall port 3456 from the outside.

Traefik picks the container up within seconds and issues the certificate on
its own (HTTP-01). Traefik has no default body-size limit, so uploads pass
without extra config. If your firewall filters Docker bridge traffic, you may
need to allow the sidecar's bridge interface to reach port 3456 — note the
bridge name changes if the compose project is recreated.

Alternatively use Traefik's file provider with a static route to
`http://127.0.0.1:3456`.

## 3. Environment

All settings live in `server/.env` (see `server/.env.example` for the full
annotated list). The deployment-relevant ones:

```
PUBLIC_BASE_URL=https://directcut.example.com   # used to build webhook + media URLs
ALLOWED_ORIGINS=http://localhost:5173         # add your static-host origin if the SPA lives elsewhere
```

`PUBLIC_BASE_URL` matters: OpenRouter's completion callback, reference-file
URLs and every returned media URL are built from it. Without a publicly
reachable value, reference uploads can't be fetched by OpenRouter and the
callback never arrives (the 60s fallback poller handles completion instead).
Set `WEBHOOK_SECRET` to enable the callback.

## 4. Optional: separate static host for the SPA

The API serves `web/dist` itself, so a separate frontend host is optional. To
mirror the SPA on Netlify or similar: `netlify.toml` is set up (base `web`,
publish `dist`, SPA redirect); set `VITE_API_BASE=https://directcut.example.com`
in the host's build environment and add the host's origin to `ALLOWED_ORIGINS`
in `server/.env`.

## 5. Backups

`tools/directcut-backup.sh` makes a WAL-safe SQLite copy (including your
stored settings) plus media and `.env` into a dated tarball and keeps the
newest 14. Treat the backups as secrets: they contain your OpenRouter key.
Point `DIRECTCUT_DIR` and `BACKUP_DIR` at your paths and schedule it (cron or
a systemd timer):

```
45 9 * * * DIRECTCUT_DIR=/opt/directcut/server BACKUP_DIR=/var/backups/directcut /opt/directcut/tools/directcut-backup.sh
```

## 6. Verification

```bash
curl -s https://directcut.example.com/health                 # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' https://directcut.example.com/api/generations   # 401 (403 before setup)
# after a completed generation:
curl -sI https://directcut.example.com/media/<uuid>.mp4 | head -3   # 200, video/mp4
```
