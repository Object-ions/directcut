# Directcut

**Generate AI video and images on your own computer, and pay the model price, not a platform's markup.**

Directcut is a small app you run yourself. It gives you a clean browser UI for
the top video and image models on [OpenRouter](https://openrouter.ai):
**Seedance**, **Kling**, **Veo**, **Wan** and **Hailuo** for video, and
**Seedream**, **Nano Banana**, **GPT Image** and **Flux** for images. You bring your own OpenRouter key and pay
per generation. There's no subscription, no credits system and no middleman,
and every file you make is saved to your own disk.

Open source (MIT), by [Switch Case Studio](https://switchcasestudio.com).
Contributions are very welcome, see [Contributing](#contributing).

> ⚠️ **Use at your own risk.** Directcut is free software provided "as is",
> with no warranty of any kind. You are responsible for your OpenRouter key,
> your spending, what you generate and how you use it. The author accepts no
> responsibility or liability for anything that happens from using it. Read
> the full [Disclaimer](#disclaimer) before you start.

![Directcut](docs/screenshots/directcut.png)

▶ **[Watch the 90-second how-to video](docs/media/directcut-demo.mp4)**: the built-in tour, building a shot with character / style / voice references, and generating an image. New here? Click **?** next to ⚙ in the app to replay the tour anytime.

## Contents

- [Why](#why)
- [Get started](#get-started-about-5-minutes)
- [Features](#features)
- [Supported models](#supported-models)
- [What it is / is not](#what-it-is--is-not)
- [Running it on a server](#running-it-on-a-server)
- [Configuration](#configuration)
- [Security model](#security-model)
- [Known limitations](#known-limitations)
- [Retention](#retention)
- [API](#api)
- [Development](#development)
- [Contributing](#contributing)
- [Disclaimer](#disclaimer)
- [License](#license)

## Why

Generation platforms resell these same models behind monthly plans and credit
packs. Directcut calls them directly, so you see the real price before you
click **Generate**:

| What | Estimated cost |
|---|---|
| 5s video, 480p, `seedance-2.5` | ~$0.55 |
| 5s video, 720p, `seedance-2.5` | ~$1.20 |
| 5s video, 480p, `seedance-2-fast` | ~$0.23 |
| 5s video, 720p with sound, `kling-3-pro` | ~$0.84 |
| 6s video, 1080p with sound, `veo-3.1-fast` | ~$0.72 |
| 10s video, 1080p, `wan-3` | ~$2.00 |
| 1K image, `seedream-5-pro` | ~$0.045 |
| 2K image, `seedream-5-lite` | ~$0.035 |
| 1K image, `nano-banana-pro` | ~$0.14 |
| 1K image, `flux-3` | ~$0.048 |

Estimates are deliberately on the high side, and the server checks them
against OpenRouter's live prices at startup (a price that went up raises the
estimate; nothing lowers it). When OpenRouter reports the
actual charge, Directcut records that instead. A **daily spend cap** (default
$10) stops a typo or a runaway script from draining your balance.

## Get started (about 5 minutes)

You need two things:

1. **Node.js 22 or newer.** Download the LTS installer from
   [nodejs.org](https://nodejs.org) and click through it.
2. **An OpenRouter key.** Sign up at [openrouter.ai](https://openrouter.ai),
   add a few dollars of credit, and create a key at
   [openrouter.ai/keys](https://openrouter.ai/keys).

Then open a terminal (on a Mac: **Terminal**; on Windows: **PowerShell**) and
paste these lines one at a time:

```bash
git clone https://github.com/switchcasestudio/directcut.git
cd directcut
npm run setup
npm start
```

No git? Click **Code → Download ZIP** on GitHub, unzip it, open a terminal in
that folder, and run the last two lines.

Now open **http://localhost:3456** in your browser. The first screen asks you to:

1. **Choose a password.** It protects the app if anyone else can reach it.
2. **Paste your OpenRouter key.** Directcut checks the key with OpenRouter before saving it.

![First-run setup](docs/screenshots/setup.png)

That's it. Type a prompt and hit **Generate**. Images take up to a minute or
two, and videos a few minutes. Everything you make is shown in the gallery and
saved under `server/media/`.

To stop Directcut, press `Ctrl+C` in the terminal. To start it again later,
run `npm start` from the same folder.

### Changing your key or password

Click the **⚙** next to the logo. There you can replace or remove your
OpenRouter key, change your password, or sign out.

## Features

- **8 video models:** Seedance 2.5 and 2 Fast (multi-reference), Kling 3.0 Pro and Standard (realistic people), Veo 3.1 and Veo 3.1 Fast (premium, up to 4K), Wan 3.0 (cheap 1080p, up to 30s) and Hailuo 3 (2K)
- **The controls follow the model:** lengths, resolutions, shapes, a sound on/off switch where it changes the price, and which frame and reference slots appear
- **Guided tour** on first launch (replay it with **?**): every part of the screen explained in 8 short steps
- **Reference slots:** start/end frame boxes, plus one-click **character**, **style**, **motion** and **voice** references that write their `@tag` phrase into your prompt. The video mode is picked automatically from what you attach. Drag and drop anywhere, or paste an image with ⌘V.
- **6 image models** for generation and editing: Seedream 5 Pro and Lite, Nano Banana Pro and Nano Banana 2, GPT Image 2 and Flux 3
- **✦ Enhance** turns a rough idea into a detailed, production-grade prompt. It runs through your same OpenRouter key.
- Live cost estimate before every generation, plus a server-enforced daily cap
- Outputs are downloaded the moment they finish (provider links expire, yours don't)
- Gallery with inline players, download, reuse-prompt and delete
- Plain HTTP API, so scripts and AI agents can use it too (see [the agent example](examples/agent-skill/SKILL.md))

## Supported models

All models run through OpenRouter with your own key. Prices are Directcut's
conservative estimates in USD; the real charge OpenRouter reports replaces
the estimate after each generation.

**Video** (price per second of output)

| Model | Best for | Lengths | Resolutions | Frames | References | Est. price |
|---|---|---|---|---|---|---|
| Seedance 2.5 | Multi-reference shots (character, style, motion, voice) | 4–30s | 480p, 720p | start + end | ✅ | $0.11–0.24 |
| Seedance 2 Fast | Cheap drafts | 4–15s | 480p, 720p | start + end | ✅ | $0.045–0.095 |
| Kling 3.0 Pro | Realistic people (accepts photo-real faces) | 3–15s | 720p | start + end | — | $0.168 (silent $0.112) |
| Kling 3.0 Standard | Realistic people, cheaper | 3–15s | 720p | start + end | — | $0.126 (silent $0.084) |
| Veo 3.1 | Premium quality with sound | 4, 6, 8s | 720p, 1080p, 4K | start + end | — | $0.40–0.60 (silent $0.20–0.40) |
| Veo 3.1 Fast | Veo quality for less | 4, 6, 8s | 720p, 1080p, 4K | start + end | — | $0.12–0.30 (silent $0.10–0.25) |
| Wan 3.0 | Cheap 1080p, long clips | 2–30s | 480p, 720p, 1080p | start | — | $0.05–0.20 |
| Hailuo 3 | 2K output | 5–15s | 2K | start + end | — | $0.13 (+$0.04 per frame image) |

**Image** (price per image)

| Model | Best for | Sizes | Max references | Est. price |
|---|---|---|---|---|
| Seedream 5 Pro | Photo-real, accepts real-looking faces | 1K, 2K | 14 | $0.045–0.09 |
| Seedream 5 Lite | Cheap 2K and 4K | 2K, 4K | 14 | $0.035 |
| Nano Banana Pro | Precise edits, text in images | 1K, 2K, 4K | 14 | $0.14–0.25 |
| Nano Banana 2 | Fast, cheap edits | 1K, 2K, 4K | 14 | $0.07–0.16 |
| GPT Image 2 | Following complex prompts | quality: low, medium, high | 16 | up to $0.03–0.30 |
| Flux 3 | Artistic and photographic styles | 1K, 1.5K, 2K, 4K | 10 | $0.048–0.61 |

The Seedance and Seedream models were tested end to end with real
generations. The others are wired from OpenRouter's published model specs and
are covered by unit and UI tests, but haven't each had a real generation yet.
If one misbehaves, please [open an issue](https://github.com/switchcasestudio/directcut/issues).
Adding a model is one entry in [`server/models.js`](server/models.js).

## What it is / is not

**Is:** a single-person tool. One Node process (Express + SQLite) serves both
the API and the UI. One password. Your files stay on your machine.

**Is not:** a platform. There are no user accounts, teams, billing or plugin
system, by design. See [CONTRIBUTING.md](CONTRIBUTING.md) for where help is
most welcome.

## Running it on a server

Want it on a VPS so you can use it from anywhere? See [DEPLOY.md](DEPLOY.md)
(pm2, a reverse proxy, TLS, backups). When you open it from another machine
the first time, the setup screen also asks for a one-time **setup code**
that the server prints in its terminal. That stops anyone who stumbles on the
URL from claiming your instance before you do.

## Configuration

Everything is optional; the setup screen covers the basics. For servers or
advanced use, copy `server/.env.example` to `server/.env`:

| Var | Default | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Set the key in config instead of the UI (overrides the UI value) |
| `APP_SECRET` | — | Set the password in config instead of the UI (overrides the UI value) |
| `HOST` | `127.0.0.1` | Listen address. Use `0.0.0.0` only behind a firewall or reverse proxy |
| `PORT` | `3456` | Port |
| `PUBLIC_BASE_URL` | `http://localhost:3456` | Public origin used to build media and webhook URLs |
| `DAILY_SPEND_CAP` | `10` | Hard daily limit (USD) on the sum of generation costs |
| `ENHANCE_MODEL` | `anthropic/claude-sonnet-5.5` | Any OpenRouter chat model for ✦ Enhance |
| `WEBHOOK_SECRET` | — | Enables OpenRouter completion callbacks (otherwise a 60s poller handles it) |
| `REF_TUNNEL` | `on` | Temporary public link for video/audio references when `PUBLIC_BASE_URL` isn't https (`off` to disable) |
| `ALLOWED_ORIGINS` | localhost dev | CORS origins, only for a separately hosted UI |
| `POLL_MAX_AGE_HOURS` | `24` | Give up on unresolved video jobs after this |
| `COMPLETION_WEBHOOK_URL` | — | POST generation metadata here when a job finishes (n8n, Zapier, archiving…) |

## Security model

Simple on purpose. Know what it is before putting it on the internet:

- **One password** guards the whole API. It's stored as a salted scrypt hash
  (or read from `APP_SECRET`). The browser keeps it in `sessionStorage` for
  the tab's lifetime.
- **Your OpenRouter key** is stored only on the server, in
  `server/data/` (owner-only permissions). The UI only ever sees a masked
  version like `sk-or-v1…abcd`.
- By default the server **only listens on localhost**. Exposing it is a
  deliberate step (`HOST`, plus a TLS reverse proxy; see DEPLOY.md).
- **Media is public-read by unguessable URL** (random uuid filenames). Anyone
  with a link can fetch that one file; nobody can list files.
- Failed logins are rate-limited (10 per 15 min per IP) and the API to 240
  requests/min.
- If you need multiple users, audit logs or private media, this isn't the
  right tool.

## Known limitations

- **Video and audio references on a local install.** Image references are
  embedded in the request, so they work anywhere. OpenRouter only accepts video
  and audio references as public `https://` URLs, so on a local install
  Directcut opens a free, temporary [Cloudflare quick tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/do-more-with-tunnels/trycloudflare/)
  that serves **only** the reference files of jobs in flight (not the app,
  gallery or API) and closes it about a minute after they finish. Quick tunnels
  carry no uptime guarantee; if one can't open, the request fails before
  anything is charged. Set `REF_TUNNEL=off` to disable it, or use a public
  `https://` `PUBLIC_BASE_URL`, which skips the tunnel entirely.
- **Seedance blocks photo-realistic faces** as video references and start/end
  frames (ByteDance can't tell an AI-generated person from a real one).
  Illustrated or stylized faces work. For realistic people in video, use
  **Kling 3.0**, which accepts photo-real start frames; Seedream (image)
  accepts them too.
- **References (character / style / motion / voice) are Seedance-only.** The
  other video models take text plus start/end frames (Wan 3.0: start frame
  only).
- Seedance rejects small video references: they need roughly 640×640 pixels
  or more.
- Video estimates cover output duration only. Seedance bills video
  *reference input* at a separate rate that isn't included.

## Retention

- **Outputs** (`server/media/*`) are kept until you delete them. Deleting a
  generation removes the database row *and* the file.
- **Reference uploads** (`server/media/refs/*`) that no generation uses are
  cleaned up after 24 hours.
- **Database**: `server/data/directcut.db` (SQLite). `tools/directcut-backup.sh`
  makes safe nightly snapshots.

## API

Everything the UI does is plain HTTP with an `X-App-Key: <your password>`
header. [`examples/agent-skill/SKILL.md`](examples/agent-skill/SKILL.md) is a
complete API reference written as an AI-agent integration (endpoints, allowed
values, validation rules, costs and a Seedance prompt guide).

## Development

```bash
npm run setup   # install server + web dependencies
npm run dev     # API with watch + Vite dev server on :5173
npm test        # server tests (node:test)
npm run build   # build the UI the server serves
```

Stack, on purpose: plain JavaScript ESM (no TypeScript), Express,
better-sqlite3 with raw SQL (no ORM), React without a state library, SCSS (no
Tailwind). [CONTRIBUTING.md](CONTRIBUTING.md) explains why.

## Contributing

**Contributions are more than welcome**, whether you're fixing a typo or
adding a whole model. Some good ways to help:

- **Report bugs** and rough edges in [Issues](https://github.com/switchcasestudio/directcut/issues).
  Include what you did, what you expected and any error text.
- **Test a model** you have credits for and tell us whether it worked.
- **Add or update a model** in `server/models.js` when OpenRouter ships a new
  one or changes a price.
- **Improve the docs**, the guided tour or the UI copy.
- **Pick something** from the [roadmap](docs/ROADMAP.md).

Fork the repo, make your change on a branch, run `npm test` and
`npm run build`, and open a pull request. For anything bigger than a bug fix,
open an issue first so we can agree on the approach. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) for setup, the stack rules and the
"no platform" scope rule. First-time contributors are very welcome, and no
contribution is too small.

## Disclaimer

**Directcut is provided "as is", without warranty of any kind. You use it
entirely at your own risk.**

By installing, running or using Directcut, you agree that:

- **No responsibility or liability.** The author, Switch Case Studio and the
  contributors are not responsible or liable for any damage, loss, cost,
  claim or consequence of any kind that comes from using, misusing or being
  unable to use this software. That includes, but isn't limited to, lost
  money, lost data, security incidents, account suspensions and legal claims.
- **Costs are yours.** Every generation is billed to *your* OpenRouter
  account. Cost estimates and the daily spend cap are best-effort safeguards,
  not guarantees. Prices can change, estimates can be wrong and bugs can
  happen. Watch your balance on [openrouter.ai](https://openrouter.ai).
- **Your key and your setup are yours.** You're responsible for keeping your
  OpenRouter key, password and server secure, especially if you expose
  Directcut to a network or the internet.
- **What you generate is your responsibility.** You're responsible for your
  prompts, the files you upload as references and the content you create.
  That includes respecting copyright, trademarks, privacy and people's
  likeness and consent, and not creating illegal, harmful, deceptive or
  non-consensual content.
- **Follow the providers' rules.** Your use is also governed by the terms and
  usage policies of OpenRouter and of each model provider (ByteDance, Kling,
  Google, Alibaba, MiniMax, OpenAI, Black Forest Labs and others). Their
  content filters, availability and output quality are outside our control.
- **Not affiliated.** Directcut is an independent open-source project. It
  isn't affiliated with, endorsed by or sponsored by OpenRouter, Higgsfield
  or any model provider. All product names and trademarks belong to their
  owners.
- **No support guarantee.** Help, fixes and updates are given in good faith
  when possible, with no promise of availability or timeline.

This disclaimer adds to the warranty and liability terms of the
[MIT License](LICENSE) and doesn't replace them. If you don't agree with
these terms, please don't use the software.

## License

[MIT](LICENSE) © Switch Case Studio and contributors
