import type { GameStats } from '../../game/GameManager';
import type { QuickSelectKind } from '../../game/systems/helpers/quickSelect';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { ROLE_ICON, ROLE_LABEL, ROLE_PLURAL } from './format';
import type { TouchHint } from './touchHint';

interface TouchCommandBarProps {
  stats: GameStats;
  hint: TouchHint;
  /** The full info panel is open over the map */
  infoOpen: boolean;
  onToggleInfo: () => void;
  onQuickSelect: (kind: QuickSelectKind) => void;
  onRecallGroup: (slot: number) => void;
  onClearSelection: () => void;
}

const CHIP: Record<QuickSelectKind, { label: string; icon: IconName }> = {
  soldier: { label: 'Soldados', icon: 'sword' },
  worker: { label: 'Obreras', icon: 'worker' },
  scout: { label: 'Exploradoras', icon: 'eye' },
  all: { label: 'Todas', icon: 'group' },
};

/**
 * The compact HUD's command bar, over the command card: the hint line (what
 * a tap does now, the selection count with its ✕, and the details button
 * that opens the info panel), and the quick-select bar: Soldados,
 * Obreras, Exploradoras and Todas, then the control groups. A chip selects
 * every ant of its kind on the map; a second tap centers the camera on them.
 * Hidden on the desktop console.
 */
export function TouchCommandBar({ stats, hint, infoOpen, onToggleInfo, onQuickSelect, onRecallGroup, onClearSelection }: TouchCommandBarProps) {
  const chips = stats.quickSelect ?? [];
  const groups = stats.controlGroups ?? [];
  return (
    <section className="console-quick" aria-label="Elegir tropas">
      <div className={`quick-hint quick-hint--${hint.mode}`} data-coach="hint-line" aria-live="polite">
        <span className="quick-hint-text">{hint.text}</span>
        {hint.selection && (
          <button
            type="button"
            className="quick-selection"
            aria-label={`Quitar selección: ${hint.selection}`}
            title="Quitar selección"
            onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
            onClick={onClearSelection}
          >
            <span className="quick-selection-text">{hint.selection}</span>
            <span className="quick-selection-x" aria-hidden="true">✕</span>
          </button>
        )}
        <button
          type="button"
          className="quick-info"
          aria-expanded={infoOpen}
          aria-label={infoOpen ? 'Ocultar los detalles' : 'Ver los detalles'}
          title={infoOpen ? 'Ocultar los detalles' : 'Ver los detalles'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onToggleInfo}
        >
          <PixelIcon name={infoOpen ? 'minus' : 'plus'} />
        </button>
      </div>
      <div className="quick-bar" role="toolbar" aria-label="Selección rápida" data-coach="quick-bar">
        {chips.map((chip) => {
          const { label, icon } = CHIP[chip.kind];
          return (
            <button
              key={chip.kind}
              type="button"
              className={chip.selected ? 'quick-chip quick-chip--selected' : 'quick-chip'}
              aria-pressed={chip.selected}
              aria-label={`${label}: ${chip.count}`}
              title={chip.selected ? `${label}: toca otra vez para centrar la vista en el grupo` : `Elegir ${label.toLowerCase()} en todo el mapa`}
              disabled={chip.count === 0}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onQuickSelect(chip.kind)}
            >
              <span className="quick-chip-top">
                <PixelIcon name={icon} size={16} />
                <span className="quick-chip-count">{chip.count}</span>
              </span>
              <span className="quick-chip-label">{label}</span>
            </button>
          );
        })}
        {groups.map((group) => {
          const ants = `${group.count} ${(group.count === 1 ? ROLE_LABEL : ROLE_PLURAL)[group.role].toLowerCase()}`;
          return (
            <button
              key={`group-${group.slot}`}
              type="button"
              className={group.selected ? 'quick-chip quick-chip--group quick-chip--selected' : 'quick-chip quick-chip--group'}
              aria-pressed={group.selected}
              aria-label={`Grupo ${group.slot}: ${ants}`}
              title={`Grupo ${group.slot} · ${ants}. Tócalo dos veces seguidas para ir hacia él.`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRecallGroup(group.slot)}
            >
              <span className="quick-chip-top">
                <PixelIcon name={ROLE_ICON[group.role]} size={16} />
                <span className="quick-chip-count">{group.count}</span>
              </span>
              <span className="quick-chip-label">Grupo {group.slot}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
