import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameManager } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { TutorialController } from '../../game/tutorial/TutorialController';
import { TUTORIAL_PLAN } from '../../game/tutorial/plan';
import { emitAudio } from '../../audio';
import { useTouchUi } from '../layout/touch';
import { HUD_BARS, hudLayout, hudScale } from '../layout/hudMetrics';
import { edgeMarker } from '../waveAlertLayout';
import { CHEERS, STEP_COPY, UI_TEXT, deviceOf, goalCopy, layerHint, say } from './steps';
import { placeArrow, placeBubble, type Rect } from './placement';
import { Hormi } from './Hormi';
import { Confetti } from './Confetti';
import './tutorial.css';

/** How often the run is read for the goals */
const POLL_MS = 250;
/** How long each step's celebration lasts before the next step */
export const CELEBRATE_MS = 2000;
const SPOT_PAD = 6;

interface TutorialOverlayProps {
  gameManager: GameManager;
  /** The player left the tutorial: the run goes on as a normal game */
  onExit: () => void;
  /** All ten steps done (or skipped) */
  onFinish: () => void;
}

interface Celebration {
  id: number;
  cheer: string;
  line: string;
}

/** Where the highlight is on screen this frame */
interface Highlight {
  /** A HUD element */
  rect: Rect | null;
  /** A spot on the map: on screen (ring) or off it (edge arrow) */
  world: { x: number; y: number; inside: boolean; angle: number } | null;
}

const NO_HIGHLIGHT: Highlight = { rect: null, world: null };

function visibleRect(selectors: readonly string[]): Rect | null {
  for (const selector of selectors) {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
  }
  return null;
}

function sameHighlight(a: Highlight, b: Highlight): boolean {
  const r = (x?: number) => Math.round(x ?? -1);
  return (
    r(a.rect?.left) === r(b.rect?.left) && r(a.rect?.top) === r(b.rect?.top) && r(a.rect?.width) === r(b.rect?.width) &&
    r(a.rect?.height) === r(b.rect?.height) && r(a.world?.x) === r(b.world?.x) && r(a.world?.y) === r(b.world?.y) &&
    a.world?.inside === b.world?.inside
  );
}

/** Floating HUD pieces over the map (the phone's minimap) that the bubble should leave free */
const FLOATING_HUD = ['.console-minimap'];

function floatingHud(): Rect[] {
  const out: Rect[] = [];
  for (const selector of FLOATING_HUD) {
    const r = document.querySelector(selector)?.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) out.push({ left: r.left, top: r.top, width: r.width, height: r.height });
  }
  return out;
}

/** HUD bar heights on screen now (CSS px), so the bubble stays over the map */
function hudBars(): { top: number; bottom: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const bars = HUD_BARS[hudLayout(w, h)];
  const scale = hudScale(w, h);
  return { top: bars.strip * scale, bottom: bars.deck * scale };
}

/**
 * The guided tutorial over a live run: Hormi's speech bubble with the step,
 * a spotlight and a bouncing arrow on what to touch, and a celebration with
 * confetti, a chime and a star for every step done. Steps advance only when
 * the player really does the thing (TutorialController reads the run).
 */
