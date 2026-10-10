import { describe, expect, it } from 'vitest';
import { Camera } from '../../engine/camera/Camera';
import { PAL } from '../../engine/renderer/pixelart/palette';
import { hasGlyph } from '../../engine/renderer/pixelart/PixelFont';
import { TILE_SIZE } from '../../shared/constants';
import { IntroDirector } from './IntroDirector';
import { MeteorIntro } from './MeteorIntro';
import {
  HIVE_RISE,
  hiveCrownGrowth,
  playerLaunchTile,
  type IntroArrival,
} from './introArrival';
import {
  INTRO_TIMELINE as T,
  INTRO_TITLE_LINES,
  INTRO_VARIANTS,
  IntroClock,
  PLAYER_INTRO,
  introDrones,
  introSpireGrowth,
  introTitleLines,
  introVariantFor,
  isPlayerArrival,
  playerDroneState,
  playerIntroCameraFocus,
  type IntroVariant,
} from './introTimeline';

const HOME_TILE = { x: 60, y: 45 };
const RIVAL_TILE = { x: 100, y: 20 };
const tileCenter = (t: { x: number; y: number }) => ({ x: t.x * TILE_SIZE + TILE_SIZE / 2, y: t.y * TILE_SIZE + TILE_SIZE / 2 });
const HOME = tileCenter(HOME_TILE);
const RIVAL = tileCenter(RIVAL_TILE);
const MAX_FRAMES = 60 * 30;

describe('the opening per player race', () => {
  it('picks the variant by the player race first, then by the rival', () => {
    // The Swarm keeps its rival-picked openings
    expect(introVariantFor('crystal', 'swarm')).toBe('crystal');
    expect(introVariantFor('human', 'swarm')).toBe('human');
    expect(introVariantFor('wildlife', 'swarm')).toBe('wildlife');
    expect(introVariantFor('human')).toBe('human');
    // A Crystal or Human player opens on their own arrival, whatever the rival
    for (const rival of ['wildlife', 'crystal', 'human'] as const) {
      expect(introVariantFor(rival, 'crystal')).toBe('crystal-player');
      expect(introVariantFor(rival, 'human')).toBe('human-player');
    }
  });

  it('tells a player race\'s own arrival from the Swarm\'s rival arrivals', () => {
    expect(isPlayerArrival('crystal-player')).toBe(true);
    expect(isPlayerArrival('human-player')).toBe(true);
    for (const v of ['crystal', 'human', 'wildlife'] as const) expect(isPlayerArrival(v)).toBe(false);
    expect(INTRO_VARIANTS['crystal-player']).toMatchObject({ arrival: 'meteor', player: 'crystal' });
    expect(INTRO_VARIANTS['human-player']).toMatchObject({ arrival: 'dropship', humanDeploy: true, player: 'human' });
  });

  it('titles each opening for its race, in the pixel font', () => {
    expect(introTitleLines('crystal')).toEqual(INTRO_TITLE_LINES);
    expect(introTitleLines('wildlife')).toEqual(['EL ENJAMBRE', 'DESPIERTA']);
    expect(introTitleLines('crystal-player').join(' ')).toBe('LA COLMENA DESPIERTA');
    expect(introTitleLines('human-player').join(' ')).toBe('LA EXPEDICIÓN ATERRIZA');
    for (const v of ['crystal-player', 'human-player'] as const) {
      for (const ch of introTitleLines(v).join('')) expect(hasGlyph(ch), ch).toBe(true);
    }
  });
});

