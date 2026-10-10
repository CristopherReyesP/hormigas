import { UI_TEXT } from './steps';
import { Hormi } from './Hormi';
import './tutorial.css';

interface TutorialOfferProps {
  onAccept: () => void;
  onDecline: () => void;
}

/** First visit: Hormi offers to teach the game, over the race picker. */
export function TutorialOffer({ onAccept, onDecline }: TutorialOfferProps) {
  return (
    <div className="tut-help-backdrop tut-offer-backdrop">
      <div className="tut-help tut-offer chrome-plate" role="dialog" aria-modal="true" aria-labelledby="tut-offer-title">
        <div className="chrome-plate-inner tut-help-inner">
          <div className="tut-head">
            <Hormi cheering />
            <div className="tut-head-text">
              <span id="tut-offer-title" className="tut-title">{UI_TEXT.offerTitle}</span>
            </div>
          </div>
          <p className="tut-say">{UI_TEXT.offerBody}</p>
          <div className="tut-actions">
            <button type="button" className="tut-btn tut-btn--go" data-sfx="start" data-tutorial-accept="" onClick={onAccept}>
              {UI_TEXT.offerAccept}
            </button>
            <button type="button" className="tut-btn tut-btn--quiet" data-tutorial-decline="" onClick={onDecline}>
              {UI_TEXT.offerDecline}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
