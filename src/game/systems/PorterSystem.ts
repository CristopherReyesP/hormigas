import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid, PantryFoodType } from '../../simulation/world/UndergroundGrid';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { TransitSystem } from './TransitSystem';
import { findPath } from '../../simulation/pathfinding/AStar';
import { findAttacker, ensureCombatComponent } from './helpers/combatHelpers';
import {
  COMPONENT,
  AntRole,
  AntState,
  FoodType,
  Layer,
  type AntComponent,
  type PositionComponent,
  type LayerComponent,
  type PathComponent,
  type CarryingComponent,
  type NestComponent,
  type FoodSourceComponent,
} from '../components/components';
import {
  ANT_DEPOSIT_RANGE,
  ROLE_STATS,
  PORTER_MAX_COUNT,
  PORTER_ASSIGN_COOLDOWN,
  SCAVENGER_MAX_COUNT,
  PANTRY_FULL_NOTIFY_COOLDOWN_MS,
  WORKER_FIGHT_RANGE,
  BEETLE_MEAT_NUTRITION_MULTIPLIER,
  CRICKET_MEAT_NUTRITION_MULTIPLIER,
} from '../../shared/constants';

/**
 * Porter logistics: idle workers physically haul food from the surface nest
 * stockpile down to the underground pantry tiles — replaces the old
 * FoodTransferSystem that teleported food underground at a flat rate.
 *
 * State machine (workers only — nurses use FetchingFood for their own flow):
 * - FetchingFood: walk to the surface stockpile, load up to carry capacity,
 *   then ride the entrance shaft down (TransitSystem).
 * - Hauling: walk to a pantry tile with space and deposit. If the pantry
 *   fills up mid-trip, the porter carries the remainder back up and returns
 *   it to the surface pile — food never appears or disappears.
 * - Scavenging: walk to loose food lying on the underground layer (meat
 *   dropped by invaders killed inside the nest), load it, then deposit it
 *   through the same Hauling flow.
 */
export class PorterSystem implements System {
  readonly name = 'PorterSystem';
  readonly priority = 4; // before NurseAISystem (5) so nurses see freshly stocked piles

  private world: World;
  private grid: UndergroundGrid;
  private surfaceGrid: TileGrid;
  private transitSystem: TransitSystem;
  private assignTimer = 0;
  private lastPantryFullNotify = 0;
  private getPendingDigJobs: (() => number) | null = null;

  /** Wired by GameManager — lets waiting haulers convert into diggers */
  setDigJobsProvider(fn: () => number): void {
    this.getPendingDigJobs = fn;
  }

  constructor(world: World, grid: UndergroundGrid, surfaceGrid: TileGrid, transitSystem: TransitSystem) {
    this.world = world;
    this.grid = grid;
    this.surfaceGrid = surfaceGrid;
    this.transitSystem = transitSystem;
  }