describe('the Crystal player\'s opening', () => {
  it('launches the meteor away from the rival, inside the map, and lands it on the home tile', () => {
    const from = playerLaunchTile(HOME_TILE, RIVAL_TILE, { width: 120, height: 90 });
    expect(from.x).toBeGreaterThanOrEqual(0);
    expect(from.y).toBeGreaterThanOrEqual(0);
    expect(from.x).toBeLessThan(120);
    expect(from.y).toBeLessThan(90);
    const dist = Math.hypot(from.x - HOME_TILE.x, from.y - HOME_TILE.y);
    expect(dist).toBeGreaterThan(12);
    // On the far side of home from the rival
    const toRival = { x: RIVAL_TILE.x - HOME_TILE.x, y: RIVAL_TILE.y - HOME_TILE.y };
    expect((from.x - HOME_TILE.x) * toRival.x + (from.y - HOME_TILE.y) * toRival.y).toBeLessThan(0);
    // No rival base (the wildlife): it still comes from somewhere on the map
    const plain = playerLaunchTile(HOME_TILE, null, { width: 120, height: 90 });
    expect(Math.hypot(plain.x - HOME_TILE.x, plain.y - HOME_TILE.y)).toBeGreaterThan(12);
  });

  it('grows the Hive\'s crown out of the crater after the impact, in pixel steps', () => {
    for (let i = 0; i < 5; i++) {
      expect(hiveCrownGrowth(i, T.impact)).toBe(0);
      expect(hiveCrownGrowth(i, T.end)).toBe(1);
    }
    let last = 0;
    let seenPartial = false;
    for (let t = HIVE_RISE.start; t < HIVE_RISE.start + HIVE_RISE.grow + 1; t += 0.02) {
      const g = hiveCrownGrowth(0, t);
      expect(g).toBeGreaterThanOrEqual(last);
      expect(g * 8).toBe(Math.round(g * 8));
      if (g > 0 && g < 1) seenPartial = true;
      last = g;
    }
    expect(seenPartial).toBe(true);
    // The crown is up before the title card
    for (let i = 0; i < 5; i++) expect(hiveCrownGrowth(i, T.titleStart)).toBe(1);
  });

  it('unfolds the starting drones out of the Hive and parks them on their real posts', () => {
    const posts = [{ x: HOME.x - 32, y: HOME.y + 80 }, { x: HOME.x + 32, y: HOME.y + 80 }];
    posts.forEach((post, i) => {
      expect(playerDroneState(i, T.impact, HOME, post)).toBeNull();
      const late = playerDroneState(i, T.end - 0.01, HOME, post)!;
      expect(late).not.toBeNull();
      expect(late.x).toBeCloseTo(post.x);
      expect(late.y).toBeCloseTo(post.y);
      expect(late.spread).toBe(1);
    });
    // They emerge near the Hive, folded
    const first = playerDroneState(0, PLAYER_INTRO.droneStart + 0.05, HOME, posts[0])!;
    expect(Math.hypot(first.x - HOME.x, first.y - HOME.y)).toBeLessThan(40);
    expect(first.spread).toBe(0);
    // The Swarm's crater drones and rim spires are not in this opening
    expect(introDrones('crystal-player', T.droneStart + 1, HOME, HOME)).toEqual([]);
    expect(introSpireGrowth('crystal-player', 0, T.end)).toBe(0);
  });

  it('chases the meteor home, glances toward the rival, and ends on home', () => {
    const from = tileCenter(playerLaunchTile(HOME_TILE, RIVAL_TILE, { width: 120, height: 90 }));
    const at = (t: number) => playerIntroCameraFocus(t, from, HOME, RIVAL, 'crystal-player');
    expect(at(0)).toEqual(from);
    // During the flight it runs from the launch point toward home
    const mid = at((T.meteorStart + T.impact) / 2);
    expect(Math.hypot(mid.x - HOME.x, mid.y - HOME.y)).toBeLessThan(Math.hypot(from.x - HOME.x, from.y - HOME.y));
    expect(at(T.impact + T.cameraSettle + 0.1)).toEqual(HOME);
    // The glance: closer to the rival than home is
    const peek = at(PLAYER_INTRO.peekStart + PLAYER_INTRO.peekOut + PLAYER_INTRO.peekHold / 2);
    expect(Math.hypot(peek.x - RIVAL.x, peek.y - RIVAL.y)).toBeLessThan(Math.hypot(HOME.x - RIVAL.x, HOME.y - RIVAL.y) - 100);
    expect(at(T.letterboxOutStart)).toEqual(HOME);
    // No rival base: it simply holds on home
    expect(playerIntroCameraFocus(PLAYER_INTRO.peekStart + 0.5, from, HOME, null, 'crystal-player')).toEqual(HOME);
  });
});

function crystalArrival(): IntroArrival {
  return {
    variant: 'crystal-player',
    target: HOME_TILE,
    from: { x: 30, y: 70 },
    rival: 'human',
    rivalBase: RIVAL_TILE,
    rivalLine: 'RIVAL: HUMANOS',
    drones: [{ x: HOME_TILE.x - 1, y: HOME_TILE.y + 2.5 }, { x: HOME_TILE.x + 1, y: HOME_TILE.y + 2.5 }],
  };
}

function humanArrival(): IntroArrival {
  return {
    variant: 'human-player',
    target: HOME_TILE,
    from: { x: 30, y: 70 },
    rival: 'crystal',
    rivalBase: RIVAL_TILE,
    rivalLine: 'RIVAL: COLMENA DE CRISTAL',
    base: {
      buildings: [{ kind: 'command_center', ...HOME_TILE }, { kind: 'barracks', x: HOME_TILE.x + 5, y: HOME_TILE.y }],
      troops: [{ x: HOME_TILE.x - 1, y: HOME_TILE.y + 3, builder: true }, { x: HOME_TILE.x + 3, y: HOME_TILE.y - 1, builder: false }],
    },
  };
}

function runTo(clock: IntroClock, t: number): void {
  for (let i = 0; i < MAX_FRAMES && clock.elapsed < t; i++) clock.advance(1 / 60);
}

