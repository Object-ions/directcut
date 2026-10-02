import React, { useRef, useState } from 'react';
import { ACCEPT, VIDEO_ROLES, IMAGE_REF_LIMIT, roleInfo, tagRefs } from '../refs.js';

// Drop target wrapper: highlights while dragging files over it and stops the
// drop from bubbling to the page-wide "drop anywhere" handler.
function useDrop(onFiles, disabled) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (e) => {
        if (disabled || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
      },
    },
  };
}

function FrameSlot({ label, frame, disabled, hint, onPick, onFiles, onClear }) {
  const drop = useDrop(onFiles, disabled);
  return (
    <div
      className={`frame${frame ? ' frame--filled' : ''}${drop.over ? ' is-over' : ''}${disabled ? ' is-disabled' : ''}`}
      {...drop.props}
    >
      {frame ? (
        <>
          <img src={frame.url} alt={`${label} frame`} />
          <span className="frame__label">{label}</span>
          <button type="button" className="frame__clear" aria-label={`remove ${label} frame`} onClick={onClear}>×</button>
        </>
      ) : (
        <button type="button" className="frame__empty" disabled={disabled} onClick={onPick}>
          <span className="frame__label">{label}</span>
          <span className="frame__plus">+</span>
          <span className="frame__hint">{hint}</span>
        </button>
      )}
    </div>
  );
}

function RefCard({ r, onInsert, onRemove }) {
  const info = roleInfo(r.role);
  return (
    <div className={`refcard refcard--${r.type}`}>
      <button type="button" className="refcard__body" title={`insert ${r.tag} into the prompt`} onClick={() => onInsert(r.tag)}>
        <span className="refcard__media">
          {r.type === 'image' && <img src={r.url} alt="" />}
          {r.type === 'video' && <video src={r.url} muted playsInline preload="metadata" />}
          {r.type === 'audio' && <span className="refcard__icon">🔊</span>}
        </span>
        <code className="refcard__tag">{r.tag}</code>
        <span className="refcard__role">{info ? info.label : r.name}</span>
      </button>
      <button type="button" className="refcard__remove" aria-label={`remove ${r.tag}`} onClick={onRemove}>×</button>
    </div>
  );
}

export default function RefSlots({ kind, refs, frames, uploading, onAttach, onRemoveRef, onClearFrame, onInsertTag }) {
  const input = useRef(null);
  const [pick, setPick] = useState(null); // { accept, target } for the shared file input
  const tagged = tagRefs(refs);
  const refsLocked = kind === 'video' && Boolean(frames.start);
  const framesLocked = kind === 'video' && refs.length > 0;
  const trayDrop = useDrop((files) => onAttach(files, { tray: true }), refsLocked);

  function choose(accept, target) {
    setPick({ accept, target });
    // Let React apply the new accept attribute before opening the picker.
    setTimeout(() => input.current?.click(), 0);
  }

  const busy = uploading > 0;

  return (
    <section className="slots">
      {kind === 'video' && (
        <div className="slots__group">
          <span className="field__label">
            frames <small>· optional · the video starts (and ends) on these images</small>
          </span>
          <div className="frames">
            <FrameSlot
              label="start"
              frame={frames.start}
              disabled={framesLocked}
              hint={framesLocked ? 'remove references to use frames' : 'image · drop or click'}
              onPick={() => choose(ACCEPT.image, { slot: 'start' })}
              onFiles={(files) => onAttach(files, { slot: 'start' })}
              onClear={() => onClearFrame('start')}
            />
            <span className="frames__arrow" aria-hidden="true">→</span>
            <FrameSlot
              label="end"
              frame={frames.end}
              disabled={framesLocked || !frames.start}
              hint={frames.start ? 'optional' : 'add a start frame first'}
              onPick={() => choose(ACCEPT.image, { slot: 'end' })}
              onFiles={(files) => onAttach(files, { slot: 'end' })}
              onClear={() => onClearFrame('end')}
            />
          </div>
        </div>
      )}

      <div className="slots__group">
        <span className="field__label">
          references
          <small>
            {kind === 'video'
              ? ' · click one to insert its tag into the prompt'
              : ` · up to ${IMAGE_REF_LIMIT} images · click one to insert its tag`}
          </small>
        </span>
        <div className={`tray${trayDrop.over ? ' is-over' : ''}${refsLocked ? ' is-disabled' : ''}`} {...trayDrop.props}>
          {tagged.map((r, i) => (
            <RefCard key={r.url} r={r} onInsert={onInsertTag} onRemove={() => onRemoveRef(i)} />
          ))}

          {refsLocked ? (
            <span className="tray__note">references can't be mixed with start/end frames, remove the frames to add some</span>
          ) : kind === 'video' ? (
            <>
              {VIDEO_ROLES.map((role) => (
                <button
                  key={role.role}
                  type="button"
                  className="tray__add"
                  disabled={busy}
                  onClick={() => choose(ACCEPT[role.type], { role: role.role })}
                  title={`add a ${role.type} as ${role.label} reference`}
                >
                  <span aria-hidden="true">{role.icon}</span> {role.label}
                  <small>{role.type}</small>
                </button>
              ))}
              <button type="button" className="tray__add tray__add--any" disabled={busy} onClick={() => choose(ACCEPT.any, { tray: true })}>
                + any file
              </button>
            </>
          ) : (
            refs.length < IMAGE_REF_LIMIT && (
              <button type="button" className="tray__add tray__add--any" disabled={busy} onClick={() => choose(ACCEPT.image, { tray: true })}>
                + add image
              </button>
            )
          )}
          {busy && <span className="tray__note">uploading…</span>}
        </div>
        <p className="slots__hint">drop files anywhere on the page, or paste an image into the prompt (⌘V)</p>
      </div>

      <input
        ref={input}
        type="file"
        multiple={!pick?.target?.slot}
        accept={pick?.accept || ACCEPT.any}
        hidden
        onChange={(e) => {
          const files = [...e.target.files];
          e.target.value = '';
          if (files.length && pick) onAttach(files, pick.target);
        }}
      />
    </section>
  );
}
