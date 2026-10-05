import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_MODELS, IMAGE_MODELS, estimateVideoCost, estimateImageCost, livePerSecond, refreshCatalog, catalogView,
} from '../models.js';

test('every model lists what it accepts and a positive rate', () => {
  for (const m of Object.values(VIDEO_MODELS)) {
    assert.ok(m.id.includes('/') && m.label && m.durations.length && m.aspects.length && m.frames.length);
    for (const r of Object.values(m.rates)) assert.ok(r > 0);
    for (const [res, r] of Object.entries(m.silent || {})) assert.ok(r > 0 && r <= m.rates[res]);
  }
  for (const m of Object.values(IMAGE_MODELS)) {
    assert.ok(m.id.includes('/') && ['resolution', 'quality'].includes(m.sizeParam) && m.maxReferences > 0);
    for (const r of Object.values(m.rates)) assert.ok(r > 0);
  }
});
test('sound off is cheaper where the model charges for it', () => {
  assert.equal(estimateVideoCost('kling-3-pro', { resolution: '720p', duration: 5 }), 0.84); // matches the real Hilary test
  assert.equal(estimateVideoCost('kling-3-pro', { resolution: '720p', duration: 5, sound: false }), 0.56);
  assert.equal(estimateVideoCost('veo-3.1', { resolution: '4K', duration: 8 }), 4.8);
  // Wan charges the same either way.
  assert.equal(estimateVideoCost('wan-3', { resolution: '1080p', duration: 10, sound: false }), 2);
});
test('Hailuo adds its per-frame-image charge', () => {
  assert.equal(estimateVideoCost('hailuo-3', { resolution: '2K', duration: 5, frameCount: 2 }), 0.73);
});
test('image cost includes references', () => {
  assert.equal(estimateImageCost('gpt-image-2', { size: 'high', referenceCount: 1 }), 0.32);
  assert.equal(estimateImageCost('flux-3', { size: '4K' }), 0.61);
  assert.equal(estimateImageCost('flux-3', { size: '8K' }), null);
});
test('reads the highest per-second price from catalog SKUs', () => {
  const veoFast = {
    duration_seconds_with_audio: '0.12', duration_seconds_with_audio_4k: '0.30',
    duration_seconds_without_audio: '0.10', duration_seconds_with_audio_720p: '0.10',
    duration_seconds_without_audio_4k: '0.25', duration_seconds_without_audio_720p: '0.08',
  };
  assert.equal(livePerSecond(veoFast, '720p', true), 0.12);
  assert.equal(livePerSecond(veoFast, '720p', false), 0.10);
  assert.equal(livePerSecond(veoFast, '4K', true), 0.30);
  assert.equal(livePerSecond({ cents_per_second_output_1080p: '29', cents_per_second_output: '17' }, '1080p', true), 0.29);
  assert.equal(livePerSecond({ video_tokens: '0.0000107' }, '720p', true), null);
  assert.equal(livePerSecond({ duration_seconds: '0.13', reference_images: '0.04' }, '2K', true), 0.13);
});
test('live prices only ever raise rates', async () => {
  const before = VIDEO_MODELS['wan-3'].rates['480p'];
  const fake = async (path) => (path === '/videos/models'
    ? { data: [
      { id: 'alibaba/wan-3.0', pricing_skus: { duration_seconds_480p: '0.09', duration_seconds_720p: '0.01' } },
    ] }
    : { endpoints: [] });
  const changed = await refreshCatalog(fake);
  assert.deepEqual(changed, ['wan-3 480p']);
  assert.equal(VIDEO_MODELS['wan-3'].rates['480p'], 0.09);
  assert.equal(VIDEO_MODELS['wan-3'].rates['720p'], 0.10); // not lowered
  VIDEO_MODELS['wan-3'].rates['480p'] = before;
  assert.deepEqual(await refreshCatalog(async () => { throw new Error('offline'); }), []);
});
test('catalog view hides OpenRouter ids', () => {
  const view = catalogView();
  assert.ok(view.video.length >= 8 && view.image.length >= 6);
  assert.ok(view.video.every((m) => m.key && !('id' in m)));
  assert.equal(view.video.find((m) => m.key === 'seedance-2.5').references.total, null);
});
