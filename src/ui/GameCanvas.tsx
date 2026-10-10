import { useRef, useEffect, useState } from 'react';
import { GameManager } from '../game/GameManager';
import type { GameStats } from '../game/GameManager';
import type { RunSetup } from '../game/run/RunSetup';
import { createTutorialGame } from '../game/tutorial/createTutorialGame';
import { fitCanvasToWindow, pickDefaultZoom, visibleCanvasRect, type CanvasFit } from './layout/canvasFit';
import { HUD_FADE_MS, hudInsets, hudLayout, hudScale } from './layout/hudMetrics';
import { readSafeArea } from './layout/safeArea';

interface GameCanvasProps {
  /** The race picker's choice; read once, when the GameManager is built */
  setup?: RunSetup;
  onStatsUpdate: (stats: GameStats) => void;
  onGameManager: (gm: GameManager) => void;
  /** True while the opening cinematic plays and the HUD is hidden */
  introPlaying: boolean;
  /** The guided tutorial: its own calm, seeded map (the setup is ignored) */
  tutorial?: boolean;
}

/**
 * The world fills the whole window at its real resolution: the canvas backing
 * store is the window's CSS size × devicePixelRatio (capped), so nothing is
 * upscaled, and the HUD floats on top. The camera is told which band of the
 * canvas stays visible between the top strip and the console, so it centers
 * and clamps there.
 * During the intro the HUD is hidden and that band is the whole window; as
 * the HUD fades in, the band eases back so the camera glides instead of jumping.
 */
export function GameCanvas({ setup, onStatsUpdate, onGameManager, introPlaying, tutorial = false }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameManagerRef = useRef<GameManager | null>(null);
  const [fit, setFit] = useState<CanvasFit>(() => fitCanvasToWindow(0, 0));
  /** HUD fade-in progress: 0 while the intro plays (the world takes the whole window), 1 once the HUD is in */
  const hudReveal = useRef(introPlaying ? 0 : 1);
  /** Re-sends the visible band to the camera; set by the resize effect */
  const syncViewport = useRef<() => void>(() => {});

  useEffect(() => {
    if (!canvasRef.current) return;
    if (gameManagerRef.current) return; // prevent double init in strict mode

    const canvas = canvasRef.current;
    const gm = tutorial ? createTutorialGame((s) => new GameManager(canvas, s)) : new GameManager(canvas, setup);
    gameManagerRef.current = gm;

    gm.onStats(onStatsUpdate);
    gm.start();
    // Dev builds only: lets browser checks (Playwright) find units on screen; stripped from production
    if (import.meta.env.DEV) (window as unknown as { __hormigasGame?: GameManager }).__hormigasGame = gm;
    onGameManager(gm);

    return () => {
      gm.stop();
      gameManagerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recomputed on container resize, window resize, and devicePixelRatio
  // changes (browser zoom / monitor swap).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let measured: CanvasFit | null = null;
    /** Notch and home indicator: the compact HUD's bars grow by them (read on resize, not every fade frame) */
    let safe = readSafeArea();
    const pushViewport = () => {
      if (!measured) return;
      const scale = hudScale(measured.width, measured.height);
      const layout = hudLayout(measured.width, measured.height);
      const visible = visibleCanvasRect(measured, hudInsets(hudReveal.current, scale, layout, safe));
      gameManagerRef.current?.setViewport(visible, pickDefaultZoom(measured.backingWidth, measured.pixelRatio));
    };
    const recompute = () => {
      const rect = container.getBoundingClientRect();
      const next = fitCanvasToWindow(rect.width, rect.height, window.devicePixelRatio || 1);
      setFit(next);
      measured = next;
      safe = readSafeArea();
      // The buffer resizes at once (cheap); size-bound render caches rebuild once the size settles
      gameManagerRef.current?.resizeCanvas(next.backingWidth, next.backingHeight, next.pixelRatio);
      pushViewport();
    };
    syncViewport.current = pushViewport;

    recompute();

    const ro = new ResizeObserver(recompute);
    ro.observe(container);
    window.addEventListener('resize', recompute);

    // Track devicePixelRatio changes via matchMedia (re-armed on each change)
    let mql: MediaQueryList | null = null;
    const onDprChange = () => {
      recompute();
      armDprWatch();
    };
    const armDprWatch = () => {
      mql?.removeEventListener('change', onDprChange);
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      mql.addEventListener('change', onDprChange);
    };
    armDprWatch();

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
      mql?.removeEventListener('change', onDprChange);
    };
  }, []);

  // The HUD fades in after the intro: ease the band in over the same time
  useEffect(() => {
    if (introPlaying) {
      hudReveal.current = 0;
      syncViewport.current();
      return;
    }
    if (hudReveal.current >= 1) return;
    const start = performance.now();
    const step = (now: number) => {
      hudReveal.current = Math.min(1, (now - start) / HUD_FADE_MS);
      syncViewport.current();
      if (hudReveal.current < 1) frame = requestAnimationFrame(step);
    };
    let frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [introPlaying]);

  return (
    <div ref={containerRef} className="world-viewport">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onContextMenu={(e) => e.preventDefault()}
        style={{ width: `${fit.width}px`, height: `${fit.height}px`, left: 0, top: 0 }}
      />
    </div>
  );
}
