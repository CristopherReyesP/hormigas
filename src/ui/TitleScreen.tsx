import { useEffect, useRef, type ReactNode } from 'react';
import { GAME_VERSION } from '../shared/version';
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

/** The game's front door: a cinematic aerial shot of the colony's tide breaking on the Crystal Hive's, then the title. */
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
      <div className="title-bar title-bar--top" aria-hidden="true" />
      <div className="title-bar title-bar--bottom" aria-hidden="true" />
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
      <p className="game-version game-version--title" data-game-version="">{GAME_VERSION}</p>
    </div>
  );
}

// ── The scene ───────────────────────────────────────────────


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

// The establishing shot: an aerial view of the field where the colony's tide
// meets the Crystal Hive's, the camera drifting in slowly over it.

/** The field in world px; the camera crops it to cover the screen. */
const WORLD_W = 1200;
const WORLD_H = 675;
const NEST = { x: 170, y: 360 };
const SPIRE = { x: 1040, y: 320 };
/** The front line where both tides break, wavering along the field. */
const frontX = (y: number, t: number) => 610 + Math.sin(y / 70 + t * 0.8) * 26;

/** Pseudo-random in [0, 1), stable per seed. */
const rand = (seed: number) => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

let groundCache: HTMLCanvasElement | null = null;
/** The dirt, painted once: speckles, pebbles, grass tufts, the colony's tint and the crystal blight. */
function ground(): HTMLCanvasElement {
  if (groundCache) return groundCache;
  const c = document.createElement('canvas');
  c.width = WORLD_W;
  c.height = WORLD_H;
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = '#2e2119';
  g.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let i = 0; i < 260; i++) {
    const r = 20 + rand(i) * 70;
    g.fillStyle = rand(i + 1) > 0.5 ? 'rgba(58, 40, 28, 0.5)' : 'rgba(30, 20, 14, 0.5)';
    g.beginPath();
    g.ellipse(rand(i + 2) * WORLD_W, rand(i + 3) * WORLD_H, r, r * 0.6, rand(i + 4) * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = ['#3e2c20', '#241912', '#4a3626', '#1c130e'][i % 4];
    g.fillRect(Math.floor(rand(i * 3) * WORLD_W), Math.floor(rand(i * 3 + 1) * WORLD_H), 2, 2);
  }
  for (let i = 0; i < 120; i++) {
    const x = rand(i * 5) * WORLD_W;
    const y = rand(i * 5 + 1) * WORLD_H;
    g.fillStyle = '#5a4a3e';
    g.fillRect(Math.floor(x), Math.floor(y), 6, 4);
    g.fillStyle = '#7a685a';
    g.fillRect(Math.floor(x), Math.floor(y), 4, 2);
  }
  // Grass on the colony's side, dying out toward the blight
  for (let i = 0; i < 260; i++) {
    const x = rand(i * 7) * WORLD_W * 0.55;
    const y = rand(i * 7 + 1) * WORLD_H;
    g.fillStyle = i % 2 ? '#3d5a1c' : '#56781f';
    for (let b = 0; b < 4; b++) g.fillRect(Math.floor(x + b * 3), Math.floor(y - (b % 2) * 3), 2, 6);
  }
  // The crystal blight: the right of the field has turned to glassy rock
  const blight = g.createLinearGradient(WORLD_W * 0.55, 0, WORLD_W, 0);
  blight.addColorStop(0, 'rgba(20, 60, 80, 0)');
  blight.addColorStop(1, 'rgba(20, 70, 95, 0.75)');
  g.fillStyle = blight;
  g.fillRect(0, 0, WORLD_W, WORLD_H);
  for (let i = 0; i < 70; i++) {
    const x = WORLD_W * 0.62 + rand(i * 11) * WORLD_W * 0.4;
    const y = rand(i * 11 + 1) * WORLD_H;
    crystalCluster(g, x, y, 6 + rand(i * 11 + 2) * 14, i);
  }
  groundCache = c;
  return c;
}

/** A top-down cluster of hexagonal crystal prisms. */
function crystalCluster(g: CanvasRenderingContext2D, x: number, y: number, size: number, seed: number) {
  for (let k = 0; k < 3; k++) {
    const r = size * (1 - k * 0.25);
    const cx = x + (rand(seed + k) - 0.5) * size * 1.4;
    const cy = y + (rand(seed + k + 9) - 0.5) * size;
    g.fillStyle = 'rgba(0, 0, 0, 0.35)';
    hexagon(g, cx + r * 0.4, cy + r * 0.5, r);
    g.fillStyle = '#1b5a73';
    hexagon(g, cx, cy, r);
    g.fillStyle = '#5fe3ff';
    hexagon(g, cx - r * 0.15, cy - r * 0.15, r * 0.6);
    g.fillStyle = '#e8ffff';
    g.fillRect(Math.floor(cx - r * 0.3), Math.floor(cy - r * 0.35), 2, 2);
  }
}

