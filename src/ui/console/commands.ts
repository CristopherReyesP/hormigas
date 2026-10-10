import type { GameManager, GameStats, UpgradeId, UpgradeInfo } from '../../game/GameManager';
import { AntRole, ColonyPriority } from '../../game/components/components';
import { breedButtonState, type BroodKeys } from './brood';
import { CARD_SLOTS, cardHotkeys } from './commandCardLayout';
import type { IconName } from './pixelIcons';
import type { ColonyDetails } from './useColonyDetails';
import { ROLE_BLURB, ROLE_LABEL, stripEmoji } from './format';

/**
 * Command card contents per context. Every button maps an action the game
 * already had (colony priorities, retreat horn, time control, breeding, nest
 * build tools, garrison, queen upgrades, diet); nothing here invents gameplay.
 */

export type BuildMode = 'dig' | 'incubation' | 'farm' | 'storage' | 'throne' | 'defense';
export type CardPage = 'root' | 'colony';

export interface CommandDef {
  id: string;
  /** Tooltip title */
  label: string;
  icon?: IconName;
  /** Short text drawn instead of an icon (speed buttons) */
  glyph?: string;
  description: string;
  /** Price printed on the button face; `short` paints it red when the stock cannot pay it */
  cost?: { amount: number; resource: 'comida' | 'hongos'; short?: boolean };
  /** Small corner text: queue size, tile count, upgrade level */
  badge?: string;
  badgeTone?: 'warn';
  /** Extra keys that also trigger this action, for the tooltip */
  altKeys?: string;
  active?: boolean;
  disabled?: boolean;
  /** Why it is disabled, for the tooltip */
  disabledReason?: string;
  tone?: 'danger';
  run: () => void;
}

export interface CommandContext {
  gm: GameManager;
  stats: GameStats;
  details: ColonyDetails;
  page: CardPage;
  buildMode: BuildMode | null;
  attackCount: number;
  setPage: (page: CardPage) => void;
  toggleBuildMode: (mode: BuildMode) => void;
  switchLayer: (layer: 'surface' | 'underground') => void;
  /** Re-read stats and details right after an action */
  refresh: () => void;
  /** Short-lived message in the feed; 'danger' for refusals */
  notify: (message: string, tone?: NoticeTone) => void;
}

export type NoticeTone = 'hint' | 'danger';

type Slot = CommandDef | null;

const MAX_GARRISON = 8;
const MAX_SPEED = 3;

const BREED_ORDER: ReadonlyArray<{ role: AntRole; icon: IconName }> = [
  { role: AntRole.Worker, icon: 'worker' },
  { role: AntRole.Soldier, icon: 'sword' },
  { role: AntRole.Scout, icon: 'eye' },
  { role: AntRole.Nurse, icon: 'nurse' },
  { role: AntRole.Defender, icon: 'shield' },
];

const UPGRADE_ICON: Record<UpgradeId, IconName> = {
  carry: 'leaf',
  damage: 'sword',
  storage: 'crate',
  dig: 'pick',
  porters: 'ant',
  heal: 'heart',
};

const BUILD_TOOLS: ReadonlyArray<{ mode: BuildMode; label: string; icon: IconName; description: string }> = [
  { mode: 'dig', label: 'Excavar', icon: 'pick', description: 'Haz clic en casillas de tierra para marcarlas. Las obreras cavan túneles allí.' },
  { mode: 'incubation', label: 'Incubación', icon: 'egg', description: 'Haz clic en casillas excavadas para marcar el área donde se incuban los huevos.' },
  { mode: 'farm', label: 'Granja de hongos', icon: 'fungus', description: 'Haz clic en casillas excavadas: la granja convierte hojas de la despensa en hongos, el doble de nutritivos.' },
  { mode: 'storage', label: 'Almacén', icon: 'crate', description: 'Haz clic en casillas excavadas para ampliar la despensa de comida.' },
];

