import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, AuthError, SetupRequiredError, getKey, clearKey } from './api.js';
import { estimateCost, applyServerRates } from './rates.js';
import Login from './components/Login.jsx';
import Setup from './components/Setup.jsx';
import Settings from './components/Settings.jsx';
import ParamsRail from './components/ParamsRail.jsx';
import PromptPanel from './components/PromptPanel.jsx';
import Gallery from './components/Gallery.jsx';

const DEFAULT_PARAMS = {
  kind: 'video',
  taskType: 'seedance-2.5',
  mode: 'text_to_video',
  duration: 5,
  resolution: '480p',
  size: '2K',
  aspectRatio: '16:9',
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

  // Refs updates come as updater functions (uploads are sequential and must
  // not clobber each other). Mode follows the refs: first attach flips
  // text_to_video → omni_reference, removing the last one flips it back.
  const handleRefs = useCallback((update) => {
    setRefs((prev) => {
      const next = typeof update === 'function' ? update(prev) : update;
      if (params.kind === 'video') {
        if (next.length && !prev.length && params.mode === 'text_to_video') {
          setParams((p) => ({ ...p, mode: 'omni_reference' }));
        } else if (!next.length && prev.length && params.mode === 'omni_reference') {
          setParams((p) => ({ ...p, mode: 'text_to_video' }));
        }
      }
      return next;
    });
  }, [params.kind, params.mode]);

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

  const cost = estimateCost(params);

  async function generate() {
    if (!prompt.trim() || busy) return;
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
        body.mode = params.mode;
        body.duration = params.duration;
        body.resolution = params.resolution;
        body.image_urls = refs.filter((r) => r.type === 'image').map((r) => r.url);
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
      <ParamsRail params={params} onChange={setParams} onOpenSettings={() => setSettingsOpen(true)} />

      <main className="main">
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
          params={params}
          refs={refs}
          onRefs={handleRefs}
          enhancerAvailable={Boolean(settings?.enhancer) && !enhancerGone}
          onEnhancerGone={() => setEnhancerGone(true)}
          onAuthError={logout}
          onSubmit={generate}
        />

        <div className="costbar">
          <code className="costbar__estimate">
            est. cost <strong>{cost == null ? '—' : `$${cost.toFixed(3)}`}</strong>
            <span className="costbar__detail">
              {params.kind === 'video'
                ? ` · ${params.taskType} · ${params.duration}s @ ${params.resolution}`
                : ` · ${params.taskType} · ${params.size}`}
            </span>
          </code>
          <span className="costbar__hint" aria-hidden="true">⌘⏎</span>
          <button
            type="button"
            className="btn btn--generate"
            disabled={busy || !prompt.trim() || cost == null || keyMissing}
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
