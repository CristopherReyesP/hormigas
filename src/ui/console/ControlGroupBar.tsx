import type { ControlGroupInfo } from '../../game/GameManager';
import { PixelIcon } from './PixelIcon';
import { ROLE_ICON, ROLE_LABEL, ROLE_PLURAL } from './format';

interface ControlGroupBarProps {
  groups: readonly ControlGroupInfo[];
  /** A chip was clicked: select its group (twice quickly also moves the camera there) */
  onRecall: (slot: number) => void;
}

/**
 * StarCraft's control group tabs on the console's top edge: one chip per
 * bound digit with its number, the caste most of it belongs to and how many
 * ants it holds. The chip of the group that is the current selection lights up.
 */
export function ControlGroupBar({ groups, onRecall }: ControlGroupBarProps) {
  if (groups.length === 0) return null;
  return (
    <div className="ctrl-groups" role="toolbar" aria-label="Grupos de control">
      {groups.map((group) => {
        const ants = `${group.count} ${(group.count === 1 ? ROLE_LABEL : ROLE_PLURAL)[group.role].toLowerCase()}`;
        return (
          <button
            key={group.slot}
            type="button"
            className={group.selected ? 'ctrl-chip ctrl-chip--selected' : 'ctrl-chip'}
            aria-label={`Grupo ${group.slot}: ${ants}`}
            aria-pressed={group.selected}
            aria-keyshortcuts={String(group.slot)}
            title={`Grupo ${group.slot} · ${ants}. Pulsa ${group.slot} para seleccionarlo y ${group.slot} dos veces para ir hacia él. Ctrl+${group.slot} lo reasigna.`}
            onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
            onClick={() => onRecall(group.slot)}
          >
            <span className="ctrl-chip-key">{group.slot}</span>
            <PixelIcon name={ROLE_ICON[group.role]} size={16} />
            <span className="ctrl-chip-count">{group.count}</span>
          </button>
        );
      })}
    </div>
  );
}
