import type { GameManager, GameStats, UpgradeId, UpgradeInfo } from '../../game/GameManager';
import { AntRole, ColonyPriority } from '../../game/components/components';
import { breedButtonState, type BroodKeys } from './brood';
import { CARD_SLOTS, cardHotkeys } from './commandCardLayout';
import type { IconName } from './pixelIcons';
import type { ColonyDetails } from './useColonyDetails';
import { ROLE_BLURB, ROLE_LABEL, stripEmoji } from './format';
import { buildCrystalCommands } from '../races/crystal/crystalCommands';

/**
 * Command card contents per context. Every button maps an action the game
 * already had (colony priorities, retreat horn, time control, breeding, nest
 * build tools, garrison, queen upgrades, diet); nothing here invents gameplay.
 */

export type BuildMode = 'dig' | 'incubation' | 'farm' | 'storage' | 'throne' | 'defense';
/** 'groups' is the touch stand-in for Ctrl/Shift+digit: bind the selection to a control group */
export type CardPage = 'root' | 'colony' | 'groups';

export interface CommandDef {
  id: string;
  /** Tooltip title */
  label: string;
  icon?: IconName;
  /** Short text drawn instead of an icon (speed buttons) */
  glyph?: string;
  description: string;
  /** Price printed on the button face; `short` paints it red when the stock cannot pay it */
  cost?: { amount: number; resource: 'comida' | 'hongos' | 'minerales'; short?: boolean };
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
  /** Touch screen: on-screen stand-ins for mouse and keyboard actions, tap wording */
  touch?: boolean;
  /** Groups page: add to the group (Shift+digit) instead of replacing it (Ctrl+digit) */
  groupAdd?: boolean;
  setGroupAdd?: (add: boolean) => void;
}

export type NoticeTone = 'hint' | 'danger';

export type Slot = CommandDef | null;

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

interface BuildToolDef {
  mode: BuildMode;
  label: string;
  icon: IconName;
  description: string;
  /** The description for touch screens */
  touch: string;
}

const BUILD_TOOLS: ReadonlyArray<BuildToolDef> = [
  {
    mode: 'dig', label: 'Excavar', icon: 'pick',
    description: 'Haz clic en casillas de tierra para marcarlas. Las obreras cavan túneles allí.',
    touch: 'Toca casillas de tierra o pasa el dedo sobre ellas para marcarlas. Las obreras cavan túneles allí.',
  },
  {
    mode: 'incubation', label: 'Incubación', icon: 'egg',
    description: 'Haz clic en casillas excavadas para marcar el área donde se incuban los huevos.',
    touch: 'Toca casillas excavadas o pasa el dedo sobre ellas para marcar el área donde se incuban los huevos.',
  },
  {
    mode: 'farm', label: 'Granja de hongos', icon: 'fungus',
    description: 'Haz clic en casillas excavadas: la granja convierte hojas de la despensa en hongos, el doble de nutritivos.',
    touch: 'Toca o pinta con el dedo casillas excavadas: la granja convierte hojas de la despensa en hongos, el doble de nutritivos.',
  },
  {
    mode: 'storage', label: 'Almacén', icon: 'crate',
    description: 'Haz clic en casillas excavadas para ampliar la despensa de comida.',
    touch: 'Toca o pinta con el dedo casillas excavadas para ampliar la despensa de comida.',
  },
];

