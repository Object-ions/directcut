---
name: directcut
description: "This skill should be used when generating AI videos (Seedance 2.5) or AI images (Seedream 5) via Directcut, a self-hosted generation API — for any request to create, render, or produce video clips or still images, including with reference images/videos/audio."
---

# Directcut — AI video & image generation (agent integration example)

> This is a worked example of giving an AI agent (Claude Code or any other
> tool-using assistant) access to your Directcut instance. Copy it into your
> agent's skill directory, replace `https://directcut.example.com` with your
> domain, and place your app key in a file the agent can read (mode 600,
> **never** in the skill text or in git).

Directcut is a self-hosted generation service (Node/Express) calling ByteDance's Seedance (video) and Seedream 5 (image) models through OpenRouter. Use it whenever the operator asks for a generated video or image.

## Access

- **Base URL: `https://directcut.example.com`** — use the URL that is reachable from where the agent runs. If the agent runs in a container, the host's `localhost:3456` is usually NOT reachable; use the public domain.
- **Auth:** every `/api/*` call needs the shared secret in the `X-App-Key` header. Read it at call time from a key file installed next to this skill:

```bash
KEY=$(cat /path/to/skills/directcut/.appkey)
curl -s -H "X-App-Key: $KEY" https://directcut.example.com/api/generations?limit=5
```

- NEVER print, echo, or paste the key into chat, logs, or files. Only substitute it into the header.
- `GET /health` and `GET /media/*` need no auth.

## Workflow (always in this order)

1. **Write the prompt yourself** (or call `POST /api/enhance` if the instance has it configured — it returns 501 when not).
2. **Upload any reference files first** (see `/api/upload`) and use the returned URLs in `image_urls` / `video_urls` / `audio_urls`.
3. **Check the cost** against the table below before generating. The server enforces a daily spend cap (default $10, HTTP 429 when exceeded). If a single generation would cost more than ~$2, confirm with the operator first.
4. **Generate** with `POST /api/generate`, always including a distinct `"source"` value (e.g. `"agent"`) so the operator can tell agent generations from their own.
5. **Poll** `GET /api/tasks/:id` every ~15s for video (up to ~10 min), every ~5s for images (usually near-instant). Stop on `status` = `completed` or `failed`.
6. **Deliver the `url` field** from the completed task — it is a permanent `/media/<uuid>.<ext>` link (the server downloads outputs locally because raw provider URLs expire).

## API reference

### POST /api/generate

Video body (defaults shown):

```json
{
  "kind": "video",
  "task_type": "seedance-2.5",
  "mode": "text_to_video",
  "prompt": "...",
  "duration": 5,
  "resolution": "480p",
  "aspect_ratio": "16:9",
  "image_urls": [], "video_urls": [], "audio_urls": [],
  "source": "agent"
}
```

Image body:

```json
{
  "kind": "image",
  "task_type": "seedream-5-pro",
  "prompt": "...",
  "size": "1K",
  "aspect_ratio": "1:1",
  "image_urls": [],
  "source": "agent"
}
```

Returns `{id, status, cost_estimate}`. `502` means OpenRouter rejected/failed the submit (row saved as failed); `400` = validation error with the reason; `429` = daily cap.

**Allowed values & rules (server-validated):**

- Video `task_type`: `seedance-2.5` (default) or `seedance-2-fast`.
- Video `mode`: `text_to_video` (no refs allowed), `first_last_frames` (exactly 1–2 `image_urls`, nothing else; `@image1` = opening frame, `@image2` = closing frame), `omni_reference` (any mix of refs, at least one required).
- `duration`: integer 4–30 for `seedance-2.5`, 4–15 for `seedance-2-fast`. `resolution`: `480p` or `720p`. Video `aspect_ratio`: `21:9, 16:9, 4:3, 1:1, 3:4, 9:16`.
- Refs: up to 14 images; up to 10 videos and 10 audios on `seedance-2.5` (9 / 12 on `seedance-2-fast`, max 12 refs total, and audio needs at least one image or video ref). Every `@imageN`/`@videoN`/`@audioN` tag in the prompt must have a matching URL (1-based) or the request is rejected. Reference URLs must be reachable by OpenRouter (public).
- Image `task_type`: `seedream-5-pro` (default; sizes `1K`/`2K`) or `seedream-5-lite` (sizes `2K`/`4K`). Image `aspect_ratio`: `1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 4:5, 5:4, 21:9` and more (`GET /api/rates` lists them). ≤10 `image_urls` (editing/reference).
- Prompt ≤4000 chars (but aim for <1500 per the guide).

**Cost (USD, conservative estimates; the real OpenRouter charge replaces the estimate on completion).** `GET /api/rates` returns the live table.

| Video tier | 480p | 720p |
|---|---|---|
| seedance-2.5 | 0.11/s | 0.24/s |
| seedance-2-fast | 0.045/s | 0.095/s |

Images: Pro $0.045 (1K) / $0.09 (2K), +$0.003 per reference image; Lite $0.035 (2K/4K).
Example: default 5s Seedance 2.5 480p video ≈ $0.55.

### GET /api/tasks/:id

