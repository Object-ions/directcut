import React, { useRef, useState } from 'react';
import { api, AuthError } from '../api.js';

const TYPE_BY_EXT = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image',
  mp4: 'video',
  mp3: 'audio', wav: 'audio',
};

// Assign @image1-style tags in upload order within each type.
export function tagRefs(refs) {
  const counters = { image: 0, video: 0, audio: 0 };
  return refs.map((r) => {
    counters[r.type] += 1;
    return { ...r, tag: `@${r.type}${counters[r.type]}` };
  });
}

export default function PromptPanel({
  prompt, onPrompt, onUseEnhanced, params, refs, onRefs, enhancerAvailable, onEnhancerGone, onAuthError, onSubmit,
}) {
  const [enhanced, setEnhanced] = useState(null);
  const [enhancing, setEnhancing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const tagged = tagRefs(refs);

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

  async function upload(files) {
    setError('');
    setUploading(true);
    try {
      for (const file of files) {
        const ext = file.name.split('.').pop().toLowerCase();
        const type = TYPE_BY_EXT[ext];
        if (!type) {
          setError(`unsupported file type: .${ext}`);
          continue;
        }
        const { url, filename } = await api.upload(file);
        onRefs((prev) => [...prev, { url, filename, type, name: file.name }]);
      }
    } catch (err) {
      if (err instanceof AuthError) return onAuthError();
      setError(err.message);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
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

      <div className="refs">
        <div className="refs__chips">
          {tagged.map((r, i) => (
            <span key={r.url} className={`chip chip--${r.type}`}>
              {r.type === 'image' && <img src={r.url} alt="" />}
              <code>{r.tag}</code>
              <span className="chip__name">{r.name}</span>
              <button
                type="button"
                aria-label={`remove ${r.tag}`}
                onClick={() => onRefs((prev) => prev.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="chip chip--add"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? 'uploading…' : '+ add reference'}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.webp,.mp4,.mp3,.wav"
          hidden
          onChange={(e) => upload([...e.target.files])}
        />
        {tagged.length > 0 && (
          <p className="refs__hint">reference these in the prompt as {tagged.map((r) => r.tag).join(', ')}</p>
        )}
      </div>

      {error && <p className="prompt__error">{error}</p>}
    </section>
  );
}
