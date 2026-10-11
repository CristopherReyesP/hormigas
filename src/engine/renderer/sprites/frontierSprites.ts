// Phase 2's creatures beyond the thorn wall, authored facing right like the
// other wildlife (ArtPen turns them and adds the top-left light):
// - the legionary, a crimson army ant with sickle mandibles (24×24);
// - the Legionary Queen, the same build swollen, crested in gold (44×44);
// - the weaver spider, eight bent legs and a red hourglass (32×32);
// - the stalker mantis, a long blighted-green hunter with folded scythes (40×40).
// Static props (PixelPainter, never turned): the Legionary nest and the spider lair.
import { ArtGrid } from '../pixelart/ArtGrid';
import { ArtPen } from '../pixelart/ArtPen';
import { directionAngle } from '../pixelart/directions';
import { PAL } from '../pixelart/palette';
import type { PixelPainter } from '../pixelart/PixelPainter';
import { SPRITE_GRID } from './spriteScale';
import type { WildlifeSpriteSpec } from './wildlifeSprites';

const GAIT = [1, 0, -1, 0];

/** The army-ant body at `k` times the legionary's size (the Queen is the same ant, bigger) */
function paintArmyAnt(grid: ArtGrid, frame: number, direction: number, k: number, queen: boolean, shadow: boolean): ArtGrid {
  const p = new ArtPen(grid, directionAngle(direction));
  const L = PAL.legion;
  const O = PAL.outline;
  const A = Math.floor(grid.width / 2);
  const c = (v: number) => Math.round(A + (v - 12) * k);
  const swing = GAIT[frame % GAIT.length] * Math.max(1, Math.round(k));
  const mirror = (y: number): number => 2 * A - y;

  // Six legs, tripod gait, elbowed out wide: army ants run
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const s = (i + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
      const hipX = c(11 + i);
      const footX = hipX + Math.round((i - 1) * 4 * k) + s;
      const kneeX = Math.round(hipX + (footX - hipX) * 0.4);
      p.polyline([[hipX, A + side], [kneeX, A + side * Math.round(5 * k)], [footX, A + side * Math.round(8 * k)]], L[2]);
      if (k > 1.4) p.polyline([[hipX - 1, A + side], [kneeX - 1, A + side * Math.round(5 * k)], [footX - 1, A + side * Math.round(8 * k)]], L[2]);
    }
  }

  const gasterRx = (queen ? 5.6 : 3.6) * k;
  const gasterRy = (queen ? 4.4 : 2.8) * k;
  p.outlined(pen => {
    pen.ellipse(c(queen ? 6 : 7), A, gasterRx, gasterRy, L[1]);
    pen.px(c(10), A, L[1]);
    pen.ellipse(c(12.5), A, 2.4 * k, 1.8 * k, L[2]);
    pen.px(c(15), A, L[1]);
    pen.disc(c(17.5), A, 2.8 * k, L[2]); // the big soldier head
  }, O);
  p.ellipse(c(queen ? 6 : 7), A, gasterRx - 1, gasterRy - 1, L[2]);
  // Gaster bands
  for (const dx of [-2, 0, 2]) p.vline(c((queen ? 6 : 7) + dx), A - Math.round(gasterRy - 1.5), Math.round((gasterRy - 1.5) * 2) + 1, L[1]);

  // Sickle mandibles: pale hooks curving in from the head
  for (const side of [-1, 1]) {
    const y0 = A + side * Math.round(1.5 * k);
    p.line(c(20), y0, c(22.5), A + side * Math.round(2.4 * k), PAL.legionBone);
    p.px(c(23), A + side * Math.round(1.2 * k), PAL.legionBone);
  }
  // Tiny pale eyes (army ants are near blind)
  p.px(c(18), A - Math.round(1.5 * k), L[3]);
  p.px(c(18), mirror(A - Math.round(1.5 * k)), L[3]);

  if (queen) {
    // A gold crest of spikes over the head, and gold seams on the gaster
    for (const dy of [-2, 0, 2]) p.line(c(16.5), A + dy, c(15), A + dy * 2, PAL.legionCrown);
    p.px(c(17.5), A, PAL.legionCrown);
    p.hline(c(3), A, Math.round(6 * k), PAL.legionCrown);
  }

  p.shade([L]);
  p.sheen(c(17.5), A, 1, L[3]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

export function paintLegionary({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  return paintArmyAnt(new ArtGrid(SPRITE_GRID.legionary), frame, direction, 1, false, shadow);
}

export function paintLegionQueen({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  return paintArmyAnt(new ArtGrid(SPRITE_GRID.legionQueen), frame, direction, 1.75, true, shadow);
}

/** 32×32 weaver spider: a round abdomen with a red hourglass, eight bent legs, a cluster of red eyes */
export function paintSpider({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.spider);
  const p = new ArtPen(grid, directionAngle(direction));
  const S = PAL.spider;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.spider / 2);
  const swing = GAIT[frame % GAIT.length];

  // Eight legs: four a side, a high knee and a long shin, alternating pairs step
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const s = (i + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
      const hipX = 17 + i;
      const kneeX = 13 + i * 4 + s;
      const footX = 9 + i * 6 + s * 2;
      // Two strands thick, the lit tone: the legs must read on dark regolith
      p.polyline([[hipX, A + side * 2], [kneeX, A + side * 8], [footX, A + side * 13]], S[3]);
      p.polyline([[hipX + 1, A + side * 2], [kneeX + 1, A + side * 8], [footX + 1, A + side * 13]], S[2]);
      p.px(kneeX, A + side * 8, S[3]);
    }
  }
  p.outlined(pen => {
    pen.ellipse(10, A, 7, 6, S[1]);
    pen.disc(19, A, 4, S[2]);
  }, O);
  p.ellipse(10, A, 6, 5, S[2]);
  // The hourglass mark
  p.line(8, A - 2, 12, A + 2, PAL.spiderMark);
  p.line(8, A + 2, 12, A - 2, PAL.spiderMark);
  p.hline(8, A - 2, 5, PAL.spiderMark);
  p.hline(8, A + 2, 5, PAL.spiderMark);
  // Fangs and eyes
  p.px(23, A - 1, S[3]);
  p.px(23, A + 1, S[3]);
  for (const [x, y] of [[20, -2], [21, -1], [21, 1], [20, 2], [22, 0]] as const) p.px(x, A + y, PAL.spiderMark);

  p.shade([S]);
  p.sheen(10, A, 3, S[3]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/** 40×40 stalker mantis: long abdomen, thin thorax, folded scythe arms, a triangular head with pale eyes */
export function paintMantis({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.mantis);
  const p = new ArtPen(grid, directionAngle(direction));
  const M = PAL.mantis;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.mantis / 2);
  const swing = GAIT[frame % GAIT.length];
  const strike = frame % 4 === 1 ? 1 : 0;

  // Four walking legs from the back of the thorax: long and spindly
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 2; i++) {
      const s = (i + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
      const hipX = 17 + i * 3;
      const footX = 10 + i * 12 + s * 2;
      p.polyline([[hipX, A + side], [hipX - 2 + i * 4, A + side * 7], [footX, A + side * 11]], M[3]);
    }
  }
  p.outlined(pen => {
    pen.capsule(4, A, 16, A, 3, M[1]); // the long abdomen
    pen.capsule(16, A, 27, A, 1.4, M[2]); // the thin prothorax
    pen.poly([[28, A - 4], [33, A], [28, A + 4]], M[2]); // the triangular head
    // Scythes: folded forward along the body, the tips raised on the strike frame
    for (const side of [-1, 1]) {
      pen.capsule(24, A + side * 2, 31 + strike, A + side * 6, 1.3, M[2]);
      pen.capsule(31 + strike, A + side * 6, 36 + strike, A + side * 3, 1, M[3]);
    }
  }, O);
  p.capsule(5, A, 15, A, 2, M[2]);
  for (const x of [7, 10, 13]) p.vline(x, A - 2, 5, M[1]);
  // Scythe spines
  for (const side of [-1, 1]) {
    p.px(29 + strike, A + side * 4, PAL.mantisEye);
    p.px(33 + strike, A + side * 5, PAL.mantisEye);
  }
  p.px(29, A - 3, PAL.mantisEye);
  p.px(29, A + 3, PAL.mantisEye);

  p.shade([M]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/**
 * 88×88 alien tarantula, twice any other wildlife: a shaggy deep-violet body
 * bristling with fur and teal crystal spines, eight thick hairy legs and a
 * crown of eight glowing green eyes over two heavy fangs.
 */
export function paintTarantula({ frame, direction, shadow = true, bite = false }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.tarantula);
  const p = new ArtPen(grid, directionAngle(direction));
  const T = PAL.tarantula;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.tarantula / 2);
  const k = 2; // authored on the old 44-px plan, drawn twice as big
  const X = (v: number) => Math.round(v * k);
  const Y = (v: number) => A + Math.round(v * k);
  // Biting, it stands still and rears: the front pair of legs lifts forward,
  // and the fangs gape wide (frame 0) or snap shut (frame 1)
  const swing = bite ? 0 : GAIT[frame % GAIT.length] * k;
  const gape = bite ? (frame % 2 === 0 ? 2.5 : -1.2) : 0;
  const hash = (a: number, b: number) => {
    let h = (a * 374761393 + b * 668265263) >>> 0;
    h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
    return (h & 0xffff) / 0xffff;
  };

  // Eight thick hairy legs: three strands each, bristles sticking out every few pixels
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const s = (i + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
      const hip: [number, number] = [X(22 + i * 2), Y(side * 3)];
      const rear = bite && i === 3; // the front pair rears up toward the prey
      const knee: [number, number] = rear ? [X(36), Y(side * 9)] : [X(15 + i * 6) + s, Y(side * 12)];
      const foot: [number, number] = rear ? [X(41), Y(side * 6)] : [X(10 + i * 9) + s * 2, Y(side * 18)];
      // Five strands thick (thinner toward the foot), lit along the middle
      for (const off of [-2, -1, 0, 1, 2]) {
        const color = off === 0 ? T[3] : Math.abs(off) === 1 ? T[2] : T[1];
        p.polyline([[hip[0] + off, hip[1]], [knee[0] + off, knee[1]]], color);
        if (Math.abs(off) < 2) p.polyline([[knee[0] + off, knee[1]], [foot[0] + off, foot[1]]], color);
      }
      // Bristles all along both segments, on both sides
      for (const [a, b] of [[hip, knee], [knee, foot]] as const) {
        for (let t = 0.1; t < 1; t += 0.12) {
          const x = Math.round(a[0] + (b[0] - a[0]) * t);
          const y = Math.round(a[1] + (b[1] - a[1]) * t);
          const lean = hash(x, y) < 0.5 ? -1 : 1;
          p.line(x - 2, y, x - 4, y + lean * 2, T[3]);
          p.line(x + 2, y, x + 4, y - lean * 2, T[2]);
        }
      }
      p.disc(knee[0], knee[1], 1.5, T[2]);
      p.px(knee[0], knee[1], PAL.tarantulaBristle);
    }
  }

  // The body: a big shaggy abdomen and the cephalothorax, with fangs
  p.outlined(pen => {
    pen.ellipse(X(13), A, 10 * k, 8.5 * k, T[1]);
    pen.disc(X(27), A, 6 * k, T[2]);
    pen.capsule(X(33), Y(-2), X(35.5 + Math.max(0, gape) * 0.6), Y(-3 - gape), 1.3 * k, T[1]);
    pen.capsule(X(33), Y(2), X(35.5 + Math.max(0, gape) * 0.6), Y(3 + gape), 1.3 * k, T[1]);
  }, O);
  p.ellipse(X(13), A, 8.5 * k, 7 * k, T[2]);
  p.disc(X(27), A, 4.6 * k, T[3]);

  // Fur: a fringe of hairs all around the abdomen and the thorax, and tufts across the back
  const fringe = (cx: number, rx: number, ry: number, hairs: number) => {
    for (let i = 0; i < hairs; i++) {
      const ang = (i / hairs) * Math.PI * 2 + hash(i, cx) * 0.2;
      const len = 2 + Math.round(hash(cx, i) * 3);
      const x0 = Math.round(cx + Math.cos(ang) * (rx - 1));
      const y0 = Math.round(A + Math.sin(ang) * (ry - 1));
      const x1 = Math.round(cx + Math.cos(ang) * (rx + len));
      const y1 = Math.round(A + Math.sin(ang) * (ry + len));
      p.line(x0, y0, x1, y1, i % 3 === 0 ? T[3] : T[2]);
    }
  };
  fringe(X(13), 10 * k, 8.5 * k, 56);
  fringe(X(27), 6 * k, 6 * k, 30);
  for (let i = 0; i < 70; i++) {
    const x = X(13) + Math.round((hash(i, 7) - 0.5) * 30);
    const y = A + Math.round((hash(7, i) - 0.5) * 24);
    const dx = x - X(13);
    const dy = y - A;
    if ((dx * dx) / (17 * 17) + (dy * dy) / (14 * 14) > 1) continue;
    p.line(x, y, x - 1, y + (hash(i, i) < 0.5 ? 2 : -2), i % 4 === 0 ? T[3] : T[1]);
  }

  // Crystal bristles: a ridge of teal spines down the back
  for (const [x, y] of [[7, -1], [10, -3], [10, 3], [13, -4], [13, 4], [16, -3], [16, 3], [19, 0], [5, 2], [8, 5], [8, -5]] as const) {
    p.line(X(x), Y(y), X(x) - 1, Y(y) + (y < 0 ? -2 : 2), PAL.tarantulaBristle);
  }
  // The eye crown: eight glowing points, two big ones in front
  for (const [x, y] of [[29, -2], [29, 2], [30, -1], [30, 1], [31, -3], [31, 3], [28, 0], [31, 0]] as const) {
    p.rect(X(x), Y(y), 2, 2, PAL.tarantulaEye);
  }
  p.rect(X(31) + 1, Y(-1), 3, 3, PAL.tarantulaEye);
  p.rect(X(31) + 1, Y(1) - 1, 3, 3, PAL.tarantulaEye);

  if (bite) {
    // Venom beads on the fang tips while it bites
    for (const side of [-1, 1]) p.rect(X(35.5 + Math.max(0, gape) * 0.6), Y(side * (3 + gape)) - 1, 2, 2, PAL.tarantulaBristle);
  }
  p.shade([T]);
  p.sheen(X(13), A, 6, T[3]);
  if (shadow) p.castShadow(O, 2, 3);
  return grid;
}

