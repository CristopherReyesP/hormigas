import { useRef, useEffect, useState } from 'react';
import { GameManager } from '../game/GameManager';
import type { GameStats } from '../game/GameManager';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../shared/constants';
import { fitCanvasToViewport, pickDefaultZoom, visibleCanvasRect, type CanvasFit } from './layout/canvasFit';
import { CONSOLE_DECK_HEIGHT, STRIP_HEIGHT } from './layout/hudMetrics';

interface GameCanvasProps {
  onStatsUpdate: (stats: GameStats) => void;
  onGameManager: (gm: GameManager) => void;
}

/**
 * The world fills the whole window: the fixed-resolution canvas is scaled to
 * cover it (pixelated, whole device pixels when the crop allows) and the HUD
 * floats on top. The camera is told which band of the canvas stays visible
 * between the top strip and the console, so it centers and clamps there.
 */
export function GameCanvas({ onStatsUpdate, onGameManager }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameManagerRef = useRef<GameManager | null>(null);
  const [fit, setFit] = useState<CanvasFit>({ scale: 1, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, left: 0, top: 0 });

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

    const recompute = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const next = fitCanvasToViewport(rect.width, rect.height, CANVAS_WIDTH, CANVAS_HEIGHT, dpr);
      setFit(next);
      const visible = visibleCanvasRect(
        next,
        rect.width,
        rect.height,
        { top: STRIP_HEIGHT, bottom: CONSOLE_DECK_HEIGHT },
        CANVAS_WIDTH,
        CANVAS_HEIGHT,
      );
      gameManagerRef.current?.setViewport(visible, pickDefaultZoom(next.scale));
    };

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
