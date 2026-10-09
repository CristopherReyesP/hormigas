import type { ObjectiveState } from '../game/systems/ObjectiveSystem';
import { PixelIcon } from './console/PixelIcon';
import { stripEmoji } from './console/format';

interface ObjectivePanelProps {
  objective: ObjectiveState | null;
}

/** Compact objective tracker: a small carapace plate under the top strip, top-left. */
export function ObjectivePanel({ objective }: ObjectivePanelProps) {
  const ratio = objective && objective.target > 0 ? Math.min(1, objective.progress / objective.target) : 1;

  return (
    <aside className="objective-plate" aria-label="Objetivo actual">
      <div className="chrome-plate">
      <div className="chrome-plate-inner objective-inner">
        <div className="objective-head">
          <PixelIcon name="flag" />
          <span className="hud-label">OBJETIVO</span>
          {objective && (
            <span className="hud-dim objective-count">
              {objective.completedCount}/{objective.totalCount}
            </span>
          )}
        </div>
        {objective ? (
          <>
            <div className="objective-title">{stripEmoji(objective.title)}</div>
            <div className="objective-desc">{stripEmoji(objective.description)}</div>
            <div className="hud-bar">
              <div
                className="hud-bar-fill"
                style={{
                  width: `${ratio * 100}%`,
                  backgroundColor: ratio >= 1 ? 'var(--chrome-accent)' : 'var(--chrome-warn)',
                }}
              />
            </div>
            <div className="hud-dim objective-progress">
              {objective.progress} / {objective.target}
            </div>
          </>
        ) : (
          <div className="objective-title">¡Todos cumplidos! La colonia domina el territorio.</div>
        )}
      </div>
      </div>
    </aside>
  );
}
