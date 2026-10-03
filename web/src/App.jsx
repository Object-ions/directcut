import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, AuthError, SetupRequiredError, getKey, clearKey } from './api.js';
import { estimateCost, applyServerRates } from './rates.js';
import Login from './components/Login.jsx';
import Setup from './components/Setup.jsx';
import Settings from './components/Settings.jsx';
import ParamsRail from './components/ParamsRail.jsx';
import PromptPanel from './components/PromptPanel.jsx';
import Gallery from './components/Gallery.jsx';
import RefSlots from './components/RefSlots.jsx';
import { startTour, tourSeen } from './tour.js';
import {
  fileType, videoSize, roleInfo, nextTag, appendToPrompt, promptAfterRemoval, videoMode,
  IMAGE_REF_LIMIT, MIN_VIDEO_REF_PIXELS,
} from './refs.js';

const DEFAULT_PARAMS = {
  kind: 'video',
  taskType: 'seedance-2.5',
  duration: 5,
  resolution: '480p',
  size: '2K',
  aspectRatio: '16:9',
};

const MODE_LABEL = {
  text_to_video: 'text → video',
  first_last_frames: 'frames → video',
  omni_reference: 'references → video',
};

const ACTIVE = (g) => g.status === 'queued' || g.status === 'processing';

export default function App() {
  // null until GET /api/setup answers; then the setup screen shows while
  // setup.setup_required is true.
  const [setup, setSetup] = useState(null);
  const [bootError, setBootError] = useState('');
  const [authed, setAuthed] = useState(() => Boolean(getKey()));
  const [authError, setAuthError] = useState('');
  const [settings, setSettings] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [prompt, setPrompt] = useState('');
  // When the current prompt came from the enhancer, this holds the original
  // idea so the before/after pair can be recorded with the generation.
  const [enhancedFrom, setEnhancedFrom] = useState(null);
  const [refs, setRefs] = useState([]);
  const refsRef = useRef(refs);
  refsRef.current = refs;
  const [frames, setFrames] = useState({ start: null, end: null });
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [, setRatesVersion] = useState(0); // bump to re-render after /api/rates lands
  const [enhancerGone, setEnhancerGone] = useState(false);
  const [generations, setGenerations] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState([]);
  const pollTimer = useRef(null);
  const toastId = useRef(0);

  const pushToast = useCallback((message) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 7000);
  }, []);

  const logout = useCallback((message = 'session expired — enter your password again') => {
    clearKey();
    setAuthed(false);
    setSettingsOpen(false);
    setAuthError(message);
  }, []);

  const checkSetup = useCallback(() => {
    api.setupStatus()
      .then((s) => { setSetup(s); setBootError(''); })
      .catch(() => setBootError("can't reach the Directcut server — is it running?"));
  }, []);

  useEffect(checkSetup, [checkSetup]);

  const refresh = useCallback(async () => {
    try {
      setGenerations(await api.generations(50));
    } catch (err) {
      if (err instanceof AuthError) logout();
      else if (err instanceof SetupRequiredError) checkSetup();
    }
  }, [logout, checkSetup]);

  const loadSettings = useCallback(() => {
    api.settings()
      .then((s) => {
        setSettings(s);
        // First visit with no key: open Settings so the fix is one paste away.
        if (!s.openrouter.configured) setSettingsOpen(true);
      })
      .catch((err) => { if (err instanceof AuthError) logout(); });
  }, [logout]);

  const ready = authed && setup && !setup.setup_required;

  useEffect(() => {
    if (ready) loadSettings();
  }, [ready, loadSettings]);

  // The server's rate table is authoritative; the baked-in copy only covers
  // the render until this lands (or if it fails).
  useEffect(() => {
    if (!ready) return;
    api.rates()
      .then((server) => { if (applyServerRates(server)) setRatesVersion((v) => v + 1); })
      .catch(() => {});
  }, [ready]);

  // First visit: run the guided tour once the app is usable (key added,
  // settings closed). The "?" button in the rail replays it.
  const tourStarted = useRef(false);
  useEffect(() => {
    if (tourStarted.current || !ready || !settings?.openrouter.configured || settingsOpen || tourSeen()) return undefined;
    tourStarted.current = true;
    const t = setTimeout(startTour, 500);
    return () => clearTimeout(t);
  }, [ready, settings, settingsOpen]);

  // Video mode isn't picked by hand: it follows what's attached.
  const mode = params.kind === 'video' ? videoMode(frames, refs) : null;

  // Seedance shapes a frames video like its start image, so frame mode
  // defaults to 'auto'; 'auto' only exists there, so fall back when it ends.
  useEffect(() => {
    if (mode === 'first_last_frames') setParams((p) => ({ ...p, aspectRatio: 'auto' }));
  }, [mode]);
  useEffect(() => {
    if (params.aspectRatio === 'auto' && mode !== 'first_last_frames') {
      setParams((p) => ({ ...p, aspectRatio: '16:9' }));
    }
  }, [mode, params.aspectRatio]);

  // Image generation only takes image refs and has no frames.
  useEffect(() => {
    if (params.kind !== 'image') return;
    setFrames({ start: null, end: null });
    setRefs((prev) => prev.filter((r) => r.type === 'image').map((r) => ({ ...r, role: null })));
  }, [params.kind]);

  // Upload files into a target: { slot: 'start'|'end' } for a frame,
  // { role } for a typed video reference, { tray: true } for a plain one.
  // Everything is checked before upload so bad files fail fast and free.
  const attach = useCallback(async (files, target) => {
    for (const file of files) {
      const type = fileType(file);
      if (!type) { pushToast(`unsupported file: ${file.name} (use jpg, png, webp, mp4, mp3 or wav)`); continue; }
      const role = target.role ? roleInfo(target.role) : null;
      const wants = target.slot ? 'image' : role?.type || (params.kind === 'image' ? 'image' : null);
      if (wants && type !== wants) { pushToast(`${file.name}: this slot takes ${wants === 'image' ? 'an' : 'a'} ${wants}`); continue; }
      if (type === 'video') {
        const dim = await videoSize(file);
        if (dim && dim.w * dim.h < MIN_VIDEO_REF_PIXELS) {
          pushToast(`${file.name} is ${dim.w}×${dim.h}: Seedance needs video references of about 640×640 or larger`);
          continue;
        }
      }
      setUploading((n) => n + 1);
      try {
        const { url, filename } = await api.upload(file);
        const base = { url, filename, type, name: file.name };
        if (target.slot) {
          setFrames((f) => ({ ...f, [target.slot]: base }));
          if (target.slot === 'start' && files.length > 1) target = { slot: 'end' };
          continue;
        }
        // Read and write through refsRef (not a setRefs updater) so the
        // prompt phrase is appended exactly once, even under StrictMode.
        const prev = refsRef.current;
        if (params.kind === 'image' && prev.length >= IMAGE_REF_LIMIT) {
          pushToast(`at most ${IMAGE_REF_LIMIT} image references`);
          continue;
        }
        const phrase = role ? role.phrase(nextTag(prev, type)) : null;
        const next = [...prev, { ...base, role: role?.role || null }];
        refsRef.current = next;
        setRefs(next);
        if (phrase) setPrompt((p) => appendToPrompt(p, phrase));
      } catch (err) {
        if (err instanceof AuthError) return logout();
        pushToast(err.message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }, [params.kind, pushToast, logout]);

  // Drop/paste with no explicit slot: in frame mode an image fills the end
  // frame; otherwise it becomes a plain reference.
  const attachLoose = useCallback((files) => {
    if (params.kind === 'video' && frames.start) {
      if (frames.end) return pushToast('remove the start/end frames to add references');
      return attach(files.slice(0, 1), { slot: 'end' });
    }
    return attach(files, { tray: true });
  }, [params.kind, frames, attach, pushToast]);

  function removeRef(index) {
    setPrompt((p) => promptAfterRemoval(p, refs, index));
    setRefs((prev) => prev.filter((_, i) => i !== index));
  }

  // Initial load + poll every 5s while anything is active.
  useEffect(() => {
    if (!ready) return undefined;
    refresh();
    pollTimer.current = setInterval(() => {
      setGenerations((current) => {
        if (current.some(ACTIVE)) {
          Promise.all(current.filter(ACTIVE).map((g) => api.task(g.id).catch(() => null)))
            .then(() => refresh())
            .catch(() => {});
        }
        return current;
      });
    }, 5000);
    return () => clearInterval(pollTimer.current);
  }, [ready, refresh]);

  const cost = estimateCost({ ...params, referenceCount: params.kind === 'image' ? refs.length : 0 });

  // Combinations the server would reject, caught before the click.
  const refsProblem = params.kind === 'video' && !params.taskType.startsWith('seedance-2.5')
    && refs.some((r) => r.type === 'audio') && !refs.some((r) => r.type !== 'audio')
    ? `${params.taskType} needs an image or video reference with a voice, add a character or switch to seedance-2.5`
    : null;

  async function generate() {
    if (!prompt.trim() || busy || uploading > 0 || refsProblem) return;
    setBusy(true);
    try {
      // With an enhancement in play, record the before/after pair: `prompt` is
      // the original idea, `enhanced_prompt` the text actually generated with.
      const body = {
        prompt: enhancedFrom ?? prompt.trim(),
        ...(enhancedFrom ? { enhanced_prompt: prompt.trim() } : {}),
        kind: params.kind,
        task_type: params.taskType,
        aspect_ratio: params.aspectRatio,
        source: 'web',
      };
      if (params.kind === 'video') {
        body.mode = mode;
        body.duration = params.duration;
        body.resolution = params.resolution;
        body.image_urls = mode === 'first_last_frames'
          ? [frames.start, frames.end].filter(Boolean).map((r) => r.url)
          : refs.filter((r) => r.type === 'image').map((r) => r.url);
        body.video_urls = refs.filter((r) => r.type === 'video').map((r) => r.url);
        body.audio_urls = refs.filter((r) => r.type === 'audio').map((r) => r.url);
      } else {
        body.size = params.size;
        body.image_urls = refs.filter((r) => r.type === 'image').map((r) => r.url);
      }
      await api.generate(body);
      await refresh();
    } catch (err) {
      if (err instanceof AuthError) return logout();
      pushToast(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!setup) {
    return (
      <div className="login">
        <div className="login__card">
          <p className="login__hint">{bootError || 'connecting…'}</p>
          {bootError && <button type="button" className="btn" onClick={checkSetup}>retry</button>}
        </div>
      </div>
    );
  }

  if (setup.setup_required) {
    return (
      <Setup
        status={setup}
        onDone={() => {
          setSetup({ ...setup, setup_required: false });
          setAuthError('');
          setAuthed(true);
        }}
      />
    );
  }

  if (!authed) {
    return <Login error={authError} onSubmit={() => { setAuthError(''); setAuthed(true); }} />;
  }

  const keyMissing = settings && !settings.openrouter.configured;

  return (
    <div className="app">
      <ParamsRail params={params} mode={mode} onChange={setParams} onOpenSettings={() => setSettingsOpen(true)} onOpenTour={startTour} />

      <main
        className={`main${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) attachLoose([...e.dataTransfer.files]);
        }}
      >
        {keyMissing && (
          <div className="banner" role="alert">
            <span>Add your OpenRouter key to start generating.</span>
            <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>open settings</button>
          </div>
        )}

        <PromptPanel
          prompt={prompt}
          onPrompt={(next) => {
            setPrompt(next);
            if (!next.trim()) setEnhancedFrom(null);
          }}
          onUseEnhanced={(original, enhanced) => {
            setEnhancedFrom(original.trim());
            setPrompt(enhanced);
          }}
          params={{ ...params, mode }}
          refs={mode === 'first_last_frames' ? [frames.start, frames.end].filter(Boolean) : refs}
          onPasteFiles={attachLoose}
          enhancerAvailable={Boolean(settings?.enhancer) && !enhancerGone}
          onEnhancerGone={() => setEnhancerGone(true)}
          onAuthError={logout}
          onSubmit={generate}
        />

        <RefSlots
          kind={params.kind}
          refs={refs}
          frames={frames}
          uploading={uploading}
          onAttach={attach}
          onRemoveRef={removeRef}
          onClearFrame={(slot) => setFrames((f) => (slot === 'start' ? { start: f.end, end: null } : { ...f, end: null }))}
          onInsertTag={(tag) => setPrompt((p) => appendToPrompt(p, tag))}
        />

        <div className="costbar">
          <code className="costbar__estimate">
            est. cost <strong>{cost == null ? '—' : `$${cost.toFixed(3)}`}</strong>
            <span className="costbar__detail">
              {params.kind === 'video'
                ? ` · ${params.taskType} · ${params.duration}s @ ${params.resolution} · ${MODE_LABEL[mode]}`
                : ` · ${params.taskType} · ${params.size}`}
            </span>
          </code>
          {refsProblem && <span className="costbar__warn" role="alert">{refsProblem}</span>}
          <span className="costbar__hint" aria-hidden="true">⌘⏎</span>
          <button
            type="button"
            className="btn btn--generate"
            disabled={busy || uploading > 0 || !prompt.trim() || cost == null || keyMissing || Boolean(refsProblem)}
            onClick={generate}
          >
            {busy ? 'submitting…' : 'Generate'}
          </button>
        </div>

        <Gallery
          generations={generations}
          onReuse={(p) => {
            setPrompt(p || '');
            setEnhancedFrom(null);
          }}
          onDelete={async (g) => {
            if (!window.confirm(`Delete this ${g.kind} (${g.status})? The media file is removed too.`)) return;
            try {
              await api.remove(g.id);
              await refresh();
            } catch (err) {
              if (err instanceof AuthError) return logout();
              pushToast(err.message);
            }
          }}
          onClearFailed={async () => {
            if (!window.confirm('Delete ALL failed generations?')) return;
            try {
              await api.clearFailed();
              await refresh();
            } catch (err) {
              if (err instanceof AuthError) return logout();
              pushToast(err.message);
            }
          }}
        />
      </main>

      {settingsOpen && settings && (
        <Settings
          settings={settings}
          onSettings={(s) => { setSettings(s); setEnhancerGone(false); }}
          onClose={() => setSettingsOpen(false)}
          onAuthError={() => logout()}
          onLogout={() => logout('signed out')}
        />
      )}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            <button
              type="button"
              aria-label="dismiss"
              onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
