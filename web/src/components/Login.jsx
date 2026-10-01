import React, { useState } from 'react';
import { setKey } from '../api.js';

export default function Login({ onSubmit, error }) {
  const [value, setValue] = useState('');

  function submit(e) {
    e.preventDefault();
    if (!value.trim()) return;
    setKey(value.trim());
    onSubmit();
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <div className="login__brand">
          <span className="login__mark">▞</span> DIRECTCUT
        </div>
        <p className="login__hint">password</p>
        <input
          type="password"
          autoFocus
          aria-label="password"
          autoComplete="current-password"
          placeholder="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <p className="login__error">{error}</p>}
        <button type="submit" className="btn btn--generate">Enter</button>
      </form>
    </div>
  );
}
