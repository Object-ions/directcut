import React, { useState } from 'react';
import { api, AuthError } from '../api.js';

export default function PromptPanel({
  prompt, onPrompt, onUseEnhanced, params, refs, onPasteFiles, enhancerAvailable, onEnhancerGone, onAuthError, onSubmit,
}) {
  const [enhanced, setEnhanced] = useState(null);
  const [enhancing, setEnhancing] = useState(false);
  const [error, setError] = useState('');

  async function enhance() {
    if (!prompt.trim() || enhancing) return;
    setError('');
    setEnhancing(true);
    try {
      const counts = { images: 0, videos: 0, audios: 0 };
      for (const r of refs) counts[`${r.type}s`] += 1;
      const { enhanced_prompt } = await api.enhance({
        idea: prompt,
        kind: params.kind,
        mode: params.mode,
        refs: counts,
      });
      setEnhanced(enhanced_prompt);
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      if (err.status === 501) onEnhancerGone();
      else setError(err.message);
    } finally {
      setEnhancing(false);
    }
  }

  return (
    <section className="prompt">
      <div className="prompt__head">
        <span className="field__label">prompt</span>
        {enhancerAvailable && (
          <button
            type="button"
            className="btn btn--ghost"
            disabled={enhancing || !prompt.trim()}
            onClick={enhance}
          >
            {enhancing ? 'enhancing…' : 'Enhance ✦'}
          </button>
        )}
      </div>

      <textarea
        value={prompt}
        aria-label="prompt"
        onChange={(e) => onPrompt(e.target.value)}
        onPaste={(e) => {
          const files = [...(e.clipboardData?.files || [])];
          if (!files.length) return;
          e.preventDefault();
          onPasteFiles(files);
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            onSubmit?.();
          }
        }}
        placeholder={
          params.kind === 'video'
            ? 'Describe the shot… e.g. "a tabby cat leaps between rooftops at sunset, cinematic"'
            : 'Describe the image…'
        }
      />

      {enhanced && (
        <div className="diff">
          <div className="diff__col diff__col--before">
            <span className="field__label">before</span>
            <p>{prompt}</p>
          </div>
          <div className="diff__col diff__col--after">
            <span className="field__label">enhanced</span>
            <p>{enhanced}</p>
            <div className="diff__actions">
              <button
                type="button"
                className="btn"
                onClick={() => { onUseEnhanced(prompt, enhanced); setEnhanced(null); }}
              >
                Use this
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setEnhanced(null)}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <p className="prompt__error">{error}</p>}
    </section>
  );
}
