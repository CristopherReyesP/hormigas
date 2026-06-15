import type { ObjectiveState } from '../game/systems/ObjectiveSystem';

interface ObjectivePanelProps {
  objective: ObjectiveState | null;
}

/** Current colony milestone — progression driver shown on both layers */
export function ObjectivePanel({ objective }: ObjectivePanelProps) {
  if (!objective) {
    return (
      <div className="pixel-panel" style={{ padding: '10px 12px', fontSize: 12 }}>
        <div className="pixel-heading" style={{ marginBottom: 6 }}>🏆 Objetivos</div>
        <div style={{ color: 'var(--accent-green)' }}>
          ¡Todos cumplidos! La colonia domina el territorio.
        </div>
      </div>
    );
  }

  const ratio = objective.target > 0 ? objective.progress / objective.target : 0;

  return (
    <div className="pixel-panel" style={{ padding: '10px 12px', fontSize: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span className="pixel-heading">🎯 Objetivo</span>
        <span style={{ color: 'var(--ui-text-dim)' }}>
          {objective.completedCount}/{objective.totalCount}
        </span>
      </div>
      <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{objective.title}</div>
      <div style={{ color: 'var(--ui-text-dim)', marginBottom: 8, lineHeight: 1.4 }}>
        {objective.description}
      </div>

      {/* Segmented pixel progress bar */}
      <div className="pixel-bar" style={{ marginBottom: 4 }}>
        <div
          className="pixel-bar-fill"
          style={{
            width: `${Math.min(100, ratio * 100)}%`,
            backgroundColor: ratio >= 1 ? 'var(--accent-green)' : 'var(--accent-amber)',
          }}
        />
      </div>
      <div style={{ textAlign: 'right', color: 'var(--ui-text-dim)' }}>
        {objective.progress} / {objective.target}
      </div>
    </div>
  );
}
