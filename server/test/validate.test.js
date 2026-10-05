import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndBuild } from '../validate.js';

const build = (body, opts = { publicBaseUrl: '', webhookSecret: '' }) => validateAndBuild(body, opts);
const rejects = (body, re) => assert.throws(() => build(body), (err) => err.status === 400 && re.test(err.message));

test('validates prompt', () => {
  rejects({}, /prompt is required/);
  rejects({ prompt: 'x'.repeat(4001) }, /4000/);
});
test('builds Seedance 2.5 OpenRouter request', () => {
  const b = build({ kind: 'video', prompt: 'a restrained commercial', aspect_ratio: '9:16' });
  assert.equal(b.payload.model, 'bytedance/seedance-2.5');
  assert.equal(b.payload.duration, 5);
  assert.equal(b.cost, 0.55);
});
test('Seedance limits duration and resolution', () => {
  rejects({ prompt: 'p', duration: 31 }, /between 4 and 30/);
  rejects({ prompt: 'p', resolution: '1080p' }, /not available/);
  rejects({ prompt: 'p', task_type: 'seedance-2-fast', duration: 16 }, /between 4 and 15/);
});
test('builds image request with real references', () => {
  const b = build({ kind: 'image', prompt: 'p', image_urls: ['https://x/ref.png'] });
  assert.equal(b.payload.model, 'bytedance-seed/seedream-5-0-pro');
  assert.deepEqual(b.payload.input_references, [{ type: 'image_url', image_url: { url: 'https://x/ref.png' } }]);
  assert.equal(b.cost, 0.048);
});
test('validates reference modes and tags', () => {
  rejects({ prompt: 'p', image_urls: ['https://x/a.png'] }, /takes no reference/);
  rejects({ prompt: 'p', mode: 'omni_reference' }, /requires at least one/);
  rejects({ prompt: 'use @image2', mode: 'omni_reference', image_urls: ['https://x/a.png'] }, /only 1/);
  const b = build({ prompt: 'use @image1', mode: 'omni_reference', image_urls: ['https://x/a.png'] });
  assert.deepEqual(b.payload.input_references[0], {
    type: 'image_url', image_url: { url: 'https://x/a.png' },
  });
});
test('first_last_frames sends frame_images, not input_references', () => {
  const b = build({ prompt: 'p', mode: 'first_last_frames', aspect_ratio: 'auto', image_urls: ['https://x/a.png', 'https://x/b.png'] });
  assert.equal(b.payload.input_references, undefined);
  assert.equal(b.payload.aspect_ratio, undefined);
  assert.deepEqual(b.payload.frame_images.map((f) => f.frame_type), ['first_frame', 'last_frame']);
  rejects({ prompt: 'p', aspect_ratio: 'auto' }, /aspect_ratio/);
});
test('adds OpenRouter callback when configured', () => {
  const b = validateAndBuild({ prompt: 'p' }, { publicBaseUrl: 'https://directcut.example', webhookSecret: 'secret value' });
  assert.equal(b.payload.callback_url, 'https://directcut.example/api/webhook/openrouter?secret=secret%20value');
});
test('enhanced prompt is sent', () => {
  const b = build({ prompt: 'rough', enhanced_prompt: 'polished' });
  assert.equal(b.payload.prompt, 'polished');
});
test('other video models: their own lengths, shapes, frames and sound', () => {
  const k = build({ prompt: 'p', task_type: 'kling-3-pro', resolution: '720p', aspect_ratio: '9:16', sound: false });
  assert.equal(k.payload.model, 'kwaivgi/kling-v3.0-pro');
  assert.equal(k.payload.generate_audio, false);
  assert.equal(k.cost, 0.56);
  rejects({ prompt: 'p', task_type: 'kling-3-pro', resolution: '480p' }, /not available/);
  rejects({ prompt: 'p', task_type: 'kling-3-pro', resolution: '720p', aspect_ratio: '21:9' }, /aspect_ratio/);
  rejects({ prompt: 'p', task_type: 'veo-3.1', resolution: '720p', duration: 5 }, /one of 4, 6, 8/);
  rejects({ prompt: 'p', task_type: 'kling-3-pro', resolution: '720p', mode: 'omni_reference', image_urls: ['https://x/a.png'] }, /not references/);
  rejects({ prompt: 'p', task_type: 'wan-3', resolution: '480p', mode: 'first_last_frames', image_urls: ['https://x/a.png', 'https://x/b.png'] }, /start frame only/);
  rejects({ prompt: 'p', task_type: 'kling-3-pro', resolution: '720p', mode: 'first_last_frames', aspect_ratio: 'auto', image_urls: ['https://x/a.png'] }, /aspect_ratio/);
  const v = build({ prompt: 'p', task_type: 'veo-3.1-fast', resolution: '1080p', duration: 8 });
  assert.equal(v.payload.generate_audio, true);
  assert.equal(v.cost, 0.96);
  // Seedance has no sound switch, so nothing extra is sent.
  assert.equal(build({ prompt: 'p' }).payload.generate_audio, undefined);
});
test('other image models: GPT Image sends quality, not resolution', () => {
  const g = build({ kind: 'image', prompt: 'p', task_type: 'gpt-image-2', size: 'medium', aspect_ratio: '16:9' });
  assert.equal(g.payload.model, 'openai/gpt-image-2');
  assert.equal(g.payload.quality, 'medium');
  assert.equal(g.payload.resolution, undefined);
  const n = build({ kind: 'image', prompt: 'p', task_type: 'nano-banana-pro', size: '4K' });
  assert.equal(n.payload.resolution, '4K');
  rejects({ kind: 'image', prompt: 'p', task_type: 'nano-banana-pro', aspect_ratio: '9:21' }, /aspect_ratio/);
  rejects({ kind: 'image', prompt: 'p', task_type: 'flux-3', image_urls: Array(11).fill('https://x/a.png') }, /at most 10/);
});
