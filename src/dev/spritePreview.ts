// DEV-ONLY sprite preview harness — not imported by the game.
// Renders every ant role at 1× (real in-game size) and 4× magnification:
// all 4 walk frames + carrying state, on the game's dirt background.
import { SpriteAtlas } from '../engine/renderer/SpriteAtlas';
import { AntRole } from '../game/components/components';
import { PAL } from '../engine/renderer/pixelart/palette';
import { ART_PX, SPRITE_GRID } from '../engine/renderer/sprites/spriteScale';
import { DIRECTIONS } from '../engine/renderer/pixelart/directions';
import { LEAPER_FRAMES } from '../engine/renderer/sprites/wildlifeSprites';
import { LEAP, LEAP_CYCLE, leapFrame } from '../game/render/leapMotion';
import { STANDING_VIEWS } from '../engine/renderer/sprites/standingAntSprites';

const ROLES: AntRole[] = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];
const FRAMES = 4;
const SPRITE = SPRITE_GRID.ant * ART_PX; // ant frame size in px (48)
const COLS = FRAMES + 1; // 4 walk frames + 1 carrying

const BLOCK_H = 240; // vertical space per role row
const X1 = 16; // 1× strip left edge
const X4 = 360; // 4× strip left edge
const CRICKET = SPRITE_GRID.cricket * ART_PX; // cricket frame size in px (96)
const QUEEN = SPRITE_GRID.queen * ART_PX; // queen frame size in px (104)
const STAND_QUEEN_COLS = 1 + FRAMES + 1; // top-down + walk frames 0-3 + swollen
// The alien tarantula (Phase 2): top-down, walk frames 0-3, then its bite (gape, snap), at 1×
const TARANTULA = SPRITE_GRID.tarantula * ART_PX; // tarantula frame size in px (176)
const STAND_TARANTULA_COLS = 1 + FRAMES + 2;
const LEAPER_POSES = LEAPER_FRAMES.length; // 4 walk frames + crouch + leap
const CRICKET_BLOCK = CRICKET * 2 + 72; // leaper pose row: 2× strip + labels
const CRICKET_DIR_BLOCK = CRICKET + 56; // leaper 16-direction row at 1×
const W = Math.max(
  X4 + COLS * (SPRITE * 4 + 8),
  X1 + LEAPER_POSES * (CRICKET * 2 + 16),
  X1 + DIRECTIONS * (CRICKET + 4),
  X1 + 12 * (CRICKET + 32) + 36,
  X1 + 80 + STAND_QUEEN_COLS * (QUEEN * 2 + 8),
  X1 + 80 + STAND_TARANTULA_COLS * (TARANTULA + 8),
) + 16;
const HOP_BLOCK = CRICKET + 72; // one hop cycle sampled left to right
// Caste lineup: every caste side by side on dirt and moss, the way the game
// draws them (1 = zoom 1, then zoom 2), to judge the silhouettes at a glance
const LINEUP_HEADINGS = [0, 4, 8, 12, 2, 6, 10, 14]; // direction indices
const LINEUP_ROW = SPRITE + 8;
const LINEUP_BLOCK = 48 + ROLES.length * LINEUP_ROW + 40 + ROLES.length * LINEUP_ROW * 2;
// Standing (3/4) views for a tilted camera, one block per caste and one for
// the queen: one row per view at 4× (the queen at 2×), the top-down sprite
// first for comparison, then walk frames 0-3, leaf, ore (queen: breathing)
const STAND_ROLES: AntRole[] = [...ROLES, AntRole.Bomber];
const STAND_COLS = 1 + FRAMES + 2;
const STAND_ROW = SPRITE * 4 + 12;
const STAND_CASTE_BLOCK = 48 + STANDING_VIEWS.length * STAND_ROW;
const STAND_QUEEN_ROW = QUEEN * 2 + 12;
// The weaver spider (Phase 2): top-down, then walk frames 0-3 (its bite replays them), at 2×
const SPIDER = SPRITE_GRID.spider * ART_PX; // spider frame size in px (64)
const STAND_SPIDER_COLS = 1 + FRAMES;
const STAND_SPIDER_ROW = SPIDER * 2 + 12;
const STAND_TARANTULA_ROW = TARANTULA + 12;
const STAND_BLOCK = STAND_ROLES.length * STAND_CASTE_BLOCK + 48 + STANDING_VIEWS.length * STAND_QUEEN_ROW
  + 48 + STANDING_VIEWS.length * STAND_SPIDER_ROW + 48 + STANDING_VIEWS.length * STAND_TARANTULA_ROW;