/** Area tools on the bottom row of the nest card, beside the time controls (they used to hide on the Colonia page). */
const AREA_TOOLS: ReadonlyArray<BuildToolDef> = [
  {
    mode: 'defense', label: 'Área de defensa', icon: 'shield',
    description: 'Haz clic en casillas excavadas: las defensoras montan guardia allí y atacan a los intrusos.',
    touch: 'Toca o pinta con el dedo casillas excavadas: las defensoras montan guardia allí y atacan a los intrusos.',
  },
  {
    mode: 'throne', label: 'Trono', icon: 'crown',
    description: 'Marca casillas de trono. Luego, sin herramienta activa, haz clic en un trono para mudar a la reina.',
    touch: 'Marca casillas de trono. Luego, sin herramienta activa, toca un trono para mudar a la reina.',
  },
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

/** BUILD_MODE_HINT for touch screens: tap or paint with a finger (two fingers still move the camera); the tool's button turns it off. */
export const BUILD_MODE_TOUCH_HINT: Record<BuildMode, string> = {
  dig: 'EXCAVAR: toca o arrastra el dedo sobre la tierra · toca Excavar para salir',
  incubation: 'INCUBACIÓN: toca o pinta casillas excavadas',
  farm: 'GRANJA: toca o pinta casillas excavadas',
  storage: 'ALMACÉN: toca o pinta casillas excavadas',
  throne: 'TRONO: pinta casillas de trono; luego, sin herramienta, toca un trono',
  defense: 'DEFENSA: toca o pinta casillas excavadas',
};

/** Hint above the console while a build tool is armed. */
export function buildModeHint(mode: BuildMode, touch = false): string {
  return (touch ? BUILD_MODE_TOUCH_HINT : BUILD_MODE_HINT)[mode];
}

export function act(ctx: CommandContext, action: () => void): () => void {
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

export function timeCommands(ctx: CommandContext): CommandDef[] {
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
      // One button for the three speeds: the top strip already shows the speed; + and - step it
      id: 'speed',
      label: `Velocidad ×${speed}`,
      glyph: `×${speed}`,
      description: `${speed === 1 ? 'Ritmo normal.' : `El tiempo corre ${speed} veces más rápido.`} Cambia entre ×1, ×2 y ×3. La tecla + acelera y la tecla - frena.`,
      altKeys: '+ y - (también en el teclado numérico)',
      active: speed > 1,
      run: act(ctx, () => ctx.gm.setSpeed((speed % MAX_SPEED) + 1)),
    },
  ];
}

function isDenSelected(stats: GameStats): boolean {
  const type = stats.selectedEntity?.type;
  return stats.activeLayer === 'surface'
    && (type === 'beetle_den' || type === 'cricket_den' || type === 'crystal_hive' || type === 'crystal_spire' || type === 'human_building');
}

function attackDen(ctx: CommandContext): CommandDef {
  const selected = ctx.stats.selectedEntity;
  const count = Math.min(ctx.attackCount, ctx.stats.availableSoldiers);
  const ready = count > 0;
  const hive = selected?.type === 'crystal_hive';
  const spire = selected?.type === 'crystal_spire';
  const human = selected?.type === 'human_building';
  const base = hive ? 'la colmena' : spire ? 'la aguja' : human ? 'el edificio' : 'la guarida';
  return {
    id: 'attack-den',
    label: hive ? 'Atacar colmena' : spire ? 'Atacar aguja' : human ? 'Atacar edificio' : 'Atacar guarida',
    icon: 'sword',
    description: `Ordena a los soldados libres más cercanos atacar ${base} seleccionada hasta destruirla. Ajusta cuántos en el panel central.`,
    badge: ready ? String(count) : undefined,
    tone: 'danger',
    disabled: !ready,
    disabledReason: ctx.touch
      ? `No hay soldados libres. Cría soldados, o selecciona hormigas y toca ${base}.`
      : `No hay soldados libres. Cría soldados, o selecciona hormigas y haz clic derecho en ${base}.`,
    run: act(ctx, () => {
      if (!selected || !ready) return;
      const sent = ctx.gm.dispatchAttackWave(selected.entityId, count);
      ctx.notify(`¡${sent} soldados en camino a ${base}!`);
    }),
  };
}

function buildTool(ctx: CommandContext, tool: BuildToolDef, badge?: number): CommandDef {
  const { mode, label, icon } = tool;
  return {
    id: mode,
    label,
    icon,
    description: ctx.touch ? tool.touch : tool.description,
    badge: badge ? String(badge) : undefined,
    active: ctx.buildMode === mode,
    run: act(ctx, () => ctx.toggleBuildMode(mode)),
  };
}

