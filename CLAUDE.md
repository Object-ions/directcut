# Directcut: notes for AI coding assistants

Self-hosted AI video/image generation: a browser UI over OpenRouter's video models (Seedance, Kling, Veo, Wan, Hailuo) and image models (Seedream, Nano Banana, GPT Image, Flux). Single operator, bring-your-own OpenRouter key.

## Layout
- `server/`: Node.js + Express API (plain JS, ESM, no TypeScript). Port 3456, binds `HOST` (default 127.0.0.1). Serves the built SPA from `web/dist` and media from `server/media/`.
  - `models.js`: the model lineup (ids, what each accepts, conservative rates) and the live price check that can only raise rates. Add a model here.
  - `openrouter.js`: flat `RATES`/`MODELS` views of the lineup, OpenRouter HTTP calls (generation, polling, key check, chat for Enhance).
  - `validate.js`: `/api/generate` body validation → OpenRouter payload + cost estimate (pure, unit-tested).
  - `settings.js`: password (scrypt hash) and OpenRouter key stored in SQLite; env vars override; first-run setup code.
  - `media.js`: media downloads; makes local refs reachable (images inlined as data URLs). `tunnel.js`: temporary Cloudflare quick tunnel serving only active jobs' video/audio refs when `PUBLIC_BASE_URL` isn't https.
  - `db.js`: SQLite schema + prepared statements. `enhance.js`: prompt enhancer.
- `web/`: Vite + React SPA (plain JS + SCSS, no Tailwind). Screens: Setup (first run) → Login → App; Settings dialog.
- `examples/agent-skill/`: worked example of giving an AI agent access via the API.

## Auth & setup
- Until a password exists (`APP_SECRET` env or stored hash), every `/api/*` route except `/api/setup` returns 403 `setup_required`.
- `POST /api/setup` sets the password + OpenRouter key once. Requests not from loopback (or carrying `X-Forwarded-For`) must include the setup code printed at startup.
- Clients send the password in `X-App-Key`. `POST /api/webhook/openrouter` validates `WEBHOOK_SECRET` instead.
- `/media/*` is public-read with uuid filenames.

## Hard rules
- Secrets live in `server/.env` or the SQLite settings table only. Never in frontend code, never committed, never returned unmasked by the API.
- SQLite via better-sqlite3, no ORM. DB at `server/data/directcut.db` (`DATA_DIR` overrides; tests use a temp dir).
- Provider result URLs expire, so always download outputs to `server/media/` on completion.
- Enhancement (`/api/enhance`) and generation (`/api/generate`) are separate calls; enhance never auto-generates.
- `DAILY_SPEND_CAP` (default $10) is enforced server-side, in one transaction with the insert. `RATES` must stay at or above real OpenRouter prices; the real `usage.cost` replaces the estimate on completion.
- No scope creep: no multi-tenancy, billing, user accounts, ORM, TypeScript or Tailwind.

## Commands
- `npm run dev` (repo root): API + web dev server together
- `npm start`: build the SPA and run the server
- `cd server && npm test`: server tests (node:test, `--import ./test/setup.js`)
