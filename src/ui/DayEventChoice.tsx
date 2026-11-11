import type { GameStats } from '../game/GameManager';
import type { DayEventId } from '../game/run/dayEvents';

interface DayEventChoiceProps {
  offer: GameStats['dayEventOffer'];
  onPick: (id: DayEventId) => void;
}

/**
 * A special dawn: two days to pick from, on a card that does not stop the
 * game. When the countdown runs out the first one comes on its own.
 */
export function DayEventChoice({ offer, onPick }: DayEventChoiceProps) {
  if (!offer) return null;
  return (
    <div className="day-choice pixel-panel" role="group" aria-label="Elige el día especial">
      <div className="day-choice-head">
        <span>AMANECER ESPECIAL · ELIGE</span>
        <span className="day-choice-clock">{`${offer.remaining}s`}</span>
      </div>
      <div className="day-choice-options">
        {offer.options.map((option, index) => (
          <button
            key={option.id}
            type="button"
            className="pixel-btn day-choice-btn"
            data-day-event={option.id}
            title={index === 0 ? 'Si no eliges, llega este' : undefined}
            onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
            onClick={() => onPick(option.id)}
          >
            <strong>{option.name.toUpperCase()}</strong>
            <span className="day-choice-blurb">{option.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