/** A screen context that records every fillRect with the style it was painted in. */
function recordingCtx(width: number, height: number) {
  const fills: string[] = [];
  const ctx = {
    canvas: { width, height },
    fillStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    save() {},
    restore() {},
    drawImage() {},
    fillRect() { fills.push(ctx.fillStyle); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

describe('the race openings, drawn', () => {
  it('Crystal: targets the home tile, hides the real Hive while it plays, digs the crater on impact', () => {
    const clock = new IntroClock();
    const intro = new MeteorIntro(HOME_TILE, HOME_TILE, clock, [], crystalArrival());
    expect(intro.getVariant()).toBe('crystal-player');
    expect(intro.getTarget()).toEqual(HOME);
    expect(intro.hidesPlayerBase()).toBe(true);
    expect(intro.hidesRivalBase()).toBe(false);
    expect(intro.hasCrater()).toBe(false);
    runTo(clock, T.impact);
    expect(intro.hasCrater()).toBe(true);
    expect(intro.hidesPlayerBase()).toBe(true);
    // Its own Hive's crown is drawn by the intro while it plays, by the game after
    expect(intro.drawsHiveAt(HOME_TILE)).toBe(false);
  });

  it('Human: lands on the home Command Center with the Cuartel, no crater, base hidden until the end', () => {
    const clock = new IntroClock();
    const intro = new MeteorIntro(HOME_TILE, HOME_TILE, clock, [], humanArrival());
    expect(intro.getVariant()).toBe('human-player');
    expect(intro.getTarget()).toEqual(HOME);
    expect(intro.hasCrater()).toBe(false);
    expect(intro.hidesPlayerBase()).toBe(true);
    runTo(clock, T.end);
    expect(intro.hasCrater()).toBe(false);
    expect(intro.hidesPlayerBase()).toBe(false);
  });

  it('a skip after the landing ends the opening and gives the real base back', () => {
    for (const arrival of [crystalArrival(), humanArrival()]) {
      const clock = new IntroClock();
      const intro = new MeteorIntro(HOME_TILE, HOME_TILE, clock, [], arrival);
      runTo(clock, T.meteorStart + 0.3);
      expect(intro.skip()).toBe(false);
      expect(intro.hidesPlayerBase()).toBe(true);
      runTo(clock, T.impact + 0.1);
      expect(intro.skip()).toBe(true);
      expect(intro.isPlaying()).toBe(false);
      expect(intro.hidesPlayerBase()).toBe(false);
    }
  });

  it('keeps the Swarm\'s openings showing the Swarm\'s own colony', () => {
    for (const variant of ['crystal', 'human', 'wildlife'] as const) {
      const intro = new MeteorIntro({ x: 20, y: 20 }, HOME_TILE, new IntroClock(), [], { variant, target: { x: 20, y: 20 }, rivalLine: '' });
      expect(intro.hidesPlayerBase()).toBe(false);
    }
    // The crater's rim spires stand for the rival Hive at the crater in the Swarm's openings
    expect(new MeteorIntro({ x: 20, y: 20 }, HOME_TILE, new IntroClock()).drawsHiveAt({ x: 20, y: 20 })).toBe(true);
  });

  it('writes the race title in its own accent, with the rival line', () => {
    const clock = new IntroClock();
    runTo(clock, T.titleStart + 1);
    const crystal = recordingCtx(800, 600);
    new MeteorIntro(HOME_TILE, HOME_TILE, clock, [], crystalArrival()).drawScreenFx(crystal.ctx, null);
    expect(crystal.fills).toContain(PAL.crystal.shield);
    // The rival line in the rival's accent (the Humans' amber)
    expect(crystal.fills).toContain(PAL.human.visor);
    const human = recordingCtx(800, 600);
    new MeteorIntro(HOME_TILE, HOME_TILE, clock, [], humanArrival()).drawScreenFx(human.ctx, null);
    expect(human.fills).toContain(PAL.human.visor);
    expect(human.fills).toContain(PAL.crystal.shield);
  });
});

describe('the camera on a player race\'s opening', () => {
  function shot(variant: IntroVariant) {
    const camera = new Camera();
    camera.setViewport({ x: 0, y: 0, w: 800, h: 600 });
    camera.setDefaultZoom(1);
    camera.zoom = 1;
    const clock = new IntroClock();
    const from = { x: 900, y: 2400 };
    const director = new IntroDirector(camera, clock, HOME, HOME, () => {}, variant, { from, rival: RIVAL });
    const center = () => camera.screenToWorld(400, 300);
    const go = (t: number) => {
      for (let i = 0; i < MAX_FRAMES && clock.elapsed < t && director.isActive(); i++) {
        clock.advance(1 / 60);
        director.frame();
      }
    };
    return { camera, director, center, go, from };
  }

  for (const variant of ['crystal-player', 'human-player'] as const) {
    it(`${variant}: opens on the launch point, settles on home, ends there with control back`, () => {
      const { camera, director, center, go, from } = shot(variant);
      director.frame();
      expect(center().x).toBeCloseTo(from.x);
      go(T.impact + T.cameraSettle + 0.1);
      expect(center().x).toBeCloseTo(HOME.x, 0);
      expect(center().y).toBeCloseTo(HOME.y, 0);
      go(T.end);
      expect(director.isActive()).toBe(false);
      expect(camera.isDirected()).toBe(false);
      expect(center().x).toBeCloseTo(HOME.x);
      expect(center().y).toBeCloseTo(HOME.y);
    });
  }
});
