import { useEffect } from 'react';
import { nestAlertTitle, type NestAlertState } from '../game/run/nestAlert';
import { prefersTouch } from './layout/touch';
import './NestAlert.css';

interface NestAlertProps {
  state: NestAlertState;
  activeLayer: 'surface' | 'underground';
  /** "Ir al nido": switch to the nest and center the camera on the fight */
  onGoToNest: () => void;
}

/** A short buzz on phones for every new alert; a harder one when the queen is in danger */
function buzz(critical: boolean): void {
  if (!prefersTouch() || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(critical ? [120, 60, 120] : 90);
  } catch {
    // Blocked (no user gesture yet, or a browser policy): the banner still shows
  }
}

/**
 * Invaders inside the nest: a banner under the wave counter with a button
 * that takes the player to the fight, the queen's health while she is bitten,
 * and a short "Nido despejado" once they are all gone.
 */
export function NestAlert({ state, activeLayer, onGoToNest }: NestAlertProps) {
  const { alert, cleared } = state;
  const alertId = alert?.id ?? 0;
  const critical = alert?.critical ?? false;

  useEffect(() => {
    if (alertId > 0) buzz(critical);
    // Buzz once per alert, not on every live update of its numbers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId]);

  if (!alert && !cleared) return null;

  return (
    <div className="nest-alert-layer" aria-live="assertive">
      {alert && (
        <div key={alert.id} className={`nest-alert nest-alert--${alert.kind}${alert.critical ? ' nest-alert--critical' : ''}`} role="alert">
          <span className="nest-alert-title">{nestAlertTitle(alert)}</span>
          {alert.queen && (
            <span className="nest-alert-queen">
              <span className="nest-alert-queen-label">Reina: {alert.queen.health}/{alert.queen.max}</span>
              <span className="nest-alert-queen-track">
                <span className="nest-alert-queen-fill" style={{ width: `${Math.round((alert.queen.health / Math.max(1, alert.queen.max)) * 100)}%` }} />
              </span>
            </span>
          )}
          {alert.kind !== 'breach' && <span className="nest-alert-sub">{alert.invaders} {alert.invaders === 1 ? 'invasor' : 'invasores'} en el nido</span>}
          <button type="button" className="nest-alert-go" onMouseDown={(e) => e.preventDefault()} onClick={onGoToNest}>{activeLayer === 'surface' ? 'Ir al nido' : 'Ver la pelea'}</button>
        </div>
      )}
      {!alert && cleared && (
        <div key={`clear-${cleared.id}`} className="nest-cleared" role="status">Nido despejado</div>
      )}
    </div>
  );
}
