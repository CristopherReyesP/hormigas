import { useEffect, useRef } from 'react';
import { UNIT_ART_PX, drawUnitFrame, type UnitSheet } from '../../engine/renderer/crystalUnits';
import { getSpriteAtlas } from '../sharedAtlas';
import type { UnitPortrait } from './races';
import { crystalSheet, humanSheet } from './unitSheets';

/** Atlas ant and beetle frames (px), and how much the race cards enlarge them (whole steps stay crisp). */
const ANT_FRAME = 48;
const ANT_ZOOM = 2;
const BEETLE_FRAME = 56;
const ATLAS_FRAME_MS = 160;
const FACING_UP = -Math.PI / 2;

type Specimen = UnitPortrait | 'beetle';

interface SpecimenLayout {
  readonly width: number;
  readonly height: number;
  readonly frameMs: number;
  readonly draw: (ctx: CanvasRenderingContext2D, step: number) => void;
}

function sheetLayout(sheet: UnitSheet): SpecimenLayout {
  return {
    width: sheet.width * UNIT_ART_PX,
    height: sheet.height * UNIT_ART_PX,
    frameMs: sheet.frameMs,
    draw: (ctx, step) => drawUnitFrame(ctx, sheet.frames[step % sheet.frames.length], 0, 0),
  };
}

/** Walk-cycle phase centered in atlas frame `step % 4`. */
const walkPhase = (step: number) => ((step % 4) + 0.5) * (Math.PI / 2);

function layoutFor(specimen: Specimen): SpecimenLayout {
  if (specimen === 'beetle') {
    return {
      width: BEETLE_FRAME,
      height: BEETLE_FRAME,
      frameMs: ATLAS_FRAME_MS,
      draw: (ctx, step) => getSpriteAtlas().drawBeetle(ctx, BEETLE_FRAME / 2, BEETLE_FRAME / 2, FACING_UP, walkPhase(step)),
    };
  }
  switch (specimen.source) {
    case 'crystal':
      return sheetLayout(crystalSheet(specimen.unit));
    case 'human':
      return sheetLayout(humanSheet(specimen.unit));
    case 'ant':
    case 'queenAnt': {
      const size = ANT_FRAME * ANT_ZOOM;
      return {
        width: size,
        height: size,
        frameMs: ATLAS_FRAME_MS,
        draw: (ctx, step) => {
          ctx.setTransform(ANT_ZOOM, 0, 0, ANT_ZOOM, 0, 0);
          const atlas = getSpriteAtlas();
          const c = ANT_FRAME / 2;
          if (specimen.source === 'queenAnt') atlas.drawQueenAnt(ctx, c, c, FACING_UP, walkPhase(step));
          else atlas.drawAnt(ctx, c, c, FACING_UP, walkPhase(step), specimen.role, false);
        },
      };
    }
  }
}

/** One animated race specimen: a Swarm caste from the sprite atlas, or a baked crystal or human unit. */
export function SpecimenCanvas({ specimen }: { specimen: Specimen }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const layout = layoutFor(specimen);
  const { width, height } = layout;

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { draw, frameMs } = layoutFor(specimen);
    const paint = (step: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      draw(ctx, step);
    };
    let step = 0;
    paint(step);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => paint(++step), frameMs);
    return () => window.clearInterval(timer);
  }, [specimen, width, height]);

  return <canvas ref={canvasRef} className="race-unit-canvas" width={width} height={height} aria-hidden="true" />;
}
