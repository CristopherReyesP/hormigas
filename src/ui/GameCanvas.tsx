import { useRef, useEffect, useState } from 'react';
import { GameManager } from '../game/GameManager';
import type { GameStats } from '../game/GameManager';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../shared/constants';

interface GameCanvasProps {
  onStatsUpdate: (stats: GameStats) => void;
  onGameManager: (gm: GameManager) => void;
}

/**
 * Compute a CSS display size so each logical canvas pixel maps to an
 * INTEGER number of device pixels — authentic crisp pixel-art scaling.
 */
function computeDisplaySize(availW: number, availH: number): { w: number; h: number } {
  const dpr = window.devicePixelRatio || 1;
  const deviceScale = Math.max(
    1,
    Math.floor(Math.min((availW * dpr) / CANVAS_WIDTH, (availH * dpr) / CANVAS_HEIGHT)),
  );
  return {
    w: (CANVAS_WIDTH * deviceScale) / dpr,
    h: (CANVAS_HEIGHT * deviceScale) / dpr,
  };
}

export function GameCanvas({ onStatsUpdate, onGameManager }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gameManagerRef = useRef<GameManager | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({
    w: CANVAS_WIDTH,
    h: CANVAS_HEIGHT,
  });

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

  // Integer-scaled display size — recomputed on container resize,
  // window resize, and devicePixelRatio changes (browser zoom / monitor swap).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const recompute = () => {
      const rect = container.getBoundingClientRect();
      setDisplaySize(computeDisplaySize(rect.width, rect.height));
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
    <div ref={containerRef} className="game-canvas-container">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: `${displaySize.w}px`,
          height: `${displaySize.h}px`,
        }}
      />
    </div>
  );
}
