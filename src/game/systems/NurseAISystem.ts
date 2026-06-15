import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { ChamberType } from '../../simulation/world/types';
import {
  COMPONENT,
  AntRole,
  AntState,
  Layer,
  type AntComponent,
  type PositionComponent,
  type CarryingComponent,
  type QueenEntityComponent,
  type LayerComponent,
  type PathComponent,
  type HungerComponent,
  type EggComponent,
} from '../components/components';
import { MAX_EGGS_PER_INCUBATION_TILE, HUNGER_PER_FOOD, HUNGER_EAT_RATE } from '../../shared/constants';

// Sub-tile slots so up to 4 eggs on one incubation tile don't overlap visually
const EGG_SLOT_OFFSETS = [
  { x: -0.22, y: -0.22 },
  { x: 0.22, y: -0.22 },
  { x: -0.22, y: 0.22 },
  { x: 0.22, y: 0.22 },
];

export class NurseAISystem implements System {
  readonly name = 'NurseAISystem';
  readonly priority = 5;

  private world: World;
  private grid: UndergroundGrid;

  constructor(world: World, grid: UndergroundGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER);

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Nurse) continue;

      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;

      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;

      switch (ant.state) {
        case AntState.Idle:
        case AntState.Searching:
          this.decideNextAction(id, ant, pos);
          break;
        case AntState.FeedingQueen:
          this.handleFeedingQueen(id, ant, pos, dt);
          break;
        case AntState.MovingEgg:
          this.handleMovingEgg(id, ant, pos);
          break;
        case AntState.TendingEgg:
          this.handleTendingEgg(id, ant, pos);
          break;
        case AntState.FetchingFood:
          this.handleFetchingFood(id, ant, pos);
          break;
        case AntState.Eating:
          this.handleEatingAtStorage(id, ant, pos, dt);
          break;
      }
    }
  }

  /** Set a BFS path through tunnels/chambers; falls back to a direct waypoint if no route exists */
  private setPath(id: number, pos: PositionComponent, tx: number, ty: number, force = false): void {
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (!path) return;
    if (!force && path.waypoints.length > 0 && path.currentIndex < path.waypoints.length) return;

    const route = this.grid.findPath(pos.x, pos.y, tx, ty);
    if (route && route.length > 0) {
      path.waypoints = route;
      path.currentIndex = 0;
    } else {
      path.waypoints = [{ x: tx, y: ty }];
      path.currentIndex = 0;
    }
  }

  private clearPath(id: number): void {
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (path) {
      path.waypoints = [];
      path.currentIndex = 0;
    }
  }

  /** How many OTHER underground nurses are in any of these states */
  private countNursesInStates(excludeId: number, ...states: AntState[]): number {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.LAYER);
    let count = 0;
    for (const id of ants) {
      if (id === excludeId) continue;
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Nurse) continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;
      if ((states as string[]).includes(ant.state)) count++;
    }
    return count;
  }

  private hasFoodInStorage(): boolean {
    return this.grid.getPantryStored().total > 0;
  }

  private getCarrying(id: number): CarryingComponent | undefined {
    return this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
  }

  private decideNextAction(id: number, ant: AntComponent, pos: PositionComponent): void {
    const foodAvailable = this.hasFoodInStorage();
    const carrying = this.getCarrying(id);
    const hasFood = carrying !== undefined && carrying.amount > 0;

    // Priority 0: Survival — eat from storage before starving to death
    const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    if (hunger && hunger.current < hunger.max * 0.35 && foodAvailable) {
      ant.state = AntState.Eating;
      ant.stateTimer = 0;
      this.clearPath(id);
      return;
    }

    // Concurrent fetchers are capped by COUNT, not "is anyone fetching" — the
    // old single-fetcher gate let one queen-bound nurse starve every larva
    const fetchers = this.countNursesInStates(id, AntState.FetchingFood);

    // Priority 1: Queen CRITICAL — she's dying-hungry, she outranks everything
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION);
    if (queens.length > 0) {
      const queen = this.world.getComponent<QueenEntityComponent>(queens[0], COMPONENT.QUEEN_ENTITY)!;
      if (queen.hunger < queen.maxHunger * 0.25) {
        if (hasFood) {
          ant.state = AntState.FeedingQueen;
          ant.stateTimer = 0;
          this.clearPath(id);
          return;
        }
        if (foodAvailable && fetchers < 2) {
          ant.state = AntState.FetchingFood;
          ant.stateTimer = 0;
          this.clearPath(id);
          return;
        }
      }
    }

    // Priority 2: HUNGRY LARVAE — they can't hatch until fed, and they outrank
    // a merely-peckish queen (she has 1000 hunger of buffer; eggs have none)
    const hungryEgg = this.findEggNeedingFood(id, pos);
    if (hungryEgg !== null) {
      if (hasFood) {
        ant.state = AntState.TendingEgg;
        ant.stateTimer = 0;
        ant.commandTargetId = hungryEgg;
        this.clearPath(id);
        return;
      }
      if (foodAvailable && fetchers < 3) {
        ant.state = AntState.FetchingFood;
        ant.stateTimer = 0;
        this.clearPath(id);
        return;
      }
    }

    // Priority 3: Move eggs to the incubation area (only if there is room for them)
    const eggToMove = this.findEggNeedingRelocation();
    if (eggToMove !== null) {
      ant.state = AntState.MovingEgg;
      ant.stateTimer = 0;
      ant.commandTargetId = eggToMove;
      ant.eggTargetTile = null;
      this.clearPath(id);
      return;
    }

    // Priority 4: Feed queen proactively (topping her up between crises)
    if (queens.length > 0) {
      const queen = this.world.getComponent<QueenEntityComponent>(queens[0], COMPONENT.QUEEN_ENTITY)!;
      if (queen.hunger < queen.maxHunger * 0.6) {
        if (hasFood) {
          ant.state = AntState.FeedingQueen;
          ant.stateTimer = 0;
          this.clearPath(id);
          return;
        }
        if (foodAvailable && fetchers < 2) {
          ant.state = AntState.FetchingFood;
          ant.stateTimer = 0;
          this.clearPath(id);
          return;
        }
      }
    }

    // Idle: hold a personal post in a ring around the queen instead of piling on top of her.
    // Deterministic per nurse id → stable, spread positions within the 5x5 queen chamber.
    if (queens.length > 0) {
      const queenPos = this.world.getComponent<PositionComponent>(queens[0], COMPONENT.POSITION)!;
      const angle = ((id % 12) / 12) * Math.PI * 2;
      const radius = 1.6 + (id % 3) * 0.4;
      const postX = queenPos.x + Math.cos(angle) * radius;
      const postY = queenPos.y + Math.sin(angle) * radius;
      const dx = postX - pos.x;
      const dy = postY - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) > 1.2) {
        this.setPath(id, pos, postX, postY);
      }
    }
  }

  private handleFeedingQueen(id: number, ant: AntComponent, pos: PositionComponent, dt: number): void {
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION);
    if (queens.length === 0) { ant.state = AntState.Idle; return; }

    const queenId = queens[0];
    const queenPos = this.world.getComponent<PositionComponent>(queenId, COMPONENT.POSITION)!;
    const queen = this.world.getComponent<QueenEntityComponent>(queenId, COMPONENT.QUEEN_ENTITY)!;

    const dx = queenPos.x - pos.x;
    const dy = queenPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.5) {
      const carrying = this.getCarrying(id);
      if (carrying && carrying.amount > 0 && queen.hunger < queen.maxHunger) {
        const feed = Math.min(carrying.amount, 5 * dt);
        carrying.amount -= feed;
        queen.hunger = Math.min(queen.maxHunger, queen.hunger + feed * 10);
        if (carrying.amount <= 0) {
          carrying.amount = 0;
          ant.state = AntState.Idle;
        }
      } else {
        // No food left, or queen is full
        ant.state = AntState.Idle;
      }
    } else {
      this.setPath(id, pos, queenPos.x, queenPos.y);
    }
  }

  private handleFetchingFood(id: number, ant: AntComponent, pos: PositionComponent): void {
    const carrying = this.getCarrying(id);
    if (carrying && carrying.amount >= carrying.maxCapacity * 0.5) {
      // Already loaded — let decideNextAction route the food where it's needed most
      ant.state = AntState.Idle;
      return;
    }

    // Nearest pile honoring the colony's consumption policy (protects farm leaves)
    const tile = this.grid.findPreferredFetchTile(pos.x, pos.y);
    if (!tile) {
      ant.state = AntState.Idle;
      return;
    }

    // Pantry tiles are corner-anchored: centers sit at +0.5
    const dx = tile.x + 0.5 - pos.x;
    const dy = tile.y + 0.5 - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.5) {
      if (!carrying) { ant.state = AntState.Idle; return; }

      const needed = carrying.maxCapacity - carrying.amount;
      const { type, taken } = this.grid.takeFood(tile.x, tile.y, needed);
      if (taken <= 0) {
        ant.state = AntState.Idle;
        return;
      }

      carrying.amount += taken;
      carrying.resourceType = type;
      // Re-decide: queen feeding and egg tending both start from Idle with food on board
      ant.state = AntState.Idle;
    } else {
      this.setPath(id, pos, tile.x + 0.5, tile.y + 0.5);
    }
  }

  /** Nurse eats directly from the underground food storage to survive */
  private handleEatingAtStorage(id: number, ant: AntComponent, pos: PositionComponent, dt: number): void {
    const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER);
    if (!hunger) { ant.state = AntState.Idle; return; }

    const tile = this.grid.findPreferredFetchTile(pos.x, pos.y);
    if (!tile) {
      // Pantry is empty — nothing to do but hope porters bring food down
      ant.state = AntState.Idle;
      return;
    }

    const dx = tile.x + 0.5 - pos.x;
    const dy = tile.y + 0.5 - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.5) {
      // Nibble straight off the pile at the eating rate
      const want = Math.min(HUNGER_EAT_RATE * dt, (hunger.max - hunger.current) / HUNGER_PER_FOOD);
      const { taken } = this.grid.takeFood(tile.x, tile.y, want);

      if (taken <= 0) {
        ant.state = AntState.Idle;
        return;
      }

      hunger.current = Math.min(hunger.max, hunger.current + taken * HUNGER_PER_FOOD);
      if (hunger.current >= hunger.max * 0.95) {
        ant.state = AntState.Idle;
      }
    } else {
      this.setPath(id, pos, tile.x + 0.5, tile.y + 0.5);
    }
  }

  private handleMovingEgg(id: number, ant: AntComponent, pos: PositionComponent): void {
    if (ant.commandTargetId === null || !this.world.hasEntity(ant.commandTargetId)) {
      this.releaseEgg(id, ant);
      return;
    }

    const eggPos = this.world.getComponent<PositionComponent>(ant.commandTargetId, COMPONENT.POSITION);
    if (!eggPos) {
      this.releaseEgg(id, ant);
      return;
    }

    const dx = eggPos.x - pos.x;
    const dy = eggPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist >= 1.0) {
      // Walking to pick up the egg
      this.setPath(id, pos, eggPos.x, eggPos.y);
      return;
    }

    // Carrying the egg. Lock the destination tile ONCE so it doesn't flip mid-carry
    // (recomputing each frame counted the carried egg itself and made the target oscillate).
    if (!ant.eggTargetTile || !this.isTileUsable(ant.eggTargetTile, ant.commandTargetId)) {
      ant.eggTargetTile = this.findAvailableIncubationTile(ant.commandTargetId);
      this.clearPath(id);
      if (!ant.eggTargetTile) {
        // Incubation is full — leave the egg here; it will be retried when space opens up
        this.releaseEgg(id, ant);
        return;
      }
    }

    const targetTile = ant.eggTargetTile;
    const tdx = targetTile.x + 0.5 - pos.x;
    const tdy = targetTile.y + 0.5 - pos.y;
    const tdist = Math.sqrt(tdx * tdx + tdy * tdy);

    if (tdist < 0.8) {
      // Arrived — place the egg in a free sub-tile slot
      const slot = this.countEggsOnTile(targetTile.x, targetTile.y, ant.commandTargetId);
      const offset = EGG_SLOT_OFFSETS[Math.min(slot, EGG_SLOT_OFFSETS.length - 1)];
      eggPos.x = targetTile.x + 0.5 + offset.x;
      eggPos.y = targetTile.y + 0.5 + offset.y;
      eggPos.prevX = eggPos.x;
      eggPos.prevY = eggPos.y;
      this.releaseEgg(id, ant);
    } else {
      // Egg travels with the nurse
      eggPos.x = pos.x;
      eggPos.y = pos.y;
      eggPos.prevX = pos.prevX;
      eggPos.prevY = pos.prevY;
      this.setPath(id, pos, targetTile.x + 0.5, targetTile.y + 0.5);
    }
  }

  /** Walk to the claimed larva and transfer carried food into it; chain to the next hungry one */
  private handleTendingEgg(id: number, ant: AntComponent, pos: PositionComponent): void {
    const carrying = this.getCarrying(id);
    if (!carrying || carrying.amount <= 0) {
      // Nothing left to give — decideNextAction will send her back to the pantry
      this.releaseEgg(id, ant);
      return;
    }

    // Target gone (hatched mid-route) or already full — retarget the next hungry larva
    let eggId = ant.commandTargetId;
    let egg = eggId !== null && this.world.hasEntity(eggId)
      ? this.world.getComponent<EggComponent>(eggId, COMPONENT.EGG)
      : undefined;
    if (!egg || egg.fedAmount >= egg.requiredFood) {
      eggId = this.findEggNeedingFood(id, pos);
      if (eggId === null) {
        this.releaseEgg(id, ant);
        return;
      }
      ant.commandTargetId = eggId;
      egg = this.world.getComponent<EggComponent>(eggId, COMPONENT.EGG)!;
      this.clearPath(id);
    }

    const eggPos = this.world.getComponent<PositionComponent>(eggId!, COMPONENT.POSITION)!;
    const dx = eggPos.x - pos.x;
    const dy = eggPos.y - pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.0) {
      // Trophallaxis: give only what the larva still needs, capped by the load
      const feed = Math.min(carrying.amount, egg.requiredFood - egg.fedAmount);
      egg.fedAmount += feed;
      carrying.amount -= feed;

      if (carrying.amount <= 0) {
        carrying.amount = 0;
        this.releaseEgg(id, ant);
        return;
      }

      // Food left over — keep the round going if another larva is hungry
      const next = this.findEggNeedingFood(id, pos);
      if (next === null) {
        this.releaseEgg(id, ant);
        return;
      }
      ant.commandTargetId = next;
      this.clearPath(id);
    } else {
      this.setPath(id, pos, eggPos.x, eggPos.y);
    }
  }

  private releaseEgg(id: number, ant: AntComponent): void {
    ant.state = AntState.Idle;
    ant.commandTargetId = null;
    ant.eggTargetTile = null;
    this.clearPath(id);
  }

  /** Eggs already claimed by another nurse (being moved or fed) */
  private getClaimedEggs(excludeNurseId: number | null = null): Set<number> {
    const claimed = new Set<number>();
    const allAnts = this.world.query(COMPONENT.ANT, COMPONENT.LAYER);
    for (const antId of allAnts) {
      if (antId === excludeNurseId) continue;
      const ant = this.world.getComponent<AntComponent>(antId, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Nurse) continue;
      if (
        (ant.state === AntState.MovingEgg || ant.state === AntState.TendingEgg) &&
        ant.commandTargetId !== null
      ) {
        claimed.add(ant.commandTargetId);
      }
    }
    return claimed;
  }

  /** Nearest larva still short of food, skipping ones another nurse already claimed */
  private findEggNeedingFood(nurseId: number, pos: PositionComponent): number | null {
    const claimedEggs = this.getClaimedEggs(nurseId);
    const eggs = this.world.query(COMPONENT.EGG, COMPONENT.POSITION);

    let best: number | null = null;
    let bestDistSq = Infinity;
    for (const eggId of eggs) {
      if (claimedEggs.has(eggId)) continue;
      const egg = this.world.getComponent<EggComponent>(eggId, COMPONENT.EGG)!;
      if (egg.fedAmount >= egg.requiredFood) continue;

      const eggPos = this.world.getComponent<PositionComponent>(eggId, COMPONENT.POSITION)!;
      const dx = eggPos.x - pos.x;
      const dy = eggPos.y - pos.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = eggId;
      }
    }
    return best;
  }

  private findEggNeedingRelocation(): number | null {
    // Don't send nurses to grab eggs when there's nowhere to put them —
    // otherwise they pick up, abort, and another nurse repeats the dance forever
    if (this.findAvailableIncubationTile(null) === null) return null;

    const eggs = this.world.query(COMPONENT.EGG, COMPONENT.POSITION);
    const claimedEggs = this.getClaimedEggs();

    for (const eggId of eggs) {
      if (claimedEggs.has(eggId)) continue;

      const eggPos = this.world.getComponent<PositionComponent>(eggId, COMPONENT.POSITION)!;
      const tile = this.grid.getTile(Math.floor(eggPos.x), Math.floor(eggPos.y));
      if (!tile || tile.chamberType !== ChamberType.Incubation) {
        return eggId;
      }
    }

    return null;
  }

  private countEggsOnTile(x: number, y: number, excludeEggId: number | null): number {
    const eggs = this.world.query(COMPONENT.EGG, COMPONENT.POSITION);
    let count = 0;
    for (const eggId of eggs) {
      if (eggId === excludeEggId) continue;
      const eggPos = this.world.getComponent<PositionComponent>(eggId, COMPONENT.POSITION)!;
      if (Math.floor(eggPos.x) === x && Math.floor(eggPos.y) === y) count++;
    }
    return count;
  }

  private isTileUsable(tile: { x: number; y: number }, excludeEggId: number | null): boolean {
    const t = this.grid.getTile(tile.x, tile.y);
    if (!t || t.chamberType !== ChamberType.Incubation || !t.walkable) return false;
    return this.countEggsOnTile(tile.x, tile.y, excludeEggId) < MAX_EGGS_PER_INCUBATION_TILE;
  }

  private findAvailableIncubationTile(excludeEggId: number | null): { x: number; y: number } | null {
    // Count eggs per tile (excluding the egg being carried — it counts itself otherwise)
    const eggCounts = new Map<string, number>();
    const eggs = this.world.query(COMPONENT.EGG, COMPONENT.POSITION);

    for (const eggId of eggs) {
      if (eggId === excludeEggId) continue;
      const eggPos = this.world.getComponent<PositionComponent>(eggId, COMPONENT.POSITION)!;
      const key = `${Math.floor(eggPos.x)},${Math.floor(eggPos.y)}`;
      eggCounts.set(key, (eggCounts.get(key) ?? 0) + 1);
    }

    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        const tile = this.grid.getTile(x, y);
        if (tile && tile.walkable && tile.chamberType === ChamberType.Incubation) {
          const count = eggCounts.get(`${x},${y}`) ?? 0;
          if (count < MAX_EGGS_PER_INCUBATION_TILE) {
            return { x, y };
          }
        }
      }
    }

    return null;
  }
}
