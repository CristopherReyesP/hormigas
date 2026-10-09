import { useEffect, useRef } from 'react';
import type { SelectedEntityInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { TILE_SIZE } from '../../shared/constants';
import { getSpriteAtlas } from '../sharedAtlas';

/** Portrait canvas size: a 16 art-px ant grid at 4 px per art pixel. */
export const PORTRAIT_SIZE = 64;
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
}

/**
 * Animated selection portrait drawn straight from the sprite atlas. Every
 * sprite is scaled so its art pixels land on whole screen pixels (ant 3 → 4,
 * beetle 4 → 4, cricket 6 → 2, den 4 → 3, food 3 → 6), so it stays crisp.
 */
export function Portrait({ kind, role = AntRole.Worker, foodType, carrying = false }: PortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const atlas = getSpriteAtlas();

    const draw = (step: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
      ctx.imageSmoothingEnabled = false;
      // Walk-cycle phase centered in frame (step % 4)
      const phase = ((step % 4) + 0.5) * (Math.PI / 2);
      const at = (scale: number) => ctx.setTransform(scale, 0, 0, scale, 0, 0);

      switch (kind) {
        case 'ant':
          at(4 / 3); // 48 px atlas frame → 64 px
          atlas.drawAnt(ctx, 24, 24, FACING_UP, phase, role, carrying);
          break;
        case 'beetle':
          at(1);
          atlas.drawBeetle(ctx, 32, 32, FACING_UP, phase);
          break;
        case 'cricket':
          at(1 / 3);
          atlas.drawCricket(ctx, 96, 96, FACING_UP, phase);
          break;
        case 'beetle_den':
          at(0.75);
          atlas.drawBeetleDen(ctx, 42.67, 42.67);
          break;
        case 'cricket_den':
          at(0.75);
          atlas.drawCricketDen(ctx, 42.67, 42.67);
          break;
        case 'nest':
          // drawNest sizes itself from a radius (sprite = radius × 2.6 tiles); 0.5 keeps 4 → 2 px art pixels
          at(0.5);
          atlas.drawNest(ctx, 64, 64, 160 / (TILE_SIZE * 2.6));
          break;
        case 'food':
          if (foodType === 'giant_mushroom') {
            at(1);
            atlas.drawGiantMushroom(ctx, 32, 32);
          } else {
            at(2);
            atlas.drawFood(ctx, 16, 16, FOOD_VARIANT[foodType ?? 'leaf'] ?? 0, 4, 0);
          }
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
  }, [kind, role, foodType, carrying]);

  return (
    <div className="portrait-frame">
      <canvas ref={canvasRef} className="portrait-canvas" width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} aria-hidden="true" />
    </div>
  );
}
