// DEV-ONLY sprite preview harness — not imported by the game.
// Renders every ant role at 1× (real in-game size) and 4× magnification:
// all 4 walk frames + carrying state, on the game's dirt background.
import { SpriteAtlas } from '../engine/renderer/SpriteAtlas';
import { AntRole } from '../game/components/components';
import { PAL } from '../engine/renderer/pixelart/palette';

const ROLES: AntRole[] = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse];
const FRAMES = 4;
const SPRITE = 48; // ant frame size in px
const COLS = FRAMES + 1; // 4 walk frames + 1 carrying

const BLOCK_H = 240; // vertical space per role row
const X1 = 16; // 1× strip left edge
const X4 = 360; // 4× strip left edge
const CRICKET = 192; // cricket frame size in px
const CRICKET_BLOCK = CRICKET * 2 + 72; // cricket row: 2× strip + labels
const W = X4 + COLS * (SPRITE * 4 + 8) + 16;
const H = ROLES.length * BLOCK_H + CRICKET_BLOCK + 56;

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

// Cricket row — 4 walk frames at 1× and 2× (sprite is already 192 px)
{
  const top = 40 + ROLES.length * BLOCK_H;
  const cricketPhase = (i: number) => ((i + 0.5) * Math.PI * 2) / 4;

  ctx.fillStyle = PAL.white;
  ctx.font = 'bold 16px monospace';
  ctx.fillText('CRICKET  (frames 0-3)  |  left: 1x  right: 2x', X1, top - 28);

  for (let i = 0; i < 4; i++) {
    const cx = X1 + i * (CRICKET + 12) + CRICKET / 2;
    atlas.drawCricket(ctx, cx, top + CRICKET / 2, 0, cricketPhase(i));
  }

  ctx.save();
  ctx.scale(2, 2);
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < 2; i++) {
    const cx = (X4 + 560 + i * (CRICKET * 2 + 16) + CRICKET) / 2;
    atlas.drawCricket(ctx, cx, (top + CRICKET) / 2, 0, cricketPhase(i));
  }
  ctx.restore();
}
