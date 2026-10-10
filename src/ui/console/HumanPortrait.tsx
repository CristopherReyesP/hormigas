import { useEffect, useRef } from 'react';
import { drawUnitFrame } from '../../engine/renderer/crystalUnits';
import type { HumanSelection } from '../../game/rival/humanInfo';
import { drawHumanBuilding, humanBuildingArtSize } from '../../game/rival/humanArt';
import type { HumanBuildingKind } from '../../game/rival/humanBase';
import { humanSheet } from '../racePicker/unitSheets';
import { PORTRAIT_SIZE } from './portraitScale';

/**
 * The selection portrait of a Human unit (its baked idle loop) or building
 * (its floors), at the largest whole number of screen px per art px that
 * fits the frame, so the pixel art stays crisp.
 */
export function HumanPortrait({ human }: { human: HumanSelection }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { portrait, building, kind } = human;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    if (building) {
      const art = humanBuildingArtSize(kind as HumanBuildingKind);
      const s = Math.max(1, Math.floor((PORTRAIT_SIZE - 4) / Math.max(art.width + 4, art.height)));
      ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
      const ground = Math.round((PORTRAIT_SIZE + art.height * s) / 2) - 2 * s;
      drawHumanBuilding(ctx, kind as HumanBuildingKind, PORTRAIT_SIZE / 2, ground, s);
      return;
    }
    if (!portrait) return;
    const sheet = humanSheet(portrait);
    const s = Math.max(1, Math.floor(PORTRAIT_SIZE / Math.max(sheet.width, sheet.height)));
    const ox = Math.floor((PORTRAIT_SIZE - sheet.width * s) / 2);
    const oy = Math.floor((PORTRAIT_SIZE - sheet.height * s) / 2);
    const paint = (step: number) => {
      ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
      drawUnitFrame(ctx, sheet.frames[step % sheet.frames.length], ox, oy, s);
    };
    let step = 0;
    paint(step);
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => paint(++step), sheet.frameMs);
    return () => window.clearInterval(timer);
  }, [portrait, building, kind]);

  return (
    <div className="portrait-frame">
      <canvas ref={canvasRef} className="portrait-canvas" width={PORTRAIT_SIZE} height={PORTRAIT_SIZE} aria-hidden="true" />
    </div>
  );
}
