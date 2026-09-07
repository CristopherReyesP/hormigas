import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameManager, MinimapEntity } from '../game/GameManager';
import { PAL } from '../engine/renderer/pixelart/palette';
import { UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT } from '../shared/constants';
import { UndergroundTerrainType, ChamberType } from '../simulation/world/types';

/**
 * Overview map of the whole nest, as a glass overlay.
 *
 * The underground is 90x60 tiles while a 1x viewport shows roughly 25x18, so
 * without this the player navigates a base they dug themselves through a ~8%
 * keyhole.
 *
 * Because the panel is translucent, solid rock is drawn nearly transparent and
 * only dug space is drawn solid: the nest reads as a lit shape floating over
 * the scene instead of as an opaque rectangle stamped on it. That is the whole
 * point of going glass here — the excavated silhouette IS the information.
 *
 * Two layers, for the same reason the light map is cached: terrain is redrawn
 * only when the grid's layout version changes, while dots and the viewport box
 * refresh on a slow poll. Nothing here runs per frame.
 */

const SCALE = 3; // px per tile
const MAP_W = UNDERGROUND_WIDTH * SCALE;
const MAP_H = UNDERGROUND_HEIGHT * SCALE;
const POLL_MS = 120;
const STORAGE_KEY = 'hormigas.minimap.visible';

/** Rock and earth stay faint so the glass reads through them */
const WALL_ALPHA = 0.22;
const ROCK_ALPHA = 0.5;

const DOT_COLOR: Record<MinimapEntity['kind'], string> = {
  worker: PAL.worker,
  soldier: PAL.soldier,
  scout: PAL.scout,
  nurse: PAL.nurse,
  defender: PAL.defender,
  queen: PAL.queen,
  invader: PAL.dangerRed,
};

/** Invaders and the queen are the two dots you must never miss */
const BIG_DOT: ReadonlySet<MinimapEntity['kind']> = new Set(['queen', 'invader']);

function loadVisible(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true; // private mode / blocked storage — default to showing it
  }
}

interface UndergroundMinimapProps {
  gameManager: GameManager | null;
}

