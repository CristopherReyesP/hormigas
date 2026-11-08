// The surface pass asks the atlas for the alien tarantula standing exactly
// while the camera is tilted, and for its top-down sprite while flat or
// underground; biting, it asks for the bite pose either way, and keeps its
// danger glow, its lunge along the map heading and its big health bar.
import { describe, expect, it } from 'vitest';
import { RenderSystem } from '../systems/RenderSystem';
import { StandingSprites, type StandingCamera } from '../../engine/renderer/standingSprites';
import { FRONTIER_CREATURE_COMPONENT } from '../phase/frontierCreatures';
import { COMPONENT } from '../components/components';

function drawTarantula(camera: StandingCamera | null, rotation = 0, attacking = false, time = 0.1) {
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
  const glows: number[] = [];
  const renderer = Object.create(RenderSystem.prototype) as RenderSystem;
  renderer['animationTime'] = time;
  renderer['world'] = {
    getComponent: (_id: number, key: string) => {
      if (key === FRONTIER_CREATURE_COMPONENT) return { kind: 'tarantula' };
      if (key === COMPONENT.HEALTH) return { current: 40, max: 90 };
      return undefined;
    },
  } as never;
  renderer['drawShadow'] = () => undefined;
  renderer['drawGlowStamp'] = (_c: unknown, _x: number, _y: number, radius: number) => { glows.push(radius); };
  renderer['drawHealthBar'] = (_c: unknown, _x: number, _y: number, current: number) => { bars.push(current); };
  renderer['spriteAtlas'] = { drawFrontierCreature: (...args: unknown[]) => creatures.push(args) } as never;
  const standing = new StandingSprites();
  standing.begin(ctx, camera && { ...camera, getRotation: () => rotation });
  renderer['standing'] = standing;
  renderer['drawBeetle'](ctx, 1, 1, Math.PI / 2, 0, 7, attacking);
  standing.flush();
  return { creatures, bars, glows };
}

const tilted = (tilt: number): StandingCamera => ({
  getTilt: () => tilt,
  getTiltScale: () => (tilt ? 0.55 : 1),
  getRotation: () => 0,
  worldToScreen: (x: number, y: number) => ({ x, y }),
});

describe('the alien tarantula on the surface', () => {
  it('stands while the camera is tilted, at every rotation, heading turned to the screen', () => {
    for (const rotation of [0, 1, 2, 3]) {
      const { creatures, bars } = drawTarantula(tilted(2), rotation);
      expect(creatures).toHaveLength(1);
      const [, kind, , , heading, , bite, standing] = creatures[0];
      expect(kind).toBe('tarantula');
      expect(heading).toBeCloseTo(Math.PI / 2 + rotation * Math.PI / 2);
      expect(bite).toBeNull();
      expect(standing).toBe(true);
      expect(bars).toEqual([40]);
    }
  });

  it('stays top-down while the camera is flat or underground', () => {
    for (const camera of [tilted(0), null]) {
      const { creatures, bars } = drawTarantula(camera);
      expect(creatures[0][1]).toBe('tarantula');
      expect(creatures[0][4]).toBe(Math.PI / 2);
      expect(creatures[0][7]).toBe(false);
      expect(bars).toEqual([40]);
    }
  });

  it('bites standing as it does flat: the bite frame, the lunge along its map heading and the danger glow', () => {
    // sin(12 · 0.1) > 0: mid-lunge; floor(0.1 · 8) is even: the combat glow is lit
    for (const camera of [tilted(2), tilted(0)]) {
      const { creatures, glows } = drawTarantula(camera, 0, true, 0.1);
      const [, , x, y, , , bite, standing] = creatures[0];
      expect(bite).toBe(Math.floor(0.1 * 6));
      expect(standing).toBe(camera.getTilt() !== 0);
      expect(x).toBeCloseTo(48);
      expect(y as number).toBeGreaterThan(48 + 6);
      // The combat glow and the tarantula's own heartbeat halo
      expect(glows.length).toBe(2);
    }
  });
});
