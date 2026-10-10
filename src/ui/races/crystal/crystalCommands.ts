// The Crystal Hive's command card (P10): raise structures, produce from a
// selected spire, add floors, and the usual unit orders. Every action goes
// through GameManager.getCrystal(); the shared pieces (time, deselect, the
// touch stand-ins) come from the Swarm's card.

import type { CrystalBuildMode, CrystalPlayerSnapshot } from '../../../game/races/crystal/CrystalPlayerController';
import {
  CRYSTAL_FLOOR,
  CRYSTAL_PLAYER_UNITS,
  CRYSTAL_QUEUE_MAX,
  CRYSTAL_STRUCTURES,
  unitForSpire,
  type CrystalBuildKind,
  type CrystalPlayerUnitKind,
} from '../../../game/races/crystal/crystalPlayerRules';
import { SPIRE_NAME } from '../../../game/rival/crystalNames';
import {
  act,
  areaSelect,
  armOrCancel,
  deselect,
  groupsButton,
  groupsPage,
  timeCommands,
  type CommandContext,
  type CommandDef,
  type Slot,
} from '../../console/commands';
import type { IconName } from '../../console/pixelIcons';

interface BuildDef {
  kind: CrystalBuildKind;
  label: string;
  icon: IconName;
  description: string;
}

const BUILDS: readonly BuildDef[] = [
  {
    kind: 'extractor',
    label: 'Extractor',
    icon: 'mineral',
    description: 'Se levanta junto a un yacimiento de minerales y lo drena hacia tu banco. Uno por yacimiento; puede ir lejos de la colmena.',
  },
  {
    kind: 'forge',
    label: 'Aguja de drones',
    icon: 'sword',
    description: 'Cristaliza drones: lentos, fuertes y con escudo, pelean cuerpo a cuerpo. Da suministro por cada piso.',
  },
  {
    kind: 'prism',
    label: 'Aguja de centinelas',
    icon: 'eye',
    description: 'Cristaliza centinelas: disparan rayos de energía a distancia. Da suministro por cada piso.',
  },
];

const UNIT_LABEL: Record<CrystalPlayerUnitKind, { label: string; icon: IconName; blurb: string }> = {
  drone: { label: 'Producir Dron', icon: 'sword', blurb: 'Golpea cuerpo a cuerpo; lento y resistente.' },
  sentinel: { label: 'Producir Centinela', icon: 'eye', blurb: 'Dispara a distancia; frágil de cerca.' },
};

/** Hint above the console while a Crystal build mode is armed */
export function crystalBuildHint(mode: CrystalBuildMode, touch = false): string {
  const name = BUILDS.find((b) => b.kind === mode)?.label.toUpperCase() ?? '';
  const where = mode === 'extractor' ? 'junto a un yacimiento de minerales' : 'cerca de la colmena o de otra aguja';
  return touch
    ? `${name}: toca ${where}, o arrastra el dedo y suelta para levantarlo · toca el botón otra vez para cancelar`
    : `${name}: haz clic ${where} · clic derecho o Esc cancela`;
}

function crystalOf(ctx: CommandContext): CrystalPlayerSnapshot {
  return ctx.stats.crystal!;
}

function buildButton(ctx: CommandContext, def: BuildDef): CommandDef {
  const snap = crystalOf(ctx);
  const cost = CRYSTAL_STRUCTURES[def.kind].cost;
  const active = snap.buildMode === def.kind;
  return {
    id: `build-${def.kind}`,
    label: def.label,
    icon: def.icon,
    description: `${def.description} Tarda ${CRYSTAL_STRUCTURES[def.kind].buildTime} s en cristalizarse.`,
    cost: { amount: cost, resource: 'minerales', short: snap.minerals < cost },
    active,
    run: act(ctx, () => {
      const crystal = ctx.gm.getCrystal();
      if (!crystal) return;
      if (active) {
        crystal.setBuildMode(null);
        return;
      }
      crystal.setBuildMode(def.kind);
      if (snap.minerals < cost) ctx.notify(`Faltan minerales: ${def.label} cuesta ${cost}.`, 'danger');
    }),
  };
}

