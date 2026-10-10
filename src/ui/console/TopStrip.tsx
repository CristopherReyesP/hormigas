import type { GameManager, GameStats } from '../../game/GameManager';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { formatClock, stripEmoji } from './format';
import { useFlashOnChange } from '../useFlashOnChange';
import { SoundToggle } from '../../audio/ui/SoundToggle';

type FoodType = 'leaf' | 'mushroom' | 'meat';

interface TopStripProps {
  stats: GameStats;
  gameManager?: GameManager | null;
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

/** A food stock that doubles as the diet toggle: click to make the colony eat this food first. */
function FoodResource({ icon, value, label, active, onSelect }: {
  icon: IconName;
  value: number;
  label: string;
  active: boolean;
  onSelect?: () => void;
}) {
  const flash = useFlashOnChange(value);
  const where = `${label}: total de la colonia, en la entrada y en la despensa.`;
  const title = active
    ? `${where} La colonia come esto primero.`
    : `${where} Clic para que la colonia coma esto primero.`;
  return (
    <button
      type="button"
      className={`strip-item strip-food${active ? ' strip-food--active' : ''}`}
      title={title}
      aria-pressed={active}
      onClick={onSelect}
      disabled={!onSelect}
    >
      <PixelIcon name={icon} />
      <span className={`strip-value ${flash}`}>{value}</span>
      {active && <span className="strip-food-badge">1º</span>}
    </button>
  );
}

/** The underground stock that pays for eggs, labeled so it never reads as the food totals beside it. */
function PantryStock({ stored, capacity }: { stored: number; capacity: number }) {
  const flash = useFlashOnChange(stored);
  return (
    <span
      className="strip-item strip-pantry"
      title="Despensa: comida guardada bajo tierra que paga los huevos y alimenta a la reina, las nodrizas y las larvas."
    >
      <PixelIcon name="pantry" />
      <span className="strip-pantry-label">DESPENSA</span>
      <span className={`strip-value ${flash}`} style={stored < 1 ? { color: 'var(--chrome-warn)' } : undefined}>
        {stored}/{capacity}
      </span>
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
  // nextWaveIn counts down to the real attack (nightfall), armed or not
  const urgent = invasion.armed || invasion.nextWaveIn < 30;
  return (
    <span
      className={`strip-item ${urgent ? 'strip-item--danger' : 'strip-item--warn'}`}
      title={invasion.armed ? 'La oleada llega al anochecer' : 'Próxima oleada'}
    >
      <PixelIcon name="beetle" />
      OLEADA {invasion.waveNumber + 1} EN {formatClock(invasion.nextWaveIn)}
    </span>
  );
}

/** Thin full-width resource bar: economy left, clock and waves center, time control right. */
export function TopStrip({ stats, gameManager }: TopStripProps) {
  const leaves = Math.max(0, stats.foodStored - stats.mushroomStored - stats.meatStored);
  const night = stats.dayPhase === 'night';
  const eatFirst = gameManager?.getConsumptionPriority();
  const select = (type: FoodType) => (gameManager ? () => gameManager.setConsumptionPriority(type) : undefined);

  return (
    <header className="top-strip">
      <div className="strip-group">
        <FoodResource icon="leaf" value={leaves} label="Hojas" active={eatFirst === 'leaf'} onSelect={select('leaf')} />
        <FoodResource icon="fungus" value={stats.mushroomStored} label="Hongos" active={eatFirst === 'mushroom'} onSelect={select('mushroom')} />
        <FoodResource icon="meat" value={stats.meatStored} label="Carne" active={eatFirst === 'meat'} onSelect={select('meat')} />
        <PantryStock stored={stats.pantryStored} capacity={stats.pantryCapacity} />
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
        <SoundToggle />
      </div>
    </header>
  );
}