Fresh status for one generation (syncs with OpenRouter on non-terminal rows). Key fields: `status` (`queued|processing|completed|failed`), `url` (permanent media link once completed), `error`, `cost_estimate`.

### GET /api/generations?limit=N

History, newest first (same row shape). Useful to find past outputs or check today's spend before a big job.

### DELETE /api/generations/:id — and — DELETE /api/generations?status=failed

Deletes a generation: the database row AND its media file on the server. The bulk form deletes every failed row. ONLY delete when the operator explicitly asks — never clean up on your own initiative; deletion is permanent.

### POST /api/upload

Multipart form, field `file`. Max 20MB; jpg/png/webp/mp4/mp3/wav only. Returns `{url}` — a public URL to use as a reference in `image_urls`/`video_urls`/`audio_urls`.

```bash
curl -s -H "X-App-Key: $KEY" -F "file=@ref.png" https://directcut.example.com/api/upload
```

Audio refs: ≤15s, mp3/wav.

### Polling example

```bash
curl -s -H "X-App-Key: $KEY" https://directcut.example.com/api/tasks/<id>
```

## Etiquette

- One generation at a time unless the operator asks for a batch; report the cost estimate when you submit.
- If a task sits `processing` past ~10 minutes, report it rather than resubmitting (the server also has a background poller that completes rows on its own).
- If you get `429` (cap reached), tell the operator how much was spent today and stop — never work around the cap.
- `failed` rows include the OpenRouter error message; fix the prompt/params rather than blind-retrying.

---

## Prompt engineering guide (Seedance 2 / Seedream)

You take a rough idea and produce one production-ready generation prompt. The prompt is the `prompt` field only — no preamble, no explanations, no quotes around it, no markdown fences.

### Prompt structure

Build video prompts in this order, as flowing descriptive prose (not labeled sections):

[shot type] → [subject + appearance] → [action] → [environment] → [lighting] → [camera movement] → [style/mood]

Example of the shape:
"Medium close-up of a weathered fisherman in a yellow raincoat, mid-60s with a grey beard, hauling a net over the gunwale. Rough North Atlantic swell, spray whipping off the crests. Overcast storm light, cold blue-grey palette. Handheld camera rolling with the boat. Gritty documentary realism."

- Shot types: extreme wide, wide, medium, medium close-up, close-up, extreme close-up, over-the-shoulder, POV, aerial, low angle, high angle.
- Camera movements: static, slow push-in, pull-back, pan, tilt, tracking/dolly, orbit, crane up/down, handheld, whip pan, rack focus.
- Be concrete about appearance, materials, textures, weather, and time of day. Prefer specific nouns ("cracked terracotta tiles") over adjectives ("beautiful").

### Multi-shot format (durations ≥ 8s)

Seedance 2 handles cuts natively. For longer durations, write 2–4 numbered shots that together tell a micro-story:

"Shot 1: Wide establishing shot of ... Shot 2: Cut to close-up of ... Shot 3: Final shot, slow pull-back revealing ..."

Keep each shot description tight. One action beat per shot. Maintain continuity of subject, wardrobe, palette, and lighting across shots.

### Reference syntax (@imageN / @videoN / @audioN)

When the request includes reference files, weave them into the prompt with 1-based tags matching the provided arrays:

- `@image1`, `@image2` … — image references (subject identity, style, first/last frame)
- `@video1` … — video references (motion, style, or subject from footage)
- `@audio1` … — audio references (soundtrack, voice, SFX timing)

HARD RULES:
- NEVER reference a tag that doesn't exist. If the request has 2 images / 0 videos / 1 audio, you may use only @image1, @image2, @audio1. A dangling reference makes the API reject the task.
- If references exist, use them explicitly — say what each contributes: "the woman from @image1 wearing the jacket from @image2, moving to the rhythm of @audio1".
- In `first_last_frames` mode: @image1 is the opening frame, @image2 (if present) is the closing frame. Describe the motion/transformation between them.
- In `omni_reference` mode: references can be people, objects, styles, motions, or audio — anchor each one.
- In `text_to_video` mode there are no references; never emit @ tags.

### Native audio

Seedance 2 generates audio natively. When sound matters, describe it inline:
- Dialogue: put spoken lines in quotes with speaker attribution — `The barista smiles and says: "The usual?"`
- SFX: "rain drumming on the tin roof", "a distant train horn".
- Ambience/music: "soft vinyl-crackle jazz under the scene".
Only add audio description when it serves the idea; silence is valid.

### Image prompts (kind = image / Seedream)

For still images, drop camera movement and multi-shot. Structure: [framing] → [subject + appearance] → [environment] → [lighting] → [style/medium]. Add composition notes (rule of thirds, negative space, depth of field) and, for editing tasks with reference images, state precisely what to keep and what to change.

### Constraints

- Keep the final prompt under 1500 characters.
- Write in English unless the idea is clearly meant for another language.
- Don't invent aspect ratios, durations, or resolutions in the prompt text — those are API parameters.
- Preserve the user's core intent exactly; enhance, never replace it.
- No camera jargon soup: pick ONE clear camera behavior per shot.
