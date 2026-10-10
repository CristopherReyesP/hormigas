export interface OrderToast {
  id: number;
  text: string;
  tone: 'move' | 'attack' | 'select';
}

export interface CasteBurst {
  id: number;
  /** CSS px in the window */
  x: number;
  y: number;
  text: string;
}

interface TouchFeedbackProps {
  toast: OrderToast | null;
  burst: CasteBurst | null;
}

/** Room the label needs on each side of the finger before it would run off the screen */
const LABEL_HALF_PX = 130;

/** Which way the long-press label hangs: centered on the finger, or inward near an edge. */
function burstSide(x: number): 'center' | 'left' | 'right' {
  const width = typeof window !== 'undefined' ? window.innerWidth : Infinity;
  if (x < LABEL_HALF_PX) return 'left';
  if (x > width - LABEL_HALF_PX) return 'right';
  return 'center';
}

/**
 * Phone order feedback over the map: a short toast that names the order
 * ("5 soldados → atacar guarida"), and the ring and label a long press
 * leaves where the finger was ("6 soldados en pantalla"). Each new event
 * remounts its element (key) so the CSS animation starts over.
 */
export function TouchFeedback({ toast, burst }: TouchFeedbackProps) {
  return (
    <div className="touch-feedback" aria-live="polite">
      {toast && (
        <div key={toast.id} className={`order-toast order-toast--${toast.tone}`} role="status">
          {toast.text}
        </div>
      )}
      {burst && (
        <div key={burst.id} className={`caste-burst caste-burst--${burstSide(burst.x)}`} style={{ left: burst.x, top: burst.y }}>
          <span className="caste-burst-ring" aria-hidden="true" />
          <span className="caste-burst-label">{burst.text}</span>
        </div>
      )}
    </div>
  );
}