const H = ROLES.length * BLOCK_H + CRICKET_BLOCK + CRICKET_DIR_BLOCK + HOP_BLOCK + LINEUP_BLOCK + STAND_BLOCK + 56;

const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
document.body.appendChild(canvas);

const ctx = canvas.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
ctx.fillStyle = PAL.soil[1];
ctx.fillRect(0, 0, W, H);

const atlas = new SpriteAtlas();

// legPhase that maps to frame i in drawAnt: phase = (i + 0.5) * (2π / FRAMES)
const phaseFor = (i: number) => ((i + 0.5) * Math.PI * 2) / FRAMES;

ctx.textBaseline = 'top';

for (let ri = 0; ri < ROLES.length; ri++) {
  const role = ROLES[ri];
  const top = 40 + ri * BLOCK_H;

  ctx.fillStyle = PAL.white;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`${role.toUpperCase()}  (frames 0-3 + carry)  |  left: 1x  right: 4x`, X1, top - 28);

  // 1× strip — real in-game size
  for (let i = 0; i < COLS; i++) {
    const carrying = i === FRAMES;
    const frame = carrying ? 0 : i;
    const cx = X1 + i * (SPRITE + 12) + SPRITE / 2;
    const cyP = top + 96; // vertically centered against the 4× row
    atlas.drawAnt(ctx, cx, cyP, 0, phaseFor(frame), role, carrying);
  }

  // 4× strip — magnified
  ctx.save();
  ctx.scale(4, 4);
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < COLS; i++) {
    const carrying = i === FRAMES;
    const frame = carrying ? 0 : i;
    const cx = (X4 + i * (SPRITE * 4 + 8) + (SPRITE * 4) / 2) / 4;
    const cyP = (top + 96) / 4;
    atlas.drawAnt(ctx, cx, cyP, 0, phaseFor(frame), role, carrying);
  }
  ctx.restore();
}

// Alien leaper (the cricket): walk frames 0-3, crouch and leap at 2×, then
// all 16 baked directions at 1× (real in-game size)
{
  const top = 40 + ROLES.length * BLOCK_H;
  const walkPhase = (i: number) => ((i + 0.5) * Math.PI * 2) / 4;

  ctx.fillStyle = PAL.white;
  ctx.font = 'bold 16px monospace';
  ctx.fillText('SALTADOR  (walk 0-3, crouch, leap)  |  2x', X1, top - 28);

  ctx.save();
  ctx.scale(2, 2);
  ctx.imageSmoothingEnabled = false;
  LEAPER_FRAMES.forEach(({ frame, pose }, i) => {
    const cx = (X1 + i * (CRICKET * 2 + 16) + CRICKET) / 2;
    atlas.drawCricket(ctx, cx, (top + CRICKET) / 2, 0, walkPhase(frame), pose);
  });
  ctx.restore();

  const dirTop = top + CRICKET_BLOCK;
  ctx.fillStyle = PAL.white;
  ctx.fillText('SALTADOR  16 directions  |  1x', X1, dirTop - 28);
  for (let d = 0; d < DIRECTIONS; d++) {
    const cx = X1 + d * (CRICKET + 4) + CRICKET / 2;
    atlas.drawCricket(ctx, cx, dirTop + CRICKET / 2, (d * Math.PI * 2) / DIRECTIONS, walkPhase(0));
  }

  // One hop cycle: crouch (squash), the arc in the air (stretch), landing, rest.
  // The dark line is the ground; the hop covers about one leap of travel.
  const hopTop = dirTop + CRICKET_DIR_BLOCK;
  const SAMPLES = 12;
  const HOP_PX = 36;
  ctx.fillStyle = PAL.white;
  ctx.fillText(`SALTADOR  one hop, ${LEAP_CYCLE.toFixed(2)} s in ${SAMPLES} samples (peak ${LEAP.height} px)  |  1x`, X1, hopTop - 28);
  for (let i = 0; i < SAMPLES; i++) {
    const f = leapFrame((i / SAMPLES) * LEAP_CYCLE);
    const cx = X1 + CRICKET / 2 + i * (CRICKET + 32) + f.travel * HOP_PX;
    const ground = hopTop + CRICKET / 2 + 8;
    ctx.fillStyle = PAL.outline;
    ctx.fillRect(cx - 40, ground + 30, 80, 2);
    atlas.drawCricket(ctx, cx, ground - f.lift, 0, 0, f.pose);
  }
}

