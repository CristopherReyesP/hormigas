import { formatDigCounter, formatDigEta, type DigStatus } from '../../game/dig/digStatus';

/** Excavar's counter: marks over the cap as a small bar, and the time left. */
export function DigMeter({ status }: { status: DigStatus }) {
  const percent = Math.round(status.fraction * 100);
  return (
    <div className={`dig-meter dig-meter--${status.level}`}>
      <span className="dig-meter-label">{formatDigCounter(status)}</span>
      <span
        className="dig-meter-bar"
        role="progressbar"
        aria-label="Marcas de excavación"
        aria-valuenow={status.pending}
        aria-valuemin={0}
        aria-valuemax={status.cap}
      >
        <span className="dig-meter-fill" style={{ width: `${percent}%` }} />
      </span>
      <span className="dig-meter-eta">{status.level === 'full' ? `Límite alcanzado · ${formatDigEta(status)}` : formatDigEta(status)}</span>
    </div>
  );
}
