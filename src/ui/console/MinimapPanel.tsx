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

/** Map box in CSS px (kept in sync with .minimap-box in index.css); phone layouts resize it */
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
  /** The map's CSS size: the phone layouts shrink it */
  const [box, setBox] = useState({ w: BOX_W, h: BOX_H });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const w = Math.round(canvas.clientWidth) || BOX_W;
      const h = Math.round(canvas.clientHeight) || BOX_H;
      setBox((current) => (current.w === w && current.h === h ? current : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [visible]);

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
    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cache = createMinimapCache();
    let tick = 0;
    const draw = () => {
      tick++;
      if (activeLayer === 'surface') drawSurfaceMinimap(ctx, gameManager, cache, unit, tick % 4 < 2);
      else drawUndergroundMinimap(ctx, gameManager, cache, unit, tick % 4 < 2);
    };
    draw();
    const interval = window.setInterval(draw, POLL_MS);
    return () => window.clearInterval(interval);
  }, [gameManager, visible, activeLayer, box]);

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
            aria-label="Superficie"
          >
            <span className="minimap-tab-icon"><PixelIcon name="sun" /></span>
            <span className="minimap-tab-label">SUPERFICIE</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeLayer === 'underground'}
            className={`minimap-tab${activeLayer === 'underground' ? ' minimap-tab--active' : ''}`}
            onClick={() => onSwitchLayer('underground')}
            title="Ver el hormiguero"
            aria-label="Nido"
          >
            <span className="minimap-tab-icon"><PixelIcon name="den" /></span>
            <span className="minimap-tab-label">NIDO</span>
          </button>
          {/* Compact HUD only: fold the map away to these tabs (M does the same) */}
          <button
            type="button"
            className="minimap-tab minimap-toggle"
            aria-expanded={visible}
            aria-label={visible ? 'Ocultar el minimapa' : 'Mostrar el minimapa'}
            title={visible ? 'Ocultar el minimapa (M)' : 'Mostrar el minimapa (M)'}
            onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
            onClick={toggle}
          >
            <PixelIcon name="map" />
          </button>
        </div>
        <div className={visible ? 'minimap-box' : 'minimap-box minimap-box--hidden'}>
          {visible && (
            <button
              type="button"
              className="minimap-tab minimap-center"
              onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
              onClick={() => gameManager?.recenterCamera()}
              title="Centrar la cámara en el nido"
              aria-label="Centrar la cámara en el nido"
            >
              <PixelIcon name="target" size={16} />
            </button>
          )}
          {visible ? (
            <canvas
              ref={canvasRef}
              className="minimap-canvas"
              title="Toca, haz clic o arrastra para mover la cámara · M oculta el mapa"
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
