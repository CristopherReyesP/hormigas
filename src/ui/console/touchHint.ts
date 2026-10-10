import type { CommandTarget, SelectedEntityInfo, SelectedGroupInfo } from '../../game/GameManager';
import type { HumanPlayerStats } from '../../game/races/human/HumanPlayerRun';
import type { HumanUnitType } from '../../game/rival/humanBase';
import { AntRole } from '../../game/components/components';
import { buildModeHint, type BuildMode } from './commands';
import { ROLE_LABEL, ROLE_PLURAL } from './format';
import { selectionTitle } from './infoSummary';

/**
 * The compact HUD's hint line: one sentence that always says what the next
 * tap on the map does, from the mode (an armed order, Seleccionar área, a
 * build tool) and the selection. It is what makes the phone controls
 * readable without a tutorial.
 */
export interface TouchHintInput {
  activeLayer: 'surface' | 'underground';
  selectedEntity: SelectedEntityInfo | null;
  selectedGroup?: SelectedGroupInfo | null;
  commandTarget?: CommandTarget | null;
  areaSelect?: boolean;
  buildMode: BuildMode | null;
  /** A finger (tap wording) rather than a mouse in the compact layout */
  touch: boolean;
  /** A Human player's base (null for the Swarm): its selected group */
  human?: Pick<HumanPlayerStats, 'group'> | null;
  /** A Crystal player's HUD (null for the other races): the selected units by kind */
  crystal?: { selectedKinds: { drones: number; sentinels: number } } | null;
  /** A race's own placement hint (a Human building being placed): it wins over everything */
  toolHint?: string | null;
}

/**
 * pick: the next tap chooses troops · order: it orders the selection ·
 * target: it is an armed order's target · area: a drag draws a box ·
 * build: it paints a build tool · info: something that is not an ant is selected
 */
export type TouchHintMode = 'pick' | 'order' | 'target' | 'area' | 'build' | 'info';

export interface TouchHint {
  mode: TouchHintMode;
  text: string;
  /** "5 soldados elegidos", or the name of what is selected; null with nothing selected */
  selection: string | null;
}

/** Feminine castes: "obreras elegidas"; the soldiers are masculine */
const MASCULINE: ReadonlySet<AntRole> = new Set([AntRole.Soldier]);

/** "5 soldados elegidos", "1 obrera elegida", "8 hormigas elegidas" (mixed castes). */
export function selectionCountLabel(byRole: Partial<Record<AntRole, number>>): string {
  const roles = (Object.keys(byRole) as AntRole[]).filter((role) => (byRole[role] ?? 0) > 0);
  const count = roles.reduce((sum, role) => sum + (byRole[role] ?? 0), 0);
  if (roles.length !== 1) return `${count} ${count === 1 ? 'hormiga elegida' : 'hormigas elegidas'}`;
  const role = roles[0];
  const noun = (count === 1 ? ROLE_LABEL : ROLE_PLURAL)[role].toLowerCase();
  const chosen = MASCULINE.has(role) ? 'elegido' : 'elegida';
  return `${count} ${noun} ${chosen}${count === 1 ? '' : 's'}`;
}

const ENEMY_TYPES: ReadonlySet<SelectedEntityInfo['type']> = new Set([
  'beetle', 'beetle_den', 'cricket', 'cricket_den', 'crystal_hive', 'crystal_unit', 'crystal_spire', 'human_unit', 'human_building',
]);

/** Human unit names: all masculine (soldados, tiradores, tanques, constructores) */
const HUMAN_ONE: Record<HumanUnitType, string> = { soldier: 'soldado', marksman: 'tirador', tank: 'tanque', builder: 'constructor' };
const HUMAN_MANY: Record<HumanUnitType, string> = { soldier: 'soldados', marksman: 'tiradores', tank: 'tanques', builder: 'constructores' };

