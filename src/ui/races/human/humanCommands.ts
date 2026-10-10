// The command card of a Human player: unit orders (with Construir for
// builders), the building menu, placement, production at the selected
// building and the base's own shortcuts. commands.ts hands the card over
// here whenever GameStats.human is set.

import type { GameStats } from '../../../game/GameManager';
import type { HumanPlayerStats, HumanSelectedBuilding } from '../../../game/races/human/HumanPlayerRun';
import type { HumanBuildingKind, HumanUnitType } from '../../../game/rival/humanBase';
import { HUMAN_BUILDING_NAME } from '../../../game/rival/humanInfo';
import { PLAYER_BUILD_COST, PLAYER_BUILDABLE, type PlayerBuildable } from '../../../game/races/human/humanPlayerRules';
import type { CommandContext, CommandDef } from '../../console/commands';
import type { IconName } from '../../console/pixelIcons';

type Slot = CommandDef | null;

const BUILD_ICON: Record<PlayerBuildable, IconName> = {
  barracks: 'flag',
  bunker: 'shield',
  supply_depot: 'crate',
  factory: 'upgrade',
};

const BUILD_BLURB: Record<PlayerBuildable, string> = {
  barracks: 'Entrena soldados y tiradores.',
  bunker: 'Defensa fija: dispara sola a los enemigos que se acercan.',
  supply_depot: 'Sube el suministro en 8 y suma raciones de sus cultivos.',
  factory: 'Fabrica tanques: lentos, blindados y con daño en área.',
};

const TRAIN_ICON: Record<HumanUnitType, IconName> = {
  builder: 'pick',
  soldier: 'sword',
  marksman: 'target',
  tank: 'shield',
};

const TRAIN_VERB: Record<HumanUnitType, string> = {
  builder: 'Entrenar',
  soldier: 'Entrenar',
  marksman: 'Entrenar',
  tank: 'Fabricar',
};

const TRAIN_BLURB: Record<HumanUnitType, string> = {
  builder: 'Junta minerales y levanta edificios. No pelea.',
  soldier: 'Infantería con fusil, blindaje 1. Dispara desde lejos.',
  marksman: 'Francotirador de largo alcance: pega fuerte, pero tiene poca vida.',
  tank: 'Blindado pesado: sus obuses dañan a todo lo que rodea al blanco.',
};

function act(ctx: CommandContext, action: () => void): () => void {
  return () => {
    action();
    ctx.refresh();
  };
}

function player(ctx: CommandContext) {
  return ctx.gm.getHumanPlayer();
}

function timeCommands(ctx: CommandContext): Slot[] {
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
      id: 'speed',
      label: `Velocidad ×${speed}`,
      glyph: `×${speed}`,
      description: `${speed === 1 ? 'Ritmo normal.' : `El tiempo corre ${speed} veces más rápido.`} Cambia entre ×1, ×2 y ×3.`,
      altKeys: '+ y -',
      active: speed > 1,
      run: act(ctx, () => ctx.gm.setSpeed((speed % 3) + 1)),
    },
  ];
}

function deselect(ctx: CommandContext): CommandDef {
  return {
    id: 'deselect',
    label: 'Quitar selección',
    icon: 'back',
    description: 'Suelta la selección.',
    altKeys: 'Esc',
    run: act(ctx, () => ctx.gm.clearSelection()),
  };
}

function areaSelect(ctx: CommandContext): Slot {
  if (!ctx.touch) return null;
  const on = Boolean(ctx.stats.areaSelect);
  return {
    id: 'area-select',
    label: 'Seleccionar área',
    icon: 'area',
    description: 'Arrastra el dedo sobre el mapa para encerrar a tus unidades en un recuadro y seleccionarlas.',
    active: on,
    run: act(ctx, () => ctx.gm.setAreaSelect(!on)),
  };
}

/** Volver a la base (touch): the selection walks back to the command center */
function rally(ctx: CommandContext, who: string): CommandDef {
  return {
    id: 'rally',
    label: 'Volver a la base',
    icon: 'descend',
    description: `Ordena a ${who} volver al Centro de Mando.`,
    prominent: true,
    shortLabel: 'Volver a la base',
    run: act(ctx, () => {
      if (ctx.gm.returnSelectedToNest() === 0) ctx.notify('Ninguna unidad elegida puede volver a la base ahora.', 'danger');
    }),
  };
}

