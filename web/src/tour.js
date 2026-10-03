import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

// First-run guided tour. Runs once per browser (remembered in localStorage,
// which can be unavailable, so every access is guarded) and can be replayed
// from the "?" button next to settings.
const SEEN_KEY = 'directcut_tour_seen';

export function tourSeen() {
  try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

function markSeen() {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode: replays next time */ }
}

const STEPS = [
  {
    element: '.rail',
    title: 'Pick what to make',
    description: '<b>video</b> (Seedance) or <b>image</b> (Seedream), the model, length, resolution and shape. '
      + '<b>seedance-2-fast</b> is cheapest for drafts; <b>seedance-2.5</b> is best quality.',
    side: 'right',
  },
  {
    element: '.prompt textarea',
    title: 'Describe the shot',
    description: 'Write what should happen, like a director: subject, action, setting, camera, mood. '
      + 'Press <b>⌘⏎</b> to generate.',
  },
  {
    element: '.prompt__head .btn--ghost',
    title: 'Enhance ✦',
    description: 'Turns a rough idea into a detailed prompt. You see before/after and choose; it never generates on its own.',
  },
  {
    element: '.frames',
    title: 'Start & end frames',
    description: 'Drop an image in <b>START</b> and the video opens on exactly that picture. '
      + 'Add an <b>END</b> image and it animates from one to the other. The video takes the start image\'s shape.',
  },
  {
    element: '.tray',
    title: 'References',
    description: '👤 <b>character</b>: keep a person or product consistent<br>'
      + '🎨 <b>style</b>: borrow a look, palette or lighting<br>'
      + '🎥 <b>motion</b>: copy camera movement from a clip (640×640+)<br>'
      + '🔊 <b>voice</b>: make someone say the line in an audio file<br><br>'
      + 'Each one writes its <code>@tag</code> into your prompt; click a card to insert its tag again. '
      + 'Frames and references can\'t be mixed in one video.',
  },
  {
    element: '.slots__hint',
    title: 'Shortcuts',
    description: 'Drag files anywhere on the page, or paste an image straight into the prompt with <b>⌘V</b>.',
  },
  {
    element: '.costbar',
    title: 'Check the price, then Generate',
    description: 'You see the estimated cost before every run, and a daily cap protects you. '
      + 'You pay OpenRouter\'s price, nothing on top. Images take up to a minute or two, videos a few minutes.',
  },
  {
    element: '.gallery',
    title: 'Your gallery',
    description: 'Everything you make is saved on this computer. Play, download, reuse a prompt or delete. '
      + 'Replay this tour anytime with the <b>?</b> button at the top left.',
  },
];

export function startTour() {
  // Skip steps whose element isn't on screen (e.g. Enhance without a key, or
  // the frames row in image mode).
  const steps = STEPS
    .filter((s) => document.querySelector(s.element))
    .map(({ element, title, description, side }) => ({
      element,
      popover: { title, description, ...(side ? { side } : {}) },
    }));
  if (!steps.length) return;
  const tour = driver({
    steps,
    showProgress: true,
    progressText: '{{current}} / {{total}}',
    nextBtnText: 'next →',
    prevBtnText: '← back',
    doneBtnText: 'start creating',
    popoverClass: 'dc-tour',
    overlayOpacity: 0.72,
    stagePadding: 6,
    stageRadius: 8,
    smoothScroll: true,
    onDestroyed: markSeen,
  });
  tour.drive();
}
