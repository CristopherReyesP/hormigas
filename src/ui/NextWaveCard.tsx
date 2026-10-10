import { useState } from 'react';
import type { InvasionInfo } from '../game/systems/UndergroundInvasionSystem';
import { PixelIcon } from './console/PixelIcon';

interface NextWaveCardProps {
  invasion: InvasionInfo;
  /** Start unfolded (tests and previews); the player's taps toggle it after that */
  defaultOpen?: boolean;
}

/** 95 → "1:35" */
function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * "Próxima oleada": what scouting tells about the coming wave, all day long.
 * Folded it is a small button with the countdown under the top strip, on
 * the right; a tap (or click) unfolds the expected mix by type, the elites
 * with their affixes, the boss and where the wave comes from. Gone while a
 * wave is on (the wave counter takes over).
 */
export function NextWaveCard({ invasion, defaultOpen = false }: NextWaveCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const next = invasion.next;
  if (invasion.active || !next) return null;
  const danger = invasion.nextWaveIn <= 30;
  return (
    <aside className={`next-wave${danger ? ' next-wave--soon' : ''}`} aria-label="Próxima oleada">
      <div className="chrome-plate">
        <div className="chrome-plate-inner next-wave-inner">
          <button
            type="button"
            className="next-wave-head"
            aria-expanded={open}
            title={open ? 'Ocultar la próxima oleada' : 'Ver la próxima oleada'}
            onClick={() => setOpen((o) => !o)}
          >
            <PixelIcon name="alert" />
            <span className="hud-label">Próxima oleada</span>
            <span className="next-wave-clock">{clock(invasion.nextWaveIn)}</span>
            <span className="hud-dim" aria-hidden="true">{open ? '-' : '+'}</span>
          </button>
          {open && (
            <div className="next-wave-body">
              <div className="next-wave-title">
                Oleada {next.wave} · {next.total} {next.total === 1 ? 'enemigo' : 'enemigos'}
              </div>
              <ul className="next-wave-list">
                {next.groups.map((g) => (
                  <li key={g.id}>
                    <span>{g.label}</span>
                    <span className="next-wave-count">{g.count}</span>
                  </li>
                ))}
              </ul>
              {next.elites.length > 0 && (
                <>
                  <div className="next-wave-sub">Élites</div>
                  <ul className="next-wave-list">
                    {next.elites.map((e) => (
                      <li key={e.affix}>
                        <span>
                          <span className="next-wave-affix" style={{ color: e.color }} aria-hidden="true">{e.icon}</span> {e.name}
                        </span>
                        <span className="next-wave-count">{e.count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {next.boss && (
                <div className="next-wave-boss">
                  <span className="next-wave-boss-name">Jefe: {next.boss.name}</span>
                  <span className="hud-dim">{next.boss.ability}</span>
                </div>
              )}
              <div className="next-wave-sub">Por dónde llega</div>
              {next.wildlife && <div className="next-wave-where">Acorazados: desde el {next.wildlife.direction}, por la superficie</div>}
              {next.entrance && <div className="next-wave-where">Nido: entrada {next.entrance.label}</div>}
              {next.surface && <div className="next-wave-where">Rival: desde el {next.surface.direction}</div>}
              {!next.entrance && !next.surface && !next.wildlife && <div className="hud-dim">Sin datos</div>}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
