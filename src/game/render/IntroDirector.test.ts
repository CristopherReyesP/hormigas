import { describe, expect, it } from 'vitest';
import { Camera } from '../../engine/camera/Camera';
import { TILE_SIZE } from '../../shared/constants';
import { IntroDirector } from './IntroDirector';
import { MeteorIntro } from './MeteorIntro';
import { INTRO_TIMELINE as T, IntroClock, flashAlpha, meteorGround } from './introTimeline';

const VIEWPORT = { x: 0, y: 0, w: 800, h: 600 };
const NEST = { x: 1936, y: 1456 };
const IMPACT = { x: 3300, y: 600 };
/** Thirty seconds of 60 fps frames: a frame loop that runs past this is broken, not slow. */
const MAX_FRAMES = 60 * 30;

function setup() {
  const camera = new Camera();
  camera.setViewport(VIEWPORT);
  camera.setDefaultZoom(1);
  camera.zoom = 1;
  const lights: Array<{ x: number; y: number; r: number }> = [];
  const clock = new IntroClock();
  const director = new IntroDirector(camera, clock, NEST, IMPACT, (x, y, r) => lights.push({ x, y, r }));
  const center = () => camera.screenToWorld(VIEWPORT.w / 2, VIEWPORT.h / 2);
  /** One rendered frame: the clock's owner (GameManager) advances it, then the director frames the shot. */
  const frame = (dt: number) => {
    clock.advance(dt);
    director.frame();
  };
  /** Render frames at 60 fps until the intro clock reaches intro time `t`. */
  const runTo = (t: number) => {
    for (let i = 0; i < MAX_FRAMES && director.elapsed() < t && director.isActive(); i++) frame(1 / 60);
  };
  return { camera, clock, director, lights, center, frame, runTo };
}

describe('intro director', () => {
  it('opens on the colony and takes the camera away from the player', () => {
    const { camera, center, frame } = setup();
    frame(0);
    expect(camera.isDirected()).toBe(true);
    expect(center().x).toBeCloseTo(NEST.x);
    expect(center().y).toBeCloseTo(NEST.y);
  });

  it('follows the meteor to the crater and punches in for the deployment', () => {
    const { camera, center, runTo } = setup();
    runTo(T.impact + T.cameraSettle + 0.1);
    expect(center().x).toBeCloseTo(IMPACT.x, 0);
    expect(center().y).toBeCloseTo(IMPACT.y, 0);
    expect(camera.zoom).toBe(1.5);
    // The player's drag does not fight the shot
    camera.pan(200, 200);
    expect(center().x).toBeCloseTo(IMPACT.x, 0);
  });

  it('lights the ground under the meteor, then the crater', () => {
    const { director, lights, runTo } = setup();
    runTo((T.meteorStart + T.impact) / 2);
    const spot = lights[lights.length - 1];
    const ground = meteorGround(director.elapsed(), NEST, IMPACT)!;
    expect(Math.abs(spot.x - ground.x / TILE_SIZE)).toBeLessThanOrEqual(1);
    expect(Math.abs(spot.y - ground.y / TILE_SIZE)).toBeLessThanOrEqual(1);
    runTo(T.impact + 1);
    const crater = lights[lights.length - 1];
    expect(crater).toMatchObject({ x: Math.floor(IMPACT.x / TILE_SIZE), y: Math.floor(IMPACT.y / TILE_SIZE) });
  });

  it('brings the camera home and gives it back when the intro ends', () => {
    const { camera, director, center, runTo } = setup();
    runTo(T.end);
    expect(director.isActive()).toBe(false);
    expect(camera.isDirected()).toBe(false);
    expect(camera.zoom).toBe(1);
    expect(center().x).toBeCloseTo(NEST.x);
    expect(center().y).toBeCloseTo(NEST.y);
  });

  it('jumps to that end state on a skip, and stays out of the way afterwards', () => {
    const { camera, director, center, frame, runTo } = setup();
    runTo(T.impact + 0.5);
    director.finish();
    expect(camera.isDirected()).toBe(false);
    expect(center().x).toBeCloseTo(NEST.x);
    expect(camera.zoom).toBe(1);
    camera.pan(100, 0);
    const x = camera.x;
    frame(1 / 60);
    expect(camera.x).toBe(x);
  });
});

describe('one intro clock', () => {
  const NEST_TILE = { x: 60, y: 45 };
  const IMPACT_TILE = { x: 103, y: 18 };
  const tileCenter = (t: { x: number; y: number }) => ({ x: t.x * TILE_SIZE + TILE_SIZE / 2, y: t.y * TILE_SIZE + TILE_SIZE / 2 });

  function cinematic() {
    const camera = new Camera();
    camera.setViewport(VIEWPORT);
    camera.setDefaultZoom(1);
    const clock = new IntroClock();
    const director = new IntroDirector(camera, clock, tileCenter(NEST_TILE), tileCenter(IMPACT_TILE), () => {});
    const art = new MeteorIntro(IMPACT_TILE, NEST_TILE, clock);
    /** One rendered frame in GameManager's order: advance the clock, frame the shot, draw the art. */
    const frame = (dt: number) => {
      clock.advance(dt);
      director.frame();
      art.frame();
    };
    /** Render frames at 60 fps until the meteor lands. */
    const toImpact = () => {
      for (let i = 0; i < MAX_FRAMES && !art.hasCrater(); i++) frame(1 / 60);
    };
    return { camera, clock, director, art, frame, toImpact };
  }

  it('lets the camera and the art read the same clock, which only its owner advances', () => {
    const { clock, director, art, frame, toImpact } = cinematic();
    frame(0.5);
    const t = clock.elapsed;
    director.frame();
    art.frame();
    expect(clock.elapsed).toBe(t);
    expect(director.elapsed()).toBe(t);
    toImpact();
    expect(art.hasCrater()).toBe(true);
    // The art lands the impact on the very frame the camera's time crosses it
    expect(director.elapsed()).toBeGreaterThanOrEqual(T.impact);
    expect(director.elapsed()).toBe(clock.elapsed);
  });

  it('keeps the impact flash at two rendered frames, full white then fading', () => {
    const { art, frame, toImpact } = cinematic();
    toImpact();
    const flashes = [art['framesSinceImpact']];
    for (let i = 0; i < 3; i++) {
      frame(1 / 60);
      flashes.push(art['framesSinceImpact']);
    }
    expect(flashes.map(flashAlpha)).toEqual([1, 0.7, 0, 0]);
  });

  it('ends the shot when the art skips the shared clock', () => {
    const { camera, clock, director, art, frame, toImpact } = cinematic();
    toImpact();
    frame(0.2);
    expect(art.skip()).toBe(true);
    expect(clock.isPlaying()).toBe(false);
    frame(1 / 60);
    expect(director.isActive()).toBe(false);
    expect(camera.isDirected()).toBe(false);
  });
});