/** Hint above the console while a card order waits for its target click. */
export function commandTargetHint(target: GameStats['commandTarget'], touch = false): string | null {
  if (touch) {
    if (target === 'move') return 'MOVER: toca el destino · toca Mover otra vez para cancelar';
    if (target === 'attack') return 'ATACAR: toca un enemigo para atacarlo, o el suelo para avanzar peleando · toca Atacar otra vez para cancelar';
    return null;
  }
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
      description: ctx.touch
        ? `Toca el suelo para mover a ${ants}, o pulsa Mover y luego toca el destino. Cada una ocupa su lugar en la formación. Al llegar, las obreras vuelven a su trabajo y las guerreras montan guardia allí.`
        : `Haz clic derecho en el suelo para mover a ${ants}. También puedes pulsar Mover y luego hacer clic en el destino. Cada una ocupa su lugar en la formación. Al llegar, las obreras vuelven a su trabajo y las guerreras montan guardia allí.`,
      altKeys: ctx.touch ? 'tocar el suelo' : 'clic derecho en el suelo',
      active: ctx.stats.commandTarget === 'move',
      run: act(ctx, () => armOrCancel(ctx, 'move')),
    },
    null,
    null,
    null,
    ctx.touch ? groupsButton(ctx) : null,
    {
      id: 'attack',
      label: 'Atacar',
      icon: 'attack',
      description: ctx.touch
        ? `Pulsa Atacar y toca un enemigo: ${ants} lo persiguen hasta matarlo. Si tocas el suelo, avanzan, pelean con cada enemigo que ven en el camino y, al llegar, atacan la guarida o la colmena que haya allí. Al terminar, vuelven a su trabajo y defienden el nido si hace falta.`
        : `Pulsa Atacar y haz clic. Sobre un enemigo, ${ants} lo persiguen hasta matarlo. En el suelo, avanzan, pelean con cada enemigo que ven en el camino y, al llegar, atacan la guarida o la colmena que haya allí. Al terminar, vuelven a su trabajo y defienden el nido si hace falta.`,
      altKeys: ctx.touch ? 'tocar un enemigo' : 'clic derecho en un enemigo',
      tone: 'danger',
      active: ctx.stats.commandTarget === 'attack',
      run: act(ctx, () => armOrCancel(ctx, 'attack')),
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
    ctx.touch ? areaSelect(ctx) : null,
    null,
    deselect(ctx),
  ];
}

/** Mover / Atacar: arm the order; on a touch screen pressing the armed one again cancels it (there is no Esc). */
export function armOrCancel(ctx: CommandContext, target: 'move' | 'attack'): void {
  if (ctx.touch && ctx.stats.commandTarget === target) ctx.gm.cancelCommandTarget();
  else if (target === 'move') ctx.gm.armMoveTarget();
  else ctx.gm.armAttackTarget();
}

/** Touch stand-in for a left drag: the next finger drag draws a selection box instead of moving the camera. */
export function areaSelect(ctx: CommandContext): CommandDef {
  const on = Boolean(ctx.stats.areaSelect);
  return {
    id: 'area-select',
    label: 'Seleccionar área',
    icon: 'area',
    description: 'Arrastra el dedo sobre el mapa para encerrar a tus hormigas en un recuadro y seleccionarlas. Se apaga después de cada recuadro. Sin esto, arrastrar mueve la cámara.',
    active: on,
    run: act(ctx, () => ctx.gm.setAreaSelect(!on)),
  };
}

/** Touch stand-in for Ctrl+digit: opens the page that binds the selection to a group. */
export function groupsButton(ctx: CommandContext): CommandDef {
  return {
    id: 'groups-page',
    label: 'Asignar grupo',
    icon: 'group',
    description: 'Guarda la selección en un grupo de control (1-9). Luego, toca su ficha sobre el panel para volver a seleccionarlo; tócala dos veces seguidas para ir hacia él.',
    run: () => {
      ctx.setGroupAdd?.(false);
      ctx.setPage('groups');
    },
  };
}