/** Mover, Atacar, Detener, Mantener posición; Construir when a builder is selected; Volver a la base on touch */
function unitPage(ctx: CommandContext, human: HumanPlayerStats): Slot[] {
  const count = human.group?.count ?? 1;
  const who = count === 1 ? 'la unidad seleccionada' : `las ${count} unidades seleccionadas`;
  const armOrCancel = (target: 'move' | 'attack') => {
    if (ctx.touch && ctx.stats.commandTarget === target) ctx.gm.cancelCommandTarget();
    else if (target === 'move') ctx.gm.armMoveTarget();
    else ctx.gm.armAttackTarget();
  };
  const build: Slot = human.selectedBuilders > 0 ? {
    id: 'human-build',
    label: 'Construir',
    icon: 'pick',
    description: 'Elige un edificio y luego el lugar. El constructor camina hasta allí y lo levanta; otro constructor puede ayudar para terminar antes.',
    run: () => ctx.setPage('build'),
  } : null;
  return [
    {
      id: 'move',
      label: 'Mover',
      icon: 'move',
      description: ctx.touch
        ? `Toca el suelo para mover a ${who}. Con constructores, toca un mineral para que lo extraigan.`
        : `Clic derecho en el suelo para mover a ${who}. Con constructores, clic derecho en un mineral para que lo extraigan.`,
      altKeys: ctx.touch ? 'tocar el suelo' : 'clic derecho en el suelo',
      active: ctx.stats.commandTarget === 'move',
      prominent: true,
      shortLabel: 'Mover',
      run: act(ctx, () => armOrCancel('move')),
    },
    build,
    ctx.touch ? rally(ctx, who) : null,
    null,
    null,
    {
      id: 'attack',
      label: 'Atacar',
      icon: 'attack',
      description: `Pulsa Atacar y elige un enemigo, o el suelo para avanzar disparando a todo lo que aparezca en el camino.`,
      altKeys: ctx.touch ? 'tocar un enemigo' : 'clic derecho en un enemigo',
      tone: 'danger',
      prominent: true,
      shortLabel: 'Atacar',
      active: ctx.stats.commandTarget === 'attack',
      run: act(ctx, () => armOrCancel('attack')),
    },
    {
      id: 'stop',
      label: 'Detener',
      icon: 'stop',
      description: 'Cancela las órdenes de la selección. Las tropas se quedan donde están y disparan a lo que se acerque.',
      run: act(ctx, () => {
        const stopped = ctx.gm.stopSelectedAnts();
        ctx.notify(stopped > 0 ? `${stopped} ${stopped === 1 ? 'unidad se detiene' : 'unidades se detienen'}` : 'No hay órdenes que cancelar.');
      }),
    },
    {
      id: 'hold',
      label: 'Mantener posición',
      icon: 'hold',
      description: 'Se quedan quietas y solo disparan a los enemigos que estén a su alcance.',
      run: act(ctx, () => {
        const held = ctx.gm.holdSelectedAnts();
        ctx.notify(held === 1 ? 'La unidad mantiene su posición' : `${held} unidades mantienen su posición`);
      }),
    },
    null,
    null,
    ...timeCommands(ctx),
    areaSelect(ctx),
    null,
    deselect(ctx),
  ];
}

/** Construir: the four buildings, priced in minerals */
function buildPage(ctx: CommandContext, human: HumanPlayerStats): Slot[] {
  const buttons: Slot[] = PLAYER_BUILDABLE.map((kind) => {
    const cost = PLAYER_BUILD_COST[kind].minerals;
    const short = human.minerals < cost;
    return {
      id: `human-build-${kind}`,
      label: HUMAN_BUILDING_NAME[kind],
      icon: BUILD_ICON[kind],
      description: `${BUILD_BLURB[kind]} ${ctx.touch ? 'Toca el lugar y vuelve a tocar para confirmar.' : 'Haz clic en el lugar; el fantasma verde marca un sitio válido.'}`,
      cost: { amount: cost, resource: 'minerales' as const, short },
      disabled: short,
      disabledReason: `Faltan minerales: ${HUMAN_BUILDING_NAME[kind]} cuesta ${cost}.`,
      run: act(ctx, () => {
        const human = player(ctx);
        const reason = human ? human.beginPlacement(kind) : 'No hay constructor.';
        if (reason) ctx.notify(reason, 'danger');
        else ctx.setPage('root');
      }),
    };
  });
  return [
    ...buttons, null,
    null, null, null, null, null,
    ...timeCommands(ctx), null, null,
    {
      id: 'back',
      label: 'Volver',
      icon: 'back',
      description: 'Regresa a las órdenes del constructor.',
      altKeys: 'Esc',
      run: () => ctx.setPage('root'),
    },
  ];
}

