import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { World } from '../engine/ecs/World';
import { AntRole, COMPONENT, Layer, type CombatComponent, type HealthComponent, type LayerComponent } from '../game/components/components';
import { createAnt, createBeetle, createCricket } from '../game/entities/factories';
import { CombatSystem } from '../game/systems/CombatSystem';
import { TileGrid } from '../simulation/world/TileGrid';
import { setAudioSink, type AudioEvent } from './events';
import { selectionAudio } from './gameHooks';

const heard: AudioEvent[] = [];
beforeEach(() => {
  heard.length = 0;
  setAudioSink((e) => heard.push(e));
});
afterEach(() => setAudioSink(null));

/** Point `attacker` at `target`, ready to strike, and make the strike lethal or not */
function engage(world: World, attacker: number, target: number, lethal: boolean): void {
  // Ants get their combat component when they first engage (combatHelpers); give it up front
  if (!world.getComponent(attacker, COMPONENT.COMBAT)) {
    world.addComponent<CombatComponent>(attacker, COMPONENT.COMBAT, { attackDamage: 1, attackRange: 1, attackCooldown: 1, attackTimer: 0, targetEntityId: null });
  }
  const combat = world.getComponent<CombatComponent>(attacker, COMPONENT.COMBAT)!;
  combat.targetEntityId = target;
  combat.attackTimer = 0;
  combat.attackRange = 5;
  combat.attackDamage = lethal ? 9999 : 0.01;
}

function fight(setup: (world: World) => void): AudioEvent[] {
  const world = new World();
  setup(world);
  new CombatSystem(world, new TileGrid()).update(1 / 60);
  return heard;
}

describe('combat sounds', () => {
  it('hears an ant spitting acid where the target stands, on its layer', () => {
    const events = fight((world) => {
      const ant = createAnt(world, 10, 12, AntRole.Soldier);
      const beetle = createBeetle(world, 11, 12);
      engage(world, ant, beetle, false);
    });
    expect(events).toEqual([{ type: 'hit', by: 'ant', at: { x: 11, y: 12, layer: 'surface' } }]);
  });

  it('hears wildlife biting as chitin, and the ant it kills', () => {
    const events = fight((world) => {
      const ant = createAnt(world, 10, 12);
      const beetle = createBeetle(world, 11, 12);
      engage(world, beetle, ant, true);
    });
    expect(events).toEqual([
      { type: 'hit', by: 'wildlife', at: { x: 10, y: 12, layer: 'surface' } },
      { type: 'death', kind: 'ant', at: { x: 10, y: 12, layer: 'surface' } },
    ]);
  });

  it('tells beetle and cricket deaths apart, and keeps an underground fight underground', () => {
    const events = fight((world) => {
      const a = createAnt(world, 3, 3, AntRole.Soldier);
      const beetle = createBeetle(world, 4, 3);
      engage(world, a, beetle, true);
      const b = createAnt(world, 20, 20, AntRole.Soldier);
      const cricket = createCricket(world, 21, 20);
      for (const id of [b, cricket]) world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer = Layer.Underground;
      engage(world, b, cricket, true);
    });
    expect(events.filter((e) => e.type === 'death')).toEqual([
      { type: 'death', kind: 'beetle', at: { x: 4, y: 3, layer: 'surface' } },
      { type: 'death', kind: 'cricket', at: { x: 21, y: 20, layer: 'underground' } },
    ]);
  });

  it('stays silent when nothing lands', () => {
    const events = fight((world) => {
      const ant = createAnt(world, 10, 12);
      const beetle = createBeetle(world, 30, 12);
      engage(world, ant, beetle, true);
      world.getComponent<CombatComponent>(ant, COMPONENT.COMBAT)!.attackRange = 1;
      expect(world.getComponent<HealthComponent>(beetle, COMPONENT.HEALTH)).toBeDefined();
    });
    expect(events).toEqual([]);
  });
});

describe('selection chitter', () => {
  it('chitters in the caste of the first selected ant', () => {
    const world = new World();
    const scout = createAnt(world, 1, 1, AntRole.Scout);
    const worker = createAnt(world, 2, 1);
    expect(selectionAudio(world, [scout, worker])).toEqual({ type: 'select', caste: 'scout' });
  });

  it('says nothing for an empty selection or one with no ants', () => {
    const world = new World();
    const beetle = createBeetle(world, 1, 1);
    expect(selectionAudio(world, [])).toBeNull();
    expect(selectionAudio(world, [beetle])).toBeNull();
  });
});
