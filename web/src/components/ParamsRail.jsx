import React from 'react';
import {
  videoTaskTypes, imageTaskTypes, VIDEO_ASPECTS, IMAGE_ASPECTS,
  resolutionsFor, sizesFor, maxDurationFor,
} from '../rates.js';

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

export default function ParamsRail({ params, mode, onChange, onOpenSettings }) {
  const { kind, taskType, duration, resolution, size, aspectRatio } = params;
  const set = (patch) => onChange({ ...params, ...patch });

  function setKind(nextKind) {
    if (nextKind === kind) return;
    set(nextKind === 'video'
      ? { kind: 'video', taskType: 'seedance-2.5', resolution: '480p', aspectRatio: '16:9' }
      : { kind: 'image', taskType: 'seedream-5-pro', size: '1K', aspectRatio: '1:1' });
  }

  function setTaskType(next) {
    const patch = { taskType: next };
    if (kind === 'video' && !resolutionsFor(next).includes(resolution)) {
      patch.resolution = resolutionsFor(next)[0];
    }
    if (kind === 'image' && !sizesFor(next).includes(size)) {
      patch.size = sizesFor(next)[0];
    }
    if (kind === 'video' && duration > maxDurationFor(next)) {
      patch.duration = maxDurationFor(next);
    }
    set(patch);
  }

  const aspects = kind === 'video'
    ? (mode === 'first_last_frames' ? [...VIDEO_ASPECTS, 'auto'] : VIDEO_ASPECTS)
    : IMAGE_ASPECTS;

  return (
    <aside className="rail">
      <div className="rail__brand">
        <span><span className="rail__mark">▞</span> DIRECTCUT</span>
        <button type="button" className="rail__settings" aria-label="settings" title="settings" onClick={onOpenSettings}>
          ⚙
        </button>
      </div>

      <Field label="kind">
        <div className="segmented">
          {['video', 'image'].map((k) => (
            <button
              key={k}
              type="button"
              className={kind === k ? 'is-active' : ''}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {k}
            </button>
          ))}
        </div>
      </Field>

      <Field label="model">
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
          {(kind === 'video' ? videoTaskTypes() : imageTaskTypes()).map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </Field>

      {kind === 'video' && (
        <>
          <Field label={`duration · ${duration}s`}>
            <input
              type="range"
              min="4"
              max={maxDurationFor(taskType)}
              step="1"
              value={duration}
              onChange={(e) => set({ duration: Number(e.target.value) })}
            />
          </Field>

          <Field label="resolution">
            <div className="segmented">
              {resolutionsFor(taskType).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={resolution === r ? 'is-active' : ''}
                  aria-pressed={resolution === r}
                  onClick={() => set({ resolution: r })}
                >
                  {r}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}

      {kind === 'image' && (
        <Field label="size">
          <div className="segmented">
            {sizesFor(taskType).map((s) => (
              <button
                key={s}
                type="button"
                className={size === s ? 'is-active' : ''}
                aria-pressed={size === s}
                onClick={() => set({ size: s })}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
      )}

      <Field label="aspect ratio">
        <div className="aspect-grid">
          {aspects.map((a) => (
            <button
              key={a}
              type="button"
              className={aspectRatio === a ? 'is-active' : ''}
              aria-pressed={aspectRatio === a}
              onClick={() => set({ aspectRatio: a })}
            >
              {a}
            </button>
          ))}
        </div>
      </Field>
    </aside>
  );
}