// Caste lineup (zoom 1, then zoom 2): rows of castes facing 8 headings, left
// half on regolith dirt, right half on moss
{
  const top = 40 + ROLES.length * BLOCK_H + CRICKET_BLOCK + CRICKET_DIR_BLOCK + HOP_BLOCK + 24;
  const half = LINEUP_HEADINGS.length / 2;
  const lineup = (zoom: number, y0: number) => {
    const row = LINEUP_ROW * zoom;
    const colW = (SPRITE + 12) * zoom;
    ctx.fillStyle = PAL.white;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`CASTE LINEUP  |  zoom ${zoom}  (dirt | moss)`, X1, y0 - 24);
    ctx.fillStyle = PAL.grass[1];
    ctx.fillRect(X1 + 120 + half * colW, y0, half * colW, ROLES.length * row);
    ROLES.forEach((role, ri) => {
      const cy = y0 + ri * row + row / 2;
      ctx.fillStyle = PAL.white;
      ctx.font = '14px monospace';
      ctx.fillText(role, X1, cy - 7);
      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.imageSmoothingEnabled = false;
      LINEUP_HEADINGS.forEach((d, i) => {
        const cx = X1 + 120 + i * colW + colW / 2;
        atlas.drawAnt(ctx, cx / zoom, cy / zoom, (d * Math.PI * 2) / DIRECTIONS, phaseFor(i % FRAMES), role, false);
      });
      ctx.restore();
    });
  };
  lineup(1, top + 24);
  lineup(2, top + 24 + ROLES.length * LINEUP_ROW + 40);
}

