# Contributing

Thanks for stopping by. Contributions are welcome: bug fixes, UX polish,
docs, and the items on the [roadmap](docs/ROADMAP.md). Directcut is small on
purpose, and the best PRs keep it that way.

## Getting set up

```bash
git clone https://github.com/switchcasestudio/directcut.git && cd directcut
npm run setup     # install server + web deps
npm run dev       # API on :3456 + Vite dev server on :5173
npm test          # server tests (node:test)
npm run build     # production UI build
```

Open http://localhost:5173 and complete the setup screen. You only need a
real OpenRouter key to actually generate; validation, UI and test work run
fine without one (set `OPENROUTER_API_KEY=sk-or-v1-dev` in `server/.env` to
skip the key check during setup).

## Ground rules (stack)

- Plain JavaScript, ESM. **No TypeScript.**
- Express + better-sqlite3 with raw SQL. **No ORM.**
- React without a state library; SCSS. **No Tailwind, no CSS frameworks.**
- Tests use `node:test`. **No test frameworks.**
- New runtime dependencies need a strong reason. Most PRs shouldn't add any.

## Scope: the "no platform" rule

Directcut is a single-person tool: one operator (plus their scripts and
agents) running it on their own machine with their own OpenRouter key. PRs
adding multi-tenancy, user accounts, billing, queue services or plugin
systems will be declined regardless of quality. If you need those, fork
happily. MIT means yes.

## Pull requests

- Open an issue first for anything bigger than a bug fix, so we agree on the
  shape before you spend time on it.
- Every diff should fix a defect, enable something real, or measurably improve
  the experience. No style-only refactors.
- Rates in `server/openrouter.js` are pre-flight estimates and must stay at
  or above the real price. Changes to them must cite OpenRouter's model pages
  or `GET https://openrouter.ai/api/v1/videos/models`.
- Add or update a test when you touch validation, cost estimation, settings
  or output parsing.
- Add a line to `CHANGELOG.md` under **Unreleased** if your change is
  user-visible.
- Never commit `server/.env`, `server/data/` or `server/media/`.
