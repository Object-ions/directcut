# Changelog

## Unreleased

- Guided first-run tour (driver.js) explaining each part of the screen,
  replayable from the new "?" button. 90-second how-to video in
  `docs/media/`, linked from the README; README screenshot updated.
- ByteDance rejections are shown in plain English. Notably, Seedance blocks
  photo-realistic faces in video references and frames (documented).
- Timing and price copy corrected: images take up to a minute or two.
- Reference tunnel is more reliable: it waits for cloudflared to connect,
  checks public DNS through two providers, and retries once with a fresh
  tunnel. No cloudflared process is left behind if the server stops mid-start.
- Jobs OpenRouter no longer knows about (404) are marked failed after 2
  minutes, not left "queued" for 24h.
- Voice-only references on Seedance 2 Fast are flagged before Generate.
- Frame mode defaults to the "auto" aspect ratio (Seedance follows the start
  image), and the image cost estimate includes Seedream Pro reference input.
- Reference slots: start/end frame boxes and character / style / motion /
  voice references for video, an image-reference tray for Seedream. Adding a
  reference writes its phrase into the prompt; removing one cleans it up and
  renumbers the remaining @tags. Drag and drop anywhere, paste with ⌘V.
- Video mode is derived from what's attached (frames → frames mode,
  references → reference mode, nothing → text); the mode dropdown is gone.
- Video references smaller than ~640×640 are caught before upload.
- Video and audio references work on a local install: a temporary Cloudflare
  quick tunnel serves only the reference files of jobs in flight and closes
  when they finish (`REF_TUNNEL=off` disables it).
- Image references now work on a local install: they're embedded in the
  request instead of sent as a localhost link OpenRouter can't reach.
- Video and audio references without a public https address now fail with a
  clear message before any spend is reserved.
- First/last-frame video sends real start/end frames (`frame_images`), and its
  `auto` aspect ratio is accepted.
- Seedream image references use OpenRouter's typed reference format.
- Dev server proxies `/media`, so reference thumbnails and the gallery load
  when running `npm run dev`.

## 1.0.0 (2026-10-01)

First public release.

- Browser UI for Seedance 2.5 / Seedance 2 Fast (video) and Seedream 5 Pro /
  Lite (image) through OpenRouter: text-to-video, first/last-frame and
  multi-reference video, image generation and editing.
- First-run setup in the browser: choose a password and paste an OpenRouter
  key (verified against OpenRouter before saving). No config file needed.
- Settings dialog: replace or remove the OpenRouter key, change the password,
  sign out. `OPENROUTER_API_KEY` / `APP_SECRET` in `server/.env` still work and
  take precedence.
- One-time setup code (printed in the server terminal) required when setting
  up from another machine.
- Server listens on localhost by default (`HOST` to change).
- ✦ Enhance prompt rewriting through the same OpenRouter key (`ENHANCE_MODEL`).
- Pre-flight cost estimates, actual OpenRouter charge recorded on completion,
  server-enforced `DAILY_SPEND_CAP`.
- Outputs downloaded to local disk on completion; gallery with players,
  download, reuse and delete; orphaned reference uploads swept after 24h.
- Optional `COMPLETION_WEBHOOK_URL` notification, OpenRouter completion
  callbacks (`WEBHOOK_SECRET`), pm2/systemd/reverse-proxy deployment guide,
  backup script and CLI.
