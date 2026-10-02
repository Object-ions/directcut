import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { refsDir, inlineLocalRefs, localRefToDataUrl } from '../media.js';

test('local refs are inlined as data URLs, remote ones pass through', () => {
  const name = 'test-inline.png';
  fs.writeFileSync(path.join(refsDir, name), Buffer.from('png-bytes'));
  try {
    const out = inlineLocalRefs({
      input_references: [
        { type: 'image_url', image_url: { url: `http://localhost:3456/media/refs/${name}` } },
        { type: 'image_url', image_url: { url: 'https://cdn.example/x.png' } },
      ],
      frame_images: [{ type: 'image_url', image_url: { url: `/media/refs/${name}` }, frame_type: 'first_frame' }],
    });
    const data = `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`;
    assert.equal(out.input_references[0].image_url.url, data);
    assert.equal(out.input_references[1].image_url.url, 'https://cdn.example/x.png');
    assert.equal(out.frame_images[0].image_url.url, data);
    assert.equal(out.frame_images[0].frame_type, 'first_frame');
  } finally {
    fs.rmSync(path.join(refsDir, name), { force: true });
  }
});
test('a missing local ref fails loudly', () => {
  assert.throws(() => localRefToDataUrl('/media/refs/nope.png'), /re-upload/);
});
test('video/audio refs need a public https base', () => {
  const name = 'test-clip.mp4';
  fs.writeFileSync(path.join(refsDir, name), Buffer.from('mp4'));
  try {
    const ref = { type: 'video_url', video_url: { url: `http://localhost:3456/media/refs/${name}` } };
    assert.throws(() => inlineLocalRefs({ input_references: [ref] }, 'http://localhost:3456'), /public https/);
    const out = inlineLocalRefs({ input_references: [ref] }, 'https://dc.example');
    assert.equal(out.input_references[0].video_url.url, `https://dc.example/media/refs/${name}`);
  } finally {
    fs.rmSync(path.join(refsDir, name), { force: true });
  }
});
