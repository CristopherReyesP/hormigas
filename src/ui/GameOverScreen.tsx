import { RUN_NIGHTS_TO_WIN } from '../shared/constants';
import type { GameOverStats } from '../game/GameManager';

interface GameOverScreenProps {
  stats: GameOverStats;
  onRestart: () => void;
}

/** Full-canvas end-of-run overlay with shared stats, the mutation build and restart. */
export function GameOverScreen({ stats, onRestart }: GameOverScreenProps) {
  const victory = stats.outcome === 'victory';
  const accent = victory ? 'var(--chrome-accent)' : 'var(--chrome-danger)';
  const minutes = Math.floor(stats.survivedTicks / 60 / 60);
  const seconds = Math.floor(stats.survivedTicks / 60) % 60;

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 24,
    padding: '6px 0',
    borderBottom: '1px solid var(--chrome-border)',
  };

  return (
    <div
      className="dither-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflowY: 'auto',
        zIndex: 20,
      }}
    >
      {victory && <div className="run-banner">LA COLMENA PREVALECE</div>}
      <div
        className="pixel-panel"
        style={{
          background: 'var(--chrome-panel)',
          color: 'var(--chrome-text)',
          borderColor: accent,
          padding: '28px 36px',
          minWidth: 320,
          textAlign: 'center',
          fontSize: 13,
        }}
      >
        {!victory && (
          <>
            <div style={{ fontSize: 28, marginBottom: 12 }}>💀</div>
            <div
              style={{
                fontFamily: 'var(--font-pixel)',
                fontSize: 16,
                lineHeight: 1.6,
                color: accent,
                marginBottom: 8,
              }}
            >
              LA REINA HA MUERTO
            </div>
          </>
        )}
        <div style={{ color: 'var(--chrome-dim)', marginBottom: 18 }}>
          {victory ? `La colonia sobrevivió ${RUN_NIGHTS_TO_WIN} noches.` : 'Sin reina no hay colonia.'}
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

        <div style={{ textAlign: 'left', marginBottom: 22 }}>
          <div className="pixel-heading" style={{ color: 'var(--chrome-dim)', marginBottom: 6 }}>
            Mutaciones
          </div>
          {stats.build.length === 0 ? (
            <div style={{ color: 'var(--chrome-dim)' }}>Sin mutaciones</div>
          ) : (
            stats.build.map((entry) => (
              <div key={entry.id} style={{ ...rowStyle, borderBottom: '1px solid var(--chrome-panel-light)' }}>
                <span style={{ color: 'var(--chrome-accent)' }}>{entry.name}</span>
                <strong className="pixel-number">× {entry.stacks}</strong>
              </div>
            ))
          )}
        </div>

        <button
          onClick={onRestart}
          className={victory ? 'pixel-btn' : 'pixel-btn pixel-btn--danger'}
          style={{
            padding: '12px 28px',
            fontFamily: 'var(--font-pixel)',
            fontSize: 10,
            ...(victory && {
              borderColor: 'var(--chrome-accent)',
              color: 'var(--chrome-accent)',
              background: 'var(--chrome-panel-light)',
            }),
          }}
        >
          🔄 {victory ? 'NUEVA PARTIDA' : 'REINTENTAR'}
        </button>
      </div>
    </div>
  );
}
