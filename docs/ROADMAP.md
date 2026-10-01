# Roadmap: help wanted

Ordered roughly by value. All of these stay inside the "single-person tool"
boundary (see CONTRIBUTING.md). Comment on or open an issue before starting.

1. **Local reference uploads without a tunnel.** Send small reference images
   to OpenRouter inline (data URLs) when `PUBLIC_BASE_URL` isn't publicly
   reachable, so reference modes work on a plain laptop install.
2. **Docker Compose one-liner.** A `docker-compose.yml` + Dockerfile with a
   volume for `server/data` and `server/media`. Parallel to the plain-Node
   path, not a replacement.
3. **Desktop launcher.** A double-click way to start Directcut (and open the
   browser) without a terminal.
4. **More OpenRouter models.** Seedance 2.0 / 2.0 Mini, other video and image
   models, driven from OpenRouter's model list instead of hard-coded tables.
5. **Gallery search & filtering.** By kind, status or date, plus free-text
   search over prompts.
6. **Cost dashboard.** Spend over time on top of `/api/stats`.
7. **first_last_frames UX.** Explicit "opening frame" / "closing frame" slots
   instead of relying on upload order.
8. **Import/export.** Tar up DB + media for moving between machines, plus a
   restore script for `tools/directcut-backup.sh` snapshots.
9. **HTTP integration tests.** Setup, auth, upload and webhook flows (current
   tests cover the pure logic).

Non-goals (will be declined): user accounts, multi-tenancy, billing, queues,
plugins, TypeScript/ORM/Tailwind rewrites.
