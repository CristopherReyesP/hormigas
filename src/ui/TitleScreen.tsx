import { useEffect, useRef, type ReactNode } from 'react';
import { installAudioUi } from '../audio';
import { AntRole } from '../game/components/components';
import { UNIT_ART_PX, drawUnitFrame, type CrystalUnitKind, type UnitFrame, type UnitSheet } from '../engine/renderer/crystalUnits';
import { getSpriteAtlas } from './sharedAtlas';
import { crystalSheet } from './racePicker/unitSheets';

interface TitleScreenProps {
  /** INICIAR: on to the race picker */
  onStart: () => void;
  /** Start the guided tutorial instead */
  onTutorial?: () => void;
  /** The saved runs: continuing one goes straight into the game */
  savedRun?: ReactNode;
}

/** The game's front door: the title over the colony facing the Crystal Hive, soldiers marching behind. */
export function TitleScreen({ onStart, onTutorial, savedRun }: TitleScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The first screen: from here on every button ticks and taps, and the first click unlocks audio
  useEffect(() => installAudioUi(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const frame = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      paintScene(ctx, w, h, still ? 0 : now / 1000);
      if (!still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="title-screen" role="dialog" aria-modal="true" aria-labelledby="title-screen-name">
      <canvas ref={canvasRef} className="title-scene" aria-hidden="true" />
      <div className="title-vignette" aria-hidden="true" />
      <header className="title-head">
        <h1 id="title-screen-name" className="title-name">HORMIGAS</h1>
        <p className="title-tagline">
          <span className="title-side title-side--colony">LA COLONIA</span>
          <span className="title-vs">VS</span>
          <span className="title-side title-side--crystal">LOS CRISTALES</span>
        </p>
      </header>
      <div className="title-launch">
        <button type="button" className="title-start" data-title-start="" data-sfx="start" autoFocus onClick={onStart}>
          INICIAR
        </button>
        {onTutorial && (
          <button type="button" className="race-tutorial title-tutorial" data-tutorial-start="" title="¿Primera vez? Aprende a jugar con Hormi" onClick={onTutorial}>
            TUTORIAL
          </button>
        )}
        {savedRun && <div className="title-saves">{savedRun}</div>}
      </div>
    </div>
  );
}

// ── The scene ───────────────────────────────────────────────

const RIGHT = 0;

/** Crystal frames baked to canvases once, so the scene blits instead of re-painting runs every frame. */
const bakedFrames = new Map<UnitFrame, HTMLCanvasElement>();
function bakedFrame(frame: UnitFrame): HTMLCanvasElement {
  let c = bakedFrames.get(frame);
  if (!c) {
    c = document.createElement('canvas');
    c.width = frame.width * UNIT_ART_PX;
    c.height = frame.height * UNIT_ART_PX;
    const fctx = c.getContext('2d');
    if (fctx) drawUnitFrame(fctx, frame, 0, 0);
    bakedFrames.set(frame, c);
  }
  return c;
}

/** A baked unit centered on (x, y), `zoom` × its card size. */
function drawSheet(ctx: CanvasRenderingContext2D, sheet: UnitSheet, x: number, y: number, zoom: number, t: number) {
  const step = Math.floor((t * 1000) / sheet.frameMs);
  const img = bakedFrame(sheet.frames[step % sheet.frames.length]);
  const w = img.width * zoom;
  const h = img.height * zoom;
  ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
}

const drawCrystal = (ctx: CanvasRenderingContext2D, kind: CrystalUnitKind, x: number, y: number, zoom: number, t: number) =>
  drawSheet(ctx, crystalSheet(kind), x, y, zoom, t);

/** An atlas ant (or the queen) centered on (x, y), `zoom` × its world size. */
function drawAnt(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, angle: number, phase: number, role: AntRole | 'queen') {
  const atlas = getSpriteAtlas();
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(zoom, zoom);
  if (role === 'queen') atlas.drawQueenAnt(ctx, 0, 0, angle, phase);
  else atlas.drawAnt(ctx, 0, 0, angle, phase, role, false, true);
  ctx.restore();
}

/** Where the split crosses height `y`: a diagonal from top-right of center to bottom-left of it. */
const splitX = (w: number, h: number, y: number) => w * 0.56 - (y / h) * w * 0.12;

/** One team's half: its color wash, its rank of fighters in a V behind the leader, the leader in front. */
function paintHalf(ctx: CanvasRenderingContext2D, w: number, h: number, side: 'left' | 'right', t: number, unit: number) {
  const left = side === 'left';
  ctx.save();
  ctx.beginPath();
  if (left) {
    ctx.moveTo(0, 0);
    ctx.lineTo(splitX(w, h, 0), 0);
    ctx.lineTo(splitX(w, h, h), h);
    ctx.lineTo(0, h);
  } else {
    ctx.moveTo(splitX(w, h, 0), 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, h);
    ctx.lineTo(splitX(w, h, h), h);
  }
  ctx.closePath();
  ctx.clip();

  // Team wash: deep at the outer edge, burning bright toward the split
  const wash = ctx.createLinearGradient(left ? 0 : w, 0, w * 0.5, 0);
  wash.addColorStop(0, left ? '#0b1206' : '#04121a');
  wash.addColorStop(0.75, left ? '#24400c' : '#0f4a5e');
  wash.addColorStop(1, left ? '#5a8a1c' : '#1b8fb0');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  // Speed lines rushing toward the center
  ctx.fillStyle = left ? 'rgba(198, 255, 61, 0.12)' : 'rgba(95, 227, 255, 0.12)';
  for (let i = 0; i < 18; i++) {
    const y = ((i * 97.3) % 1) * h + ((i * 53) % h);
    const len = (60 + ((i * 31) % 140)) * unit;
    const run = ((t * 300 + i * 211) % (w * 0.7));
    const x = left ? run - len : w - run;
    ctx.fillRect(Math.round(x), Math.round(y % h), Math.round(len), Math.max(2, Math.round(2 * unit)));
  }

  // The army: ranks fanning back from the leader, smaller as they recede
  const dir = left ? 1 : -1;
  const leadX = left ? w * 0.27 : w * 0.73;
  const leadY = h * 0.6;
  const charge = Math.sin(t * 3) * 4 * unit;
  const fighter = (x: number, y: number, zoom: number, seed: number) => {
    const bob = Math.sin(t * 7 + seed) * 2 * unit;
    if (left) drawAnt(ctx, x + bob, y, zoom, RIGHT, t * 10 + seed, seed % 3 === 0 ? AntRole.Defender : AntRole.Soldier);
    else drawCrystal(ctx, seed % 2 ? 'sentinel' : 'drone', x - bob, y + bob, zoom * 0.7, t + seed * 0.13);
  };
  for (let r = 4; r >= 1; r--) {
    const depth = 1 - r * 0.15;
    const count = 3 + r;
    for (let k = 0; k < count; k++) {
      const spread = (k - (count - 1) / 2) * (62 - r * 4) * unit;
      const x = leadX - dir * (r * 58 * unit + Math.abs(spread) * 0.35) + Math.sin(k * 3.7 + r) * 8 * unit;
      const y = leadY - r * 34 * unit + spread;
      fighter(x + charge * depth, y, unit * 1.5 * depth, r * 7 + k);
    }
  }
  // Two lieutenants flanking the leader
  fighter(leadX - dir * 30 * unit + charge, leadY - 70 * unit, unit * 1.7, 1);
  fighter(leadX - dir * 30 * unit + charge, leadY + 66 * unit, unit * 1.7, 2);

  // The leader, front and center of the team
  const glow = ctx.createRadialGradient(leadX, leadY, 0, leadX, leadY, 120 * unit);
  glow.addColorStop(0, left ? 'rgba(198, 255, 61, 0.35)' : 'rgba(95, 227, 255, 0.35)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(leadX - 130 * unit, leadY - 130 * unit, 260 * unit, 260 * unit);
  if (left) drawAnt(ctx, leadX + charge, leadY, unit * 2.4, RIGHT, t * 4, 'queen');
  else drawCrystal(ctx, 'queen', leadX - charge, leadY + Math.sin(t * 2) * 4 * unit, unit * 1.9, t);

  ctx.restore();
}

function paintScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const unit = Math.max(0.55, Math.min(w / 760, h / 520));
  paintHalf(ctx, w, h, 'left', t, unit);
  paintHalf(ctx, w, h, 'right', t, unit);

  // The split: a crackling white seam with sparks thrown both ways
  const flicker = 0.7 + 0.3 * Math.sin(t * 17);
  ctx.strokeStyle = `rgba(255, 255, 255, ${flicker})`;
  ctx.lineWidth = Math.max(3, Math.round(4 * unit));
  ctx.beginPath();
  const segs = 14;
  for (let i = 0; i <= segs; i++) {
    const y = (h * i) / segs;
    const jitter = i === 0 || i === segs ? 0 : Math.sin(Math.floor(t * 10) * 2.3 + i * 5.1) * 6 * unit;
    const x = splitX(w, h, y) + jitter;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  for (let i = 0; i < 24; i++) {
    const life = (t * 1.1 + i / 24) % 1;
    const y = ((i * 0.618) % 1) * h;
    const x0 = splitX(w, h, y);
    const toLeft = i % 2 === 0;
    const x = x0 + (toLeft ? -1 : 1) * life * 90 * unit;
    ctx.fillStyle = toLeft ? `rgba(198, 255, 61, ${1 - life})` : `rgba(95, 227, 255, ${1 - life})`;
    const s = Math.max(2, Math.round(4 * unit * (1 - life)));
    ctx.fillRect(Math.round(x), Math.round(y - life * 30 * unit), s, s);
  }

  // Team banners under the leaders
  ctx.font = `${Math.round(Math.max(10, 14 * unit))}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText('LA COLONIA', w * 0.24 + 2, h * 0.6 + 110 * unit + 2);
  ctx.fillText('LOS CRISTALES', w * 0.76 + 2, h * 0.6 + 110 * unit + 2);
  ctx.fillStyle = '#c6ff3d';
  ctx.fillText('LA COLONIA', w * 0.24, h * 0.6 + 110 * unit);
  ctx.fillStyle = '#5fe3ff';
  ctx.fillText('LOS CRISTALES', w * 0.76, h * 0.6 + 110 * unit);
}