function placingPage(ctx: CommandContext, human: HumanPlayerStats): Slot[] {
  const placing = human.placing!;
  return [
    null, null, null, null, null,
    null, null, null, null, null,
    ...timeCommands(ctx), null, null,
    {
      id: 'human-cancel-placement',
      label: `Cancelar ${placing.name.toLowerCase()}`,
      icon: 'back',
      description: 'Deja de colocar el edificio. No se gasta nada.',
      altKeys: ctx.touch ? undefined : 'Esc o clic derecho',
      tone: 'danger',
      run: act(ctx, () => player(ctx)?.cancelPlacement()),
    },
  ];
}

/** Where the command center's shortcut buttons queue each unit */
const QUEUED_AT: Partial<Record<HumanBuildingKind, string>> = {
  barracks: 'Se entrena en el Cuartel más cercano.',
  factory: 'Se fabrica en la Fábrica más cercana.',
};

/** Construir Cuartel on the command center's card: a builder and the placement ghost in one tap */
function barracksShortcut(ctx: CommandContext, human: HumanPlayerStats): CommandDef {
  const cost = PLAYER_BUILD_COST.barracks.minerals;
  const short = human.minerals < cost;
  const noBuilder = human.units.builder === 0;
  return {
    id: 'human-shortcut-barracks',
    label: `Construir ${HUMAN_BUILDING_NAME.barracks}`,
    icon: BUILD_ICON.barracks,
    description: `Elige al constructor ocioso más cercano y empieza a colocar un Cuartel. ${BUILD_BLURB.barracks} ${ctx.touch ? 'Toca el lugar y vuelve a tocar para confirmar.' : 'Haz clic en el lugar; el fantasma verde marca un sitio válido.'}`,
    cost: { amount: cost, resource: 'minerales' as const, short },
    disabled: short || noBuilder,
    disabledReason: noBuilder ? 'No hay constructores: entrena uno en el Centro de Mando.' : `Faltan minerales: ${HUMAN_BUILDING_NAME.barracks} cuesta ${cost}.`,
    run: act(ctx, () => {
      const run = player(ctx);
      const reason = run ? run.startBarracksPlacement() : 'No hay constructores.';
      if (reason) ctx.notify(reason, 'danger');
    }),
  };
}

/** The selected own building: its training buttons, queue and rally point */
function buildingPage(ctx: CommandContext, selected: HumanSelectedBuilding, human: HumanPlayerStats): Slot[] {
  const trains: Slot[] = selected.trains.map((option) => {
    const queued = option.at ? 0 : selected.queue.filter((t) => t === option.type).length;
    const extra = option.cost.minerals > 0 ? ` y ${option.cost.minerals} minerales` : '';
    const where = option.at ? ` ${QUEUED_AT[option.at] ?? ''}` : '';
    return {
      id: `human-train-${option.type}`,
      label: `${TRAIN_VERB[option.type]} ${option.name}`,
      icon: TRAIN_ICON[option.type],
      description: `${TRAIN_BLURB[option.type]}${where} Cuesta ${option.cost.rations} raciones${extra}.`,
      cost: { amount: option.cost.rations, resource: 'raciones' as const, short: option.reason !== null && /raciones/.test(option.reason) },
      badge: queued > 0 ? String(queued) : undefined,
      disabled: option.reason !== null,
      disabledReason: option.reason ?? undefined,
      run: act(ctx, () => {
        const human = player(ctx);
        const reason = human ? human.train(option.type) : 'Selecciona un edificio.';
        if (reason) ctx.notify(reason, 'danger');
      }),
    };
  });
  if (selected.kind === 'command_center' && selected.construction === null) trains.push(barracksShortcut(ctx, human));
  while (trains.length < 5) trains.push(null);
  const producer = selected.trains.length > 0;
  return [
    ...trains.slice(0, 5),
    null, null, null,
    producer ? {
      id: 'human-cancel-train',
      label: 'Cancelar último',
      icon: 'minus',
      description: 'Quita la última unidad de la cola y devuelve lo que costó.',
      disabled: selected.queue.length === 0,
      disabledReason: 'La cola está vacía.',
      run: act(ctx, () => player(ctx)?.cancelTraining()),
    } : null,
    producer ? {
      id: 'human-clear-rally',
      label: 'Quitar punto de reunión',
      icon: 'flag',
      description: ctx.touch
        ? 'Con el edificio seleccionado, toca el suelo para fijar dónde van las unidades nuevas. Este botón lo quita.'
        : 'Con el edificio seleccionado, haz clic derecho en el suelo para fijar dónde van las unidades nuevas. Este botón lo quita.',
      disabled: selected.rally === null,
      disabledReason: 'No hay punto de reunión.',
      run: act(ctx, () => player(ctx)?.clearRally()),
    } : null,
    ...timeCommands(ctx), null, null,
    deselect(ctx),
  ];
}

