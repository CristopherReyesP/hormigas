import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { ChamberType } from '../../simulation/world/types';
import { ensureCombatComponent } from './helpers/combatHelpers';
import {
  COMPONENT,
  AntRole,
  AntState,
  Layer,
  type AntComponent,
  type PositionComponent,
  type LayerComponent,
  type PathComponent,
  type HungerComponent,
  type CombatComponent,
} from '../components/components';
import {
  DEFENDER_DETECT_RANGE,
  HUNGER_EAT_RATE,
  HUNGER_PER_FOOD,
} from '../../shared/constants';

/**
 * Defenders are underground SENTINELS bound to player-designated Defense areas:
 * they hold a post inside the area, engage intruders that come within
 * DEFENDER_DETECT_RANGE of that post (detection reaches beyond the area itself),
 * and leave only to eat. Where you place defense areas IS the strategy —
 * chokepoints, the throne antechamber, the pantry door.
 */
export class DefenderAISystem implements System {
  readonly name = 'DefenderAISystem';
  readonly priority = 7; // after nurses (5) / underground healing (6), before movement (10)

  private world: World;
  private grid: UndergroundGrid;
  private hintShown = false;

  constructor(world: World, grid: UndergroundGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    // Defense posts: every tile of every Defense region, flat list (cached by the grid)
    const posts: Array<{ x: number; y: number }> = [];
    for (const region of this.grid.getChamberRegions()) {
      if (region.type === ChamberType.Defense) posts.push(...region.tiles);
    }

    // No defense areas designated → defenders are the QUEEN'S ROYAL GUARD by
    // default: a wide ring around her, between the throne and whatever comes
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION);
    const queenPos = queens.length > 0
      ? this.world.getComponent<PositionComponent>(queens[0], COMPONENT.POSITION)!
      : null;

    // Underground intruders (invasion beetles/crickets), one snapshot per tick
    const enemies: Array<{ id: number; x: number; y: number }> = [];
    for (const store of [COMPONENT.BEETLE, COMPONENT.CRICKET]) {
      for (const id of this.world.query(store, COMPONENT.POSITION, COMPONENT.LAYER)) {
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
        if (layer.layer !== Layer.Underground) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        enemies.push({ id, x: pos.x, y: pos.y });
      }
    }

    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER, COMPONENT.PATH);
    let defenderIndex = 0;

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Defender) continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;

      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      ant.stateTimer += dt;

      // Onboarding hint: without a designated area they default to royal guard
      if (posts.length === 0 && !this.hintShown) {
        this.hintShown = true;
        this.world.pushNotification(
          'info',
          '🛡️ Sin área de defensa designada — las defensoras custodian a la reina. Marcá 🛡️ Defensa para posicionarlas'
        );
      }

      // Stable post assignment: spread defenders across the designated tiles,
      // or hold a guard ring around the queen when no area exists
      let postX: number;
      let postY: number;
      if (posts.length > 0) {
        const post = posts[defenderIndex % posts.length];
        postX = post.x + 0.5;
        postY = post.y + 0.5;
      } else if (queenPos) {
        // Ring slot by id; shrink the radius until the post lands on open ground
        const angle = ((id % 8) / 8) * Math.PI * 2;
        postX = queenPos.x;
        postY = queenPos.y;
        for (const radius of [2.8 + (id % 2) * 0.8, 2.2, 1.6]) {
          const tx = queenPos.x + Math.cos(angle) * radius;
          const ty = queenPos.y + Math.sin(angle) * radius;
          if (this.grid.isWalkable(Math.floor(tx), Math.floor(ty))) {
            postX = tx;
            postY = ty;
            break;
          }
        }
      } else {
        postX = pos.x;
        postY = pos.y;
      }
      defenderIndex++;

      // Survival first: leave the post to eat when really hungry
      const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
      if (ant.state === AntState.Eating) {
        this.handleEating(id, ant, pos, hunger, dt);
        continue;
      }
      if (hunger && hunger.current < hunger.max * 0.3 && this.grid.getPantryStored().total > 0) {
        ant.state = AntState.Eating;
        ant.stateTimer = 0;
        this.clearPath(id);
        continue;
      }

      // Threat check: engage intruders near the POST (area-anchored detection —
      // defenders never get baited far away from what they guard)
      let target: { id: number; x: number; y: number } | null = null;
      let bestDist = DEFENDER_DETECT_RANGE;
      for (const e of enemies) {
        const d = Math.hypot(e.x - postX, e.y - postY);
        if (d < bestDist) {
          bestDist = d;
          target = e;
        }
      }

      if (target) {
        ant.state = AntState.AttackingEnemy;
        ensureCombatComponent(this.world, id, target.id);
        // Close the distance while CombatSystem handles the actual damage
        if (Math.hypot(target.x - pos.x, target.y - pos.y) > 1.2) {
          this.setPath(id, pos, target.x, target.y);
        } else {
          this.clearPath(id);
        }
        continue;
      }

      // No threat — return to / hold the post
      if (ant.state === AntState.AttackingEnemy) {
        const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
        if (combat) combat.targetEntityId = null;
        ant.state = AntState.Idle;
        ant.stateTimer = 0;
        this.clearPath(id);
      }
      const distToPost = Math.hypot(postX - pos.x, postY - pos.y);
      if (distToPost > 1.0) {
        this.setPath(id, pos, postX, postY);
      } else {
        this.clearPath(id);
      }
    }
  }

  /** Walk to the nearest policy-preferred pile and eat until ~full, then return */
  private handleEating(
    id: number,
    ant: AntComponent,
    pos: PositionComponent,
    hunger: HungerComponent | undefined,
    dt: number
  ): void {
    if (!hunger || hunger.current >= hunger.max * 0.95) {
      ant.state = AntState.Idle;
      ant.stateTimer = 0;
      this.clearPath(id);
      return;
    }

    const pile = this.grid.findPreferredFetchTile(pos.x, pos.y);
    if (!pile) {
      // Nothing to eat below — go back to the post and hope porters arrive
      ant.state = AntState.Idle;
      ant.stateTimer = 0;
      return;
    }

    const dx = pile.x + 0.5 - pos.x;
    const dy = pile.y + 0.5 - pos.y;
    if (Math.sqrt(dx * dx + dy * dy) < 1.2) {
      const want = Math.min(HUNGER_EAT_RATE * dt, (hunger.max - hunger.current) / HUNGER_PER_FOOD);
      const { taken } = this.grid.takeFood(pile.x, pile.y, want);
      if (taken > 0) {
        hunger.current = Math.min(hunger.max, hunger.current + taken * HUNGER_PER_FOOD);
        ant.stateTimer = 0; // eating is progress
      }
      this.clearPath(id);
    } else {
      this.setPath(id, pos, pile.x + 0.5, pile.y + 0.5);
    }
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
