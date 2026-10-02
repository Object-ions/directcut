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
