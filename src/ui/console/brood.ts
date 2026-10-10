import type { BroodSnapshot } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import type { IconName } from './pixelIcons';
import { formatClock, ROLE_LABEL } from './format';

/**
 * The breeding pipeline as the player should read it, derived from the game's
 * real rules (GameManager.queueBreed, EggIncubationSystem, NurseAISystem):
 *
 *   DESPENSA → REINA → INCUBANDO → NACE
 *
 * - The egg is paid up front from the underground pantry (pantry + farm piles).
 * - The queen lays queued eggs one at a time; she pauses while starving.
 * - Only nurses carry a laid egg to a free incubation slot, and it only grows there.
 * - A grown larva hatches once a nurse has fed it from the pantry.
 */

export type StageId = 'pantry' | 'laying' | 'incubating' | 'hatch';
export type StageTone = 'idle' | 'ok' | 'busy' | 'warn' | 'blocked';

export interface BroodStage {
  id: StageId;
  label: string;
  icon: IconName;
  value: string;
  tone: StageTone;
  /** Tooltip: what the stage is, plus its problem when it has one */
  hint: string;
}

export interface BroodIssue {
  stage: StageId;
  tone: 'blocked' | 'warn';
  text: string;
}

export type EggChipState = 'queued' | 'waiting' | 'incubating' | 'hungry';

export interface EggChip {
  role: AntRole;
  state: EggChipState;
  progress: number;
  /** Time left, or a one-word state */
  tag: string;
  title: string;
}

/** Hotkeys the hints quote, read from the command card layout */
export interface BroodKeys {
  breed: readonly string[];
  incubation: string;
  storage: string;
}

export interface BroodPipeline {
  /** Queued plus laid eggs */
  count: number;
  stages: BroodStage[];
  /** Problems in pipeline order; the first one is the headline */
  issues: BroodIssue[];
  eggs: EggChip[];
  hiddenEggs: number;
  status: { tone: 'good' | 'dim' | 'warn' | 'blocked'; text: string; more: number };
}

const MAX_EGG_CHIPS = 3;

