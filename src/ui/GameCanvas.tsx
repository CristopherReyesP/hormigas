import { useRef, useEffect, useState } from 'react';
import { GameManager } from '../game/GameManager';
import type { GameStats } from '../game/GameManager';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../shared/constants';
import { fitCanvasToViewport, pickDefaultZoom, visibleCanvasRect, type CanvasFit } from './layout/canvasFit';
import { HUD_FADE_MS, hudInsets } from './layout/hudMetrics';

interface GameCanvasProps {
  onStatsUpdate: (stats: GameStats) => void;
  onGameManager: (gm: GameManager) => void;
  /** True while the opening cinematic plays and the HUD is hidden */
  introPlaying: boolean;
}

/**
 * The world fills the whole window: the fixed-resolution canvas is scaled to
 * cover it (pixelated, whole device pixels when the crop allows) and the HUD
 * floats on top. The camera is told which band of the canvas stays visible
 * between the top strip and the console, so it centers and clamps there.
 * During the intro the HUD is hidden and that band is the whole window; as
 * the HUD fades in, the band eases back so the camera glides instead of jumping.
 */
export function GameCanvas({ onStatsUpdate, onGameManager, introPlaying }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameManagerRef = useRef<GameManager | null>(null);
  const [fit, setFit] = useState<CanvasFit>({ scale: 1, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, left: 0, top: 0 });
  /** HUD fade-in progress: 0 while the intro plays (the world takes the whole window), 1 once the HUD is in */
  const hudReveal = useRef(introPlaying ? 0 : 1);
  /** Re-sends the visible band to the camera; set by the resize effect */
  const syncViewport = useRef<() => void>(() => {});

  useEffect(() => {
    if (!canvasRef.current) return;
    if (gameManagerRef.current) return; // prevent double init in strict mode

    const gm = new GameManager(canvasRef.current);
    gameManagerRef.current = gm;

    gm.onStats(onStatsUpdate);
    gm.start();
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

    let measured: { fit: CanvasFit; width: number; height: number } | null = null;
    const pushViewport = () => {
      if (!measured) return;
      const visible = visibleCanvasRect(
        measured.fit,
        measured.width,
        measured.height,
        hudInsets(hudReveal.current),
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
      );
      gameManagerRef.current?.setViewport(visible, pickDefaultZoom(measured.fit.scale));
    };
    const recompute = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const next = fitCanvasToViewport(rect.width, rect.height, CANVAS_WIDTH, CANVAS_HEIGHT, dpr);
      setFit(next);
      measured = { fit: next, width: rect.width, height: rect.height };
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
        style={{
          width: `${fit.width}px`,
          height: `${fit.height}px`,
          left: `${fit.left}px`,
          top: `${fit.top}px`,
        }}
      />
    </div>
  );
}
