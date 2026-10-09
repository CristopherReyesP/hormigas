import { useEffect, useMemo, useState } from 'react';
import { cardHotkeys, GRID_LETTERS, slotForKey } from './commandCardLayout';
import type { CommandDef } from './commands';
import { PixelIcon } from './PixelIcon';

interface CommandCardProps {
  commands: Array<CommandDef | null>;
  /** Hotkeys listen only while no overlay (evolution chamber, game over) is up */
  hotkeysEnabled: boolean;
  onEscape: () => void;
}

/** Why a grid letter was swapped for a stand-in — told in the tooltip. */
const RESERVED_REASON: Record<string, string> = {
  E: 'la E abre la cámara de evolución en modo desarrollo',
  R: 'la R reinicia la cámara',
  M: 'la M muestra u oculta el mapa',
};

const PRESS_FLASH_MS = 140;

/** 3×5 command card with positional hotkeys and a tooltip plate above it. */
export function CommandCard({ commands, hotkeysEnabled, onEscape }: CommandCardProps) {
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
      if (!command || command.disabled) return;
      e.preventDefault();
      command.run();
      setPressed(slot);
      window.setTimeout(() => setPressed((current) => (current === slot ? null : current)), PRESS_FLASH_MS);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkeysEnabled, commands, hotkeys, onEscape]);

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
                  disabled={command.disabled}
                  aria-label={`${command.label} (${key})`}
                  aria-keyshortcuts={key}
                  aria-pressed={command.active ?? undefined}
                  onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered((h) => (h === i ? null : h))}
                  onClick={command.run}
                >
                  <span className="cmd-face">
                    {command.icon ? (
                      <PixelIcon name={command.icon} size={32} />
                    ) : (
                      <span className="cmd-glyph">{command.glyph}</span>
                    )}
                    <span className="cmd-key">{key}</span>
                    {command.badge && <span className="cmd-badge">{command.badge}</span>}
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
              <div className="cmd-tip-cost">
                <PixelIcon name={tip.cost.resource === 'hongos' ? 'fungus' : 'leaf'} />
                {tip.cost.amount} {tip.cost.resource}
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