/** Area tools on the bottom row of the nest card, beside the time controls (they used to hide on the Colonia page). */
const AREA_TOOLS: ReadonlyArray<{ mode: BuildMode; label: string; icon: IconName; description: string }> = [
  { mode: 'defense', label: 'Área de defensa', icon: 'shield', description: 'Haz clic en casillas excavadas: las defensoras montan guardia allí y atacan a los intrusos.' },
  { mode: 'throne', label: 'Trono', icon: 'crown', description: 'Marca casillas de trono. Luego, sin herramienta activa, haz clic en un trono para mudar a la reina.' },
];

/** Hint shown above the console while a build tool is armed. */
export const BUILD_MODE_HINT: Record<BuildMode, string> = {
  dig: 'EXCAVAR: haz clic en casillas de tierra para marcar túneles · Esc cancela',
  incubation: 'INCUBACIÓN: haz clic en casillas excavadas · Esc cancela',
  farm: 'GRANJA: haz clic en casillas excavadas para sembrar hongos · Esc cancela',
  storage: 'ALMACÉN: haz clic en casillas excavadas para ampliar la despensa · Esc cancela',
  throne: 'TRONO: marca casillas de trono; luego, sin herramienta, haz clic en un trono para mudar a la reina · Esc cancela',
  defense: 'DEFENSA: haz clic en casillas excavadas; las defensoras montan guardia allí · Esc cancela',
};

function act(ctx: CommandContext, action: () => void): () => void {
  return () => {
    action();
    ctx.refresh();
  };
}

function priority(ctx: CommandContext, value: ColonyPriority, id: string, label: string, icon: IconName, description: string): CommandDef {
  return {
    id,
    label,
    icon,
    description: `Prioridad de la colonia: ${description}`,
    active: ctx.stats.colonyPriority === value,
    run: act(ctx, () => ctx.gm.setColonyPriority(value)),
  };
}

function breedCommands(ctx: CommandContext): CommandDef[] {
  return BREED_ORDER.map(({ role, icon }) => {
    const state = breedButtonState(role, ctx.details.brood);
    const name = ROLE_LABEL[role].toLowerCase();
    const max = ctx.details.brood.maxQueuedPerRole;
    return {
      id: `breed-${role}`,
      label: `Criar ${name}`,
      icon,
      description: `La reina pone un huevo de ${name}. ${ROLE_BLURB[role]} Se paga al encargarlo con comida de la despensa, bajo tierra.`,
      cost: { amount: state.cost, resource: 'comida' as const, short: !state.affordable },
      badge: state.full ? `${state.queued}/${max}` : state.queued > 0 ? String(state.queued) : undefined,
      badgeTone: state.full ? ('warn' as const) : undefined,
      disabled: state.disabled,
      disabledReason: state.reason,
      run: act(ctx, () => {
        if (ctx.gm.queueBreed(role)) ctx.notify(`Huevo de ${name} encargado (-${state.cost} comida)`);
        else ctx.notify(state.reason ?? 'La reina no puede poner ese huevo ahora.', 'danger');
      }),
    };
  });
}

function timeCommands(ctx: CommandContext): CommandDef[] {
  const { paused, speed } = ctx.stats;
  return [
    {
      id: 'pause',
      label: paused ? 'Reanudar' : 'Pausa',
      icon: paused ? 'play' : 'pause',
      description: paused ? 'Reanuda la partida.' : 'Detiene la partida.',
      altKeys: 'Espacio',
      active: paused,
      run: act(ctx, () => ctx.gm.togglePause()),
    },
    {
      // One button for the three speeds: the top strip already shows the speed and 1-3 still pick one
      id: 'speed',
      label: `Velocidad ×${speed}`,
      glyph: `×${speed}`,
      description: `${speed === 1 ? 'Ritmo normal.' : `El tiempo corre ${speed} veces más rápido.`} Cambia entre ×1, ×2 y ×3.`,
      altKeys: '1, 2, 3',
      active: speed > 1,
      run: act(ctx, () => ctx.gm.setSpeed((speed % MAX_SPEED) + 1)),
    },
  ];
}

