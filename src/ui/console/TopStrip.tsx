import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { GameManager, GameStats } from '../../game/GameManager';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { formatClock, stripEmoji } from './format';
import { useFlashOnChange } from '../useFlashOnChange';
import { SoundToggle } from '../../audio/ui/SoundToggle';
import { CrystalResources } from '../races/crystal/CrystalResources';
import '../races/crystal/crystal.css';
import { HumanResources } from '../races/human/HumanResources';
import { pantryFullText, pantryWaitersText, pantryWaitingText } from './pantryNote';
import { STRIP_FOLDS, foldClassNames, planStripFolds, type StripFoldId } from './stripFold';

type FoodType = 'leaf' | 'mushroom' | 'meat';

interface TopStripProps {
  stats: GameStats;
  gameManager?: GameManager | null;
  /** Opens the help card (controls and Repetir tutorial) */
  onHelp?: () => void;
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
  const where = `${label} en la despensa: pagan los huevos.`;
  const title = active
    ? `${where} La colonia come esto primero.`
    : `${where} Clic para que la colonia coma esto primero.`;
  return (
    <button
      type="button"
      className={`strip-item strip-food strip-food--${icon}${active ? ' strip-food--active' : ''}`}
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
 * The underground stock that pays for eggs; the food totals beside it are the
 * same pantry by type. Food on its way (on the entrance pile or in the ants'
 * jaws) shows apart as "+N en camino": it buys no egg until it is down.
 * A full pantry says so, with the tool that makes room.
 */
function PantryStock({ stored, capacity, inTransit, atEntrance, full, waiting }: {
  stored: number;
  capacity: number;
  inTransit: number;
  atEntrance: number;
  full: boolean;
  /** Workers below holding a load until a pile has room */
  waiting: number;
}) {
  const flash = useFlashOnChange(stored);
  const fullText = pantryFullText();
  const carried = Math.max(0, inTransit - atEntrance);
  let title = 'Despensa: comida guardada bajo tierra que paga los huevos y alimenta a la reina, las nodrizas y las larvas.';
  if (inTransit > 0) {
    title += ` Hay ${inTransit} en camino: ${atEntrance} en la entrada y ${carried} en la boca de las obreras.`;
  }
  if (full) {
    title += ` ${fullText} en el nido.`;
    if (waiting > 0) {
      title += ` ${waiting} ${waiting === 1 ? 'obrera espera' : 'obreras esperan'} con la comida hasta que haya espacio; si tienen hambre, se la comen.`;
    }
    title += ' Mientras tanto no salen a buscar más comida.';
  }
  return (
    <span className={full ? 'strip-item strip-pantry strip-pantry--full' : 'strip-item strip-pantry'} title={title} data-hud="pantry">
      {full && (
        // Shown in the open drawer; the banner column (PantryFullNote) says it the rest of the time
        <span className="strip-pantry-full">
          {inTransit > 0 && <span className="strip-pantry-waiting">{pantryWaitingText(inTransit)}</span>}
          {waiting > 0 && <span className="strip-pantry-waiting">{pantryWaitersText(waiting)}</span>}
          <span>{fullText}</span>
        </span>
      )}
      <PixelIcon name="pantry" />
      <span className="strip-pantry-label">DESPENSA</span>
      <span className={`strip-value ${flash}`} style={stored < 1 || full ? { color: 'var(--chrome-warn)' } : undefined}>
        {stored}/{capacity}
      </span>
      {/* Full: the food on its way moves into the full-pantry message */}
      {inTransit > 0 && !full && <span className="strip-pantry-incoming">+{inTransit} en camino</span>}
      {full && <span className="strip-pantry-full-short" aria-hidden="true">LLENA</span>}
    </span>
  );
}

/** The minerals bank: ore the miners delivered, the currency for structures (never food), and who is mining. */
function MineralStock({ stored, miners }: { stored: number; miners: number }) {
  const flash = useFlashOnChange(stored);
  return (
    <span
      className="strip-item strip-minerals"
      data-hud="minerals"
      title={`Minerales ${stored} · ${miners} ${miners === 1 ? 'minera' : 'mineras'}. Cristal que extraen las obreras de los yacimientos. Paga las estructuras; no se come.`}
    >
      <PixelIcon name="mineral" />
      <span className={`strip-value strip-minerals-value ${flash}`}>{stored}</span>
      <span className="strip-miners" aria-label={`${miners} ${miners === 1 ? 'minera' : 'mineras'}`}>
        <PixelIcon name="worker" />{miners}
      </span>
    </span>
  );
}

function WaveStatus({ stats }: { stats: GameStats }) {
  const { invasion } = stats;
  if (invasion.active) {
    return (
      <span className="strip-item strip-wave strip-item--danger strip-blink" title="Oleada en curso">
        <PixelIcon name="beetle" />
        {/* A narrow strip keeps the invaders alive beside the blinking beetle */}
        <span className="strip-wave-text">
          <span className="strip-wave-word">{`¡OLEADA ${invasion.waveNumber}! `}</span>{invasion.invadersAlive}<span className="strip-wave-word"> INVASORES</span>
        </span>
      </span>
    );
  }
  // nextWaveIn counts down to the real attack (nightfall), armed or not
  const urgent = invasion.armed || invasion.nextWaveIn < 30;
  return (
    <span
      className={`strip-item strip-wave ${urgent ? 'strip-item--danger' : 'strip-item--warn'}`}
      title={invasion.armed ? 'La oleada llega al anochecer' : 'Próxima oleada'}
    >
      <PixelIcon name="beetle" />
      {/* A narrow strip folds the words and keeps the clock beside the beetle */}
      <span className="strip-wave-text">
        <span className="strip-wave-word">{`OLEADA ${invasion.waveNumber + 1} EN `}</span>{formatClock(invasion.nextWaveIn)}
      </span>
    </span>
  );
}

const px = (value: string) => parseFloat(value) || 0;

/** Room for the Más datos button at the end of the desktop strip (38 px and the group gap) */
const DESKTOP_MORE_RESERVE = 52;

/** A plan may not unfold this soon (ms) after folding more: a guard against flip-flopping on a pixel */
const FLIP_GUARD_MS = 400;

/**
 * What the strip needs and has, measured on the page: the row with every
 * readout unfolded (folded ones are only hidden, so they still have a width)
 * against the strip's inner width, for planStripFolds.
 */
function measureStrip(strip: HTMLElement): StripFoldId[] {
  const style = getComputedStyle(strip);
  const available = strip.clientWidth - px(style.paddingLeft) - px(style.paddingRight);
  const groups = Array.from(strip.children).filter((el) => el.classList.contains('strip-group'));
  let natural = px(style.columnGap) * Math.max(0, groups.length - 1);
  for (const group of groups) {
    const shown = Array.from(group.children).filter((el) => {
      if (el.classList.contains('strip-more')) return false;
      const position = getComputedStyle(el).position;
      return position !== 'absolute' && position !== 'fixed' && (el as HTMLElement).offsetParent !== null;
    });
    natural += shown.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0);
    natural += px(getComputedStyle(group).columnGap) * Math.max(0, shown.length - 1);
  }
  // Folded units still have a width: the row needs it back once unfolded
  const items = STRIP_FOLDS.map((fold) => {
    let cost = 0;
    for (const el of strip.querySelectorAll<HTMLElement>(fold.selector)) {
      const width = el.getBoundingClientRect().width;
      if (width === 0) continue;
      const parent = el.parentElement;
      cost += width + (parent ? px(getComputedStyle(parent).columnGap) : 0);
    }
    return { id: fold.id, priority: fold.priority, cost };
  });
  const foldedNow = strip.classList.contains('top-strip--folded');
  if (foldedNow) {
    for (const item of items) {
      if (strip.classList.contains(`top-strip--fold-${item.id}`)) natural += item.cost;
    }
  }
  // Phones always show the button, in the strip's own padding
  const more = strip.querySelector<HTMLElement>('.strip-more');
  const reserve = more && getComputedStyle(more).position === 'absolute' ? 0 : DESKTOP_MORE_RESERVE;
  // A couple of pixels of slack for rounding
  return planStripFolds({ natural: Math.ceil(natural) + 2, available, reserve, items });
}

/**
 * The readouts to fold on this strip: re-measured after every render (the
 * numbers change width) and on every resize. The open drawer keeps the plan.
 */
function useStripFolds(ref: RefObject<HTMLElement | null>, open: boolean): StripFoldId[] {
  const [folded, setFolded] = useState<StripFoldId[]>([]);
  /** When the plan last folded more: a plan that unfolds right after is a rounding flip, not more room */
  const foldedMoreAt = useRef(-Infinity);
  const replan = useCallback(() => {
    const strip = ref.current;
    if (!strip || strip.classList.contains('top-strip--open')) return;
    const next = measureStrip(strip);
    setFolded((current) => {
      if (current.join() === next.join()) return current;
      const now = performance.now();
      if (next.length < current.length && now - foldedMoreAt.current < FLIP_GUARD_MS) return current;
      if (next.length > current.length) foldedMoreAt.current = now;
      return next;
    });
  }, [ref]);
  // The readouts change width with their numbers: re-plan after every render, before paint
  useLayoutEffect(replan);
  // And whenever the window (so the strip) changes size
  useLayoutEffect(() => {
    const strip = ref.current;
    if (!strip || open || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(replan);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [ref, open, replan]);
  return folded;
}

/**
 * Thin full-width resource bar: economy left, clock and waves center, time
 * control right. When the row runs short (a narrow window, a phone) the
 * least important readouts fold away (stripFold.ts) into a drawer that Más
 * datos opens; the pantry, the minerals, the wave timer and pause stay.
 */
export function TopStrip({ stats, gameManager, onHelp }: TopStripProps) {
  const leaves = Math.max(0, stats.foodStored - stats.mushroomStored - stats.meatStored);
  const night = stats.dayPhase === 'night';
  const eatFirst = gameManager?.getConsumptionPriority();
  const select = (type: FoodType) => (gameManager ? () => gameManager.setConsumptionPriority(type) : undefined);
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const folded = useStripFolds(header, open);
  const classes = ['top-strip', open ? 'top-strip--open' : '', foldClassNames(folded)].filter(Boolean).join(' ');

  return (
    <header ref={header} className={classes}>
      <div className="strip-group">
        {stats.crystal ? <CrystalResources crystal={stats.crystal} /> : stats.human ? <HumanResources human={stats.human} /> : (<>
        <FoodResource icon="leaf" value={leaves} label="Hojas" active={eatFirst === 'leaf'} onSelect={select('leaf')} />
        <FoodResource icon="fungus" value={stats.mushroomStored} label="Hongos" active={eatFirst === 'mushroom'} onSelect={select('mushroom')} />
        <FoodResource icon="meat" value={stats.meatStored} label="Carne" active={eatFirst === 'meat'} onSelect={select('meat')} />
        <PantryStock
          stored={stats.pantryStored}
          capacity={stats.pantryCapacity}
          inTransit={stats.foodInTransit ?? 0}
          atEntrance={stats.entranceFoodStored ?? 0}
          full={stats.pantryFull ?? false}
          waiting={stats.antsWaitingForPantry ?? 0}
        />
        <MineralStock stored={stats.mineralsStored ?? 0} miners={stats.miners?.count ?? 0} />
        <span className="strip-sep" aria-hidden="true" />
        <span className="strip-pop">
        <Resource icon="ant" value={stats.antCount} label="Población total" tone="var(--chrome-text)" />
        <Resource icon="worker" value={stats.workerCount} label="Obreras" />
        <Resource icon="sword" value={stats.soldierCount} label="Soldados" />
        <Resource icon="eye" value={stats.scoutCount} label="Exploradoras" />
        {stats.nurseCount > 0 && <Resource icon="nurse" value={stats.nurseCount} label="Nodrizas" />}
        {stats.defenderCount > 0 && <Resource icon="shield" value={stats.defenderCount} label="Defensoras" />}
        </span>
        </>)}
      </div>

      <div className="strip-group strip-group--center">
        <span className={`strip-item strip-day ${night ? 'strip-item--night' : 'strip-item--day'}`} title={night ? 'Noche' : 'Día'}>
          <PixelIcon name={night ? 'moon' : 'sun'} />
          {night ? 'NOCHE' : 'DÍA'} {stats.dayNumber}
        </span>
        <span className="strip-item strip-phase" title={night ? 'Tiempo hasta el amanecer' : 'Tiempo hasta el anochecer'}>
          <PixelIcon name="hourglass" />
          {formatClock(stats.phaseRemaining)}
        </span>
        <WaveStatus stats={stats} />
      </div>

      <div className="strip-group strip-group--right">
        {stats.activeEvents.map((event) => {
          const name = stripEmoji(event.name);
          return (
            <span key={event.name} className="strip-item strip-item--event" title={`Evento activo: ${name}`}>
              <PixelIcon name="star" />
              <span className="strip-event-text">
                <span className="strip-event-name">{`${name.toUpperCase()} `}</span>{formatClock(event.remaining)}
              </span>
            </span>
          );
        })}
        <button
          type="button"
          className={`strip-item strip-time ${stats.paused ? 'strip-item--danger strip-blink' : 'strip-item--accent'}`}
          title={stats.paused ? 'Partida en pausa (Espacio). Toca para reanudar.' : 'Velocidad. Toca para pausar (Espacio).'}
          aria-label={stats.paused ? 'Reanudar la partida' : 'Pausar la partida'}
          aria-pressed={stats.paused}
          disabled={!gameManager}
          onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
          onClick={() => gameManager?.togglePause()}
        >
          <PixelIcon name={stats.paused ? 'pause' : 'play'} />
          {stats.paused ? 'PAUSA' : `×${stats.speed}`}
        </button>
        <SoundToggle />
        {onHelp && (
          <button
            type="button"
            className="strip-item strip-help"
            data-hud="help"
            aria-label="Ayuda y controles"
            title="Ayuda y controles"
            onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
            onClick={onHelp}
          >
            ?
          </button>
        )}
        <button
          type="button"
          className="strip-more"
          aria-expanded={open}
          aria-label="Más datos"
          title={open ? 'Ocultar los datos de la colonia' : 'Ver todos los datos de la colonia'}
          onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
          onClick={() => setOpen((o) => !o)}
        >
          <PixelIcon name={open ? 'minus' : 'plus'} />
        </button>
      </div>
    </header>
  );
}