/**
 * 40×40 plasma centipede: a long chain of violet plates seamed with cyan
 * plasma, a pair of legs per segment rippling down the body, forcipules in front.
 */
export function paintCentipede({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.centipede);
  const p = new ArtPen(grid, directionAngle(direction));
  const C = PAL.centipede;
  const G = PAL.centipedeGlow;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.centipede / 2);
  const segments = 9;
  // The body sways: each segment sits on a sine wave that travels with the frame
  const at = (i: number) => ({ x: 6 + i * 3.2, y: A + Math.round(Math.sin((i + frame) * 0.9) * 1.5) });
  // Legs: one pair per segment, the wave of steps running down the body
  for (let i = 0; i < segments; i++) {
    const { x, y } = at(i);
    const step = (i + frame) % 2 === 0 ? 1 : -1;
    for (const side of [-1, 1]) p.line(Math.round(x), y + side * 2, Math.round(x) + step, y + side * 5, C[3]);
  }
  p.outlined(pen => {
    for (let i = 0; i < segments; i++) {
      const { x, y } = at(i);
      pen.ellipse(x, y, 1.9, 2.4, C[2]);
    }
    const head = at(segments);
    pen.disc(head.x, head.y, 2.6, C[2]);
  }, O);
  // Plasma seams between the plates, and the glowing spine
  for (let i = 0; i < segments; i++) {
    const { x, y } = at(i);
    p.px(Math.round(x), y, i % 2 === 0 ? G[0] : G[1]);
    p.px(Math.round(x) + 1, y - 1, C[3]);
  }
  const head = at(segments);
  // Forcipules (venom claws) and eyes
  for (const side of [-1, 1]) {
    p.line(Math.round(head.x) + 2, head.y + side * 2, Math.round(head.x) + 4, head.y + side, G[1]);
    p.px(Math.round(head.x) + 1, head.y + side, G[0]);
  }
  p.shade([C]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/**
 * 32×32 spore jelly: a floating translucent bell with a glowing spore core
 * and drifting tentacles. Seen from above it reads as a round bell.
 */
export function paintSporeJelly({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.sporeJelly);
  const p = new ArtPen(grid, directionAngle(direction));
  const J = PAL.jelly;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.sporeJelly / 2);
  const pulse = frame % 2;
  // Tentacles trail behind (to the left), waving with the frame
  for (let t = -2; t <= 2; t++) {
    const y0 = A + t * 2;
    p.polyline([[A - 3, y0], [A - 7, y0 + ((t + frame) % 2 === 0 ? 1 : -1)], [A - 11, y0]], J[2]);
  }
  p.outlined(pen => pen.disc(A + 1, A, 6 + pulse * 0.5, J[1]), O);
  p.disc(A + 1, A, 5, J[2]);
  p.disc(A + 2, A - 1, 3, J[3]);
  // The spore core and specks
  p.disc(A + 1, A, 1.6, PAL.jellySpore);
  for (const [x, y] of [[-2, -3], [3, 2], [-3, 2], [2, -4]] as const) p.px(A + 1 + x, A + y, PAL.jellySpore);
  p.shade([J]);
  if (shadow) p.castShadow(O, 2, 3);
  return grid;
}