  update(dt: number): void {
    this.assignTimer = Math.max(0, this.assignTimer - dt);

    const nests = this.world.query(COMPONENT.NEST, COMPONENT.POSITION);
    if (nests.length === 0) return;
    const nest = this.world.getComponent<NestComponent>(nests[0], COMPONENT.NEST)!;
    const nestPos = this.world.getComponent<PositionComponent>(nests[0], COMPONENT.POSITION)!;

    // Drive active porters. The state itself is the registry — a dead porter
    // simply stops being counted (its load is lost with it, like a real ant).
    let activePorters = 0;
    let activeScavengers = 0;
    const idleSurfaceWorkers: number[] = [];
    const idleUndergroundWorkers: number[] = [];
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER, COMPONENT.CARRYING);

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Worker) continue;

      if (ant.state === AntState.FetchingFood) {
        if (this.reactToSurfaceThreat(id, ant, nestPos)) continue;
        activePorters++;
        this.handleFetchingFood(id, ant, nest, nestPos);
        continue;
      }
      if (ant.state === AntState.Hauling) {
        if (this.reactToSurfaceThreat(id, ant, nestPos)) continue;
        activePorters++;
        this.handleHauling(id, ant, nest, nestPos, dt);
        continue;
      }
      if (ant.state === AntState.Scavenging) {
        if (this.reactToSurfaceThreat(id, ant, nestPos)) continue;
        activeScavengers++;
        this.handleScavenging(id, ant, nest, dt);
        continue;
      }

      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (this.transitSystem.isInTransit(id)) continue;

      // A loaded idle ant below resumes its delivery the moment a pile frees
      // up (it was parked waiting for space, or finished a dig with food in
      // its mouth) — this is what re-animates held loads after expansion
      if (layer.layer === Layer.Underground && ant.state === AntState.Idle) {
        const held = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
        if (held.amount > 0 && this.grid.hasDepositSpace([this.asPantryType(held.resourceType)])) {
          ant.state = AntState.Hauling;
          ant.stateTimer = 0;
          continue;
        }
      }

      if (
        layer.layer === Layer.Surface &&
        (ant.state === AntState.Idle || ant.state === AntState.Searching)
      ) {
        idleSurfaceWorkers.push(id);
      } else if (layer.layer === Layer.Underground && ant.state === AntState.Idle) {
        idleUndergroundWorkers.push(id);
      }
    }

    // Assign at most ONE recruit per cooldown window — requesting in a loop here
    // once vacuumed the entire idle workforce in a second (see ExcavationSystem)
    if (this.assignTimer > 0) return;

    // Scavenging beats porter duty: invader meat lying in the nest rots player
    // attention — underground idlers first (they're already down there)
    const looseFood = this.countLooseUndergroundFood();
    if (looseFood > 0 && this.grid.hasDepositSpace() && activeScavengers < Math.min(SCAVENGER_MAX_COUNT, looseFood)) {
      const recruitId = idleUndergroundWorkers[0] ?? idleSurfaceWorkers[0];
      if (recruitId !== undefined) {
        const recruit = this.world.getComponent<AntComponent>(recruitId, COMPONENT.ANT)!;
        recruit.state = AntState.Scavenging;
        recruit.stateTimer = 0;
        this.assignTimer = PORTER_ASSIGN_COOLDOWN;
        return;
      }
    }

    if (idleSurfaceWorkers.length === 0) return;
    if (!this.hasHaulableFood(nest)) return;

    // Demand-driven cap: no point sending 4 porters for half a load.
    // The queen's 'porters' upgrade raises the simultaneous-porter ceiling.
    const porterCapacity = Math.max(1, Math.round(ROLE_STATS.worker.carryCapacity * this.world.upgrades.workerCarryMult));
    const desired = Math.min(PORTER_MAX_COUNT + this.world.upgrades.porterBonus, Math.ceil(nest.foodStored / porterCapacity));
    if (activePorters >= desired) return;

    const recruit = this.world.getComponent<AntComponent>(idleSurfaceWorkers[0], COMPONENT.ANT)!;
    recruit.state = AntState.FetchingFood;
    recruit.stateTimer = 0;
    this.assignTimer = PORTER_ASSIGN_COOLDOWN;
  }

  /**
   * Porters mid-haul must not be blind to predators: if a beetle/cricket is
   * actively attacking this porter on the surface, drop to the standard worker
   * reaction — fight near the nest, flee otherwise (mirrors AntAISystem's
   * react-to-attack). AntAISystem runs right after this system and handles the
   * AttackingEnemy/Fleeing states from there. The load stays on the
   * CarryingComponent — it comes back on the next deposit, or dies with the ant.
   */
  private reactToSurfaceThreat(id: number, ant: AntComponent, nestPos: PositionComponent): boolean {
    if (this.transitSystem.isInTransit(id)) return false; // riding the shaft — unreachable

    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    if (layer.layer !== Layer.Surface) return false; // underground defense is the invasion system's job

    const attackerId = findAttacker(this.world, id);
    if (attackerId === null) return false;

    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    if (Math.hypot(nestPos.x - pos.x, nestPos.y - pos.y) < WORKER_FIGHT_RANGE) {
      // Fight back near the nest — CombatSystem deals the damage
      ant.state = AntState.AttackingEnemy;
      ensureCombatComponent(this.world, id, attackerId);
    } else {
      // Too far from home — run; AntAISystem's Fleeing handler paths away
      ant.state = AntState.Fleeing;
    }
    ant.stateTimer = 0;
    this.clearPath(id);
    return true;
  }

  /** Walk to the surface stockpile, load a typed batch, then head underground */
  private handleFetchingFood(id: number, ant: AntComponent, nest: NestComponent, nestPos: PositionComponent): void {
    if (this.transitSystem.isInTransit(id)) return; // riding the shaft

    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    if (layer.layer === Layer.Underground) {
      // Looping porter still below ground — climb back up to the stockpile first
      this.transitSystem.requestTransit(id, 'exit');
      return;
    }

    // Job evaporated (pile emptied / pantry filled) — back to normal worker duties
    if (!this.hasHaulableFood(nest)) {
      ant.state = AntState.Idle;
      ant.stateTimer = 0;
      return;
    }

    // Give up if stuck walking to the nest for too long (AntAISystem ticks stateTimer on surface)
    if (ant.stateTimer > 20) {
      ant.state = AntState.Idle;
      ant.stateTimer = 0;
      return;
    }

    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const dx = nestPos.x - pos.x;
    const dy = nestPos.y - pos.y;

    if (Math.sqrt(dx * dx + dy * dy) < ANT_DEPOSIT_RANGE) {
      const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
      const load = this.takeFromStockpile(nest, carrying.maxCapacity);
      if (load.amount <= 0) {
        ant.state = AntState.Idle;
        ant.stateTimer = 0;
        return;
      }
      carrying.resourceType = load.type;
      carrying.amount = load.amount;
      ant.state = AntState.Hauling;
      ant.stateTimer = 0;
      this.transitSystem.requestTransit(id, 'enter');
    } else {
      this.setSurfacePathToNest(id, pos, nestPos);
    }
  }

  /** Carry the load to a pantry tile; if the pantry is full, bring it back to the surface pile */
  private handleHauling(id: number, ant: AntComponent, nest: NestComponent, nestPos: PositionComponent, dt: number): void {
    if (this.transitSystem.isInTransit(id)) return;

    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;

    if (carrying.amount <= 0) {
      carrying.amount = 0;
      carrying.resourceType = null;
      this.finishTrip(id, ant, nest, layer);
      return;
    }

    const type = this.asPantryType(carrying.resourceType);

    if (layer.layer === Layer.Surface) {
      // FOOD IS ONLY STORED UNDERGROUND: a loaded ant on the surface walks to
      // the nest and rides down — it never drops the load on the surface
      const dx = nestPos.x - pos.x;
      const dy = nestPos.y - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < ANT_DEPOSIT_RANGE) {
        this.transitSystem.requestTransit(id, 'enter');
      } else {
        this.setSurfacePathToNest(id, pos, nestPos);
      }
      return;
    }

    // Underground — AntAISystem skips this layer, so the porter ticks its own timer
    ant.stateTimer += dt;

    const target = this.grid.findDepositTile(type, pos.x, pos.y);
    if (!target) {
      // Pantry is FULL — the ant keeps the food in its mouth (visible: carry
      // sprite). If it gets hungry it eats from its own load (HungerSystem).
      // Nothing is ever dropped. And CRUCIALLY: a waiting hauler is wasted
      // labor when there's digging to do — release it to the excavation pool
      // (Idle underground = recruitable; the load travels with it). Expanding
      // storage is exactly what unblocks the deposit.
      this.notifyPantryFull();
      this.clearPath(id);
      if (this.getPendingDigJobs && this.getPendingDigJobs() > 0) {
        ant.state = AntState.Idle;
        ant.stateTimer = 0;
      }
      return;
    }

    // Underground tiles are corner-anchored: centers sit at +0.5
    const tdx = target.x + 0.5 - pos.x;
    const tdy = target.y + 0.5 - pos.y;

    if (Math.sqrt(tdx * tdx + tdy * tdy) < 1.2) {
      const accepted = this.grid.depositFood(target.x, target.y, type, carrying.amount);
      carrying.amount -= accepted;
      if (carrying.amount <= 1e-6) {
        carrying.amount = 0;
        carrying.resourceType = null;
        this.finishTrip(id, ant, nest, layer);
      } else {
        // Tile filled (or got claimed by another type) mid-trip — re-target next frame
        this.clearPath(id);
      }
    } else {
      this.setUndergroundPath(id, pos, target.x + 0.5, target.y + 0.5);
    }
  }

  /** Load delivered — loop for more if there's work, otherwise back to the surface to forage */
  private finishTrip(id: number, ant: AntComponent, nest: NestComponent, layer: LayerComponent): void {
    ant.stateTimer = 0;
    if (this.hasHaulableFood(nest)) {
      ant.state = AntState.FetchingFood;
      if (layer.layer === Layer.Underground) {
        this.transitSystem.requestTransit(id, 'exit');
      }
    } else {
      // ALWAYS ride back up: with the underground-only economy there is no
      // surface stockpile to fetch from, so without this exit every forager
      // that deposited stayed Idle below forever — the colony ground to a halt
      ant.state = AntState.Idle;
      if (layer.layer === Layer.Underground) {
        this.transitSystem.requestTransit(id, 'exit');
      }
    }
  }

  /** Walk to a loose underground food drop (invader meat), load it, deposit via Hauling */
  private handleScavenging(id: number, ant: AntComponent, nest: NestComponent, dt: number): void {
    if (this.transitSystem.isInTransit(id)) return;

    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;

    // Already loaded (e.g. re-entered the state after a civilian draft) — just deposit
    if (carrying.amount > 0) {
      ant.state = AntState.Hauling;
      ant.stateTimer = 0;
      return;
    }

    if (layer.layer === Layer.Surface) {
      // Recruited up top — ride the shaft down (AntAISystem ticks stateTimer on surface)
      if (ant.stateTimer > 20) {
        ant.state = AntState.Idle;
        ant.stateTimer = 0;
        return;
      }
      this.transitSystem.requestTransit(id, 'enter');
      return;
    }

    // Underground — AntAISystem skips this layer, so the scavenger ticks its own timer
    ant.stateTimer += dt;
    if (ant.stateTimer > 30) {
      ant.state = AntState.Idle;
      ant.stateTimer = 0;
      return;
    }

    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const target = this.findNearestLooseFood(pos);
    if (target === null) {
      // Someone else got it — fall back to porter duty or idle
      this.finishTrip(id, ant, nest, layer);
      return;
    }

    const tdx = target.pos.x - pos.x;
    const tdy = target.pos.y - pos.y;

    if (Math.sqrt(tdx * tdx + tdy * tdy) < 1.2) {
      const food = this.world.getComponent<FoodSourceComponent>(target.id, COMPONENT.FOOD_SOURCE)!;
      const raw = Math.min(carrying.maxCapacity, food.amount);
      food.amount -= raw;
      if (food.amount <= 0) this.world.destroyEntity(target.id);

      // Convert raw meat to stored units at pickup — surface harvests convert at
      // the nest deposit (AntAISystem), so converting here keeps both routes worth
      // the same and lets Hauling treat this like any pantry-typed porter batch
      const mult =
        food.resourceType === FoodType.CricketMeat ? CRICKET_MEAT_NUTRITION_MULTIPLIER :
        food.resourceType === FoodType.BeetleMeat ? BEETLE_MEAT_NUTRITION_MULTIPLIER : 1.0;
      carrying.resourceType = 'meat';
      carrying.amount = raw * mult;
      ant.state = AntState.Hauling;
      ant.stateTimer = 0;
      this.clearPath(id);
    } else {
      this.setUndergroundPath(id, pos, target.pos.x, target.pos.y);
    }
  }

  /** Food entities lying on the underground layer (meat from invaders killed in the nest) */
  private countLooseUndergroundFood(): number {
    const foods = this.world.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION, COMPONENT.LAYER);
    let count = 0;
    for (const id of foods) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer === Layer.Underground) count++;
    }
    return count;
  }

  private findNearestLooseFood(pos: PositionComponent): { id: number; pos: PositionComponent } | null {
    const foods = this.world.query(COMPONENT.FOOD_SOURCE, COMPONENT.POSITION, COMPONENT.LAYER);
    let nearest: { id: number; pos: PositionComponent } | null = null;
    let nearestDist = Infinity;
    for (const id of foods) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;
      const foodPos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const dist = Math.hypot(foodPos.x - pos.x, foodPos.y - pos.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { id, pos: foodPos };
      }
    }
    return nearest;
  }

  /**
   * Stockpile types with at least a unit on the pile (leaf is the implicit
   * remainder), ORDERED by the colony's consumption policy: porters haul down
   * first what the colony wants to eat first, so the pantry actually contains
   * the priority type — otherwise nurses keep falling back to leaves while
   * mushrooms rot on the surface.
   */
  private stockpileAmounts(nest: NestComponent): Array<{ type: PantryFoodType; available: number }> {
    const available: Record<PantryFoodType, number> = {
      leaf: Math.max(0, nest.foodStored - nest.mushroomStored - nest.meatStored),
      mushroom: nest.mushroomStored,
      meat: nest.meatStored,
    };
    return this.grid
      .getConsumptionOrder()
      .map((type) => ({ type, available: available[type] }))
      .filter((e) => e.available >= 1);
  }

  /**
   * True only if some stockpile type can actually land on a pantry tile —
   * gating on the TYPE prevents porters ping-ponging meat up and down forever
   * while the only free pile space belongs to leaves.
   */
  private hasHaulableFood(nest: NestComponent): boolean {
    return this.stockpileAmounts(nest).some((e) => e.available > 0 && this.grid.hasDepositSpace([e.type]));
  }

  /**
   * Take ONE typed batch from the stockpile (pantry piles hold a single type
   * per tile, so mixed loads would need multiple deposit stops). Order follows
   * the consumption policy — skipping types the pantry can't accept.
   */
  private takeFromStockpile(nest: NestComponent, maxAmount: number): { type: PantryFoodType; amount: number } {
    for (const entry of this.stockpileAmounts(nest)) {
      if (!this.grid.hasDepositSpace([entry.type])) continue;
      const amount = Math.min(maxAmount, entry.available);
      if (entry.type === 'mushroom') nest.mushroomStored -= amount;
      else if (entry.type === 'meat') nest.meatStored -= amount;
      nest.foodStored = Math.max(0, nest.foodStored - amount);
      return { type: entry.type, amount };
    }
    return { type: 'leaf', amount: 0 };
  }

  /** Porter loads are always pantry-typed; default defensively to leaf */
  private asPantryType(resourceType: string | null): PantryFoodType {
    return resourceType === 'mushroom' || resourceType === 'meat' ? resourceType : 'leaf';
  }

  /** A* through surface terrain; falls back to a straight waypoint (nest clearing is open ground) */
  private setSurfacePathToNest(id: number, pos: PositionComponent, nestPos: PositionComponent): void {
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (!path || (path.waypoints.length > 0 && path.currentIndex < path.waypoints.length)) return;

    const route = findPath(
      this.surfaceGrid,
      { x: Math.round(pos.x), y: Math.round(pos.y) },
      { x: Math.round(nestPos.x), y: Math.round(nestPos.y) }
    );
    path.waypoints = route ?? [{ x: nestPos.x, y: nestPos.y }];
    path.currentIndex = 0;
  }

  /** BFS through tunnels/chambers; falls back to a direct waypoint if no route exists */
  private setUndergroundPath(id: number, pos: PositionComponent, tx: number, ty: number): void {
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

  private notifyPantryFull(): void {
    const now = Date.now();
    if (now - this.lastPantryFullNotify < PANTRY_FULL_NOTIFY_COOLDOWN_MS) return;
    this.lastPantryFullNotify = now;
    this.world.pushNotification('warning', '🍖 ¡Despensa llena! Los porteadores devuelven la comida a la superficie — excavá más despensa');
  }
}
