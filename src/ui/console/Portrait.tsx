import { useEffect, useRef } from 'react';
import type { SelectedEntityInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { getSpriteAtlas } from '../sharedAtlas';
import { drawUnitFrame, type CrystalUnitKind } from '../../engine/renderer/crystalUnits';
import { crystalSheet } from '../racePicker/unitSheets';
import { drawMineralCluster } from '../../game/render/resourceArt';
import { NEST_PORTRAIT_RADIUS, PORTRAIT_SIZE, portraitPlacement, portraitSprite } from './portraitScale';

const FRAME_MS = 160;
const FACING_UP = -Math.PI / 2;

/** Food sprite variants in the atlas (see RenderSystem.drawFood). */
const FOOD_VARIANT: Record<string, number> = { leaf: 0, mushroom: 2, beetle_meat: 3, cricket_meat: 4 };

type PortraitKind = SelectedEntityInfo['type'];

interface PortraitProps {
  kind: PortraitKind;
  role?: AntRole;
  foodType?: string;
  carrying?: boolean;
  /** Crystal units: which one */
  crystalKind?: CrystalUnitKind;
}

/** The baked frames a Crystal selection shows: its own unit, or the obelisk for the hive and its spires */
function crystalPortraitKind(kind: PortraitKind, crystalKind?: CrystalUnitKind): CrystalUnitKind | null {
  if (kind === 'crystal_unit') return crystalKind ?? 'drone';
  if (kind === 'crystal_hive' || kind === 'crystal_spire') return 'sentinel';
  return null;
}

/** A hovering Crystal unit, as many whole screen px per art px as fit, centered */
function drawCrystalPortrait(ctx: CanvasRenderingContext2D, unit: CrystalUnitKind, step: number): void {
  const sheet = crystalSheet(unit);
  const artPx = Math.max(1, Math.floor(PORTRAIT_SIZE / Math.max(sheet.width, sheet.height)));
  const x = Math.floor((PORTRAIT_SIZE - sheet.width * artPx) / 2);
  const y = Math.floor((PORTRAIT_SIZE - sheet.height * artPx) / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  drawUnitFrame(ctx, sheet.frames[step % sheet.frames.length], x, y, artPx);
}

/**
 * Animated selection portrait drawn straight from the sprite atlas. Every
 * sprite (2 world px per art px) is drawn at the largest whole number of
 * screen px per art px that fits the 64 px frame, centered on a whole screen
 * px, so it stays crisp: ant 24 and beetle 28 art px at 2, cricket 48, dens
 * 40 and nest 40 at 1, food and the mineral node 24 at 2, giant mushroom 32 at 2 (see portraitScale).
 */
export function Portrait({ kind, role = AntRole.Worker, foodType, carrying = false, crystalKind }: PortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const crystal = crystalPortraitKind(kind, crystalKind);
    if (crystal) {
      let step = 0;
      drawCrystalPortrait(ctx, crystal, step);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const timer = window.setInterval(() => drawCrystalPortrait(ctx, crystal, ++step), crystalSheet(crystal).frameMs);
      return () => window.clearInterval(timer);
    }
    const atlas = getSpriteAtlas();
    const sprite = portraitSprite(kind, foodType);
    const { scale, offset, at } = portraitPlacement(sprite);

    const draw = (step: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(scale, 0, 0, scale, offset, offset);
      // Walk-cycle phase centered in frame (step % 4)
      const phase = ((step % 4) + 0.5) * (Math.PI / 2);

      switch (kind) {
        case 'ant':
          atlas.drawAnt(ctx, at, at, FACING_UP, phase, role, carrying);
          break;
        case 'beetle':
          atlas.drawBeetle(ctx, at, at, FACING_UP, phase);
          break;
        case 'cricket':
          atlas.drawCricket(ctx, at, at, FACING_UP, phase);
          break;
        case 'beetle_den':
          atlas.drawBeetleDen(ctx, at, at);
          break;
        case 'cricket_den':
          atlas.drawCricketDen(ctx, at, at);
          break;
        case 'nest':
          atlas.drawNest(ctx, at, at, NEST_PORTRAIT_RADIUS);
          break;
        case 'mineral':
          drawMineralCluster(ctx, at, at, 1, 0);
          break;
        case 'food':
          if (sprite === 'giantMushroom') atlas.drawGiantMushroom(ctx, at, at);
          else atlas.drawFood(ctx, at, at, FOOD_VARIANT[foodType ?? 'leaf'] ?? 0, 4, 0);
          break;
      }
    };

    const animated = kind === 'ant' || kind === 'beetle' || kind === 'cricket';
    if (!animated || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(0);
      return;
    }
    let step = 0;
    draw(step);
    const timer = window.setInterval(() => draw(++step), FRAME_MS);
    return () => window.clearInterval(timer);
  }, [kind, role, foodType, carrying, crystalKind]);

  return (
    <div className="portrait-frame">
      <canvas ref={canvasRef} className="portrait-canvas" width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} aria-hidden="true" />
    </div>
  );
}