/** "3 soldados elegidos", "1 tanque elegido", "5 unidades elegidas" (mixed types). */
export function humanCountLabel(byType: Partial<Record<HumanUnitType, number>>): string {
  const types = (Object.keys(byType) as HumanUnitType[]).filter((type) => (byType[type] ?? 0) > 0);
  const count = types.reduce((sum, type) => sum + (byType[type] ?? 0), 0);
  if (types.length !== 1) return `${count} ${count === 1 ? 'unidad elegida' : 'unidades elegidas'}`;
  return `${count} ${(count === 1 ? HUMAN_ONE : HUMAN_MANY)[types[0]]} ${count === 1 ? 'elegido' : 'elegidos'}`;
}

/** "2 drones elegidos", "1 centinela elegido", "3 unidades elegidas" (mixed kinds). */
export function crystalCountLabel(kinds: { drones: number; sentinels: number }): string {
  const count = kinds.drones + kinds.sentinels;
  if (kinds.drones > 0 && kinds.sentinels > 0) return `${count} unidades elegidas`;
  const noun = kinds.drones > 0 ? (count === 1 ? 'dron' : 'drones') : (count === 1 ? 'centinela' : 'centinelas');
  return `${count} ${noun} ${count === 1 ? 'elegido' : 'elegidos'}`;
}

/** A Crystal player's selected own units, or null when none */
function selectedCrystalKinds(input: TouchHintInput): { drones: number; sentinels: number } | null {
  const kinds = input.crystal?.selectedKinds;
  return kinds && kinds.drones + kinds.sentinels > 0 ? kinds : null;
}

/** A Human player's selected own units per type: a group, or one unit; null when none */
function selectedHumanTypes(input: TouchHintInput): Partial<Record<HumanUnitType, number>> | null {
  const group = input.human?.group;
  if (group && group.count > 0) return group.byType;
  const sel = input.selectedEntity;
  if (sel?.type === 'human_unit' && sel.human?.own) return { [sel.human.kind as HumanUnitType]: 1 };
  return null;
}

/** Castes of the selected ants, whether one ant or a group */
function selectedRoles(input: TouchHintInput): Partial<Record<AntRole, number>> | null {
  if (input.selectedGroup) return input.selectedGroup.byRole;
  const sel = input.selectedEntity;
  if (sel?.type === 'ant') return { [sel.role ?? AntRole.Worker]: 1 };
  return null;
}

const TEXT = {
  touch: {
    pick: 'Toca una hormiga o usa la barra de abajo para elegir tropas',
    order: 'Toca el suelo para mover · toca un enemigo para atacar',
    orderScouts: 'Toca el suelo para mover · las exploradoras no pelean',
    orderBuilders: 'Toca el suelo para mover · toca un mineral para extraerlo',
    orderWorkers: 'Toca el suelo para mover · toca un cristal para minar · toca comida para recolectar',
    move: 'Toca el destino para mover',
    gather: 'Toca una hoja, un hongo o carne: la llevan a la despensa hasta agotarla',
    mine: 'Toca un cristal: lo minan sin parar hasta otra orden',
    mineral: 'Elige obreras en la barra y toca el cristal para minarlo',
    attack: 'Toca un enemigo para atacarlo, o el suelo para avanzar peleando',
    enemy: 'Elige tropas en la barra y luego toca al enemigo para atacarlo',
    nest: 'Toca el nido otra vez para bajar al hormiguero',
    food: 'Las obreras recogen la comida solas · elige obreras y toca la comida para recolectarla',
    below: 'Elige una herramienta abajo y toca la tierra · arrastra para mover la vista',
  },
  mouse: {
    pick: 'Haz clic en una hormiga o usa la barra de abajo para elegir tropas',
    order: 'Clic derecho en el suelo para mover · en un enemigo para atacar',
    orderScouts: 'Clic derecho en el suelo para mover · las exploradoras no pelean',
    orderBuilders: 'Clic derecho en el suelo para mover · en un mineral para extraerlo',
    orderWorkers: 'Clic derecho en el suelo para mover · en un cristal para minar · en comida para recolectar',
    move: 'Haz clic en el destino para mover',
    gather: 'Haz clic en una hoja, un hongo o carne: la llevan a la despensa hasta agotarla',
    mine: 'Haz clic en un cristal: lo minan sin parar hasta otra orden',
    mineral: 'Elige obreras y haz clic derecho en el cristal para minarlo',
    attack: 'Haz clic en un enemigo para atacarlo, o en el suelo para avanzar peleando',
    enemy: 'Elige tropas en la barra y luego haz clic derecho en el enemigo',
    nest: 'Haz clic en el nido otra vez para bajar al hormiguero',
    food: 'Las obreras recogen la comida solas · elige obreras y haz clic derecho en la comida',
    below: 'Elige una herramienta abajo y haz clic en la tierra',
  },
} as const;