/** Nothing (or the Hive) selected: the build row and the time controls */
function rootPage(ctx: CommandContext): Slot[] {
  const hasSelection = Boolean(ctx.stats.selectedEntity || ctx.stats.selectedGroup);
  return [
    ...BUILDS.map((b) => buildButton(ctx, b)),
    null,
    null,
    null, null, null, null, null,
    ...timeCommands(ctx),
    ctx.touch ? areaSelect(ctx) : null,
    null,
    hasSelection ? deselect(ctx) : null,
  ];
}

/** An own spire selected: its production, Añadir piso and its queue */
function spirePage(ctx: CommandContext): Slot[] {
  const snap = crystalOf(ctx);
  const sel = snap.selection!;
  const id = sel.entityId;
  const kind = sel.spireKind ?? 'extractor';
  const unit = unitForSpire(kind);
  const growing = sel.construction?.kind === 'build';
  const floorGrowing = sel.construction?.kind === 'floor';
  const queue = sel.producer?.queue ?? [];
  const slots: Slot[] = [null, null, null, null, null, null, null, null, null, null];
  if (unit) {
    const def = CRYSTAL_PLAYER_UNITS[unit];
    const full = queue.length >= CRYSTAL_QUEUE_MAX;
    const reason = growing ? 'La aguja todavía se está cristalizando.' : full ? `La cola está llena (${CRYSTAL_QUEUE_MAX}).` : undefined;
    slots[0] = {
      id: `produce-${unit}`,
      label: UNIT_LABEL[unit].label,
      icon: UNIT_LABEL[unit].icon,
      description: `${UNIT_LABEL[unit].blurb} Tarda ${def.time} s (menos con más pisos) y ocupa ${def.supply} de suministro. Se paga al encargarla.`,
      cost: { amount: def.cost, resource: 'minerales', short: snap.minerals < def.cost },
      badge: queue.length > 0 ? (full ? `${queue.length}/${CRYSTAL_QUEUE_MAX}` : String(queue.length)) : undefined,
      badgeTone: full ? 'warn' : undefined,
      disabled: Boolean(reason),
      disabledReason: reason,
      run: act(ctx, () => {
        const result = ctx.gm.getCrystal()?.queueUnit(id, unit);
        if (!result) return;
        if (result.ok) ctx.notify(`${UNIT_LABEL[unit].label.replace('Producir ', '')} en la cola (-${def.cost} minerales)`);
        else ctx.notify(result.reason, 'danger');
      }),
    };
    const floors = sel.floors ?? 1;
    const maxed = floors >= (sel.maxFloors ?? 3);
    const floorReason = growing || floorGrowing ? 'Ya se está cristalizando.' : maxed ? 'La aguja ya tiene todos sus pisos.' : undefined;
    slots[1] = {
      id: 'add-floor',
      label: 'Añadir piso',
      icon: 'upgrade',
      description: `Un piso más: otra línea de producción (más rápida) y más suministro. Tarda ${CRYSTAL_FLOOR.buildTime} s. Pisos: ${floors}/${sel.maxFloors ?? 3}.`,
      cost: maxed ? undefined : { amount: CRYSTAL_FLOOR.cost, resource: 'minerales', short: snap.minerals < CRYSTAL_FLOOR.cost },
      badge: `${floors}/${sel.maxFloors ?? 3}`,
      disabled: Boolean(floorReason),
      disabledReason: floorReason,
      run: act(ctx, () => {
        const result = ctx.gm.getCrystal()?.addFloor(id);
        if (!result) return;
        if (result.ok) ctx.notify(`Nuevo piso en ${SPIRE_NAME[kind]} (-${CRYSTAL_FLOOR.cost} minerales)`);
        else ctx.notify(result.reason, 'danger');
      }),
    };
    slots[2] = {
      id: 'cancel-unit',
      label: 'Cancelar la última',
      icon: 'minus',
      description: 'Quita la última unidad de la cola y devuelve sus minerales.',
      disabled: queue.length === 0,
      disabledReason: 'La cola está vacía.',
      run: act(ctx, () => {
        if (ctx.gm.getCrystal()?.cancelLast(id)) ctx.notify('Unidad cancelada: minerales devueltos');
      }),
    };
    slots[5] = {
      id: 'rally-hint',
      label: 'Punto de reunión',
      icon: 'flag',
      description: ctx.touch
        ? 'Con la aguja seleccionada, toca el suelo: sus nuevas unidades irán allí.'
        : 'Con la aguja seleccionada, haz clic derecho en el suelo: sus nuevas unidades irán allí.',
      active: Boolean(sel.producer?.rally),
      run: () => ctx.notify(ctx.touch ? 'Toca el suelo para fijar el punto de reunión' : 'Clic derecho en el suelo para fijar el punto de reunión'),
    };
  }
  return [...slots, ...timeCommands(ctx), ctx.touch ? areaSelect(ctx) : null, null, deselect(ctx)];
}

