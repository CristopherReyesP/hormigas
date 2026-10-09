import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { TransitSystem } from './TransitSystem';
import {
  COMPONENT,
  AntRole,
  AntState,
  Layer,
  type AntComponent,
  type PositionComponent,
  type LayerComponent,
  type PathComponent,
  type HealthComponent,
  type HungerComponent,
  type FoodSourceComponent,
} from '../components/components';
import {
  HEAL_RATE,
  HEAL_HP_PER_FOOD,
  HUNGER_PER_FOOD,
  HUNGER_EAT_RATE,
} from '../../shared/constants';

/**
 * Drives ants that came DOWN to the colony to eat and heal: AntAISystem sends
 * Healing ants underground when the surface stockpile is empty (porters haul
 * everything below), and this system walks them to the nearest food pile
 * (pantry or fungus farm), feeds/heals them, then sends them back up.
 *
 * AntAISystem skips the underground layer entirely, so without this system a
 * Healing ant below ground would stand frozen forever.
 */
export class UndergroundHealingSystem implements System {
  readonly name = 'UndergroundHealingSystem';
  readonly priority = 6; // after PorterSystem (4) / NurseAISystem (5), before movement (10)

  private world: World;
  private grid: UndergroundGrid;
  private transitSystem: TransitSystem;

  constructor(world: World, grid: UndergroundGrid, transitSystem: TransitSystem) {
    this.world = world;
    this.grid = grid;
    this.transitSystem = transitSystem;
  }

  update(dt: number): void {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER, COMPONENT.PATH);

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.state !== AntState.Healing) continue;
      if (ant.role === AntRole.Nurse) continue; // nurses live below and feed themselves

      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue; // surface healing is AntAISystem's job
      if (this.transitSystem.isInTransit(id)) continue;

      // AntAISystem skips this layer, so we tick the state timer ourselves
      ant.stateTimer += dt;
      if (ant.stateTimer > 30) {
        this.finish(id, ant); // safety: don't let an ant rot below forever
        continue;
      }

      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
      const needsHeal = health !== undefined && health.current < health.max;
      const needsFood = hunger !== undefined && hunger.current < hunger.max * 0.95;

      if (!needsHeal && !needsFood) {
        this.finish(id, ant);
        continue;
      }

      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const pile = this.grid.findPreferredFetchTile(pos.x, pos.y);
      if (!pile) {
        // No pantry piles — but loose food (invader meat) on the floor still
        // counts: a starving ant is not too proud to eat off the ground
        if (this.eatLooseFood(id, ant, pos, health, hunger, dt)) continue;
        // Truly nothing edible down here — go back up
        this.finish(id, ant);
        continue;
      }

      const dx = pile.x + 0.5 - pos.x;
      const dy = pile.y + 0.5 - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 1.2) {
        this.eatAndHeal(id, ant, pile, health, hunger, dt);
      } else {
        this.setPath(id, pos, pile.x + 0.5, pile.y + 0.5);
      }
    }
  }

  /** Walk to the nearest loose underground food drop and eat it directly. True if one exists. */
  private eatLooseFood(
    id: number,
    ant: AntComponent,
    pos: PositionComponent,
    health: HealthComponent | undefined,
    hunger: HungerComponent | undefined,
    dt: number
  ): boolean {
    let best: { id: number; x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const fid of this.world.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION, COMPONENT.LAYER)) {
      const layer = this.world.getComponent<LayerComponent>(fid, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;
      const fpos = this.world.getComponent<PositionComponent>(fid, COMPONENT.POSITION)!;
      const d = Math.hypot(fpos.x - pos.x, fpos.y - pos.y);
      if (d < bestDist) {
        bestDist = d;
        best = { id: fid, x: fpos.x, y: fpos.y };
      }
    }
    if (!best) return false;

    if (bestDist < 1.2) {
      const food = this.world.getComponent<FoodSourceComponent>(best.id, COMPONENT.FOOD_SOURCE);
      if (!food || food.amount <= 0) return true; // gone this tick — retarget next frame
      const want = Math.min(
        food.amount,
        HUNGER_EAT_RATE * dt,
        hunger ? (hunger.max - hunger.current) / HUNGER_PER_FOOD : HUNGER_EAT_RATE * dt
      );
      food.amount -= want;
      if (hunger) hunger.current = Math.min(hunger.max, hunger.current + want * HUNGER_PER_FOOD);
      if (health && health.current < health.max) {
        health.current = Math.min(health.max, health.current + HEAL_RATE * this.world.upgrades.healRateMult * dt);
      }
      if (food.amount <= 0) this.world.destroyEntity(best.id);
      ant.stateTimer = 0; // eating is progress
      this.clearPath(id);
    } else {
      this.setPath(id, pos, best.x, best.y);
    }
    return true;
  }

  /** Eat from the pile: hunger first, then convert food into HP at the heal rate */
  private eatAndHeal(
    id: number,
    ant: AntComponent,
    pile: { x: number; y: number },
    health: HealthComponent | undefined,
    hunger: HungerComponent | undefined,
    dt: number
  ): void {
    // Stored units are already nutrition-normalized (multipliers applied at deposit)
    const hungerFood = hunger ? (hunger.max - hunger.current) / HUNGER_PER_FOOD : 0;
    const healHp = health
      ? Math.min(HEAL_RATE * this.world.upgrades.healRateMult * dt, health.max - health.current)
      : 0;
    const healFood = healHp / HEAL_HP_PER_FOOD;

    const wantFood = Math.min(HUNGER_EAT_RATE * dt, hungerFood + healFood);
    if (wantFood <= 0) return;

    const { taken } = this.grid.takeFood(pile.x, pile.y, wantFood);
    if (taken <= 0) return; // pile emptied this tick — findFetchTile retargets next frame

    // Eating IS progress — the 30s safety timeout is only for ants stuck walking
    ant.stateTimer = 0;

    let remaining = taken;
    if (hunger) {
      const toHunger = Math.min(remaining, hungerFood);
      hunger.current = Math.min(hunger.max, hunger.current + toHunger * HUNGER_PER_FOOD);
      remaining -= toHunger;
    }
    if (health && remaining > 0) {
      health.current = Math.min(health.max, health.current + remaining * HEAL_HP_PER_FOOD);
    }

    // Keep the ant parked on the pile while it eats
    this.clearPath(id);
  }

  /** Done (or nothing left to eat) — ride the shaft back to the surface */
  private finish(id: number, ant: AntComponent): void {
    ant.state = AntState.Idle;
    ant.stateTimer = 0;
    this.transitSystem.requestTransit(id, 'exit');
  }

  private setPath(id: number, pos: PositionComponent, tx: number, ty: number): void {
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (!path || (path.waypoints.length > 0 && path.currentIndex < path.waypoints.length)) return;

    const route = this.grid.findPath(pos.x, pos.y, tx, ty);
    path.waypoints = route && route.length > 0 ? route : [{ x: tx, y: ty }];
    path.currentIndex = 0;
  }

  private clearPath(id: number): void {
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (path) {
      path.waypoints = [];
      path.currentIndex = 0;
    }
  }
}
