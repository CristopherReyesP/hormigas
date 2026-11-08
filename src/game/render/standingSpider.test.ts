// The surface pass asks the atlas for the weaver spider standing exactly while
// the camera is tilted, and for its top-down sprite while flat or underground;
// the other Phase 2 creatures go through the same call (the atlas keeps them
// top-down) and still get their health bars.
import { describe, expect, it } from 'vitest';
import { RenderSystem } from '../systems/RenderSystem';
import { StandingSprites, type StandingCamera } from '../../engine/renderer/standingSprites';
import { FRONTIER_CREATURE_COMPONENT, type FrontierCreatureKind } from '../phase/frontierCreatures';
import { COMPONENT } from '../components/components';

function drawCreature(kind: FrontierCreatureKind, camera: StandingCamera | null, rotation = 0) {
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    getTransform: () => ({ a: 2, b: 0, c: 0, d: camera ? 1.1 : 2, e: 0, f: 0 }),
    setTransform: () => undefined,
    globalAlpha: 1,
    drawImage: () => undefined,
  } as unknown as CanvasRenderingContext2D;
  const creatures: unknown[][] = [];
  const bars: number[] = [];
  const renderer = Object.create(RenderSystem.prototype) as RenderSystem;
  renderer['animationTime'] = 0;
  renderer['world'] = {
    getComponent: (_id: number, key: string) => {
      if (key === FRONTIER_CREATURE_COMPONENT) return { kind };
      if (key === COMPONENT.HEALTH) return { current: 5, max: 10 };
      return undefined;
    },
  } as never;
  renderer['drawShadow'] = () => undefined;
  renderer['drawGlowStamp'] = () => undefined;
  renderer['drawHealthBar'] = (_c: unknown, _x: number, _y: number, current: number) => { bars.push(current); };
  renderer['spriteAtlas'] = { drawFrontierCreature: (...args: unknown[]) => creatures.push(args) } as never;
  const standing = new StandingSprites();
  standing.begin(ctx, camera && {
    ...camera,
    getRotation: () => rotation,
  });
  renderer['standing'] = standing;
  renderer['drawBeetle'](ctx, 1, 1, Math.PI / 2, 0, 7, false);
  standing.flush();
  return { creatures, bars };
}

const tilted = (tilt: number): StandingCamera => ({
  getTilt: () => tilt,
  getTiltScale: () => (tilt ? 0.55 : 1),
  getRotation: () => 0,
  worldToScreen: (x: number, y: number) => ({ x, y }),
});

describe('the weaver spider on the surface', () => {
  it('stands while the camera is tilted, at every rotation, heading turned to the screen', () => {
    for (const rotation of [0, 1, 2, 3]) {
      const { creatures, bars } = drawCreature('spider', tilted(2), rotation);
      expect(creatures).toHaveLength(1);
      const [, kind, , , heading, , bite, standing] = creatures[0];
      expect(kind).toBe('spider');
      expect(heading).toBeCloseTo(Math.PI / 2 + rotation * Math.PI / 2);
      expect(bite).toBeNull();
      expect(standing).toBe(true);
      expect(bars).toEqual([5]);
    }
  });

  it('stays top-down while the camera is flat or underground', () => {
    for (const camera of [tilted(0), null]) {
      const { creatures, bars } = drawCreature('spider', camera);
      expect(creatures[0][1]).toBe('spider');
      expect(creatures[0][4]).toBe(Math.PI / 2);
      expect(creatures[0][7]).toBe(false);
      expect(bars).toEqual([5]);
    }
  });

  it('draws the tarantula and the other creatures through the same call, health bars included', () => {
    for (const kind of ['tarantula', 'legionary', 'mantis'] as const) {
      const { creatures, bars } = drawCreature(kind, tilted(0));
      expect(creatures[0][1]).toBe(kind);
      expect(creatures[0][7]).toBe(false);
      expect(bars).toEqual([5]);
    }
  });
});