/** Nothing of yours selected: base shortcuts */
function rootPage(ctx: CommandContext, human: HumanPlayerStats): Slot[] {
  return [
    {
      id: 'human-idle-builders',
      label: 'Constructores ociosos',
      icon: 'pick',
      description: 'Selecciona a los constructores que no están haciendo nada.',
      badge: human.idleBuilders > 0 ? String(human.idleBuilders) : undefined,
      badgeTone: human.idleBuilders > 0 ? 'warn' : undefined,
      disabled: human.idleBuilders === 0,
      disabledReason: 'Todos los constructores están ocupados.',
      run: act(ctx, () => player(ctx)?.selectIdleBuilders()),
    },
    {
      id: 'human-select-core',
      label: 'Centro de Mando',
      icon: 'den',
      description: 'Selecciona el Centro de Mando: entrena constructores y, con un Cuartel o una Fábrica, soldados, tiradores y tanques.',
      run: act(ctx, () => player(ctx)?.selectCore()),
    },
    null, null, null,
    null, null, null, null, null,
    ...timeCommands(ctx),
    areaSelect(ctx),
    null,
    null,
  ];
}

/** The 15 slots of a Human player's card */
export function humanCommands(ctx: CommandContext, human: HumanPlayerStats): Slot[] {
  if (human.placing) return placingPage(ctx, human);
  if (human.selected) return buildingPage(ctx, human.selected, human);
  if (human.selectedUnits > 0) return ctx.page === 'build' && human.selectedBuilders > 0 ? buildPage(ctx, human) : unitPage(ctx, human);
  if (ctx.stats.selectedEntity) {
    // Something not ours (an enemy, a mineral): look, but no orders for it
    return [null, null, null, null, null, null, null, null, null, null, ...timeCommands(ctx), null, null, deselect(ctx)];
  }
  return rootPage(ctx, human);
}

/** The hint above the console while a Human player places a building */
export function humanHint(stats: GameStats, touch: boolean): string | null {
  const placing = stats.human?.placing;
  if (!placing) return null;
  const name = placing.name.toUpperCase();
  const problem = placing.reason ? ` · ${placing.reason}` : '';
  return touch
    ? `${name}: toca dónde va y vuelve a tocar para confirmar · Cancelar para salir${problem}`
    : `${name}: haz clic donde va · clic derecho o Esc cancela${problem}`;
}

/** What a Human player with nothing selected reads on the hint line: where soldiers come from */
export const HUMAN_RECRUIT_HINT = 'Toca el Cuartel o el Centro de mando para entrenar soldados';

/** The hint line of a Human player with nothing selected and no mode on; null otherwise */
export function humanIdleHint(stats: GameStats): string | null {
  const human = stats.human;
  if (!human || human.placing || human.selected || human.selectedUnits > 0) return null;
  if (stats.selectedEntity || stats.commandTarget || stats.areaSelect) return null;
  return HUMAN_RECRUIT_HINT;
}