/**
 * 32×32 acid spitter: a squat swamp-green bug with a swollen glowing acid
 * sac on its back and a long nozzle snout it spits from.
 */
export function paintAcidSpitter({ frame, direction, shadow = true }: WildlifeSpriteSpec): ArtGrid {
  const grid = new ArtGrid(SPRITE_GRID.acidSpitter);
  const p = new ArtPen(grid, directionAngle(direction));
  const S = PAL.spitter;
  const O = PAL.outline;
  const A = Math.floor(SPRITE_GRID.acidSpitter / 2);
  const swing = GAIT[frame % GAIT.length];
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 3; i++) {
      const s = (i + (side === 1 ? 1 : 0)) % 2 === 0 ? swing : -swing;
      const hip = 12 + i * 3;
      p.polyline([[hip, A + side * 3], [hip - 1 + s, A + side * 7], [hip - 2 + i * 2 + s, A + side * 9]], S[3]);
    }
  }
  p.outlined(pen => {
    pen.ellipse(13, A, 7, 5.5, S[1]); // body
    pen.disc(21, A, 3, S[2]); // head
    pen.capsule(23, A, 27, A, 1, S[2]); // the nozzle snout
  }, O);
  // The acid sac: a big glowing bulb on the back
  p.disc(12, A, 3.6, PAL.spitterSac[0]);
  p.disc(11, A - 1, 2, PAL.spitterSac[1]);
  p.px(27, A, PAL.spitterSac[1]); // a drop on the nozzle tip
  p.px(20, A - 2, PAL.spitterSac[1]);
  p.px(20, A + 2, PAL.spitterSac[1]);
  p.shade([S]);
  if (shadow) p.castShadow(O, 1, 2);
  return grid;
}

