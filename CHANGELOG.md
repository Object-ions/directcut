# Changelog

## Unreleased

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