/** A Crystal player's own spire or Hive selected: its card produces and grows */
const OWN_CRYSTAL = 'Produce o añade pisos con los botones de abajo · elige tropas en la barra';
/** A Human player's own building selected: its card trains and builds */
const OWN_BUILDING = 'Entrena o construye con los botones de abajo · elige tropas en la barra';
const AREA = 'Arrastra un rectángulo para elegir hormigas';
const BELOW_ANTS = 'Bajo tierra las hormigas trabajan solas · sube para darles órdenes';

export function touchHint(input: TouchHintInput): TouchHint {
  const text = input.touch ? TEXT.touch : TEXT.mouse;
  const humans = selectedHumanTypes(input);
  const crystals = selectedCrystalKinds(input);
  const roles = crystals ? null : selectedRoles(input) ?? humans;
  const sel = input.selectedEntity;
  const selection = crystals ? crystalCountLabel(crystals)
    : humans ? humanCountLabel(humans)
    : roles ? selectionCountLabel(roles as Partial<Record<AntRole, number>>)
    : sel ? selectionTitle(sel).name : null;

  if (input.toolHint) return { mode: 'build', text: input.toolHint, selection };

  // A build tool is on (a nest tool below, or a defense on either layer): the tool says what to tap
  if (input.buildMode) return { mode: 'build', text: buildModeHint(input.buildMode, input.touch), selection };
  if (input.activeLayer === 'underground') {
    return { mode: roles ? 'info' : 'pick', text: roles ? BELOW_ANTS : text.below, selection };
  }
  if (input.areaSelect) return { mode: 'area', text: input.crystal ? AREA.replace('hormigas', 'unidades') : AREA, selection };
  if (crystals) {
    if (input.commandTarget === 'move') return { mode: 'target', text: text.move, selection };
    if (input.commandTarget === 'attack') return { mode: 'target', text: text.attack, selection };
    return { mode: 'order', text: text.order, selection };
  }
  if (roles) {
    if (humans) {
      if (input.commandTarget === 'move') return { mode: 'target', text: text.move, selection };
      if (input.commandTarget === 'attack') return { mode: 'target', text: text.attack, selection };
      const onlyBuilders = Object.entries(humans).every(([type, n]) => type === 'builder' || !n);
      return { mode: 'order', text: onlyBuilders ? text.orderBuilders : text.order, selection };
    }
    if (input.commandTarget === 'move') return { mode: 'target', text: text.move, selection };
    if (input.commandTarget === 'attack') return { mode: 'target', text: text.attack, selection };
    if (input.commandTarget === 'gather') return { mode: 'target', text: text.gather, selection };
    if (input.commandTarget === 'mine') return { mode: 'target', text: text.mine, selection };
    const onlyScouts = Object.entries(roles).every(([role, n]) => role === AntRole.Scout || !n);
    const workers = ((roles as Partial<Record<AntRole, number>>)[AntRole.Worker] ?? 0) > 0;
    return { mode: 'order', text: onlyScouts ? text.orderScouts : workers ? text.orderWorkers : text.order, selection };
  }
  if (sel) {
    if (sel.human?.own) return { mode: 'info', text: OWN_BUILDING, selection };
    if (sel.owned) return { mode: 'info', text: OWN_CRYSTAL, selection };
    if (ENEMY_TYPES.has(sel.type)) return { mode: 'info', text: text.enemy, selection };
    if (sel.type === 'nest') return { mode: 'info', text: text.nest, selection };
    if (sel.type === 'mineral') return { mode: 'info', text: text.mineral, selection };
    return { mode: 'info', text: text.food, selection };
  }
  // A Human player picks units, not ants
  const pick = input.human || input.crystal ? text.pick.replace('una hormiga', 'una unidad') : text.pick;
  return { mode: 'pick', text: pick, selection: null };
}
