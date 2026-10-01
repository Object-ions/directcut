import React, { useEffect, useRef, useState } from 'react';
import { api, AuthError, setKey } from '../api.js';

// Settings dialog: OpenRouter key (replace/remove) and the access password.
// Values configured in server/.env are shown read-only — env always wins.
export default function Settings({ settings, onSettings, onClose, onAuthError, onLogout }) {
  const dialog = useRef(null);
  const [newKey, setNewKey] = useState('');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [msg, setMsg] = useState(null); // { kind: 'ok' | 'error', text }
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);

  async function run(fn, okText) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: 'ok', text: okText });
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setMsg({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const saveKey = (e) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    run(async () => {
      onSettings(await api.saveOpenrouterKey(newKey.trim()));
      setNewKey('');
    }, 'OpenRouter key saved and verified.');
  };

  const removeKey = () => {
    if (!window.confirm('Remove the saved OpenRouter key? Generation stops until you add one again.')) return;
    run(async () => onSettings(await api.removeOpenrouterKey()), 'Key removed.');
  };

  const changePassword = (e) => {
    e.preventDefault();
    if (next.length < 8) return setMsg({ kind: 'error', text: 'new password must be at least 8 characters' });
    run(async () => {
      await api.changePassword(current, next);
      setKey(next);
      setCurrent('');
      setNext('');
    }, 'Password changed.');
  };

  const { openrouter, password } = settings;

  return (
    <dialog ref={dialog} className="settings" onClose={onClose}>
      <div className="settings__head">
        <h2>settings</h2>
        <button type="button" className="btn btn--ghost" aria-label="close" onClick={onClose}>×</button>
      </div>

      <section className="settings__section">
        <h3>OpenRouter key</h3>
        <p className="settings__status">
          {openrouter.configured
            ? <>✓ connected <code>{openrouter.masked}</code></>
            : <span className="settings__warn">not set — generation is disabled</span>}
        </p>
        {openrouter.source === 'env' ? (
          <p className="settings__note">Set by <code>OPENROUTER_API_KEY</code> in <code>server/.env</code>. Change it there.</p>
        ) : (
          <form className="settings__row" onSubmit={saveKey}>
            <input
              type="password"
              autoComplete="off"
              spellCheck="false"
              aria-label="new OpenRouter key"
              placeholder={openrouter.configured ? 'paste a new key to replace' : 'sk-or-v1-…'}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
            <button type="submit" className="btn" disabled={busy || !newKey.trim()}>save</button>
            {openrouter.configured && (
              <button type="button" className="btn btn--danger" disabled={busy} onClick={removeKey}>remove</button>
            )}
          </form>
        )}
        <p className="settings__note">
          Get or manage keys at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>.
          The key is stored only on this server and never sent back to the browser.
        </p>
      </section>

      <section className="settings__section">
        <h3>password</h3>
        {password.source === 'env' ? (
          <p className="settings__note">Set by <code>APP_SECRET</code> in <code>server/.env</code>. Change it there.</p>
        ) : (
          <form className="settings__stack" onSubmit={changePassword}>
            <input
              type="password"
              autoComplete="current-password"
              aria-label="current password"
              placeholder="current password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              aria-label="new password"
              placeholder="new password (8+ characters)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <button type="submit" className="btn" disabled={busy || !current || !next}>change password</button>
          </form>
        )}
      </section>

      {msg && <p className={`settings__msg settings__msg--${msg.kind}`} role="status">{msg.text}</p>}

      <div className="settings__foot">
        <button type="button" className="btn btn--ghost" onClick={onLogout}>sign out</button>
      </div>
    </dialog>
  );
}
