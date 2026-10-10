import type { BossBarInfo, InvasionInfo, WaveThreat } from '../game/systems/UndergroundInvasionSystem';
import type { WaveReward } from '../game/run/waveRewards';
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

const rewardLine = (reward: WaveReward) => `+${reward.minerals} minerales · +${reward.food} comida`;

/** The boss's health (and shield) at the top of the screen while it lives */
function BossBar({ boss }: { boss: BossBarInfo }) {
  const pct = (n: number, of: number) => `${Math.round((Math.max(0, n) / Math.max(1, of)) * 100)}%`;
  return (
    <div className={`boss-bar boss-bar--${boss.kind}`} role="progressbar" aria-label={boss.name} aria-valuemin={0} aria-valuemax={boss.maxHealth} aria-valuenow={boss.health}>
      <span className="boss-bar-name">{boss.name}</span>
      <span className="boss-bar-track">
        <span className="boss-bar-fill" style={{ width: pct(boss.health, boss.maxHealth) }} />
      </span>
      {boss.maxShield > 0 && (
        <span className="boss-bar-track boss-bar-track--shield">
          <span className="boss-bar-fill boss-bar-fill--shield" style={{ width: pct(boss.shield, boss.maxShield) }} />
        </span>
      )}
    </div>
  );
}

/**
 * Night-wave alerts over the game view, impossible to miss: the warning
 * banner half a minute ahead, the big arrival announcement (with a red edge
 * pulse), the remaining-enemies counter, the "cleared" message, and red
 * arrows on the screen edge pointing at where the enemies come from.
 * The edge pulse and the arrows cover the screen (WaveAlert.css); the
 * banners flow in the column under the top strip (AlertStack). Never takes input.
 */
export function WaveAlert({ invasion, activeLayer, view }: WaveAlertProps) {
  const { banner, active } = invasion;
  const warning = banner?.kind === 'warning' && !active;
  const boss = invasion.boss ?? null;
  if (!banner && !active && !boss) return null;
  const threats = warning || active ? invasion.threats.filter((t) => t.layer === activeLayer) : [];
  // No arrow can point across layers: say where the fight is instead
  const elsewhere = active && threats.length === 0 && invasion.threats.length > 0
    ? (activeLayer === 'surface' ? ' · en el NIDO' : ' · en la SUPERFICIE')
    : '';

  const pulse = banner?.kind === 'arrival';
  const markers = view !== null && threats.length > 0;

  return (
    <>
      {(pulse || markers) && (
        <div className="wave-alert" aria-hidden="true">
          {pulse && (
            <div key={`pulse-${banner.id}`} className={banner.boss ? 'wave-edge-pulse wave-edge-pulse--boss' : 'wave-edge-pulse'} />
          )}
          {markers && <Markers threats={threats} view={view} />}
        </div>
      )}
      {/* The banners flow in the column under the top strip (AlertStack) */}
      <div className="wave-alert-banners" aria-live="assertive">
        {boss && <BossBar boss={boss} />}

        {warning && banner && (
          <div className="wave-banner">
            <span className="wave-banner-title">¡Oleada {banner.wave} en {Math.max(0, Math.ceil(invasion.nextWaveIn))} s!</span>
            <span className="wave-banner-sub">
              {plural(banner.count, 'enemigo', 'enemigos')}
              {banner.elites ? ` · ${plural(banner.elites, 'élite', 'élites')}` : ''}
              {banner.bossName ? ` · jefe: ${banner.bossName}` : ''} · prepara a tus soldados
            </span>
          </div>
        )}

        {active && (
          <div className="wave-counter">
            Oleada {invasion.waveNumber} · <strong>{invasion.remaining}</strong>/{invasion.waveSize} restantes{elsewhere}
          </div>
        )}

        {banner?.kind === 'arrival' && banner.boss && (
          <div key={`announce-${banner.id}`} className="wave-announce wave-announce--boss">
            <span className="wave-announce-title">LA REINA DE CRISTAL</span>
            <span className="wave-announce-sub">Oleada {banner.wave} · {plural(banner.count, 'enemigo', 'enemigos')}</span>
            <span className="wave-announce-sub">Su aura recarga los escudos de su escolta y su pulso daña a quien se acerca.</span>
          </div>
        )}

        {banner?.kind === 'arrival' && !banner.boss && banner.bossName && (
          <div key={`announce-${banner.id}`} className="wave-announce wave-announce--miniboss">
            <span className="wave-announce-title">{banner.bossName}</span>
            <span className="wave-announce-sub">Oleada {banner.wave} · {plural(banner.count, 'enemigo', 'enemigos')}</span>
            {banner.bossAbility && <span className="wave-announce-sub">{banner.bossAbility}</span>}
          </div>
        )}

        {banner?.kind === 'arrival' && !banner.boss && !banner.bossName && (
          <div key={`announce-${banner.id}`} className="wave-announce">
            <span className="wave-announce-title">OLEADA {banner.wave}</span>
            <span className="wave-announce-sub">{plural(banner.count, 'enemigo', 'enemigos')}</span>
          </div>
        )}

        {banner?.kind === 'cleared' && (
          <div key={`announce-${banner.id}`} className={banner.perfect ? 'wave-announce wave-announce--cleared wave-announce--perfect' : 'wave-announce wave-announce--cleared'}>
            <span className="wave-announce-title">{banner.perfect ? '¡Defensa perfecta!' : `¡Oleada ${banner.wave} superada!`}</span>
            {banner.perfect && <span className="wave-announce-sub">Oleada {banner.wave} superada sin perder ni una hormiga</span>}
            {banner.reward && <span className="wave-announce-sub wave-announce-reward">{rewardLine(banner.reward)}</span>}
          </div>
        )}

        {banner?.kind === 'bossDown' && (
          <div key={`announce-${banner.id}`} className="wave-announce wave-announce--cleared wave-announce--bossdown">
            <span className="wave-announce-title">¡Derrotaste al {banner.bossName}!</span>
            {banner.reward && <span className="wave-announce-sub wave-announce-reward">{rewardLine(banner.reward)}</span>}
          </div>
        )}
      </div>
    </>
  );
}