export function TutorialOverlay({ gameManager, onExit, onFinish }: TutorialOverlayProps) {
  const [controller] = useState(() => new TutorialController(gameManager));
  useSyncExternalStore(controller.subscribe, controller.version);
  const device = deviceOf(useTouchUi());
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [finished, setFinished] = useState(false);
  /** The view on screen (read with the goals): a step in the other view first sends the player back */
  const [layer, setLayer] = useState(() => gameManager.getActiveLayer());
  const [highlight, setHighlight] = useState<Highlight>(NO_HIGHLIGHT);
  const [bubbleHeight, setBubbleHeight] = useState(160);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const bubbleRef = useRef<HTMLDivElement>(null);
  const celebrationTimer = useRef<number | null>(null);

  // Stage the lessons, celebrate each step, and read the run a few times a second
  useEffect(() => {
    const stopCelebration = () => {
      if (celebrationTimer.current !== null) window.clearTimeout(celebrationTimer.current);
      celebrationTimer.current = null;
    };
    const off = controller.onEvent((event) => {
      if (event.type === 'step-done') {
        const index = TUTORIAL_PLAN.findIndex((s) => s.id === event.step);
        setCelebration({ id: Date.now(), cheer: CHEERS[index % CHEERS.length], line: STEP_COPY[event.step].done });
        emitAudio({ type: 'hatch', caste: AntRole.Worker });
        stopCelebration();
        celebrationTimer.current = window.setTimeout(() => {
          celebrationTimer.current = null;
          setCelebration(null);
          controller.next();
        }, CELEBRATE_MS);
      } else if (event.type === 'step-start') {
        stopCelebration();
        setCelebration(null);
      } else if (event.type === 'finished') {
        setFinished(true);
        emitAudio({ type: 'mutationChosen' });
      }
    });
    controller.start();
    const timer = window.setInterval(() => {
      controller.poll();
      setLayer(gameManager.getActiveLayer());
    }, POLL_MS);
    return () => {
      off();
      window.clearInterval(timer);
      stopCelebration();
      controller.dispose();
    };
  }, [controller, gameManager]);

  const state = controller.state;
  const step = controller.step;
  const goal = controller.goal;
  const wanted = step ? STEP_COPY[step.id].layer : undefined;
  const wrongLayer = Boolean(wanted && wanted !== layer && state.phase === 'active');
  const copy = step && goal ? (wrongLayer && wanted ? layerHint(wanted, device) : goalCopy(step.id, goal, device)) : null;
  const active = state.phase === 'active' && !finished;
  const selectorKey = copy?.selectors.join('|') ?? '';
  const focus = copy?.world;

  // Follow the target every frame: buttons appear and the camera moves
  useEffect(() => {
    if (!active) return;
    const selectors = selectorKey ? selectorKey.split('|') : [];
    let frame = 0;
    const tick = () => {
      let next: Highlight = NO_HIGHLIGHT;
      const rect = visibleRect(selectors);
      if (rect) next = { rect, world: null };
      else if (focus && gameManager.getActiveLayer() === 'surface') {
        const at = controller.focus(focus);
        if (at) {
          const m = edgeMarker(gameManager.getActiveView(), { x: at.x + 0.5, y: at.y + 0.5 }, 8);
          next = { rect: null, world: { x: (m.left / 100) * window.innerWidth, y: (m.top / 100) * window.innerHeight, inside: m.inside, angle: m.angle } };
        }
      }
      setHighlight((current) => (sameHighlight(current, next) ? current : next));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, selectorKey, focus, controller, gameManager]);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // The bubble's height decides where it fits
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setBubbleHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const skip = () => controller.skipStep();
  const exit = () => {
    controller.exit();
    onExit();
  };
  const ready = () => {
    controller.ack();
    controller.poll();
  };
  const shown = active ? highlight : NO_HIGHLIGHT;

  const total = TUTORIAL_PLAN.length;
  const stepNumber = Math.min(total, state.stepIndex + 1);
  const progress = finished ? 1 : (state.stepIndex + (state.phase === 'celebrate' ? 1 : 0)) / total;
  const worldTarget = shown.world
    ? { left: shown.world.x - 24, top: shown.world.y - 24, width: 48, height: 48 }
    : null;
  const bubble = placeBubble(viewport, hudBars(), bubbleHeight, shown.rect ?? worldTarget, floatingHud());
  const arrow = shown.rect ? placeArrow(shown.rect, viewport.height) : null;
  const night = step?.id === 'night' && state.phase !== 'done' && !finished;

  return (
    <div className="tut-root" data-tutorial-step={step?.id ?? 'done'} data-tutorial-goal={goal ?? ''}>
      {night && (
        <div className="tut-night" aria-hidden="true">
          <span className="tut-night-banner">{UI_TEXT.nightBanner}</span>
        </div>
      )}

      {active && shown.rect && (
        <div
          className="tut-spotlight"
          style={{
            left: shown.rect.left - SPOT_PAD,
            top: shown.rect.top - SPOT_PAD,
            width: shown.rect.width + SPOT_PAD * 2,
            height: shown.rect.height + SPOT_PAD * 2,
          }}
        />
      )}
      {active && arrow && (
        <div className={`tut-arrow tut-arrow--${arrow.pointing}`} style={{ left: arrow.x, top: arrow.y }} aria-hidden="true">
          <span className="tut-arrow-body" />
        </div>
      )}
      {active && shown.world && shown.world.inside && (
        <div className="tut-ring" style={{ left: shown.world.x, top: shown.world.y }} aria-hidden="true">
          <span className="tut-arrow tut-arrow--down tut-arrow--ring"><span className="tut-arrow-body" /></span>
        </div>
      )}
      {active && shown.world && !shown.world.inside && (
        <div
          className="tut-edge"
          style={{ left: shown.world.x, top: shown.world.y, transform: `translate(-50%, -50%) rotate(${shown.world.angle}deg)` }}
          aria-hidden="true"
        >
          <span className="tut-edge-head" />
        </div>
      )}

      {celebration && (
        <div className="tut-celebrate" key={celebration.id} aria-live="assertive">
          <Confetti seed={celebration.id % 997} />
          <div className="tut-cheer">
            <span className="tut-cheer-title">{celebration.cheer}</span>
            <span className="tut-cheer-line">{celebration.line}</span>
            <span className="tut-cheer-star" aria-label={UI_TEXT.stars(state.stars)}>★</span>
          </div>
        </div>
      )}

      <div
        ref={bubbleRef}
        className={`tut-bubble chrome-plate tut-bubble--${bubble.side}`}
        style={{ left: bubble.left, top: bubble.top, width: bubble.width }}
        role="dialog"
        aria-label="Tutorial"
      >
        <div className="chrome-plate-inner tut-bubble-inner">
          <div className="tut-head">
            <Hormi cheering={Boolean(celebration) || finished} />
            <div className="tut-head-text">
              <span className="tut-progress">{finished ? '¡Tutorial completo!' : UI_TEXT.progress(stepNumber, total)}</span>
              <span className="tut-title">{finished ? STEP_COPY.wrap.done : step ? STEP_COPY[step.id].title : ''}</span>
            </div>
            <span className="tut-stars" title={UI_TEXT.stars(state.stars)} aria-label={UI_TEXT.stars(state.stars)}>
              <span className="tut-star-icon">★</span>
              {state.stars}
            </span>
          </div>
          <div className="tut-bar" aria-hidden="true">
            <span className="tut-bar-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          {finished ? (
            <p className="tut-say">
              {UI_TEXT.finished(state.stars, total)}
            </p>
          ) : (
            step && (
              <>
                {state.goalIndex === 0 && state.phase === 'active' && <p className="tut-say tut-say--intro">{say(STEP_COPY[step.id].intro, device)}</p>}
                {state.phase === 'celebrate' ? (
                  <p className="tut-say tut-say--done">{STEP_COPY[step.id].done}</p>
                ) : (
                  copy && <p className="tut-say tut-say--goal">{copy.text}</p>
                )}
              </>
            )
          )}
          <div className="tut-actions">
            {finished ? (
              <button type="button" className="tut-btn tut-btn--go" data-sfx="start" onClick={onFinish}>
                {UI_TEXT.ready}
              </button>
            ) : (
              <>
                {goal === 'ack' && state.phase === 'active' && (
                  <button type="button" className="tut-btn tut-btn--go" data-tutorial-ready="" onClick={ready}>
                    {UI_TEXT.ready}
                  </button>
                )}
                {goal !== 'ack' && (
                  <button type="button" className="tut-btn" data-tutorial-skip="" onClick={skip}>
                    {UI_TEXT.skipStep}
                  </button>
                )}
                <button type="button" className="tut-btn tut-btn--quiet" data-tutorial-exit="" onClick={exit}>
                  {UI_TEXT.exit}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