const STAGE_BLURB: Record<StageId, string> = {
  pantry: 'Comida guardada bajo tierra. Paga cada huevo al encargarlo.',
  laying: 'Huevos encargados: la reina los pone de a uno.',
  incubating: 'Las nodrizas llevan los huevos al área de incubación y los alimentan.',
  hatch: 'Tiempo hasta la próxima eclosión.',
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function cheapestCost(s: BroodSnapshot): number {
  return Math.min(...Object.values(s.costs));
}

function pantryIssue(s: BroodSnapshot, keys: BroodKeys): BroodIssue | null {
  const stored = Math.floor(s.pantry.stored);
  const cheapest = cheapestCost(s);
  if (stored >= cheapest) return null;
  const blocked = (text: string): BroodIssue => ({ stage: 'pantry', tone: 'blocked', text });
  if (s.pantry.tiles === 0) return blocked(`Sin despensa: marca casillas con Almacén (${keys.storage}) en el nido`);
  if (stored < 1) {
    return s.surfaceStock >= 1
      ? blocked(`Despensa vacía: las obreras deben bajar comida (${s.surfaceStock} en la entrada)`)
      : blocked('Despensa vacía: recolecta comida en la superficie');
  }
  const missing = `Faltan ${cheapest - stored} de comida en la despensa para un huevo`;
  return blocked(s.surfaceStock >= 1 ? `${missing} (${s.surfaceStock} en la entrada)` : missing);
}

/**
 * Where the missing food is: the top bar counts the entrance pile too, so a
 * "no food" message must say that food is still on its way down.
 */
function pantryShortfall(stored: number, cost: number, s: BroodSnapshot): string {
  const short = `Falta comida en la despensa: hay ${stored} de ${cost}.`;
  if (s.pantry.tiles === 0) return `${short} Marca casillas de Almacén en el nido.`;
  if (s.surfaceStock >= 1) return `${short} Hay ${s.surfaceStock} en la entrada: las obreras la bajan a la despensa.`;
  return `${short} Recolecta comida en la superficie.`;
}

function layingIssue(s: BroodSnapshot): BroodIssue | null {
  if (!s.hasQueen) return { stage: 'laying', tone: 'blocked', text: 'Sin reina: nadie pone huevos' };
  if (!s.queenCanLay) {
    return { stage: 'laying', tone: 'blocked', text: 'La reina tiene hambre: no pone hasta que las nodrizas la alimenten' };
  }
  return null;
}

function incubationIssue(s: BroodSnapshot, keys: BroodKeys, waiting: number): BroodIssue | null {
  const blocked = (text: string): BroodIssue => ({ stage: 'incubating', tone: 'blocked', text });
  if (s.incubation.tiles === 0) return blocked(`Sin área de incubación: márcala con Incubación (${keys.incubation}) en el nido`);
  if (s.nurses === 0) return blocked('Sin nodrizas: nadie lleva ni alimenta los huevos');
  if (waiting === 0) return null;
  if (s.incubation.freeSlots === 0) return blocked(`Incubación llena: marca más casillas con Incubación (${keys.incubation})`);
  return {
    stage: 'incubating',
    tone: 'warn',
    text: waiting === 1
      ? '1 huevo espera que una nodriza lo lleve a incubar'
      : `${waiting} huevos esperan que una nodriza los lleve a incubar`,
  };
}

function hatchIssue(hungry: number): BroodIssue | null {
  if (hungry === 0) return null;
  return { stage: 'hatch', tone: 'blocked', text: 'Larvas con hambre: las nodrizas necesitan comida en la despensa' };
}

/** Seconds left, rounded up so a growing egg never reads 0:00 */
const timeLeft = (seconds: number) => formatClock(Math.ceil(seconds));

/** Hungry larvae first (they need help), then the soonest hatch, then eggs waiting for a nurse, then the queue */
function laidChip(egg: BroodSnapshot['eggs'][number]): { chip: EggChip; order: number } {
  const name = ROLE_LABEL[egg.role] ?? egg.role;
  if (egg.progress >= 1 && egg.fedProgress < 1) {
    return { order: -1, chip: { role: egg.role, state: 'hungry', progress: 1, tag: 'HAMBRE', title: `${name}: larva con hambre, necesita comida` } };
  }
  if (!egg.incubating) {
    return { order: Infinity, chip: { role: egg.role, state: 'waiting', progress: egg.progress, tag: 'ESPERA', title: `${name}: espera a una nodriza` } };
  }
  const left = timeLeft(egg.remaining);
  return { order: egg.remaining, chip: { role: egg.role, state: 'incubating', progress: egg.progress, tag: left, title: `${name}: nace en ${left}` } };
}

function eggChips(s: BroodSnapshot): EggChip[] {
  const laid = s.eggs.map(laidChip).sort((a, b) => a.order - b.order).map((entry) => entry.chip);
  const queued = s.queue.map((egg): EggChip => ({
    role: egg.role,
    state: 'queued',
    progress: egg.progress,
    tag: 'COLA',
    title: `${ROLE_LABEL[egg.role] ?? egg.role}: en cola, la reina lo pondrá`,
  }));
  return [...laid, ...queued];
}

function stageTone(issue: BroodIssue | null, fallback: StageTone): StageTone {
  return issue ? issue.tone : fallback;
}

export function deriveBroodPipeline(s: BroodSnapshot, keys: BroodKeys): BroodPipeline {
  const waiting = s.eggs.filter((e) => !e.incubating && e.progress < 1).length;
  const hungry = s.eggs.filter((e) => e.progress >= 1 && e.fedProgress < 1).length;
  const growing = s.eggs.filter((e) => e.incubating && e.progress < 1);
  const nextHatch = growing.length > 0 ? Math.min(...growing.map((e) => e.remaining)) : null;

  const byStage: Record<StageId, BroodIssue | null> = {
    pantry: pantryIssue(s, keys),
    laying: layingIssue(s),
    incubating: incubationIssue(s, keys, waiting),
    hatch: hatchIssue(hungry),
  };
  const issues = (['pantry', 'laying', 'incubating', 'hatch'] as const)
    .map((id) => byStage[id])
    .filter((issue): issue is BroodIssue => issue !== null);

  const stage = (id: StageId, label: string, icon: IconName, value: string, fallback: StageTone): BroodStage => {
    const issue = byStage[id];
    return { id, label, icon, value, tone: stageTone(issue, fallback), hint: issue ? `${STAGE_BLURB[id]} ${issue.text}.` : STAGE_BLURB[id] };
  };

  const stages = [
    stage('pantry', 'DESPENSA', 'pantry', String(Math.floor(s.pantry.stored)), 'ok'),
    stage('laying', 'REINA', 'crown', String(s.queue.length), s.queue.length > 0 ? 'busy' : 'idle'),
    stage('incubating', 'INCUBANDO', 'egg', String(s.eggs.length), growing.length > 0 ? 'busy' : 'idle'),
    stage('hatch', 'NACE', 'ant', nextHatch !== null ? timeLeft(nextHatch) : '-', nextHatch !== null ? 'busy' : 'idle'),
  ];

  const chips = eggChips(s);
  let status: BroodPipeline['status'];
  if (issues.length > 0) {
    status = { tone: issues[0].tone, text: issues[0].text, more: issues.length - 1 };
  } else if (nextHatch !== null) {
    status = { tone: 'good', text: `Próxima eclosión en ${timeLeft(nextHatch)}`, more: 0 };
  } else if (s.queue.length > 0) {
    const n = s.queue.length;
    status = { tone: 'good', text: `La reina está poniendo ${n} ${plural(n, 'huevo', 'huevos')}`, more: 0 };
  } else {
    status = { tone: 'dim', text: `Encarga un huevo con ${keys.breed.join(' ')}`, more: 0 };
  }

  return {
    count: s.queue.length + s.eggs.length,
    stages,
    issues,
    eggs: chips.slice(0, MAX_EGG_CHIPS),
    hiddenEggs: Math.max(0, chips.length - MAX_EGG_CHIPS),
    status,
  };
}

export interface BreedButtonState {
  cost: number;
  queued: number;
  full: boolean;
  affordable: boolean;
  disabled: boolean;
  reason?: string;
}

/** Mirrors GameManager.queueBreed: a queen, room in this caste's queue, and the price in the pantry. */
export function breedButtonState(role: AntRole, s: BroodSnapshot): BreedButtonState {
  const cost = s.costs[role];
  const stored = Math.floor(s.pantry.stored);
  const queued = s.queue.filter((egg) => egg.role === role).length;
  const full = queued >= s.maxQueuedPerRole;
  const affordable = stored >= cost;
  const state: BreedButtonState = { cost, queued, full, affordable, disabled: false };
  if (!s.hasQueen) return { ...state, disabled: true, reason: 'No hay reina que ponga huevos.' };
  if (full) {
    return { ...state, disabled: true, reason: `Cola llena: ya hay ${queued} huevos de ${ROLE_LABEL[role].toLowerCase()} en espera.` };
  }
  if (!affordable) return { ...state, disabled: true, reason: pantryShortfall(stored, cost, s) };
  return state;
}
