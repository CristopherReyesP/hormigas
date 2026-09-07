import type { GameStats } from '../game/GameManager';
import { useFlashOnChange } from './useFlashOnChange';

interface HUDProps {
  stats: GameStats;
}

export function HUD({ stats }: HUDProps) {
  const timeFlash = useFlashOnChange(Math.floor(stats.tickCount / 60));
  const waveFlash = useFlashOnChange(stats.invasion.waveNumber);

  const formatTime = (ticks: number) => {
    const seconds = Math.floor(ticks / 60);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className="pixel-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        fontSize: '13px',
      }}
    >
      <div>
        <span style={{ color: 'var(--ui-text-dim)' }}>⏱</span>{' '}
        <strong className={`pixel-number ${timeFlash}`}>{formatTime(stats.tickCount)}</strong>
      </div>
      <div>
        <span
          className="pixel-number"
          style={{ color: stats.paused ? 'var(--accent-red)' : 'var(--accent-green)' }}
        >
          {stats.paused ? '⏸ PAUSED' : `▶ x${stats.speed}`}
        </span>
      </div>
      {stats.zoom !== 1 && (
        <div>
          <span style={{ color: 'var(--ui-text-dim)' }}>🔍 {Math.round(stats.zoom * 100)}%</span>
        </div>
      )}
      {/* Day/night cycle */}
      <div style={{ color: stats.dayPhase === 'night' ? 'var(--accent-blue)' : 'var(--accent-amber)' }}>
        {stats.dayPhase === 'night' ? '🌙 Noche' : `☀️ Día ${stats.dayNumber}`}{' '}
        <span style={{ color: 'var(--ui-text-dim)' }}>({stats.phaseRemaining}s)</span>
      </div>
      {/* Active world events */}
      {stats.activeEvents.map((ev) => (
        <div key={ev.name} style={{ color: 'var(--accent-blue)' }}>
          {ev.icon} {ev.name}{' '}
          <span style={{ color: 'var(--ui-text-dim)' }}>({ev.remaining}s)</span>
        </div>
      ))}
      {/* Survival wave countdown */}
      {stats.invasion.active ? (
        <div className={waveFlash} style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>
          🪲 ¡OLEADA {stats.invasion.waveNumber} EN CURSO! ({stats.invasion.invadersAlive} invasores)
        </div>
      ) : stats.invasion.armed ? (
        /* Armed: the countdown is over, only nightfall stands between the
           player and the wave — show the trigger, not a stale number. */
        <div style={{ color: 'var(--accent-red)', fontWeight: 'bold' }}>
          🪲 Oleada {stats.invasion.waveNumber + 1} al anochecer
          {stats.dayPhase === 'day' && (
            <span style={{ color: 'var(--ui-text-dim)', fontWeight: 'normal' }}>
              {' '}({stats.phaseRemaining}s)
            </span>
          )}
        </div>
      ) : (
        <div
          style={{
            color: stats.invasion.nextWaveIn < 30 ? 'var(--accent-red)' : 'var(--accent-amber)',
          }}
        >
          ⚠️ Oleada {stats.invasion.waveNumber + 1} en{' '}
          <strong className="pixel-number">
            {Math.floor(stats.invasion.nextWaveIn / 60)}:
            {Math.floor(stats.invasion.nextWaveIn % 60).toString().padStart(2, '0')}
          </strong>
        </div>
      )}
    </div>
  );
}
