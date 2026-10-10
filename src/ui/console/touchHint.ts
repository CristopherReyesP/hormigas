import type { CommandTarget, SelectedEntityInfo, SelectedGroupInfo } from '../../game/GameManager';
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
    move: 'Toca el destino para mover',
    attack: 'Toca un enemigo para atacarlo, o el suelo para avanzar peleando',
    enemy: 'Elige tropas en la barra y luego toca al enemigo para atacarlo',
    nest: 'Toca el nido otra vez para bajar al hormiguero',
    food: 'Las obreras recogen la comida solas · elige tropas en la barra',
    below: 'Elige una herramienta abajo y toca la tierra · arrastra para mover la vista',
  },
  mouse: {
    pick: 'Haz clic en una hormiga o usa la barra de abajo para elegir tropas',
    order: 'Clic derecho en el suelo para mover · en un enemigo para atacar',
    orderScouts: 'Clic derecho en el suelo para mover · las exploradoras no pelean',
    move: 'Haz clic en el destino para mover',
    attack: 'Haz clic en un enemigo para atacarlo, o en el suelo para avanzar peleando',
    enemy: 'Elige tropas en la barra y luego haz clic derecho en el enemigo',
    nest: 'Haz clic en el nido otra vez para bajar al hormiguero',
    food: 'Las obreras recogen la comida solas · elige tropas en la barra',
    below: 'Elige una herramienta abajo y haz clic en la tierra',
  },
} as const;

const AREA = 'Arrastra un rectángulo para elegir hormigas';
const BELOW_ANTS = 'Bajo tierra las hormigas trabajan solas · sube para darles órdenes';

export function touchHint(input: TouchHintInput): TouchHint {
  const text = input.touch ? TEXT.touch : TEXT.mouse;
  const roles = selectedRoles(input);
  const sel = input.selectedEntity;
  const selection = roles ? selectionCountLabel(roles) : sel ? selectionTitle(sel).name : null;

  if (input.activeLayer === 'underground') {
    if (input.buildMode) return { mode: 'build', text: buildModeHint(input.buildMode, input.touch), selection };
    return { mode: roles ? 'info' : 'pick', text: roles ? BELOW_ANTS : text.below, selection };
  }
  if (input.areaSelect) return { mode: 'area', text: AREA, selection };
  if (roles) {
    if (input.commandTarget === 'move') return { mode: 'target', text: text.move, selection };
    if (input.commandTarget === 'attack') return { mode: 'target', text: text.attack, selection };
    const onlyScouts = Object.entries(roles).every(([role, n]) => role === AntRole.Scout || !n);
    return { mode: 'order', text: onlyScouts ? text.orderScouts : text.order, selection };
  }
  if (sel) {
    if (ENEMY_TYPES.has(sel.type)) return { mode: 'info', text: text.enemy, selection };
    if (sel.type === 'nest') return { mode: 'info', text: text.nest, selection };
    return { mode: 'info', text: text.food, selection };
  }
  return { mode: 'pick', text: text.pick, selection: null };
}
