import { useState, type CSSProperties } from 'react';
import type { ObjectiveState } from '../game/systems/ObjectiveSystem';
import { PixelIcon } from './console/PixelIcon';
import { stripEmoji } from './console/format';

interface ObjectivePanelProps {
  objective: ObjectiveState | null;
}

/**
 * Objective tracker under the top strip, top-left. It starts folded into a
 * small OBJETIVOS toggle so the opening cinematic plays unobstructed; a
 * click unfolds the full plate and folds it back.
 */
export function ObjectivePanel({ objective }: ObjectivePanelProps) {
  const [open, setOpen] = useState(false);
  return <ObjectivePanelView objective={objective} open={open} onToggle={() => setOpen((o) => !o)} />;
}

interface ObjectivePanelViewProps extends ObjectivePanelProps {
  open: boolean;
  onToggle: () => void;
}

/** Folded, the plate shrinks to its header row. */
const FOLDED_PLATE: CSSProperties = { width: 'auto' };
const FOLDED_INNER: CSSProperties = { padding: '6px 12px' };
/** The header row is the toggle: a bare button that keeps the plate's look. */
const TOGGLE: CSSProperties = {
  width: '100%',
  margin: 0,
  padding: 0,
  border: 0,
  background: 'none',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

/** The plate itself, open or folded (state lives in ObjectivePanel). */
export function ObjectivePanelView({ objective, open, onToggle }: ObjectivePanelViewProps) {
  const ratio = objective && objective.target > 0 ? Math.min(1, objective.progress / objective.target) : 1;

  return (
    <aside className="objective-plate" aria-label="Objetivo actual" style={open ? undefined : FOLDED_PLATE}>
      <div className="chrome-plate">
      <div className="chrome-plate-inner objective-inner" style={open ? undefined : FOLDED_INNER}>
        <button
          type="button"
          className="objective-head"
          style={TOGGLE}
          aria-expanded={open}
          title={open ? 'Ocultar objetivos' : 'Mostrar objetivos'}
          onClick={onToggle}
        >
          <PixelIcon name="flag" />
          <span className="hud-label">OBJETIVOS</span>
          {objective && (
            <span className="hud-dim objective-count">
              {objective.completedCount}/{objective.totalCount}
            </span>
          )}
          <span className="hud-dim" aria-hidden="true">{open ? '-' : '+'}</span>
        </button>
        {open && (objective ? (
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
        ))}
      </div>
      </div>
    </aside>
  );
}