/** Volver a la colmena (touch): the selection walks back to the Hive */
function rallyHome(ctx: CommandContext, them: string): CommandDef {
  return {
    id: 'rally',
    label: 'Volver a la colmena',
    icon: 'descend',
    description: `Ordena a ${them} volver a la colmena y montar guardia allí.`,
    prominent: true,
    shortLabel: 'Volver a la colmena',
    run: act(ctx, () => {
      if (ctx.gm.returnSelectedToNest() === 0) ctx.notify('Ninguna unidad elegida puede volver a la colmena ahora.', 'danger');
    }),
  };
}

/** Own units selected: Mover, Atacar, Detener, Mantener posición */
function unitPage(ctx: CommandContext): Slot[] {
  const count = ctx.stats.selectedGroup?.count ?? 1;
  const them = count === 1 ? 'la unidad seleccionada' : `las ${count} unidades seleccionadas`;
  return [
    {
      id: 'move',
      label: 'Mover',
      icon: 'move',
      description: ctx.touch
        ? `Toca el suelo para mover a ${them}, o pulsa Mover y toca el destino. Al llegar, montan guardia allí.`
        : `Clic derecho en el suelo para mover a ${them}, o pulsa Mover y haz clic en el destino. Al llegar, montan guardia allí.`,
      altKeys: ctx.touch ? 'tocar el suelo' : 'clic derecho en el suelo',
      prominent: true,
      shortLabel: 'Mover',
      active: ctx.stats.commandTarget === 'move',
      run: act(ctx, () => armOrCancel(ctx, 'move')),
    },
    // Building needs no worker: the build row stays at hand with units selected
    // (on touch the first slot is Volver a la colmena; the extractor stays on the root card)
    ctx.touch ? rallyHome(ctx, them) : buildButton(ctx, BUILDS[0]),
    buildButton(ctx, BUILDS[1]),
    buildButton(ctx, BUILDS[2]),
    ctx.touch ? groupsButton(ctx) : null,
    {
      id: 'attack',
      label: 'Atacar',
      icon: 'attack',
      description: `Pulsa Atacar y elige un enemigo: ${them} lo persiguen hasta destruirlo. Sobre el suelo, avanzan peleando con todo lo que ven y atacan la base que haya al llegar.`,
      altKeys: ctx.touch ? 'tocar un enemigo' : 'clic derecho en un enemigo',
      prominent: true,
      shortLabel: 'Atacar',
      tone: 'danger',
      active: ctx.stats.commandTarget === 'attack',
      run: act(ctx, () => armOrCancel(ctx, 'attack')),
    },
    {
      id: 'stop',
      label: 'Detener',
      icon: 'stop',
      description: 'Cancela sus órdenes. Se quedan donde están y defienden ese lugar.',
      run: act(ctx, () => {
        const stopped = ctx.gm.stopSelectedAnts();
        ctx.notify(stopped > 0 ? `${stopped} ${stopped === 1 ? 'unidad se detiene' : 'unidades se detienen'}` : 'No hay órdenes que cancelar.');
      }),
    },
    {
      id: 'hold',
      label: 'Mantener posición',
      icon: 'hold',
      description: 'Se quedan quietas y solo disparan a lo que está a su alcance. No persiguen a nadie.',
      run: act(ctx, () => {
        const held = ctx.gm.holdSelectedAnts();
        ctx.notify(held === 1 ? 'La unidad mantiene su posición' : `${held} unidades mantienen su posición`);
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

/** The Crystal Hive's 15 slots for the current selection */
export function buildCrystalCommands(ctx: CommandContext): Slot[] {
  const snap = crystalOf(ctx);
  const ownUnits = snap.selectedKinds.drones + snap.selectedKinds.sentinels > 0;
  if (ownUnits) return ctx.page === 'groups' ? groupsPage(ctx) : unitPage(ctx);
  if (snap.selection?.kind === 'spire' && ctx.stats.selectedEntity) return spirePage(ctx);
  return rootPage(ctx);
}
