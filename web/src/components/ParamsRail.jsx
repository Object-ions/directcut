import React from 'react';
import {
  modelsFor, modelFor, resolutionsFor, sizesFor, aspectsFor, durationsContiguous, fitParams,
} from '../rates.js';

function Field({ label, children }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
    </label>
  );
}

function Segmented({ options, value, onPick, format = String }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          className={value === o ? 'is-active' : ''}
          aria-pressed={value === o}
          onClick={() => onPick(o)}
        >
          {format(o)}
        </button>
      ))}
    </div>
  );
}

export default function ParamsRail({ params, mode, onChange, onOpenSettings, onOpenTour }) {
  const { kind, taskType, duration, resolution, size, aspectRatio, sound } = params;
  const model = modelFor(kind, taskType);
  const set = (patch) => onChange({ ...params, ...patch });

  function setKind(nextKind) {
    if (nextKind === kind) return;
    const first = modelsFor(nextKind)[0];
    onChange(fitParams({ ...params, kind: nextKind, aspectRatio: nextKind === 'video' ? '16:9' : '1:1' }, first, mode));
  }

  const aspects = kind === 'video' ? aspectsFor(model, mode) : model.aspects;

  return (
    <aside className="rail">
      <div className="rail__brand">
        <span><span className="rail__mark">▞</span> DIRECTCUT</span>
        <span className="rail__actions">
          <button type="button" className="rail__settings" aria-label="how to use" title="how to use" onClick={onOpenTour}>
            ?
          </button>
          <button type="button" className="rail__settings" aria-label="settings" title="settings" onClick={onOpenSettings}>
            ⚙
          </button>
        </span>
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
        <select value={model.key} onChange={(e) => onChange(fitParams(params, modelFor(kind, e.target.value), mode))}>
          {modelsFor(kind).map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        {model.note && <small className="field__note">{model.note}</small>}
      </Field>

      {kind === 'video' && (
        <>
          <Field label={`duration · ${duration}s`}>
            {durationsContiguous(model) ? (
              <input
                type="range"
                min={model.durations[0]}
                max={model.durations[model.durations.length - 1]}
                step="1"
                value={duration}
                onChange={(e) => set({ duration: Number(e.target.value) })}
              />
            ) : (
              <Segmented options={model.durations} value={duration} onPick={(d) => set({ duration: d })} format={(d) => `${d}s`} />
            )}
          </Field>

          <Field label="resolution">
            <Segmented options={resolutionsFor(model)} value={resolution} onPick={(r) => set({ resolution: r })} />
          </Field>

          {model.sound && (
            <Field label="sound">
              <Segmented options={['on', 'off']} value={sound === false ? 'off' : 'on'} onPick={(v) => set({ sound: v === 'on' })} />
            </Field>
          )}
        </>
      )}

      {kind === 'image' && (
        <Field label={model.sizeParam === 'quality' ? 'quality' : 'size'}>
          <Segmented options={sizesFor(model)} value={size} onPick={(s) => set({ size: s })} />
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
