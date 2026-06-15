import type { GameOverStats } from '../game/GameManager';

interface GameOverScreenProps {
  stats: GameOverStats;
  onRestart: () => void;
}

/** Full-canvas overlay shown when the queen dies — run stats + restart */
export function GameOverScreen({ stats, onRestart }: GameOverScreenProps) {
  const minutes = Math.floor(stats.survivedTicks / 60 / 60);
  const seconds = Math.floor(stats.survivedTicks / 60) % 60;

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 24,
    padding: '6px 0',
    borderBottom: '1px solid var(--ui-border)',
  };

  return (
    <div
      className="dither-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <div
        className="pixel-panel"
        style={{
          borderColor: 'var(--accent-red)',
          padding: '28px 36px',
          minWidth: 320,
          textAlign: 'center',
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 28, marginBottom: 12 }}>💀</div>
        <div
          style={{
            fontFamily: 'var(--font-pixel)',
            fontSize: 16,
            lineHeight: 1.6,
            color: 'var(--accent-red)',
            marginBottom: 8,
          }}
        >
          LA REINA HA MUERTO
        </div>
        <div style={{ color: 'var(--ui-text-dim)', marginBottom: 18 }}>
          Sin reina no hay colonia.
        </div>

        <div style={{ fontSize: 13, textAlign: 'left', marginBottom: 22 }}>
          <div style={rowStyle}>
            <span>⏱ Tiempo sobrevivido</span>
            <strong className="pixel-number">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </strong>
          </div>
          <div style={rowStyle}>
            <span>🐜 Hormigas nacidas</span>
            <strong className="pixel-number">{stats.antsHatched}</strong>
          </div>
          <div style={rowStyle}>
            <span>🛡️ Oleadas repelidas</span>
            <strong className="pixel-number">{stats.wavesRepelled}</strong>
          </div>
          <div style={rowStyle}>
            <span>💥 Nidos destruidos</span>
            <strong className="pixel-number">{stats.densDestroyed}</strong>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span>⛏️ Tiles excavados</span>
            <strong className="pixel-number">{stats.tilesExcavated}</strong>
          </div>
        </div>

        <button
          onClick={onRestart}
          className="pixel-btn pixel-btn--danger"
          style={{
            padding: '12px 28px',
            fontFamily: 'var(--font-pixel)',
            fontSize: 10,
          }}
        >
          🔄 REINTENTAR
        </button>
      </div>
    </div>
  );
}
