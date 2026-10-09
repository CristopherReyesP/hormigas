import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameManager } from '../../game/GameManager';
import { UNDERGROUND_HEIGHT, UNDERGROUND_WIDTH, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';
import { createMinimapCache, drawSurfaceMinimap, drawUndergroundMinimap } from './minimapDraw';
import { fitMinimap, minimapToTile } from './minimapTransform';
import { PixelIcon } from './PixelIcon';

type LayerName = 'surface' | 'underground';

interface MinimapPanelProps {
  gameManager: GameManager | null;
  activeLayer: LayerName;
  onSwitchLayer: (layer: LayerName) => void;
}

/** Map box in CSS px (kept in sync with .minimap-box in index.css) */
const BOX_W = 172;
const BOX_H = 160;
const POLL_MS = 150;
const STORAGE_KEY = 'hormigas.minimap.visible';

function loadVisible(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true; // private mode / blocked storage: default to showing it
  }
}

/**
 * Console minimap with a surface / nest tab. The tabs switch the layer the
 * camera looks at; clicking or dragging on the map moves that camera.
 * M shows or hides the map, as it did for the old nest overlay.
 */
export function MinimapPanel({ gameManager, activeLayer, onSwitchLayer }: MinimapPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(loadVisible);

  const toggle = useCallback(() => {
    setVisible((v) => {
      const next = !v;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // Storage unavailable: the toggle still works for this session
      }
      return next;
    });
  }, []);

  // M toggles the map; guarded against modifier combos so it never steals a browser shortcut
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!gameManager || !visible || !canvas) return;
    // Backing store at device resolution; markers are sized in whole device pixels
    const dpr = window.devicePixelRatio || 1;
    const unit = Math.max(1, Math.round(dpr));
    canvas.width = Math.round(BOX_W * dpr);
    canvas.height = Math.round(BOX_H * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cache = createMinimapCache();
    let tick = 0;
    const draw = () => {
      tick++;
      if (activeLayer === 'surface') drawSurfaceMinimap(ctx, gameManager, cache, unit, tick % 4 < 2);
      else drawUndergroundMinimap(ctx, gameManager, cache, unit);
    };
    draw();
    const interval = window.setInterval(draw, POLL_MS);
    return () => window.clearInterval(interval);
  }, [gameManager, visible, activeLayer]);

  const moveCamera = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!gameManager) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const surface = activeLayer === 'surface';
      const layout = surface
        ? fitMinimap(WORLD_WIDTH, WORLD_HEIGHT, rect.width, rect.height)
        : fitMinimap(UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT, rect.width, rect.height);
      const tile = minimapToTile(layout, e.clientX - rect.left, e.clientY - rect.top);
      if (surface) gameManager.centerSurfaceOn(tile.x, tile.y);
      else gameManager.centerUndergroundOn(tile.x, tile.y);
    },
    [gameManager, activeLayer],
  );

  return (
    <section className="console-minimap" aria-label="Minimapa">
      <div className="chrome-plate console-plate">
      <div className="chrome-plate-inner console-minimap-inner">
        <div className="minimap-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeLayer === 'surface'}
            className={`minimap-tab${activeLayer === 'surface' ? ' minimap-tab--active' : ''}`}
            onClick={() => onSwitchLayer('surface')}
            title="Ver la superficie"
          >
            SUPERFICIE
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeLayer === 'underground'}
            className={`minimap-tab${activeLayer === 'underground' ? ' minimap-tab--active' : ''}`}
            onClick={() => onSwitchLayer('underground')}
            title="Ver el hormiguero"
          >
            NIDO
          </button>
        </div>
        <div className="minimap-box">
          {visible ? (
            <canvas
              ref={canvasRef}
              className="minimap-canvas"
              title="Haz clic o arrastra para mover la cámara · M oculta el mapa"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                moveCamera(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons & 1) moveCamera(e);
              }}
            />
          ) : (
            <button type="button" className="minimap-hidden" onClick={toggle} title="Mostrar mapa (M)">
              <PixelIcon name="map" size={32} />
              MAPA OCULTO · M
            </button>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}
