import type { HumanPlayerStats } from '../../../game/races/human/HumanPlayerRun';
import { PixelIcon } from '../../console/PixelIcon';
import type { IconName } from '../../console/pixelIcons';
import { useFlashOnChange } from '../../useFlashOnChange';

function Stock({ icon, value, label, title, className, tone }: {
  icon: IconName;
  value: string | number;
  label: string;
  title: string;
  className?: string;
  tone?: string;
}) {
  const flash = useFlashOnChange(typeof value === 'number' ? value : 0);
  return (
    <span className={`strip-item ${className ?? ''}`} title={title} aria-label={`${label}: ${value}`}>
      <PixelIcon name={icon} />
      <span className="strip-pantry-label">{label}</span>
      <span className={`strip-value ${flash}`} style={tone ? { color: tone } : undefined}>{value}</span>
    </span>
  );
}

function Count({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <span className="strip-item" title={label}>
      <PixelIcon name={icon} />
      <span className="strip-value">{value}</span>
    </span>
  );
}

/**
 * The left side of the top strip for a Human player: rations (they pay for
 * troops), minerals (they pay for buildings), the supply in use against the
 * cap, and the troops by type. The Swarm's food, pantry and castes stay out.
 */
export function HumanResources({ human }: { human: HumanPlayerStats }) {
  const full = human.supply >= human.supplyCap;
  return (
    <>
      <Stock
        icon="bowl"
        value={human.rations}
        label="Raciones"
        className="strip-rations"
        title={`Raciones: pagan el entrenamiento de las tropas. El Centro de Mando y los depósitos dan ${String(human.income).replace('.', ',')} por segundo.`}
      />
      <Stock
        icon="mineral"
        value={human.minerals}
        label="Minerales"
        className="strip-human-minerals"
        title="Minerales: los constructores los extraen de los yacimientos y los llevan al Centro de Mando. Pagan los edificios."
      />
      <Stock
        icon="group"
        value={`${human.supply}/${human.supplyCap}`}
        label="Suministro"
        className={full ? 'strip-supply strip-supply--full' : 'strip-supply'}
        tone={full ? 'var(--chrome-danger)' : undefined}
        title={full
          ? 'Suministro al máximo: construye un depósito de suministros para entrenar más tropas.'
          : 'Suministro: tropas vivas y en cola contra el límite del Centro de Mando y los depósitos.'}
      />
      <span className="strip-sep" aria-hidden="true" />
      <span className="strip-pop">
        <Count icon="pick" value={human.units.builder} label="Constructores" />
        <Count icon="sword" value={human.units.soldier} label="Soldados" />
        <Count icon="target" value={human.units.marksman} label="Tiradores" />
        <Count icon="shield" value={human.units.tank} label="Tanques" />
      </span>
    </>
  );
}
