import { PixelIcon } from '../console/PixelIcon';
import { upgradeBadge } from './upgradeUi';
import './upgrades.css';

interface UpgradesButtonProps {
  /** Lines the colony can buy now */
  affordable: number;
  onOpen: () => void;
}

/** The big labeled MEJORAS button over the command card; it glows with a count when something can be bought. */
export function UpgradesButton({ affordable, onOpen }: UpgradesButtonProps) {
  const badge = upgradeBadge(affordable);
  return (
    <button
      type="button"
      className={badge.glow ? 'upg-launch upg-launch--ready' : 'upg-launch'}
      aria-label={badge.text ? `Mejoras: ${badge.text} disponibles` : 'Mejoras'}
      title="Mejoras del enjambre: reina, incubación, castas, colonia y estadísticas"
      data-sfx="command"
      onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
      onClick={onOpen}
    >
      <PixelIcon name="upgrade" size={16} />
      <span className="upg-launch-label">MEJORAS</span>
      {badge.text && <span className="upg-launch-badge">{badge.text}</span>}
    </button>
  );
}