function attackDen(ctx: CommandContext): CommandDef {
  const selected = ctx.stats.selectedEntity;
  const isDen = selected?.type === 'beetle_den' || selected?.type === 'cricket_den';
  const count = Math.min(ctx.attackCount, ctx.stats.availableSoldiers);
  const ready = isDen && count > 0;
  return {
    id: 'attack-den',
    label: 'Atacar guarida',
    icon: 'sword',
    description: 'Ordena a los soldados libres más cercanos atacar la guarida seleccionada hasta destruirla. Ajusta cuántos en el panel central.',
    badge: ready ? String(count) : undefined,
    tone: 'danger',
    disabled: !ready,
    disabledReason: !isDen ? 'Selecciona una guarida enemiga.' : 'No hay soldados libres.',
    run: act(ctx, () => {
      if (!selected || !ready) return;
      const sent = ctx.gm.dispatchAttackWave(selected.entityId, count);
      ctx.notify(`¡${sent} soldados en camino a la guarida!`);
    }),
  };
}

function buildTool(ctx: CommandContext, mode: BuildMode, label: string, icon: IconName, description: string, badge?: number): CommandDef {
  return {
    id: mode,
    label,
    icon,
    description,
    badge: badge ? String(badge) : undefined,
    active: ctx.buildMode === mode,
    run: act(ctx, () => ctx.toggleBuildMode(mode)),
  };
}

/** Hint above the console while a card order waits for its target click. */
export function commandTargetHint(target: GameStats['commandTarget']): string | null {
  if (target === 'move') return 'MOVER: haz clic en el destino · el clic derecho también mueve · Esc cancela';
  if (target === 'attack') {
    return 'ATACAR: haz clic en un enemigo para atacarlo, o en el suelo para avanzar peleando · Esc cancela';
  }
  return null;
}

/** Own ants are selected on the surface: the StarCraft unit card. */
function hasUnitSelection(stats: GameStats): boolean {
  if (stats.activeLayer !== 'surface') return false;
  return Boolean(stats.selectedGroup) || stats.selectedEntity?.type === 'ant';
}

/**
 * Unit card: Mover (Q), Atacar (A), Detener (S), Mantener posición (D), time
 * controls (Z, X) and Quitar selección (B).
 */
function unitPage(ctx: CommandContext): Slot[] {
  const count = ctx.stats.selectedGroup?.count ?? 1;
  const ants = count === 1 ? 'la hormiga seleccionada' : `las ${count} hormigas seleccionadas`;
  return [
    {
      id: 'move',
      label: 'Mover',
      icon: 'move',
      description: `Haz clic derecho en el suelo para mover a ${ants}. También puedes pulsar Mover y luego hacer clic en el destino. Cada una ocupa su lugar en la formación. Al llegar, las obreras vuelven a su trabajo y las guerreras montan guardia allí.`,
      altKeys: 'clic derecho en el suelo',
      active: ctx.stats.commandTarget === 'move',
      run: act(ctx, () => ctx.gm.armMoveTarget()),
    },
    null,
    null,
    null,
    null,
    {
      id: 'attack',
      label: 'Atacar',
      icon: 'attack',
      description: `Pulsa Atacar y haz clic. Sobre un enemigo, ${ants} lo persiguen hasta matarlo. En el suelo, avanzan y pelean con cada enemigo que ven en el camino. Las guerreras se quedan de guardia al terminar.`,
      altKeys: 'clic derecho en un enemigo',
      tone: 'danger',
      active: ctx.stats.commandTarget === 'attack',
      run: act(ctx, () => ctx.gm.armAttackTarget()),
    },
    {
      id: 'stop',
      label: 'Detener',
      icon: 'stop',
      description: 'Cancela las órdenes que diste a la selección: mover, atacar, mantener posición y la guardia. Las hormigas vuelven a su trabajo.',
      run: act(ctx, () => {
        const stopped = ctx.gm.stopSelectedAnts();
        ctx.notify(stopped > 0 ? `${stopped} ${stopped === 1 ? 'hormiga se detiene' : 'hormigas se detienen'}` : 'No hay órdenes que cancelar.');
      }),
    },
    {
      id: 'hold',
      label: 'Mantener posición',
      icon: 'hold',
      description: `${count === 1 ? 'La hormiga se queda quieta' : 'Las hormigas se quedan quietas'} y solo pelea${count === 1 ? '' : 'n'} con los enemigos a su alcance. No persiguen a nadie.`,
      run: act(ctx, () => {
        const held = ctx.gm.holdSelectedAnts();
        ctx.notify(held === 1 ? 'La hormiga mantiene su posición' : `${held} hormigas mantienen su posición`);
      }),
    },
    null,
    null,
    ...timeCommands(ctx),
    null,
    null,
    {
      id: 'deselect',
      label: 'Quitar selección',
      icon: 'back',
      description: 'Suelta la selección y vuelve a los comandos de la colonia.',
      altKeys: 'Esc',
      run: act(ctx, () => ctx.gm.clearSelection()),
    },
  ];
}

