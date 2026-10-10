import type { GameStats, SelectedEntityInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { LEAPER_NAME } from '../../shared/wildlifeNames';
import { FOOD_LABEL, ROLE_LABEL } from './format';
import { CRYSTAL_UNIT_NAME, SPIRE_NAME } from '../../game/rival/crystalNames';
import type { ColonyDetails } from './useColonyDetails';

/** Name and faction line of a selected entity. */
export function selectionTitle(sel: SelectedEntityInfo): { name: string; faction: string } {
  // A Crystal player's own Hive, spires and units
  if (sel.owned) {
    if (sel.type === 'crystal_hive') return { name: 'Tu colmena', faction: 'Colmena de Cristal · núcleo' };
    if (sel.type === 'crystal_spire') return { name: SPIRE_NAME[sel.spireKind ?? 'forge'], faction: 'Colmena de Cristal · tuya' };
    if (sel.type === 'crystal_unit') return { name: CRYSTAL_UNIT_NAME[sel.crystalKind ?? 'drone'], faction: 'Colmena de Cristal · tuya' };
  }
  switch (sel.type) {
    case 'ant': return { name: ROLE_LABEL[sel.role ?? AntRole.Worker], faction: 'Enjambre mutante' };
    case 'nest': return { name: 'Nido', faction: 'Enjambre mutante · colmena' };
    case 'beetle': return { name: 'Acorazado', faction: 'Fauna salvaje' };
    case 'cricket': return { name: LEAPER_NAME.one, faction: 'Fauna salvaje' };
    case 'beetle_den': return { name: 'Guarida de acorazados', faction: 'Fauna salvaje · guarida' };
    case 'cricket_den': return { name: LEAPER_NAME.den, faction: 'Fauna salvaje · guarida' };
    case 'crystal_hive': return { name: 'Colmena de Cristal', faction: 'Colmena rival · base' };
    case 'crystal_unit': return { name: CRYSTAL_UNIT_NAME[sel.crystalKind ?? 'drone'], faction: 'Colmena de Cristal' };
    case 'crystal_spire': return { name: SPIRE_NAME[sel.spireKind ?? 'forge'], faction: 'Colmena de Cristal · aguja' };
    case 'food': return { name: FOOD_LABEL[sel.foodType ?? 'leaf'] ?? 'Comida', faction: 'Recurso · comida' };
    case 'mineral': return { name: 'Cristal mineral', faction: 'Recurso · yacimiento' };
    case 'human_unit':
    case 'human_building':
      return { name: sel.human?.name ?? 'Humano', faction: sel.human?.faction ?? 'Humanos' };
  }
}

/** "180/250": what a food source or mineral node has left of what it held. */
export function resourceAmountText(sel: SelectedEntityInfo): string {
  const left = Math.round((sel.type === 'mineral' ? sel.mineralAmount : sel.foodAmount) ?? 0);
  const max = Math.round((sel.type === 'mineral' ? sel.mineralMax : sel.foodMax) ?? left);
  return `${left}/${Math.max(left, max)}`;
}

/** The health bar a selected entity shows, whatever kind it is. */
export function selectionHealth(sel: SelectedEntityInfo): { current: number; max: number } | undefined {
  return sel.health ?? sel.beetleHealth ?? sel.cricketHealth ?? sel.denHealth ?? sel.cricketDenHealth ?? sel.hiveHealth ?? sel.human?.health;
}

/**
 * The info panel in one line, for the compact HUD's collapsed info bar:
 * the selection (a group, or one entity and its health), else the state of
 * the colony on the layer in view. A tap on the bar opens the full panel.
 */
export function infoSummary(stats: GameStats, details: ColonyDetails): string {
  const humanGroup = stats.human?.group;
  if (humanGroup) return `GRUPO · ${humanGroup.count}${humanGroup.ordered > 0 ? ` · ${humanGroup.ordered} EN MARCHA` : ''}`;
  const group = stats.selectedGroup;
  if (group) return `GRUPO · ${group.count}${group.ordered > 0 ? ` · ${group.ordered} EN MARCHA` : ''}`;
  const sel = stats.selectedEntity;
  if (sel) {
    const name = selectionTitle(sel).name.toUpperCase();
    const health = selectionHealth(sel);
    const shield = sel.shield ? ` · ESCUDO ${Math.round(sel.shield.current)}/${Math.round(sel.shield.max)}` : '';
    if (health) return `${name}${shield} · VIDA ${Math.round(health.current)}/${Math.round(health.max)}`;
    if (sel.type === 'food' || sel.type === 'mineral') return `${name} · ${resourceAmountText(sel)}`;
    return name;
  }
  if (stats.crystal) {
    const c = stats.crystal;
    return `COLMENA · MINERALES ${c.minerals} · SUMINISTRO ${c.supply.used}/${c.supply.cap}`;
  }
  if (stats.activeLayer === 'underground') {
    const queen = details.queen ? `REINA ${Math.round(details.queen.health)}/${Math.round(details.queen.maxHealth)}` : 'SIN REINA';
    return `NIDO · ${queen} · DESPENSA ${details.food.total}`;
  }
  if (stats.human) {
    const h = stats.human;
    return `EXPEDICIÓN · RACIONES ${h.rations} · MINERALES ${h.minerals} · SUMINISTRO ${h.supply}/${h.supplyCap}`;
  }
  return `ENJAMBRE · ${stats.antCount} · AMENAZAS · ${stats.beetleCount + stats.cricketCount}`;
}