function hexagon(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    if (i === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
}

/** Where a fighter of one tide is at time `t`: it leaves home, crosses the field and fights at the front, then a fresh one takes its place. */
function tidePos(home: { x: number; y: number }, i: number, t: number, period: number, fromLeft: boolean) {
  const lane = (rand(i * 13) - 0.5) * WORLD_H * 0.95 + WORLD_H / 2;
  const p = (t / period + rand(i * 13 + 1)) % 1;
  const march = Math.min(1, p / 0.55);
  const front = frontX(lane, t) + (fromLeft ? -1 : 1) * (8 + rand(i * 13 + 2) * 40);
  const sx = home.x + (rand(i * 13 + 3) - 0.5) * 60;
  const sy = home.y + (rand(i * 13 + 4) - 0.5) * 60;
  const ease = march * march * (3 - 2 * march);
  let x = sx + (front - sx) * ease;
  let y = sy + (lane - sy) * ease;
  const fighting = p > 0.55;
  if (fighting) {
    x += Math.sin(t * 14 + i) * 5;
    y += Math.cos(t * 11 + i * 2) * 4;
  }
  const alpha = Math.min(1, p / 0.06, (1 - p) / 0.06);
  const angle = fighting ? (fromLeft ? 0 : Math.PI) + Math.sin(t * 9 + i) * 0.5 : Math.atan2(lane - sy, front - sx);
  return { x, y, alpha, angle, fighting };
}

const ANT_TIDE = 70;
const CRYSTAL_TIDE = 44;

function paintScene(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  // The camera: covers the screen, then pushes in slowly and drifts across the field
  const push = 1.04 + 0.08 * (0.5 - 0.5 * Math.cos(t * 0.12));
  const scale = Math.max(w / WORLD_W, h / WORLD_H) * push;
  const camX = WORLD_W / 2 + Math.sin(t * 0.09) * 40;
  const camY = WORLD_H / 2 + Math.cos(t * 0.07) * 18;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-camX, -camY);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ground(), 0, 0);

  // Home bases: the colony's mound and the hive's spire
  getSpriteAtlas().drawNest(ctx, NEST.x, NEST.y, 2); // radius in tiles
  ctx.save();
  ctx.globalAlpha = 0.6 + 0.2 * Math.sin(t * 2);
  const aura = ctx.createRadialGradient(SPIRE.x, SPIRE.y, 0, SPIRE.x, SPIRE.y, 150);
  aura.addColorStop(0, 'rgba(95, 227, 255, 0.55)');
  aura.addColorStop(1, 'rgba(95, 227, 255, 0)');
  ctx.fillStyle = aura;
  ctx.fillRect(SPIRE.x - 150, SPIRE.y - 150, 300, 300);
  ctx.restore();
  crystalCluster(ctx, SPIRE.x, SPIRE.y + 30, 34, 3);

  // Both tides
  for (let i = 0; i < ANT_TIDE; i++) {
    const a = tidePos(NEST, i, t, 16, true);
    ctx.globalAlpha = a.alpha;
    drawAnt(ctx, a.x, a.y, 1, a.angle, t * 12 + i, i % 5 === 0 ? AntRole.Defender : i % 3 === 0 ? AntRole.Worker : AntRole.Soldier);
  }
  for (let i = 0; i < CRYSTAL_TIDE; i++) {
    const c = tidePos(SPIRE, i + 500, t, 20, false);
    ctx.globalAlpha = c.alpha;
    drawCrystal(ctx, i % 3 === 0 ? 'sentinel' : 'drone', c.x, c.y + Math.sin(t * 2 + i) * 3, 0.75, t + i * 0.1);
  }
  ctx.globalAlpha = 1;

  // The leaders watching from home
  drawAnt(ctx, NEST.x + 70, NEST.y + 10, 1.4, 0, t * 2, 'queen');
  drawCrystal(ctx, 'queen', SPIRE.x - 30, SPIRE.y - 20 + Math.sin(t * 1.5) * 4, 1, t);

  // The clash: flashes and sparks all along the front
  for (let i = 0; i < 16; i++) {
    const life = (t * 1.6 + rand(i * 17)) % 1;
    const y = rand(i * 17 + Math.floor(t * 1.6 + rand(i * 17))) * WORLD_H;
    const x = frontX(y, t);
    const r = 10 + life * 34;
    const flash = ctx.createRadialGradient(x, y, 0, x, y, r);
    const green = i % 2 === 0;
    flash.addColorStop(0, `rgba(255, 255, 255, ${0.8 * (1 - life)})`);
    flash.addColorStop(0.4, green ? `rgba(198, 255, 61, ${0.5 * (1 - life)})` : `rgba(95, 227, 255, ${0.5 * (1 - life)})`);
    flash.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = flash;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();

  // Grading: warm green on the colony's side, cold cyan on the hive's, crushed blacks at the edges
  const grade = ctx.createLinearGradient(0, 0, w, 0);
  grade.addColorStop(0, 'rgba(120, 160, 20, 0.18)');
  grade.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  grade.addColorStop(1, 'rgba(20, 140, 190, 0.22)');
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, w, h);
  const vignette = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.8)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  // Film grain
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  const seed = Math.floor(t * 24);
  for (let i = 0; i < 220; i++) ctx.fillRect(Math.floor(rand(seed + i * 2) * w), Math.floor(rand(seed + i * 2 + 1) * h), 1, 1);
}
