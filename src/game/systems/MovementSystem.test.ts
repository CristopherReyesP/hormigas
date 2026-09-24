import { describe, expect, it } from 'vitest';
import { World } from '../../engine/ecs/World';
import { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../events/GlobalModifiers';
import { AntRole, AntState, COMPONENT, Layer, type AntComponent, type PathComponent, type PositionComponent } from '../components/components';
import { MovementSystem } from './MovementSystem';

function setup() {
  const world = new World();
  const grid = new UndergroundGrid();
  const system = new MovementSystem(world, grid, createDefaultModifiers(), grid);

  function open(...tiles: Array<[number, number]>) {
    for (const [x, y] of tiles) grid.getTile(x, y)!.walkable = true;
  }

  function ant(x: number, y: number, target?: { x: number; y: number }) {
    const id = world.createEntity();
    const position: PositionComponent = { x, y, prevX: x, prevY: y };
    const component: AntComponent = {
      role: AntRole.Worker,
      state: AntState.Idle,
      stateTimer: 0,
      commandTargetId: null,
    };
    world.addComponent(id, COMPONENT.POSITION, position);
    world.addComponent(id, COMPONENT.ANT, component);
    world.addComponent(id, COMPONENT.LAYER, { layer: Layer.Underground });
    if (target) {
      const path: PathComponent = { waypoints: [target], currentIndex: 0 };
      world.addComponent(id, COMPONENT.PATH, path);
    }
    return { id, position };
  }

  return { world, grid, system, open, ant };
}

function blockedTime(system: MovementSystem): Map<number, number> {
  return (system as unknown as { blockedTime: Map<number, number> }).blockedTime;
}

describe('underground movement occupancy', () => {
  it('keeps source occupancy when an ant cannot enter or slide past a wall', () => {
    const { system, open, ant } = setup();
    open([9, 10], [10, 10]);

    const blocked = ant(10.5, 10.5, { x: 11.5, y: 10.5 });
    ant(10.5, 10.5);
    ant(10.5, 10.5);
    const sourceFollower = ant(9.5, 10.5, { x: 10.5, y: 10.5 });

    system.update(0.5);

    expect(blocked.position.x).toBe(10.5);
    expect(sourceFollower.position.x).toBe(9.5);
  });

  it('does not add a blocked ant to the target wall tile occupancy', () => {
    const { system, open, ant } = setup();
    open([10, 10], [12, 10]);

    const blocked = ant(10.5, 10.5, { x: 11.5, y: 10.5 });
    ant(11.5, 10.5);
    ant(11.5, 10.5);
    const wallFollower = ant(12.5, 10.5, { x: 11.5, y: 10.5 });

    system.update(0.5);

    expect(blocked.position.x).toBe(10.5);
    expect(blockedTime(system).has(wallFollower.id)).toBe(false);
  });

  it('counts an ant in its slide destination instead of the blocked diagonal tile', () => {
    const { system, open, ant } = setup();
    open([10, 10], [11, 10], [12, 10]);

    const slider = ant(10.5, 10.5, { x: 11.5, y: 11.5 });
    ant(11.5, 10.5);
    ant(11.5, 10.5);
    const follower = ant(12.5, 10.5, { x: 11.5, y: 10.5 });

    system.update(1);

    expect(slider.position.x).toBeCloseTo(11.5);
    expect(slider.position.y).toBe(10.5);
    expect(follower.position.x).toBe(12.5);
  });

  it('clears crowding wait state after an ant is removed from the world', () => {
    const { world, system, open, ant } = setup();
    open([10, 10], [11, 10]);

    const waiting = ant(10.5, 10.5, { x: 11.5, y: 10.5 });
    ant(11.5, 10.5);
    ant(11.5, 10.5);
    ant(11.5, 10.5);

    system.update(0.5);
    expect(blockedTime(system).has(waiting.id)).toBe(true);

    world.destroyEntity(waiting.id);
    system.update(0.5);

    // World has no removal hook or entity ID reuse, so this state has no public observer.
    expect(blockedTime(system).has(waiting.id)).toBe(false);
  });
});
