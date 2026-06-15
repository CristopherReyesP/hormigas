interface GameControlsProps {
  paused: boolean;
  speed: number;
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
}

export function GameControls({ paused, speed, onTogglePause, onSetSpeed }: GameControlsProps) {
  return (
    <div
      className="pixel-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
      }}
    >
      <div className="pixel-heading">Controls</div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <button
          onClick={onTogglePause}
          className={`pixel-btn${paused ? ' pixel-btn--active' : ''}`}
          style={{ padding: '6px 12px', fontSize: '12px' }}
        >
          {paused ? '▶ Play' : '⏸ Pause'}
        </button>
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {[1, 2, 3].map(s => (
          <button
            key={s}
            onClick={() => onSetSpeed(s)}
            className={`pixel-btn${speed === s ? ' pixel-btn--active' : ''}`}
            style={{ padding: '6px 12px', fontSize: '12px' }}
          >
            x{s}
          </button>
        ))}
      </div>
      <div style={{ color: 'var(--ui-text-dim)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
        Space: pause | 1-3: speed
      </div>
    </div>
  );
}
