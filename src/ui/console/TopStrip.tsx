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
  const where = `${label}: total de la colonia, en la entrada y en la despensa. Los huevos se pagan solo con la despensa.`;
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

/**
 * The underground stock that pays for eggs, labeled so it never reads as the
 * food totals beside it. Food still at the entrance shows as "+N": the totals
 * count it, but it buys no egg until the porters carry it down.
 */
function PantryStock({ stored, capacity, incoming }: { stored: number; capacity: number; incoming: number }) {
  const flash = useFlashOnChange(stored);
  const base = 'Despensa: comida guardada bajo tierra que paga los huevos y alimenta a la reina, las nodrizas y las larvas.';
  const title = incoming > 0
    ? `${base} Hay ${incoming} más en la entrada: las obreras la bajan a la despensa.`
    : base;
  return (
    <span className="strip-item strip-pantry" title={title}>
      <PixelIcon name="pantry" />
      <span className="strip-pantry-label">DESPENSA</span>
      <span className={`strip-value ${flash}`} style={stored < 1 ? { color: 'var(--chrome-warn)' } : undefined}>
        {stored}/{capacity}
      </span>
      {incoming > 0 && <span className="strip-pantry-incoming">+{incoming} en la entrada</span>}
    </span>
  );
}

/** The minerals bank: ore the miners delivered, the currency for structures (never food). */
function MineralStock({ stored }: { stored: number }) {
  const flash = useFlashOnChange(stored);
  return (
    <span
      className="strip-item strip-minerals"
      title="Minerales: cristal que extraen las obreras de los yacimientos. Paga las estructuras; no se come."
    >
      <PixelIcon name="mineral" />
      <span className={`strip-value ${flash}`}>{stored}</span>
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
        <PantryStock stored={stats.pantryStored} capacity={stats.pantryCapacity} incoming={stats.entranceFoodStored ?? 0} />
        <MineralStock stored={stats.mineralsStored ?? 0} />
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
