import type { GameStats, SelectedEntityInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { LEAPER_NAME } from '../../shared/wildlifeNames';
import { FOOD_LABEL, ROLE_LABEL } from './format';
import type { ColonyDetails } from './useColonyDetails';

/** Name and faction line of a selected entity. */
export function selectionTitle(sel: SelectedEntityInfo): { name: string; faction: string } {
  switch (sel.type) {
    case 'ant': return { name: ROLE_LABEL[sel.role ?? AntRole.Worker], faction: 'Enjambre mutante' };
    case 'nest': return { name: 'Nido', faction: 'Enjambre mutante · colmena' };
    case 'beetle': return { name: 'Acorazado', faction: 'Fauna salvaje' };
    case 'cricket': return { name: LEAPER_NAME.one, faction: 'Fauna salvaje' };
    case 'beetle_den': return { name: 'Guarida de acorazados', faction: 'Fauna salvaje · guarida' };
    case 'cricket_den': return { name: LEAPER_NAME.den, faction: 'Fauna salvaje · guarida' };
    case 'crystal_hive': return { name: 'Colmena de Cristal', faction: 'Colmena rival · base' };
    case 'food': return { name: FOOD_LABEL[sel.foodType ?? 'leaf'] ?? 'Comida', faction: 'Recurso' };
  }
}

/** The health bar a selected entity shows, whatever kind it is. */
export function selectionHealth(sel: SelectedEntityInfo): { current: number; max: number } | undefined {
  return sel.health ?? sel.beetleHealth ?? sel.cricketHealth ?? sel.denHealth ?? sel.cricketDenHealth ?? sel.hiveHealth;
}

/**
 * The info panel in one line, for the compact HUD's collapsed info bar:
 * the selection (a group, or one entity and its health), else the state of
 * the colony on the layer in view. A tap on the bar opens the full panel.
 */
export function infoSummary(stats: GameStats, details: ColonyDetails): string {
  const group = stats.selectedGroup;
  if (group) return `GRUPO · ${group.count}${group.ordered > 0 ? ` · ${group.ordered} EN MARCHA` : ''}`;
  const sel = stats.selectedEntity;
  if (sel) {
    const name = selectionTitle(sel).name.toUpperCase();
    const health = selectionHealth(sel);
    if (health) return `${name} · VIDA ${Math.round(health.current)}/${Math.round(health.max)}`;
    if (sel.type === 'food') return `${name} · ${Math.round(sel.foodAmount ?? 0)}`;
    return name;
  }
  if (stats.activeLayer === 'underground') {
    const queen = details.queen ? `REINA ${Math.round(details.queen.health)}/${Math.round(details.queen.maxHealth)}` : 'SIN REINA';
    return `NIDO · ${queen} · DESPENSA ${details.food.total}`;
  }
  return `ENJAMBRE · ${stats.antCount} · AMENAZAS · ${stats.beetleCount + stats.cricketCount}`;
}
