import { useEffect, useRef, type ReactNode } from 'react';
import { installAudioUi } from '../audio';
import { AntRole } from '../game/components/components';
import { UNIT_ART_PX, drawUnitFrame, type CrystalUnitKind, type UnitFrame, type UnitSheet } from '../engine/renderer/crystalUnits';
import type { HumanUnitKind } from '../engine/renderer/humanUnits';
import { getSpriteAtlas } from './sharedAtlas';
import { crystalSheet, humanSheet } from './racePicker/unitSheets';

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
const LEFT = Math.PI;

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
const drawHuman = (ctx: CanvasRenderingContext2D, kind: HumanUnitKind, x: number, y: number, zoom: number, t: number) =>
  drawSheet(ctx, humanSheet(kind), x, y, zoom, t);

/** A wildlife critter from the atlas centered on (x, y), `zoom` × its world size. */
function drawCritter(ctx: CanvasRenderingContext2D, kind: 'beetle' | 'cricket', x: number, y: number, zoom: number, angle: number, phase: number) {
  const atlas = getSpriteAtlas();
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(zoom, zoom);
  if (kind === 'beetle') atlas.drawBeetle(ctx, 0, 0, angle, phase);
  else atlas.drawCricket(ctx, 0, 0, angle, phase);
  ctx.restore();
}

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

/** One faceted crystal spike rising from the ground. */
function drawShard(ctx: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, lean: number) {
  const tipX = x + lean;
  ctx.fillStyle = '#1b5a73';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base);
  ctx.lineTo(tipX, base - h);
  ctx.lineTo(x + w / 2, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#5fe3ff';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base);
  ctx.lineTo(tipX, base - h);
  ctx.lineTo(x - w / 8, base);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(232, 255, 255, 0.8)';
  ctx.fillRect(Math.round(tipX - 1), Math.round(base - h + 2), 2, Math.max(2, Math.round(h * 0.25)));
}

/** A column of soldiers marching across the backdrop, wrapping at the edges. */
function marchRow(ctx: CanvasRenderingContext2D, w: number, y: number, zoom: number, speed: number, gap: number, t: number, alpha: number, dir: 1 | -1) {
  const span = w + gap * 2;
  const count = Math.ceil(span / gap);
  const offset = (t * speed) % gap;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < count; i++) {
    const base = i * gap + offset;
    const x = dir === 1 ? base - gap : w + gap - base;
    const bob = Math.sin(t * 6 + i) * zoom * 0.6;
    drawAnt(ctx, x, y + bob, zoom, dir === 1 ? RIGHT : LEFT, t * 10 + i, i % 4 === 3 ? AntRole.Defender : AntRole.Soldier);
  }
  ctx.restore();
}

function paintScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  // Dusk sky: green swarm glow on the left, crystal cyan on the right
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#07040a');
  sky.addColorStop(0.6, '#160c12');
  sky.addColorStop(1, '#241420');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const glow = (x: number, color: string) => {
    const g = ctx.createRadialGradient(x, h * 0.7, 0, x, h * 0.7, Math.max(w, h) * 0.55);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  glow(w * 0.15, 'rgba(198, 255, 61, 0.16)');
  glow(w * 0.85, 'rgba(95, 227, 255, 0.18)');

  // Stars
  ctx.fillStyle = 'rgba(232, 216, 220, 0.6)';
  for (let i = 0; i < 60; i++) {
    const sx = (i * 137.5) % w;
    const sy = ((i * 89.3) % (h * 0.45));
    if ((Math.floor(t * 2) + i) % 7 !== 0) ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
  }

  const unit = Math.max(0.6, Math.min(w / 640, h / 420));
  // Tall phone screens: lift the battle above the buttons
  const ground = h * (h > w * 1.3 ? 0.62 : 0.78);

  // Far ridge with a far column of soldiers, then the near column
  ctx.fillStyle = '#1a0f16';
  ctx.fillRect(0, ground - 70 * unit, w, h);
  marchRow(ctx, w, ground - 62 * unit, unit * 0.45, 22 * unit, 30 * unit, t, 0.45, -1);
  ctx.fillStyle = '#211219';
  ctx.fillRect(0, ground - 40 * unit, w, h);
  marchRow(ctx, w, ground - 30 * unit, unit * 0.7, 34 * unit, 44 * unit, t, 0.7, 1);

  // The Humans' squad dug in on the far ridge, watching the clash
  const hx = w * 0.5;
  const hy = ground - 58 * unit;
  drawHuman(ctx, 'marksman', hx - 70 * unit, hy - 4 * unit, unit * 0.9, t);
  drawHuman(ctx, 'soldier', hx - 36 * unit, hy, unit * 0.9, t + 0.1);
  drawHuman(ctx, 'tank', hx + 10 * unit, hy + 2 * unit, unit * 0.9, t);
  drawHuman(ctx, 'soldier', hx + 56 * unit, hy, unit * 0.9, t + 0.3);
  drawHuman(ctx, 'soldier', hx + 84 * unit, hy - 2 * unit, unit * 0.9, t + 0.2);

  // Battlefield floor
  ctx.fillStyle = '#2b1820';
  ctx.fillRect(0, ground, w, h - ground);
  ctx.fillStyle = '#3a2030';
  for (let x = 0; x < w; x += 12 * unit) ctx.fillRect(Math.round(x), Math.round(ground), Math.round(6 * unit), Math.round(2 * unit));

  // The Crystal Hive's side: spikes of crystal
  const cx = w * 0.78;
  drawShard(ctx, cx - 120 * unit, ground + 4, 26 * unit, 90 * unit, 6 * unit);
  drawShard(ctx, cx - 90 * unit, ground + 4, 18 * unit, 56 * unit, -4 * unit);
  drawShard(ctx, cx + 110 * unit, ground + 4, 30 * unit, 120 * unit, -8 * unit);
  drawShard(ctx, cx + 140 * unit, ground + 4, 18 * unit, 70 * unit, 5 * unit);
  drawShard(ctx, w - 10 * unit, ground + 4, 34 * unit, 150 * unit, -10 * unit);

  // The colony's side: queen in the back, soldiers in front
  const ax = w * 0.22;
  const step = t * 8;
  drawAnt(ctx, ax - 60 * unit, ground - 10 * unit, unit * 1.3, RIGHT, step * 0.5, 'queen');
  drawAnt(ctx, ax + 40 * unit, ground + 4 * unit, unit * 1.2, RIGHT, step, AntRole.Soldier);
  drawAnt(ctx, ax + 10 * unit, ground + 40 * unit, unit * 1.2, RIGHT, step + 1, AntRole.Soldier);
  drawAnt(ctx, ax + 80 * unit, ground + 30 * unit, unit, RIGHT, step + 2, AntRole.Defender);

  // The Crystal Hive: queen hovering high, sentinels and drones ahead
  const hover = (k: number) => Math.sin(t * 2 + k) * 4 * unit;
  drawCrystal(ctx, 'queen', cx + 40 * unit, ground - 60 * unit + hover(0), unit * 1.6, t);
  drawCrystal(ctx, 'sentinel', cx - 40 * unit, ground - 8 * unit + hover(1), unit * 1.5, t);
  drawCrystal(ctx, 'sentinel', cx + 10 * unit, ground + 34 * unit + hover(2), unit * 1.4, t);
  drawCrystal(ctx, 'drone', cx - 80 * unit, ground - 60 * unit + hover(3), unit * 1.3, t);
  drawCrystal(ctx, 'drone', cx + 100 * unit, ground + 10 * unit + hover(4), unit * 1.2, t);

  // The wildlife: a beetle lumbering across the front, crickets leaping at the edges
  const crawl = ((t * 18 * unit) % (w + 120 * unit)) - 60 * unit;
  drawCritter(ctx, 'beetle', crawl, ground + 70 * unit, unit * 1.1, RIGHT, t * 6);
  drawCritter(ctx, 'beetle', w * 0.05, ground + 50 * unit, unit, -Math.PI / 4, t * 4);
  const hop = Math.abs(Math.sin(t * 2.2)) * 18 * unit;
  drawCritter(ctx, 'cricket', w * 0.95, ground + 66 * unit - hop, unit * 0.65, LEFT, t * 5);
  drawCritter(ctx, 'cricket', w * 0.62, ground + 80 * unit - Math.abs(Math.sin(t * 2.2 + 1.5)) * 14 * unit, unit * 0.6, LEFT, t * 5 + 2);

  // The clash: crackling energy where both lines meet
  const mx = w * 0.5;
  const my = ground + 6 * unit;
  const pulse = 0.6 + 0.4 * Math.sin(t * 9);
  const burst = ctx.createRadialGradient(mx, my, 0, mx, my, 70 * unit);
  burst.addColorStop(0, `rgba(255, 255, 255, ${0.55 * pulse})`);
  burst.addColorStop(0.35, `rgba(198, 255, 61, ${0.3 * pulse})`);
  burst.addColorStop(0.7, `rgba(95, 227, 255, ${0.18 * pulse})`);
  burst.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = burst;
  ctx.fillRect(mx - 80 * unit, my - 80 * unit, 160 * unit, 160 * unit);
  const bolt = (from: number, to: number, color: string, seed: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.round(2 * unit));
    ctx.beginPath();
    ctx.moveTo(from, my);
    const segs = 6;
    for (let i = 1; i <= segs; i++) {
      const x = from + ((to - from) * i) / segs;
      const jitter = i === segs ? 0 : Math.sin(Math.floor(t * 12) * 3.1 + i * 7.7 + seed) * 10 * unit;
      ctx.lineTo(x, my + jitter);
    }
    ctx.stroke();
  };
  bolt(mx - 60 * unit, mx, '#c6ff3d', 0);
  bolt(mx + 60 * unit, mx, '#5fe3ff', 2);

  // Sparks thrown from the clash
  for (let i = 0; i < 14; i++) {
    const life = (t * 1.2 + i / 14) % 1;
    const a = i * 2.39996;
    const r = life * 60 * unit;
    ctx.fillStyle = i % 2 ? `rgba(198, 255, 61, ${1 - life})` : `rgba(95, 227, 255, ${1 - life})`;
    const s = Math.max(2, Math.round(3 * unit * (1 - life)));
    ctx.fillRect(Math.round(mx + Math.cos(a) * r), Math.round(my + Math.sin(a) * r * 0.6 - life * 20 * unit), s, s);
  }
}
