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

interface MutationsButtonProps {
  /** The swarm's mutations with their stacks */
  mutations: ReadonlyArray<{ name: string; stacks: number }>;
  onOpen: () => void;
}

/** Over MEJORAS once the swarm has mutated: how many mutation levels it carries; opens the Mutaciones tab. */
export function MutationsButton({ mutations, onOpen }: MutationsButtonProps) {
  const levels = mutations.reduce((sum, m) => sum + m.stacks, 0);
  if (levels === 0) return null;
  const list = mutations.map((m) => `${m.name} ×${m.stacks}`).join(' · ');
  return (
    <button
      type="button"
      className="upg-mut-launch"
      aria-label={`Mutaciones: ${list}`}
      title={`Mutaciones: ${list}`}
      data-sfx="command"
      onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
      onClick={onOpen}
    >
      <PixelIcon name="vein" size={8} />
      <span className="upg-mut-launch-label">MUTACIONES</span>
      <span className="upg-mut-launch-count">{levels}</span>
    </button>
  );
}
