import { useEffect, useMemo, useState } from 'react';
import { cardHotkeys, GRID_LETTERS, slotForKey } from './commandCardLayout';
import type { CommandDef } from './commands';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { uiSound } from '../../audio';

interface CommandCardProps {
  commands: Array<CommandDef | null>;
  /** Hotkeys listen only while no overlay (evolution chamber, game over) is up */
  hotkeysEnabled: boolean;
  onEscape: () => void;
  /** A disabled command was pressed: say why (StarCraft's "not enough minerals") */
  onBlocked?: (command: CommandDef) => void;
}

/** Why a grid letter was swapped for a stand-in — told in the tooltip. */
const RESERVED_REASON: Record<string, string> = {
  E: 'la E abre la cámara de evolución en modo desarrollo',
  R: 'la R reinicia la cámara',
  M: 'la M muestra u oculta el mapa',
};

const PRESS_FLASH_MS = 140;

/** Eggs are paid from the pantry, upgrades from farm fungus */
const COST_ICON: Record<NonNullable<CommandDef['cost']>['resource'], IconName> = {
  comida: 'pantry',
  hongos: 'fungus',
};

const COST_LABEL: Record<NonNullable<CommandDef['cost']>['resource'], string> = {
  comida: 'de comida de la despensa',
  hongos: 'hongos',
};

/** 3×5 command card with positional hotkeys and a tooltip plate above it. */
export function CommandCard({ commands, hotkeysEnabled, onEscape, onBlocked }: CommandCardProps) {
  const hotkeys = useMemo(() => cardHotkeys(), []);
  const [hovered, setHovered] = useState<number | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);

  useEffect(() => {
    if (!hotkeysEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      if (e.code === 'Escape') {
        onEscape();
        return;
      }
      const slot = slotForKey(e.code, hotkeys);
      const command = slot >= 0 ? commands[slot] : null;
      if (!command) return;
      e.preventDefault();
      uiSound(command.disabled ? 'error' : 'command');
      if (command.disabled) {
        onBlocked?.(command);
        return;
      }
      command.run();
      setPressed(slot);
      window.setTimeout(() => setPressed((current) => (current === slot ? null : current)), PRESS_FLASH_MS);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeysEnabled, commands, hotkeys, onEscape, onBlocked]);

  const tip = hovered !== null ? commands[hovered] : null;

  return (
    <section className="console-card" aria-label="Comandos">
      <div className="chrome-plate console-plate">
      <div className="chrome-plate-inner console-card-inner">
        <div className="cmd-grid">
          {commands.map((command, i) => {
            const key = hotkeys[i];
            if (!command) return <div key={`empty-${i}`} className="cmd-slot cmd-slot--empty" />;
            const classes = [
              'cmd-btn',
              command.active ? 'cmd-btn--active' : '',
              command.tone === 'danger' ? 'cmd-btn--danger' : '',
              command.disabled ? 'cmd-btn--disabled' : '',
              pressed === i ? 'cmd-btn--pressed' : '',
            ].filter(Boolean).join(' ');
            return (
              <div
                key={command.id}
                className="cmd-slot"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered((h) => (h === i ? null : h))}
              >
                <button
                  type="button"
                  className={classes}
                  aria-disabled={command.disabled || undefined}
                  aria-label={`${command.label} (${key})`}
                  aria-keyshortcuts={key}
                  data-sfx="command"
                  aria-pressed={command.active ?? undefined}
                  onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((h) => (h === i ? null : h))}
                  onClick={() => (command.disabled ? onBlocked?.(command) : command.run())}
                >
                  <span className={command.cost ? 'cmd-face cmd-face--cost' : 'cmd-face'}>
                    {command.icon ? (
                      <PixelIcon name={command.icon} size={command.cost ? 24 : 32} />
                    ) : (
                      <span className="cmd-glyph">{command.glyph}</span>
                    )}
                    <span className="cmd-key">{key}</span>
                    {command.badge && (
                      <span className={command.badgeTone ? `cmd-badge cmd-badge--${command.badgeTone}` : 'cmd-badge'}>{command.badge}</span>
                    )}
                    {command.cost && (
                      <span className={command.cost.short ? 'cmd-cost cmd-cost--short' : 'cmd-cost'}>
                        <PixelIcon name={COST_ICON[command.cost.resource]} size={8} />
                        {command.cost.amount}
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {tip && hovered !== null && (
        <div className="cmd-tooltip" role="tooltip">
          <div className="chrome-plate">
          <div className="chrome-plate-inner cmd-tooltip-inner">
            <div className="cmd-tip-title">
              <span>{tip.label}</span>
              <span className="cmd-tip-key">[{hotkeys[hovered]}]</span>
            </div>
            {tip.cost && (
              <div className={tip.cost.short ? 'cmd-tip-cost cmd-tip-cost--short' : 'cmd-tip-cost'}>
                <PixelIcon name={COST_ICON[tip.cost.resource]} />
                {tip.cost.amount} {COST_LABEL[tip.cost.resource]}
              </div>
            )}
            <div className="cmd-tip-desc">{tip.description}</div>
            {tip.altKeys && <div className="cmd-tip-dim">También: {tip.altKeys}</div>}
            {hotkeys[hovered] !== GRID_LETTERS[hovered] && (
              <div className="cmd-tip-dim">
                Tecla {hotkeys[hovered]}: {RESERVED_REASON[GRID_LETTERS[hovered]] ?? 'su letra está reservada'}.
              </div>
            )}
            {tip.disabled && tip.disabledReason && <div className="cmd-tip-warn">{tip.disabledReason}</div>}
          </div>
          </div>
        </div>
      )}
    </section>
  );
}
