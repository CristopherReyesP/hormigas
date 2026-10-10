import type { InvasionInfo, WaveThreat } from '../game/systems/UndergroundInvasionSystem';
import { edgeMarker, type ViewRect } from './waveAlertLayout';
import './WaveAlert.css';

interface WaveAlertProps {
  invasion: InvasionInfo;
  activeLayer: 'surface' | 'underground';
  /** The camera's view on the active layer, in tiles; null hides the arrows */
  view: ViewRect | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Markers({ threats, view }: { threats: WaveThreat[]; view: ViewRect }) {
  return (
    <>
      {threats.map((t, i) => {
        const m = edgeMarker(view, t);
        const style = { left: `${m.left}%`, top: `${m.top}%` };
        return m.inside ? (
          <span key={i} className="wave-ping" style={style} aria-hidden="true" />
        ) : (
          <span key={i} className="wave-arrow" style={{ ...style, transform: `translate(-50%, -50%) rotate(${m.angle}deg)` }} aria-hidden="true">
            <span className="wave-arrow-head" />
          </span>
        );
      })}
    </>
  );
}

/**
 * Night-wave alerts over the game view, impossible to miss: the warning
 * banner half a minute ahead, the big arrival announcement (with a red edge
 * pulse), the remaining-enemies counter, the "cleared" message, and red
 * arrows on the screen edge pointing at where the enemies come from.
 * Self-contained (WaveAlert.css), fixed over the screen, never takes input.
 */
export function WaveAlert({ invasion, activeLayer, view }: WaveAlertProps) {
  const { banner, active } = invasion;
  const warning = banner?.kind === 'warning' && !active;
  if (!banner && !active) return null;
  const threats = warning || active ? invasion.threats.filter((t) => t.layer === activeLayer) : [];
  // No arrow can point across layers: say where the fight is instead
  const elsewhere = active && threats.length === 0 && invasion.threats.length > 0
    ? (activeLayer === 'surface' ? ' · en el NIDO' : ' · en la SUPERFICIE')
    : '';

  return (
    <div className="wave-alert" aria-live="assertive">
      {banner?.kind === 'arrival' && <div key={banner.id} className="wave-edge-pulse" aria-hidden="true" />}
      {view && threats.length > 0 && <Markers threats={threats} view={view} />}

      {warning && banner && (
        <div className="wave-banner">
          <span className="wave-banner-title">¡Oleada {banner.wave} en {Math.max(0, Math.ceil(invasion.nextWaveIn))} s!</span>
          <span className="wave-banner-sub">{plural(banner.count, 'enemigo', 'enemigos')} · prepara a tus soldados</span>
        </div>
      )}

      {active && (
        <div className="wave-counter">
          Oleada {invasion.waveNumber} · <strong>{invasion.remaining}</strong>/{invasion.waveSize} restantes{elsewhere}
        </div>
      )}

      {banner?.kind === 'arrival' && (
        <div key={banner.id} className="wave-announce">
          <span className="wave-announce-title">OLEADA {banner.wave}</span>
          <span className="wave-announce-sub">{plural(banner.count, 'enemigo', 'enemigos')}</span>
        </div>
      )}

      {banner?.kind === 'cleared' && (
        <div key={banner.id} className="wave-announce wave-announce--cleared">
          <span className="wave-announce-title">¡Oleada {banner.wave} superada!</span>
        </div>
      )}
    </div>
  );
}
