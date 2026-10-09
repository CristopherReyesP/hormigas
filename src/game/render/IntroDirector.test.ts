import { describe, expect, it } from 'vitest';
import { Camera } from '../../engine/camera/Camera';
import { TILE_SIZE } from '../../shared/constants';
import { IntroDirector } from './IntroDirector';
import { INTRO_TIMELINE as T, meteorGround } from './introTimeline';

const VIEWPORT = { x: 0, y: 0, w: 800, h: 600 };
const NEST = { x: 1936, y: 1456 };
const IMPACT = { x: 3300, y: 600 };

function setup() {
  const camera = new Camera();
  camera.setViewport(VIEWPORT);
  camera.setDefaultZoom(1);
  camera.zoom = 1;
  const lights: Array<{ x: number; y: number; r: number }> = [];
  const director = new IntroDirector(camera, NEST, IMPACT, (x, y, r) => lights.push({ x, y, r }));
  const center = () => camera.screenToWorld(VIEWPORT.w / 2, VIEWPORT.h / 2);
  /** Render frames at 60 fps until the director's clock reaches intro time `t`. */
  const runTo = (t: number) => {
    while (director.elapsed() < t && director.isActive()) director.frame(1 / 60);
  };
  return { camera, director, lights, center, runTo };
}

describe('intro director', () => {
  it('opens on the colony and takes the camera away from the player', () => {
    const { camera, director, center } = setup();
    director.frame(0);
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
    const { camera, director, center, runTo } = setup();
    runTo(T.impact + 0.5);
    director.finish();
    expect(camera.isDirected()).toBe(false);
    expect(center().x).toBeCloseTo(NEST.x);
    expect(camera.zoom).toBe(1);
    camera.pan(100, 0);
    const x = camera.x;
    director.frame(1 / 60);
    expect(camera.x).toBe(x);
  });
});