/** Bind the selected ants to a control group: Ctrl+digit, or Shift+digit with Añadir on. */
export function groupsPage(ctx: CommandContext): Slot[] {
  const add = Boolean(ctx.groupAdd);
  const bound = new Map((ctx.stats.controlGroups ?? []).map((g) => [g.slot, g.count]));
  const slot = (n: number): CommandDef => ({
    id: `bind-group-${n}`,
    label: add ? `Añadir al grupo ${n}` : `Guardar en el grupo ${n}`,
    glyph: String(n),
    description: add
      ? `Suma la selección al grupo ${n} sin quitar a las que ya están.`
      : `La selección pasa a ser el grupo ${n}${bound.has(n) ? ' y reemplaza al anterior' : ''}.`,
    altKeys: add ? `Mayús+${n}` : `Ctrl+${n}`,
    badge: bound.has(n) ? String(bound.get(n)) : undefined,
    run: act(ctx, () => {
      if (ctx.gm.bindControlGroup(n, add)) ctx.notify(add ? `Añadidas al grupo ${n}` : `Grupo ${n} guardado`);
      ctx.setPage('root');
    }),
  });
  return [
    slot(1), slot(2), slot(3), slot(4), slot(5),
    slot(6), slot(7), slot(8), slot(9), null,
    {
      id: 'group-add',
      label: 'Añadir en vez de reemplazar',
      icon: 'plus',
      description: 'Encendido, el grupo que elijas suma la selección a las hormigas que ya tiene (como Mayús+número).',
      active: add,
      run: () => ctx.setGroupAdd?.(!add),
    },
    null,
    null,
    null,
    {
      id: 'back',
      label: 'Volver',
      icon: 'back',
      description: 'Regresa a las órdenes de la selección.',
      altKeys: 'Esc',
      run: () => ctx.setPage('root'),
    },
  ];
}

export function deselect(ctx: CommandContext): CommandDef {
  return {
    id: 'deselect',
    label: 'Quitar selección',
    icon: 'back',
    description: 'Suelta la selección y vuelve a los comandos de la colonia.',
    altKeys: 'Esc',
    run: act(ctx, () => ctx.gm.clearSelection()),
  };
}

/**
 * Den card: Atacar guarida on A and Quitar selección on B, the same keys the
 * unit card uses for Atacar and Quitar selección, plus the time controls.
 */
function denPage(ctx: CommandContext): Slot[] {
  return [
    null, null, null, null, null,
    attackDen(ctx), null, null, null, null,
    ...timeCommands(ctx),
    null,
    null,
    deselect(ctx),
  ];
}

function surfaceRoot(ctx: CommandContext): Slot[] {
  return [
    priority(ctx, ColonyPriority.Gather, 'gather', 'Recolectar', 'leaf', 'las obreras se concentran en juntar comida.'),
    priority(ctx, ColonyPriority.Explore, 'explore', 'Explorar', 'eye', 'las exploradoras se alejan más del nido.'),
    priority(ctx, ColonyPriority.Defend, 'defend', 'Defender', 'shield', 'los soldados patrullan el nido y cazan acorazados.'),
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
      altKeys: ctx.touch ? 'tocar el nido seleccionado' : 'clic en el nido seleccionado',
      run: act(ctx, () => ctx.switchLayer('underground')),
    },
    ...breedCommands(ctx),
    ...timeCommands(ctx),
    ctx.touch ? areaSelect(ctx) : null,
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
    ...BUILD_TOOLS.map((tool) => buildTool(ctx, tool, counts[tool.mode])),
    {
      id: 'ascend',
      label: 'Subir a la superficie',
      icon: 'ascend',
      description: 'Vuelve a la vista de la superficie.',
      run: act(ctx, () => ctx.switchLayer('surface')),
    },
    ...breedCommands(ctx),
    ...timeCommands(ctx),
    ...AREA_TOOLS.map((tool) => buildTool(ctx, tool)),
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
  // The Crystal Hive has its own card: build, produce, and the same unit orders
  const slots = ctx.stats.crystal ? buildCrystalCommands(ctx)
    : ctx.stats.activeLayer === 'underground'
      ? ctx.page === 'colony' ? colonyPage(ctx) : nestRoot(ctx)
      : hasUnitSelection(ctx.stats) ? ctx.page === 'groups' ? groupsPage(ctx) : unitPage(ctx)
      : isDenSelected(ctx.stats) ? denPage(ctx)
      : surfaceRoot(ctx);
  return Array.from({ length: CARD_SLOTS }, (_, i) => slots[i] ?? null);
}
