import type { GameStats } from '../../game/GameManager';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { formatClock, stripEmoji } from './format';
import { useFlashOnChange } from '../useFlashOnChange';

interface TopStripProps {
  stats: GameStats;
}

function Resource({ icon, value, label, tone }: { icon: IconName; value: number; label: string; tone?: string }) {
  const flash = useFlashOnChange(value);
  return (
    <span className="strip-item" title={label}>
      <PixelIcon name={icon} />
      <span className={`strip-value ${flash}`} style={tone ? { color: tone } : undefined}>{value}</span>
    </span>
  );
}

function WaveStatus({ stats }: { stats: GameStats }) {
  const { invasion } = stats;
  if (invasion.active) {
    return (
      <span className="strip-item strip-item--danger strip-blink" title="Oleada en curso">
        <PixelIcon name="beetle" />
        ¡OLEADA {invasion.waveNumber}! {invasion.invadersAlive} INVASORES
      </span>
    );
  }
  if (invasion.armed) {
    return (
      <span className="strip-item strip-item--danger" title="La oleada llega con la noche">
        <PixelIcon name="beetle" />
        OLEADA {invasion.waveNumber + 1} AL ANOCHECER
      </span>
    );
  }
  const urgent = invasion.nextWaveIn < 30;
  return (
    <span className={`strip-item ${urgent ? 'strip-item--danger' : 'strip-item--warn'}`} title="Próxima oleada">
      <PixelIcon name="beetle" />
      OLEADA {invasion.waveNumber + 1} EN {formatClock(invasion.nextWaveIn)}
    </span>
  );
}

/** Thin full-width resource bar: economy left, clock and waves center, time control right. */
export function TopStrip({ stats }: TopStripProps) {
  const leaves = Math.max(0, stats.foodStored - stats.mushroomStored - stats.meatStored);
  const night = stats.dayPhase === 'night';

  return (
    <header className="top-strip">
      <div className="strip-group">
        <Resource icon="leaf" value={leaves} label="Hojas" />
        <Resource icon="fungus" value={stats.mushroomStored} label="Hongos" />
        <Resource icon="meat" value={stats.meatStored} label="Carne" />
        <span className="strip-sep" aria-hidden="true" />
        <Resource icon="ant" value={stats.antCount} label="Población total" tone="var(--chrome-text)" />
        <Resource icon="worker" value={stats.workerCount} label="Obreras" />
        <Resource icon="sword" value={stats.soldierCount} label="Soldados" />
        <Resource icon="eye" value={stats.scoutCount} label="Exploradoras" />
        {stats.nurseCount > 0 && <Resource icon="nurse" value={stats.nurseCount} label="Nodrizas" />}
        {stats.defenderCount > 0 && <Resource icon="shield" value={stats.defenderCount} label="Defensoras" />}
      </div>

      <div className="strip-group strip-group--center">
        <span className={`strip-item ${night ? 'strip-item--night' : 'strip-item--day'}`} title={night ? 'Noche' : 'Día'}>
          <PixelIcon name={night ? 'moon' : 'sun'} />
          {night ? 'NOCHE' : 'DÍA'} {stats.dayNumber}
        </span>
        <span className="strip-item" title={night ? 'Tiempo hasta el amanecer' : 'Tiempo hasta el anochecer'}>
          <PixelIcon name="hourglass" />
          {formatClock(stats.phaseRemaining)}
        </span>
        <WaveStatus stats={stats} />
      </div>

      <div className="strip-group strip-group--right">
        {stats.activeEvents.map((event) => (
          <span key={event.name} className="strip-item strip-item--event" title="Evento activo">
            <PixelIcon name="star" />
            {stripEmoji(event.name).toUpperCase()} {formatClock(event.remaining)}
          </span>
        ))}
        {stats.paused ? (
          <span className="strip-item strip-item--danger strip-blink" title="Partida en pausa (Espacio)">
            <PixelIcon name="pause" />
            PAUSA
          </span>
        ) : (
          <span className="strip-item strip-item--accent" title="Velocidad (teclas 1-3)">
            <PixelIcon name="play" />
            ×{stats.speed}
          </span>
        )}
      </div>
    </header>
  );
}
