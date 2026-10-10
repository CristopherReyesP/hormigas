import { useEffect } from 'react';
import { HELP_CONTROLS, UI_TEXT, type Device } from './steps';
import { Hormi } from './Hormi';
import './tutorial.css';

interface HelpCardProps {
  device: Device;
  onClose: () => void;
  /** Start the tutorial again (a fresh tutorial run) */
  onReplayTutorial: () => void;
}

/**
 * The "?" card: the controls for this device (touch gestures, or mouse and
 * keys) and the goal of the game, with Repetir tutorial. For players who
 * skipped the tutorial as much as for those who forgot.
 */
export function HelpCard({ device, onClose, onReplayTutorial }: HelpCardProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="tut-help-backdrop" onClick={onClose}>
      <div
        className="tut-help chrome-plate"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tut-help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="chrome-plate-inner tut-help-inner">
          <div className="tut-head">
            <Hormi />
            <div className="tut-head-text">
              <span className="tut-progress">{device === 'touch' ? 'Pantalla táctil' : 'Mouse y teclado'}</span>
              <span id="tut-help-title" className="tut-title">{UI_TEXT.helpTitle}</span>
            </div>
          </div>
          <dl className="tut-help-list">
            {HELP_CONTROLS[device].map((c) => (
              <div key={c.what} className="tut-help-row">
                <dt>{c.what}</dt>
                <dd>{c.how}</dd>
              </div>
            ))}
          </dl>
          <p className="tut-say tut-help-goal">{UI_TEXT.helpGoal}</p>
          <div className="tut-actions">
            <button type="button" className="tut-btn tut-btn--go" data-help-replay="" onClick={onReplayTutorial}>
              {UI_TEXT.helpReplay}
            </button>
            <button type="button" className="tut-btn tut-btn--quiet" data-help-close="" onClick={onClose}>
              {UI_TEXT.helpClose}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