// Standing (3/4) views: what a tilted camera shows (screen heading → view)
{
  const top0 = 40 + ROLES.length * BLOCK_H + CRICKET_BLOCK + CRICKET_DIR_BLOCK + HOP_BLOCK + LINEUP_BLOCK + 24;
  const VIEW_HEADING = { front: Math.PI / 2, back: -Math.PI / 2, left: Math.PI, right: 0 } as const;
  STAND_ROLES.forEach((role, ri) => {
    const top = top0 + ri * STAND_CASTE_BLOCK;
    ctx.fillStyle = PAL.white;
    ctx.font = 'bold 16px monospace';
    ctx.fillText(`STANDING 3/4  ${role.toUpperCase()}  (top-down | frames 0-3 | leaf | ore)  |  4x`, X1, top);
    STANDING_VIEWS.forEach((view, vi) => {
      const cy = (top + 32 + vi * STAND_ROW + STAND_ROW / 2) / 4;
      ctx.fillStyle = PAL.white;
      ctx.font = '14px monospace';
      ctx.fillText(view, X1, cy * 4 - 7);
      ctx.save();
      ctx.scale(4, 4);
      ctx.imageSmoothingEnabled = false;
      for (let i = 0; i < STAND_COLS; i++) {
        const cx = (X1 + 80 + i * (SPRITE * 4 + 8) + (SPRITE * 4) / 2) / 4;
        const heading = VIEW_HEADING[view];
        if (i === 0) atlas.drawAnt(ctx, cx, cy, heading, phaseFor(0), role, false);
        else {
          const frame = i <= FRAMES ? i - 1 : 0;
          const carrying = i === FRAMES + 1 ? true : i === FRAMES + 2 ? 'ore' : false;
          atlas.drawAnt(ctx, cx, cy, heading, phaseFor(frame), role, carrying, false, undefined, true);
        }
      }
      ctx.restore();
    });
  });

  // The brood queen: top-down, frames 0-3, then the swollen breathing step, at 2×
  const top = top0 + STAND_ROLES.length * STAND_CASTE_BLOCK;
  ctx.fillStyle = PAL.white;
  ctx.font = 'bold 16px monospace';
  ctx.fillText('STANDING 3/4  QUEEN  (top-down | frames 0-3 | swollen)  |  2x', X1, top);
  STANDING_VIEWS.forEach((view, vi) => {
    const cy = (top + 32 + vi * STAND_QUEEN_ROW + STAND_QUEEN_ROW / 2) / 2;
    ctx.fillStyle = PAL.white;
    ctx.font = '14px monospace';
    ctx.fillText(view, X1, cy * 2 - 7);
    ctx.save();
    ctx.scale(2, 2);
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < STAND_QUEEN_COLS; i++) {
      const cx = (X1 + 80 + i * (QUEEN * 2 + 8) + QUEEN) / 2;
      const heading = VIEW_HEADING[view];
      if (i === 0) atlas.drawQueenAnt(ctx, cx, cy, heading, phaseFor(0));
      else atlas.drawQueenAnt(ctx, cx, cy, heading, phaseFor(i <= FRAMES ? i - 1 : 0), i > FRAMES, true);
    }
    ctx.restore();
  });

  // The weaver spider: top-down, then frames 0-3, at 2×
  const spiderTop = top + 48 + STANDING_VIEWS.length * STAND_QUEEN_ROW;
  ctx.fillStyle = PAL.white;
  ctx.font = 'bold 16px monospace';
  ctx.fillText('STANDING 3/4  WEAVER SPIDER  (top-down | frames 0-3; bite = frames 0-1)  |  2x', X1, spiderTop);
  STANDING_VIEWS.forEach((view, vi) => {
    const cy = (spiderTop + 32 + vi * STAND_SPIDER_ROW + STAND_SPIDER_ROW / 2) / 2;
    ctx.fillStyle = PAL.white;
    ctx.font = '14px monospace';
    ctx.fillText(view, X1, cy * 2 - 7);
    ctx.save();
    ctx.scale(2, 2);
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < STAND_SPIDER_COLS; i++) {
      const cx = (X1 + 80 + i * (SPIDER * 2 + 8) + SPIDER) / 2;
      const heading = VIEW_HEADING[view];
      if (i === 0) atlas.drawFrontierCreature(ctx, 'spider', cx, cy, heading, phaseFor(0));
      else atlas.drawFrontierCreature(ctx, 'spider', cx, cy, heading, phaseFor(i - 1), null, true);
    }
    ctx.restore();
  });

  // The alien tarantula: top-down, frames 0-3, then the bite pose (gape, snap), at 1×
  const tarantulaTop = spiderTop + 48 + STANDING_VIEWS.length * STAND_SPIDER_ROW;
  ctx.fillStyle = PAL.white;
  ctx.font = 'bold 16px monospace';
  ctx.fillText('STANDING 3/4  ALIEN TARANTULA  (top-down | frames 0-3 | bite gape | bite snap)  |  1x', X1, tarantulaTop);
  STANDING_VIEWS.forEach((view, vi) => {
    const cy = tarantulaTop + 32 + vi * STAND_TARANTULA_ROW + STAND_TARANTULA_ROW / 2;
    ctx.fillStyle = PAL.white;
    ctx.font = '14px monospace';
    ctx.fillText(view, X1, cy - 7);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < STAND_TARANTULA_COLS; i++) {
      const cx = X1 + 80 + i * (TARANTULA + 8) + TARANTULA / 2;
      const heading = VIEW_HEADING[view];
      if (i === 0) atlas.drawFrontierCreature(ctx, 'tarantula', cx, cy, heading, phaseFor(0));
      else if (i <= FRAMES) atlas.drawFrontierCreature(ctx, 'tarantula', cx, cy, heading, phaseFor(i - 1), null, true);
      else atlas.drawFrontierCreature(ctx, 'tarantula', cx, cy, heading, phaseFor(0), i - FRAMES - 1, true);
    }
    ctx.restore();
  });
}
