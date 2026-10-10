import type { GameOverStats } from '../game/GameManager';
import { PixelIcon } from './console/PixelIcon';
import type { IconName } from './console/pixelIcons';

interface GameOverScreenProps {
  stats: GameOverStats;
  onRestart: () => void;
  /** Victory only: close the screen and keep playing the endless run */
  onContinue?: () => void;
}

/**
 * Full-canvas end-of-run overlay with shared stats, the night record, the
 * mutation build and restart. A victory (the rival core destroyed) can also
 * be continued: the run is endless.
 */
export function GameOverScreen({ stats, onRestart, onContinue }: GameOverScreenProps) {
  const victory = stats.outcome === 'victory';
  const accent = victory ? 'var(--chrome-accent)' : 'var(--chrome-danger)';
  const minutes = Math.floor(stats.survivedTicks / 60 / 60);
  const seconds = Math.floor(stats.survivedTicks / 60) % 60;

  const label = (icon: IconName, text: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <PixelIcon name={icon} />
      {text}
    </span>
  );

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
        zIndex: 40,
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
          fontSize: 8,
          lineHeight: 1.8,
        }}
      >
        {!victory && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <PixelIcon name="skull" size={48} />
            </div>
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
          {victory
            ? stats.rivalCoreDestroyed === 'human'
              ? 'La colonia destruyó el Centro de Mando humano.'
              : stats.hiveDestroyed || stats.rivalCoreDestroyed === 'crystal'
                ? 'La colonia destruyó la Colmena de Cristal.'
                : 'La colonia venció a su rival.'
            : 'Sin reina no hay colonia.'}
        </div>
        <div style={{ color: accent, marginBottom: 18 }}>
          {stats.newRecord && <div>¡Nuevo récord!</div>}
          <div>{`Récord: noche ${stats.bestNight}`}</div>
        </div>

        <div style={{ textAlign: 'left', marginBottom: 22 }}>
          <div style={rowStyle}>
            {label('flag', 'Noches sobrevividas')}
            <strong className="pixel-number">{stats.nightsSurvived}</strong>
          </div>
          <div style={rowStyle}>
            {label('hourglass', 'Tiempo sobrevivido')}
            <strong className="pixel-number">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </strong>
          </div>
          <div style={rowStyle}>
            {label('ant', 'Hormigas nacidas')}
            <strong className="pixel-number">{stats.antsHatched}</strong>
          </div>
          <div style={rowStyle}>
            {label('shield', 'Oleadas repelidas')}
            <strong className="pixel-number">{stats.wavesRepelled}</strong>
          </div>
          <div style={rowStyle}>
            {label('den', 'Guaridas destruidas')}
            <strong className="pixel-number">{stats.densDestroyed}</strong>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            {label('pick', 'Casillas excavadas')}
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

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
        {victory && onContinue && (
          <button
            onClick={onContinue}
            className="pixel-btn"
            style={{
              padding: '12px 28px',
              fontSize: 8,
              borderColor: 'var(--chrome-accent)',
              color: 'var(--chrome-text)',
              background: 'var(--chrome-accent-dim)',
            }}
          >
            SEGUIR JUGANDO
          </button>
        )}
        <button
          onClick={onRestart}
          className={victory ? 'pixel-btn' : 'pixel-btn pixel-btn--danger'}
          style={{
            padding: '12px 28px',
            fontSize: 8,
            ...(victory && {
              borderColor: 'var(--chrome-accent)',
              color: 'var(--chrome-accent)',
              background: 'var(--chrome-panel-light)',
            }),
          }}
        >
          {victory ? 'NUEVA PARTIDA' : 'REINTENTAR'}
        </button>
        </div>
      </div>
    </div>
  );
}
