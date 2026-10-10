import { bakeCrystalUnit, type CrystalUnitKind, type UnitSheet } from '../../engine/renderer/crystalUnits';
import { bakeHumanUnit, type HumanUnitKind } from '../../engine/renderer/humanUnits';

const crystalSheets = new Map<CrystalUnitKind, UnitSheet>();
const humanSheets = new Map<HumanUnitKind, UnitSheet>();

/** Baked once per kind and shared by every preview on screen. */
export function crystalSheet(kind: CrystalUnitKind): UnitSheet {
  let sheet = crystalSheets.get(kind);
  if (!sheet) {
    sheet = bakeCrystalUnit(kind);
    crystalSheets.set(kind, sheet);
  }
  return sheet;
}

export function humanSheet(kind: HumanUnitKind): UnitSheet {
  let sheet = humanSheets.get(kind);
  if (!sheet) {
    sheet = bakeHumanUnit(kind);
    humanSheets.set(kind, sheet);
  }
  return sheet;
}