function surfaceRoot(ctx: CommandContext): Slot[] {
  return [
    priority(ctx, ColonyPriority.Gather, 'gather', 'Recolectar', 'leaf', 'las obreras se concentran en juntar comida.'),
    priority(ctx, ColonyPriority.Explore, 'explore', 'Explorar', 'eye', 'las exploradoras se alejan más del nido.'),
    priority(ctx, ColonyPriority.Defend, 'defend', 'Defender', 'shield', 'los soldados patrullan el nido y cazan escarabajos.'),
    {
      id: 'retreat',
      label: '¡Retirada al nido!',
      icon: 'horn',
      description: 'Todas las hormigas de la superficie vuelven al nido.',
      tone: 'danger',
      run: act(ctx, () => ctx.gm.soundRetreat()),
    },
    {
      id: 'descend',
      label: 'Bajar al nido',
      icon: 'descend',
      description: 'Cambia a la vista del hormiguero subterráneo.',
      altKeys: 'clic en el nido seleccionado',
      run: act(ctx, () => ctx.switchLayer('underground')),
    },
    ...breedCommands(ctx),
    ...timeCommands(ctx),
    null,
    null,
    attackDen(ctx),
  ];
}

/** Reading order of the nest root card; nestRoot() fills it and the brood hints quote its keys. */
const NEST_ROOT_ORDER: readonly string[] = [
  'dig', 'incubation', 'farm', 'storage', 'ascend',
  ...BREED_ORDER.map(({ role }) => `breed-${role}`),
  'pause', 'speed', 'defense', 'throne', 'colony-page',
];

function nestRoot(ctx: CommandContext): Slot[] {
  const counts: Partial<Record<BuildMode, number>> = {
    farm: ctx.details.farm.tiles,
    storage: ctx.details.storageTiles,
  };
  const defs: CommandDef[] = [
    ...BUILD_TOOLS.map((tool) => buildTool(ctx, tool.mode, tool.label, tool.icon, tool.description, counts[tool.mode])),
    {
      id: 'ascend',
      label: 'Subir a la superficie',
      icon: 'ascend',
      description: 'Vuelve a la vista de la superficie.',
      run: act(ctx, () => ctx.switchLayer('surface')),
    },
    ...breedCommands(ctx),
    ...timeCommands(ctx),
    ...AREA_TOOLS.map((tool) => buildTool(ctx, tool.mode, tool.label, tool.icon, tool.description)),
    {
      id: 'colony-page',
      label: 'Colonia',
      icon: 'upgrade',
      description: 'Guarnición, mejoras de la reina y dieta.',
      run: () => ctx.setPage('colony'),
    },
  ];
  const byId = new Map(defs.map((def) => [def.id, def]));
  return NEST_ROOT_ORDER.map((id) => byId.get(id) ?? null);
}

