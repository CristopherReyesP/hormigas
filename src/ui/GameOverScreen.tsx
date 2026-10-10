import { RUN_NIGHTS_TO_WIN } from '../shared/constants';
import type { GameOverStats } from '../game/GameManager';
import { PixelIcon } from './console/PixelIcon';
import type { IconName } from './console/pixelIcons';
import { crystalGameOverCopy } from './races/crystal/crystalGameOver';
import { humanGameOverCopy } from './races/human/gameOverCopy';

interface GameOverScreenProps {
  stats: GameOverStats;
  onRestart: () => void;
}

/** Full-canvas end-of-run overlay with shared stats, the mutation build and restart. */
export function GameOverScreen({ stats, onRestart }: GameOverScreenProps) {
  const victory = stats.outcome === 'victory';
  // A Crystal Hive run has its own words and figures
  const crystal = stats.playerRace === 'crystal' ? crystalGameOverCopy(stats) : null;
  // A Human player's run ends with the expedition's words, not the queen's
  const human = stats.playerRace === 'human' ? humanGameOverCopy(stats) : null;
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
      {victory && <div className="run-banner">{crystal?.banner ?? human?.banner ?? 'LA COLMENA PREVALECE'}</div>}
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
              {crystal?.title ?? human?.defeatTitle ?? 'LA REINA HA MUERTO'}
            </div>
          </>
        )}
        <div style={{ color: 'var(--chrome-dim)', marginBottom: 18 }}>
          {crystal ? crystal.subtitle : human ? human.line : victory
            ? stats.rivalCoreDestroyed === 'human'
              ? 'La colonia destruyó el Centro de Mando humano.'
              : stats.hiveDestroyed || stats.rivalCoreDestroyed === 'crystal'
                ? 'La colonia destruyó la Colmena de Cristal.'
                : `La colonia sobrevivió ${RUN_NIGHTS_TO_WIN} noches.`
            : 'Sin reina no hay colonia.'}
        </div>

        <div style={{ textAlign: 'left', marginBottom: 22 }}>
          <div style={rowStyle}>
            {label('hourglass', 'Tiempo sobrevivido')}
            <strong className="pixel-number">
              {minutes}:{seconds.toString().padStart(2, '0')}
            </strong>
          </div>
          {crystal ? crystal.rows.map((row) => (
            <div key={row.label} style={rowStyle}>
              {label(row.icon, row.label)}
              <strong className="pixel-number">{row.value}</strong>
            </div>
          )) : <>
          {!human && (
            <div style={rowStyle}>
              {label('ant', 'Hormigas nacidas')}
              <strong className="pixel-number">{stats.antsHatched}</strong>
            </div>
          )}
          <div style={rowStyle}>
            {label('shield', 'Oleadas repelidas')}
            <strong className="pixel-number">{stats.wavesRepelled}</strong>
          </div>
          <div style={rowStyle}>
            {label('den', 'Guaridas destruidas')}
            <strong className="pixel-number">{stats.densDestroyed}</strong>
          </div>
          {!human && (
            <div style={{ ...rowStyle, borderBottom: 'none' }}>
              {label('pick', 'Casillas excavadas')}
              <strong className="pixel-number">{stats.tilesExcavated}</strong>
            </div>
          )}
          </>}
        </div>

        {!human && !crystal && <div style={{ textAlign: 'left', marginBottom: 22 }}>
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
        </div>}

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
  );
}
