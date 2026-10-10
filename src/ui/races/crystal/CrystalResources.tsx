import type { CrystalPlayerSnapshot } from '../../../game/races/crystal/CrystalPlayerController';
import { PixelIcon } from '../../console/PixelIcon';
import { useFlashOnChange } from '../../useFlashOnChange';

/**
 * The Crystal Hive's side of the top strip: minerals with their income, the
 * supply, and the army by kind. No food, pantry or castes: crystals eat nothing.
 */
export function CrystalResources({ crystal }: { crystal: CrystalPlayerSnapshot }) {
  const flash = useFlashOnChange(crystal.minerals);
  const full = crystal.supply.used >= crystal.supply.cap;
  return (
    <>
      <span
        className="strip-item strip-minerals"
        title={`Minerales: pagan estructuras, pisos y unidades. Entran ${crystal.income.toFixed(1)} por segundo (la colmena y los extractores).`}
      >
        <PixelIcon name="mineral" />
        <span className={`strip-value ${flash}`}>{crystal.minerals}</span>
        <span className="strip-pantry-incoming">+{crystal.income.toFixed(1)}/s</span>
      </span>
      <span
        className="strip-item strip-supply"
        title="Suministro: lo que ocupa tu ejército, y el máximo que dan la colmena y los pisos de tus agujas."
      >
        <PixelIcon name="crown" />
        <span className="strip-pantry-label">SUMINISTRO</span>
        <span className="strip-value" style={full ? { color: 'var(--chrome-warn)' } : undefined}>
          {crystal.supply.used}/{crystal.supply.cap}
        </span>
      </span>
      <span className="strip-sep" aria-hidden="true" />
      <span className="strip-pop">
        <span className="strip-item" title="Drones de cristal">
          <PixelIcon name="sword" />
          <span className="strip-value">{crystal.units.drones}</span>
        </span>
        <span className="strip-item" title="Centinelas">
          <PixelIcon name="eye" />
          <span className="strip-value">{crystal.units.sentinels}</span>
        </span>
      </span>
    </>
  );
}
