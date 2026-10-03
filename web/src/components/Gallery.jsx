import React from 'react';

function Badge({ status }) {
  return <span className={`badge badge--${status}`}>{status}</span>;
}

const ACTIVE = (status) => status === 'queued' || status === 'processing';

function Media({ g }) {
  if (!g.url) {
    return (
      <div className={`card__placeholder${ACTIVE(g.status) ? ' card__placeholder--loading' : ''}`}>
        {g.status === 'failed' ? '✕' : '…'}
      </div>
    );
  }
  if (g.kind === 'video') return <video src={g.url} controls preload="metadata" />;
  return <img src={g.url} alt={g.prompt?.slice(0, 60) || ''} loading="lazy" />;
}

// Full parameter record for a generation, collapsed by default.
function Params({ g }) {
  const rows = [
    ['id', g.id],
    ['model', g.task_type],
    g.mode && ['mode', g.mode],
    g.params?.duration && ['duration', `${g.params.duration}s`],
    g.params?.resolution && ['resolution', g.params.resolution],
    g.params?.size && ['size', g.params.size],
    g.params?.aspect_ratio && ['aspect', g.params.aspect_ratio],
    ['refs', [
      g.params?.image_urls?.length && `${g.params.image_urls.length} image`,
      g.params?.video_urls?.length && `${g.params.video_urls.length} video`,
      g.params?.audio_urls?.length && `${g.params.audio_urls.length} audio`,
    ].filter(Boolean).join(', ') || 'none'],
    g.cost_estimate != null && ['est. cost', `$${g.cost_estimate.toFixed(3)}`],
    ['source', g.source],
    ['created', g.created_at],
    g.completed_at && ['completed', g.completed_at],
  ].filter(Boolean);
  return (
    <details className="card__details">
      <summary>params</summary>
      <dl>
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </React.Fragment>
        ))}
        {g.enhanced_prompt && (
          <>
            <dt>idea</dt>
            <dd>{g.prompt}</dd>
            <dt>enhanced</dt>
            <dd>{g.enhanced_prompt}</dd>
          </>
        )}
      </dl>
    </details>
  );
}

export default function Gallery({ generations, onReuse, onDelete, onClearFailed }) {
  if (!generations.length) {
    return (
      <section className="gallery gallery--empty">
        <p>nothing generated yet</p>
        <p className="gallery__empty-hint">
          describe a shot above and hit Generate: an image costs ~$0.04–0.09
          and takes up to a minute or two; a 5s video is ~$0.23–0.55 and takes a few minutes
        </p>
      </section>
    );
  }
  const failedCount = generations.filter((g) => g.status === 'failed').length;
  return (
    <section className="gallery">
      {failedCount > 0 && (
        <div className="gallery__bar">
          <button type="button" className="btn btn--ghost btn--danger" onClick={onClearFailed}>
            clear failed ({failedCount})
          </button>
        </div>
      )}
      {generations.map((g) => (
        <article key={g.id} className="card">
          <div className="card__media"><Media g={g} /></div>
          <div className="card__body">
            <div className="card__meta">
              <Badge status={g.status} />
              <code className="card__params">
                {g.task_type}
                {g.kind === 'video' && g.params?.duration ? ` · ${g.params.duration}s` : ''}
                {g.params?.resolution ? ` · ${g.params.resolution}` : ''}
                {g.params?.size ? ` · ${g.params.size}` : ''}
                {g.cost_estimate != null ? ` · $${g.cost_estimate.toFixed(3)}` : ''}
              </code>
            </div>
            <p className="card__prompt" title={g.prompt}>{g.prompt}</p>
            {g.error && <p className="card__error">{g.error}</p>}
            <Params g={g} />
            <div className="card__actions">
              {g.url && (
                <a className="btn btn--ghost" href={g.url} download target="_blank" rel="noreferrer">
                  download
                </a>
              )}
              <button type="button" className="btn btn--ghost" onClick={() => onReuse(g.prompt)}>
                reuse prompt
              </button>
              <button type="button" className="btn btn--ghost btn--danger" onClick={() => onDelete(g)}>
                delete
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