/** Hotkey of a nest root command, from its declared slot. */
function nestKey(id: string): string {
  return cardHotkeys()[NEST_ROOT_ORDER.indexOf(id)] ?? '';
}

/** Keys the brood readout quotes: the breed row and the nest tools that unblock breeding. */
export function broodKeys(): BroodKeys {
  return {
    breed: BREED_ORDER.map(({ role }) => nestKey(`breed-${role}`)),
    incubation: nestKey('incubation'),
    storage: nestKey('storage'),
  };
}

function upgradeCommand(ctx: CommandContext, upgrade: UpgradeInfo | undefined): Slot {
  if (!upgrade) return null;
  const maxed = upgrade.nextCost === null;
  const affordable = !maxed && ctx.details.food.mushrooms >= (upgrade.nextCost ?? 0);
  return {
    id: `upgrade-${upgrade.id}`,
    label: stripEmoji(upgrade.name),
    icon: UPGRADE_ICON[upgrade.id],
    description: `Mejora de la reina: ${upgrade.description}.`,
    cost: maxed ? undefined : { amount: upgrade.nextCost ?? 0, resource: 'hongos', short: !affordable },
    badge: `${upgrade.level}/${upgrade.maxLevel}`,
    disabled: maxed || !affordable,
    disabledReason: maxed ? 'Nivel máximo.' : 'Faltan hongos de la granja.',
    run: act(ctx, () => ctx.gm.purchaseUpgrade(upgrade.id)),
  };
}

function colonyPage(ctx: CommandContext): Slot[] {
  const { garrison, upgrades, eatFirst } = ctx.details;
  const diet = (type: 'leaf' | 'mushroom' | 'meat', label: string, icon: IconName): CommandDef => ({
    id: `diet-${type}`,
    label: `Comer primero: ${label}`,
    icon,
    description: 'La colonia come primero este tipo de comida (cría, nodrizas, curación). Si no queda, come lo que haya.',
    active: eatFirst === type,
    run: act(ctx, () => ctx.gm.setConsumptionPriority(type)),
  });
  return [
    {
      id: 'garrison-down',
      label: 'Menos guarnición',
      icon: 'minus',
      description: `Soldados que custodian a la reina entre oleadas: ${garrison.current}/${garrison.target}.`,
      badge: String(garrison.target),
      disabled: garrison.target <= 0,
      run: act(ctx, () => ctx.gm.setGarrisonSize(garrison.target - 1)),
    },
    {
      id: 'garrison-up',
      label: 'Más guarnición',
      icon: 'plus',
      description: `Soldados que custodian a la reina entre oleadas: ${garrison.current}/${garrison.target}.`,
      badge: String(garrison.target),
      disabled: garrison.target >= MAX_GARRISON,
      run: act(ctx, () => ctx.gm.setGarrisonSize(garrison.target + 1)),
    },
    diet('leaf', 'hojas', 'leaf'),
    diet('mushroom', 'hongos', 'fungus'),
    diet('meat', 'carne', 'meat'),
    ...[0, 1, 2, 3, 4, 5].map((i) => upgradeCommand(ctx, upgrades[i])),
    null,
    null,
    null,
    {
      id: 'back',
      label: 'Volver',
      icon: 'back',
      description: 'Regresa a los comandos principales.',
      altKeys: 'Esc',
      run: () => ctx.setPage('root'),
    },
  ];
}

/** The 15 slots of the card for the current layer and page (null = empty slot). */
export function buildCommands(ctx: CommandContext): Slot[] {
  const slots =
    ctx.stats.activeLayer === 'underground'
      ? ctx.page === 'colony' ? colonyPage(ctx) : nestRoot(ctx)
      : hasUnitSelection(ctx.stats) ? unitPage(ctx) : surfaceRoot(ctx);
  return Array.from({ length: CARD_SLOTS }, (_, i) => slots[i] ?? null);
}
