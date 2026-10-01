import React, { useState } from 'react';
import { api, setKey } from '../api.js';

// First-run screen: choose the access password and paste an OpenRouter key.
// Shown only while the server reports setup_required.
export default function Setup({ status, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const keyFromEnv = status.openrouter_key_from_env;

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) return setError('password must be at least 8 characters');
    if (password !== confirm) return setError('passwords do not match');
    if (!keyFromEnv && !openrouterKey.trim()) return setError('paste your OpenRouter key');
    setBusy(true);
    setError('');
    try {
      await api.setup({
        password,
        openrouter_key: keyFromEnv ? undefined : openrouterKey.trim(),
        setup_code: status.needs_code ? code.trim() : undefined,
      });
      setKey(password);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card login__card--wide" onSubmit={submit}>
        <div className="login__brand">
          <span className="login__mark">▞</span> DIRECTCUT
        </div>
        <p className="login__hint">
          Welcome. Two things and you're generating — both stay on this machine.
        </p>

        <label className="field">
          <span className="field__label">1 · choose a password</span>
          <input
            type="password"
            autoFocus
            autoComplete="new-password"
            placeholder="at least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            autoComplete="new-password"
            aria-label="confirm password"
            placeholder="type it again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        {keyFromEnv ? (
          <p className="login__hint">✓ OpenRouter key already set in the server config.</p>
        ) : (
          <label className="field">
            <span className="field__label">2 · paste your OpenRouter key</span>
            <input
              type="password"
              autoComplete="off"
              spellCheck="false"
              placeholder="sk-or-v1-…"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
            />
            <span className="login__hint">
              No key yet? Create one at{' '}
              <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>
              {' '}and add a few dollars of credit. You pay OpenRouter directly, per generation.
            </span>
          </label>
        )}

        {status.needs_code && (
          <label className="field">
            <span className="field__label">setup code</span>
            <input
              autoComplete="off"
              spellCheck="false"
              placeholder="shown in the server's terminal"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <span className="login__hint">
              You're connecting from another machine, so confirm you own this server.
            </span>
          </label>
        )}

        {error && <p className="login__error">{error}</p>}
        <button type="submit" className="btn btn--generate" disabled={busy}>
          {busy ? 'checking key…' : 'Start'}
        </button>
      </form>
    </div>
  );
}