/** The Legionary nest (40×40 art px): a crimson mound riddled with holes, bones of prey around it */
export function paintLegionNest(p: PixelPainter): void {
  const L = PAL.legion;
  p.shadow(20, 29, 17, 6, PAL.outline);
  p.ellipse(20, 21, 15, 11, PAL.outline);
  p.ellipse(20, 21, 14, 10, L[1]);
  p.ellipse(18, 18, 10, 6, L[2]);
  p.ellipse(16, 15, 5, 3, L[3]);
  // Entrance holes: many small dark mouths
  for (const [x, y] of [[20, 20], [12, 23], [27, 23], [16, 27], [24, 28], [9, 18], [31, 17], [20, 13]] as const) {
    p.ellipse(x, y, 2, 1.4, PAL.black);
    p.px(x - 1, y - 1, L[0]);
  }
  // Scattered prey bones
  for (const [x, y] of [[4, 30], [35, 31], [6, 12], [36, 9]] as const) {
    p.hline(x - 1, y, 3, PAL.legionBone);
    p.px(x - 2, y - 1, PAL.legionBone);
    p.px(x + 2, y + 1, PAL.legionBone);
  }
  p.px(16, 14, PAL.legionCrown);
}

/** The spider lair (40×40 art px): a dark hole under a radiating web */
export function paintSpiderLair(p: PixelPainter): void {
  p.shadow(20, 26, 15, 6, PAL.outline);
  p.ellipse(20, 22, 9, 6, PAL.outline);
  p.ellipse(20, 22, 7, 4.5, PAL.black);
  // Web: spokes from the hole, and two rings of silk across them
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    p.line(20, 20, Math.round(20 + Math.cos(a) * 18), Math.round(20 + Math.sin(a) * 16), PAL.web);
  }
  for (const r of [7, 12, 16]) {
    for (let i = 0; i < spokes; i++) {
      const a0 = (i / spokes) * Math.PI * 2;
      const a1 = ((i + 1) / spokes) * Math.PI * 2;
      p.line(
        Math.round(20 + Math.cos(a0) * r), Math.round(20 + Math.sin(a0) * r * 0.9),
        Math.round(20 + Math.cos(a1) * r), Math.round(20 + Math.sin(a1) * r * 0.9),
        r === 16 ? PAL.spider[3] : PAL.web,
      );
    }
  }
  p.px(19, 21, PAL.spiderMark);
  p.px(21, 21, PAL.spiderMark);
}
