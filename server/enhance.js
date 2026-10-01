import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chat } from './openrouter.js';
import { openrouterKey } from './settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL = fs.readFileSync(path.join(__dirname, 'prompts', 'seedance-skill.md'), 'utf8');

// Any OpenRouter chat model works; override with ENHANCE_MODEL.
const MODEL = process.env.ENHANCE_MODEL || 'anthropic/claude-sonnet-5.5';

export const enhancerConfigured = () => Boolean(openrouterKey());

export async function enhance({ idea, kind = 'video', mode = 'text_to_video', refs = {} }) {
  const images = Number(refs.images) || 0;
  const videos = Number(refs.videos) || 0;
  const audios = Number(refs.audios) || 0;

  const request = [
    `Kind: ${kind}`,
    kind === 'video' ? `Mode: ${mode}` : null,
    `References provided: ${images} image(s), ${videos} video(s), ${audios} audio(s)`,
    '',
    'Rough idea:',
    idea,
  ].filter((l) => l !== null).join('\n');

  const text = (await chat({ model: MODEL, system: SKILL, user: request })).trim();
  if (!text) throw new Error('enhancer returned empty response');
  return text;
}