export function UndergroundMinimap({ gameManager }: UndergroundMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const terrainRef = useRef<HTMLCanvasElement | null>(null);
  const terrainVersionRef = useRef(-1);
  const [visible, setVisible] = useState(loadVisible);

  const toggle = useCallback(() => {
    setVisible((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Storage unavailable — the toggle still works for this session
      }
      return next;
    });
  }, []);

  // M toggles the map. Guarded against modifier combos so it never steals a
  // browser shortcut, and the game's own keys live on the canvas, not window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyM' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!gameManager) return;
      const rect = e.currentTarget.getBoundingClientRect();
      // Go through the rect, not SCALE — the canvas is CSS-scaled to fit
      const tileX = ((e.clientX - rect.left) / rect.width) * UNDERGROUND_WIDTH;
      const tileY = ((e.clientY - rect.top) / rect.height) * UNDERGROUND_HEIGHT;
      gameManager.centerUndergroundOn(tileX, tileY);
    },
    [gameManager]
  );

  useEffect(() => {
    if (!gameManager || !visible) return;

    if (!terrainRef.current) {
      terrainRef.current = document.createElement('canvas');
      terrainRef.current.width = MAP_W;
      terrainRef.current.height = MAP_H;
    }
    // A fresh game (or a remount after hiding) must rebuild the terrain layer
    terrainVersionRef.current = -1;

    const drawTerrain = () => {
      const grid = gameManager.getUndergroundGrid();
      const tctx = terrainRef.current!.getContext('2d');
      if (!tctx) return;

      // Transparent base — the glass panel behind IS the background
      tctx.clearRect(0, 0, MAP_W, MAP_H);

      for (let y = 0; y < UNDERGROUND_HEIGHT; y++) {
        for (let x = 0; x < UNDERGROUND_WIDTH; x++) {
          const tile = grid.getTile(x, y);
          if (!tile) continue;

          let color: string;
          let alpha = 1;

          if (!tile.walkable) {
            // Undiggable rock reads distinctly from plain earth — those pockets
            // are the map's fixed constraints, so they stay more visible.
            const rock = tile.terrain === UndergroundTerrainType.Reinforced;
            color = rock ? PAL.stone[1] : PAL.earth[3];
            alpha = rock ? ROCK_ALPHA : WALL_ALPHA;
          } else if (tile.chamberType === ChamberType.Queen) {
            color = PAL.queen;
          } else if (tile.chamberType === ChamberType.FoodStorage) {
            color = PAL.leaf[1];
          } else if (tile.chamberType === ChamberType.Incubation || tile.chamberType === ChamberType.Egg) {
            color = PAL.nurse;
          } else if (tile.chamberType === ChamberType.FungusFarm) {
            color = PAL.shroomCap;
          } else if (tile.chamberType === ChamberType.Defense) {
            color = PAL.defender;
          } else {
            color = PAL.tunnel[2];
          }

          tctx.globalAlpha = alpha;
          tctx.fillStyle = color;
          tctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
        }
      }
      tctx.globalAlpha = 1;
    };

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;

      const version = gameManager.getUndergroundGrid().getLayoutVersion();
      if (version !== terrainVersionRef.current) {
        terrainVersionRef.current = version;
        drawTerrain();
      }

      ctx.clearRect(0, 0, MAP_W, MAP_H);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(terrainRef.current!, 0, 0);

      // Pending dig orders
      ctx.fillStyle = PAL.glowAmber;
      for (const job of gameManager.getUndergroundDigOrders()) {
        ctx.fillRect(job.x * SCALE, job.y * SCALE, SCALE, SCALE);
      }

      // Entrances — each is a forage artery AND a breach point, so they get a
      // marker that hangs above the map rather than a tinted tile.
      for (const e of gameManager.getUndergroundEntrances()) {
        const ex = e.x * SCALE + SCALE / 2;
        ctx.fillStyle = PAL.glowGreen;
        ctx.fillRect(ex - 2, 0, 4, 2);
        ctx.fillRect(ex - 1, 2, 2, SCALE * 2);
      }

      // Live dots — invaders and the queen drawn last so nothing covers them
      const entities = gameManager.getUndergroundEntities();
      for (const e of entities) {
        if (BIG_DOT.has(e.kind)) continue;
        ctx.fillStyle = DOT_COLOR[e.kind];
        ctx.fillRect(Math.floor(e.x * SCALE) - 1, Math.floor(e.y * SCALE) - 1, 2, 2);
      }
      for (const e of entities) {
        if (!BIG_DOT.has(e.kind)) continue;
        ctx.fillStyle = DOT_COLOR[e.kind];
        ctx.fillRect(Math.floor(e.x * SCALE) - 2, Math.floor(e.y * SCALE) - 2, 4, 4);
        ctx.strokeStyle = PAL.outline;
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.floor(e.x * SCALE) - 2.5, Math.floor(e.y * SCALE) - 2.5, 5, 5);
      }

      // Viewport box — "you are here"
      const view = gameManager.getUndergroundView();
      ctx.strokeStyle = PAL.white;
      ctx.lineWidth = 1;
      ctx.strokeRect(
        Math.floor(view.x * SCALE) + 0.5,
        Math.floor(view.y * SCALE) + 0.5,
        Math.max(2, Math.floor(view.w * SCALE)),
        Math.max(2, Math.floor(view.h * SCALE))
      );
    };

    draw();
    const interval = setInterval(draw, POLL_MS);
    return () => clearInterval(interval);
  }, [gameManager, visible]);

  if (!visible) {
    return (
      <button
        onClick={toggle}
        className="glass-btn"
        title="Mostrar mapa (M)"
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 10,
          padding: '6px 8px',
          fontSize: 14,
        }}
      >
        🗺
      </button>
    );
  }

  return (
    <div
      className="glass-panel"
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        padding: 5,
        zIndex: 10,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          className="pixel-heading"
          style={{ fontSize: 7, color: 'var(--ui-text-dim)', letterSpacing: 1 }}
        >
          Hormiguero
        </span>
        <button
          onClick={toggle}
          className="glass-btn"
          title="Ocultar mapa (M)"
          style={{ padding: '1px 6px', fontSize: 11 }}
        >
          ✕
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={MAP_W}
        height={MAP_H}
        onClick={handleClick}
        title="Clickeá para mover la cámara"
        style={{
          display: 'block',
          width: MAP_W,
          height: MAP_H,
          imageRendering: 'pixelated',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}
