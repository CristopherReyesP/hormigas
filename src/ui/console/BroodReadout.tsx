import type { BroodPipeline } from './brood';
import { ROLE_ICON } from './format';
import { PixelIcon } from './PixelIcon';

/**
 * Always-visible brood column: DESPENSA → REINA → INCUBANDO → NACE with a count
 * per stage, the eggs in progress, and the first thing blocking the pipeline.
 */
export function BroodReadout({ pipeline }: { pipeline: BroodPipeline }) {
  const { stages, eggs, hiddenEggs, status, count } = pipeline;
  const alarming = status.tone === 'blocked' || status.tone === 'warn';
  return (
    <section className="info-col brood" aria-label="Cría">
      <h3 className="hud-label">CRÍA · {count}</h3>
      <ol className="brood-flow">
        {stages.map((stage) => (
          <li key={stage.id} className={`brood-stage brood-stage--${stage.tone}`} title={stage.hint}>
            <span className="brood-stage-label">{stage.label}</span>
            <span className="brood-stage-value">
              <PixelIcon name={stage.icon} />
              {stage.value}
            </span>
          </li>
        ))}
      </ol>
      {eggs.length > 0 && (
        <div className="brood-eggs">
          {eggs.map((egg, i) => (
            <span key={i} className={`brood-egg brood-egg--${egg.state}`} title={egg.title}>
              <PixelIcon name={ROLE_ICON[egg.role]} />
              <span className="hud-bar brood-egg-bar">
                <span className="hud-bar-fill" style={{ width: `${Math.round(egg.progress * 100)}%` }} />
              </span>
              <span className="brood-egg-tag">{egg.tag}</span>
            </span>
          ))}
          {hiddenEggs > 0 && <span className="brood-more">+{hiddenEggs} más</span>}
        </div>
      )}
      <div className={`brood-status brood-status--${status.tone}`} role="status">
        {alarming && <PixelIcon name="alert" />}
        <span className="brood-status-text">{status.text}</span>
        {status.more > 0 && <span className="brood-more">+{status.more}</span>}
      </div>
    </section>
  );
}
