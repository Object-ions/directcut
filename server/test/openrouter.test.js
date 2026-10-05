import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateCost, mapStatus, normalizeTask, actualCost, MODELS, RATES } from '../openrouter.js';

test('uses current OpenRouter model identifiers', () => {
  assert.equal(MODELS['seedance-2.5'], 'bytedance/seedance-2.5');
  assert.equal(MODELS['seedream-5-pro'], 'bytedance-seed/seedream-5-0-pro');
});
test('estimates video and image cost', () => {
  assert.equal(estimateCost({ kind: 'video', task_type: 'seedance-2.5', resolution: '480p', duration: 5 }), 0.55);
  assert.equal(estimateCost({ kind: 'image', task_type: 'seedream-5-pro', size: '1K', referenceCount: 2 }), 0.051);
  assert.equal(estimateCost({ kind: 'video', task_type: 'seedance-2.5', resolution: '1080p', duration: 5 }), null);
});
test('all configured rates are positive', () => {
  for (const table of [RATES.video, RATES.image]) for (const tiers of Object.values(table))
    for (const rate of Object.values(tiers)) assert.ok(rate > 0);
});
test('maps OpenRouter statuses', () => {
  assert.equal(mapStatus('completed'), 'completed');
  assert.equal(mapStatus('failed'), 'failed');
  assert.equal(mapStatus('queued'), 'queued');
  assert.equal(mapStatus('running'), 'processing');
});
test('normalizes synchronous image and asynchronous video responses', () => {
  assert.equal(normalizeTask({ data: [{ b64_json: 'AA==' }] }, 'image').images.length, 1);
  assert.deepEqual(normalizeTask({ id: 'job', status: 'completed', unsigned_urls: ['https://x/v.mp4'] }, 'video').urls, ['https://x/v.mp4']);
});
test('Seedance 720p is priced above 480p (token cost scales with frame area)', () => {
  for (const key of ['seedance-2.5', 'seedance-2-fast']) {
    const tiers = RATES.video[key];
    assert.ok(tiers['720p'] > tiers['480p'] * 2);
  }
});
test('reads the real charge from usage.cost when present', () => {
  assert.equal(actualCost({ usage: { cost: 0.42 } }), 0.42);
  assert.equal(actualCost({ usage: null }), null);
  assert.equal(actualCost({ usage: { cost: 'n/a' } }), null);
});

test('ByteDance rejections become readable messages', async () => {
  const { friendlyError } = await import('../openrouter.js');
  const raw = 'HTTP 400: {"error":{"code":"InputImageSensitiveContentDetected.PrivacyInformation","message":"The request failed because the input image \'content[1]\' may contain real person."}}';
  assert.match(friendlyError(400, raw), /photo-realistic faces/);
  assert.match(friendlyError(400, 'the parameter video pixel count specified in the request must be greater'), /640×640/);
  assert.equal(friendlyError(500, 'boom'), 'OpenRouter error (HTTP 500): boom');
});
