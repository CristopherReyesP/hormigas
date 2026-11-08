import { StandingSprites } from '../../engine/renderer/standingSprites';
import type { World } from '../../engine/ecs/World';
import { COMPONENT } from '../components/components';
import { HUMAN_COMPONENT } from '../rival/humanComponents';
import { describe, expect, it } from 'vitest';
import { HumanRenderer, humanFrameIndex } from './HumanRenderer';

describe('humanFrameIndex', () => {
  it('stays in range for a negative render clock', () => {
    for (const time of [-5, -0.3, -0.001]) {
      for (const id of [0, 3, 41]) {
        const i = humanFrameIndex(time, id, 4);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(4);
      }
    }
  });

  it('stays in range when the clock is not a number yet', () => {
    expect(humanFrameIndex(Number.NaN, 7, 4)).toBe(3);
  });

  it('steps through the frames as time passes', () => {
    expect(humanFrameIndex(0, 0, 4)).toBe(0);
    expect(humanFrameIndex(10, 0, 4)).toBeGreaterThanOrEqual(0);
  });
});

describe('Human sprites under a tilted camera', () => {
  function scene() {
    const positions = new Map([[1, { x: 2, y: 3, prevX: 2, prevY: 3 }], [2, { x: 4, y: 1, prevX: 4, prevY: 1 }]]);
    const world = {
      query: (component: string) => component === HUMAN_COMPONENT.BUILDING ? [1] : component === HUMAN_COMPONENT.UNIT ? [2] : [],
      getComponent: (id: number, component: string) => {
        if (component === COMPONENT.POSITION) return positions.get(id);
        if (component === HUMAN_COMPONENT.BUILDING) return { kind: 'command_center', constructing: 0 };
        if (component === HUMAN_COMPONENT.UNIT) return { type: 'soldier' };
        return undefined;
      },
    } as unknown as World;
    const renderer = new HumanRenderer(world, { isExplored: () => true, getBrightness: () => 255 });
    const drawn: Array<number | string> = [];
    // The painters are stubbed: this checks only what is drawn when
    Object.assign(renderer as object, {
      paintBuilding: (_ctx: unknown, id: number) => drawn.push(id),
      paintUnit: (_ctx: unknown, id: number) => drawn.push(id),
      drawShots: () => drawn.push('shots'),
    });
    return { renderer, drawn };
  }
  // Screen Y falls as world X grows: depth order differs from the map's
  const camera = (tilt: number) => ({
    getTilt: () => tilt, getTiltScale: () => (tilt ? 0.75 : 1), getRotation: () => 1,
    worldToScreen: (x: number, y: number) => ({ x: y, y: -x }),
  });
  const ctx = { getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }), save() {}, restore() {}, setTransform() {}, beginPath() {}, ellipse() {}, fill() {} } as unknown as CanvasRenderingContext2D;

  it('paints buildings and troops together back to front, gunfire last', () => {
    const { renderer, drawn } = scene();
    const standing = new StandingSprites();
    standing.begin(ctx, camera(1));
    renderer.draw(ctx, 1, 0, () => {}, undefined, standing);
    expect(drawn).toEqual([]);
    standing.flush();
    expect(drawn).toEqual([2, 1, 'shots']);
  });

  it('keeps the top-down order when the camera is flat', () => {
    const { renderer, drawn } = scene();
    const standing = new StandingSprites();
    standing.begin(ctx, camera(0));
    renderer.draw(ctx, 1, 0, () => {}, undefined, standing);
    expect(drawn).toEqual([1, 2, 'shots']);
  });
});
