interface PopulationChipProps {
  antCount: number;
  workerCount: number;
  soldierCount: number;
  scoutCount: number;
  nurseCount: number;
  defenderCount: number;
}

/** Compact floating population summary over the canvas — top-left, underground only */
export function PopulationChip({ antCount, workerCount, soldierCount, scoutCount, nurseCount, defenderCount }: PopulationChipProps) {
  const roleStat = (icon: string, count: number, color: string, title: string) => (
    <span title={title} style={{ color }}>
      {icon}{count}
    </span>
  );

  return (
    <div
      className="pixel-panel"
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        fontSize: '11px',
        zIndex: 10,
        pointerEvents: 'none',
      }}
    >
      <span className="pixel-number" style={{ color: 'var(--accent-amber)' }}>🐜 {antCount}</span>
      {roleStat('⚒', workerCount, '#c08a4a', 'Obreras')}
      {roleStat('🗡', soldierCount, 'var(--accent-red)', 'Soldados')}
      {roleStat('👁', scoutCount, 'var(--accent-blue)', 'Exploradoras')}
      {roleStat('✚', nurseCount, 'var(--accent-green)', 'Nodrizas')}
      {roleStat('🛡', defenderCount, '#8a5fc8', 'Defensoras')}
    </div>
  );
}
