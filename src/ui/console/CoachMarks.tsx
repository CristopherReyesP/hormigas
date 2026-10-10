import { useEffect, useState } from 'react';
import { COACH_STEPS, coachSelector, coachStorage, hasSeenCoach, markCoachSeen } from './coachMarks';

interface CoachMarksProps {
  /** A touch screen in a running game with nothing else over the HUD */
  active: boolean;
}

interface Spot {
  left: number;
  top: number;
  width: number;
  /** Where the arrow points, from the bubble's left edge */
  arrow: number;
}

const BUBBLE_W = 260;
/** How often the target is measured again: the bar and the card change with the selection */
const MEASURE_MS = 250;

/** Where the step's bubble goes: just above its target, kept on screen. */
function measure(selector: string): Spot | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  const width = Math.min(BUBBLE_W, window.innerWidth - 16);
  const center = rect.left + rect.width / 2;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, center - width / 2));
  return { left, top: rect.top, width, arrow: Math.round(center - left) };
}

/**
 * First game on a touch screen: three pointers, one after another, at the
 * quick-select bar, the hint line and Atacar (which waits until troops are
 * picked and the button shows). "Saltar" ends them; they never come back.
 */
export function CoachMarks({ active }: CoachMarksProps) {
  const [step, setStep] = useState<number | null>(() => (hasSeenCoach(coachStorage()) ? null : 0));
  const [spot, setSpot] = useState<{ step: number; at: Spot } | null>(null);
  const current = step !== null ? COACH_STEPS[step] : null;

  useEffect(() => {
    if (!active || step === null) return;
    const selector = coachSelector(COACH_STEPS[step].anchor);
    const update = () => {
      const at = measure(selector);
      setSpot((prev) => {
        if (!at) return null;
        if (prev && prev.step === step && prev.at.left === at.left && prev.at.top === at.top && prev.at.width === at.width && prev.at.arrow === at.arrow) return prev;
        return { step, at };
      });
    };
    update();
    const timer = window.setInterval(update, MEASURE_MS);
    return () => window.clearInterval(timer);
  }, [active, step]);

  if (!active || step === null || !current || !spot || spot.step !== step) return null;

  const last = step === COACH_STEPS.length - 1;
  const finish = () => {
    markCoachSeen(coachStorage());
    setStep(null);
  };
  const next = () => (last ? finish() : setStep(step + 1));

  return (
    <div
      className="coach-mark"
      role="dialog"
      aria-label={current.title}
      style={{ left: spot.at.left, top: spot.at.top, width: spot.at.width, ["--arrow-x" as string]: `${spot.at.arrow}px` }}
    >
      <div className="coach-mark-inner">
        <div className="coach-mark-title">
          <span>{current.title}</span>
          <span className="coach-mark-step">{step + 1}/{COACH_STEPS.length}</span>
        </div>
        <p className="coach-mark-text">{current.text}</p>
        <div className="coach-mark-actions">
          {!last && (
            <button type="button" className="hud-btn coach-mark-skip" onClick={finish}>
              Saltar
            </button>
          )}
          <button type="button" className="hud-btn coach-mark-next" onClick={next}>
            {last ? 'Entendido' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}
