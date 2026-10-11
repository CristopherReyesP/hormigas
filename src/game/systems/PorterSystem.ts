import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid, PantryFoodType } from '../../simulation/world/UndergroundGrid';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { TransitSystem } from './TransitSystem';
import { findPath } from '../../simulation/pathfinding/AStar';
import { findAttacker, ensureCombatComponent } from './helpers/combatHelpers';
import { hasPlayerOrder } from './helpers/playerOrders';
import { antSpawnStats } from '../run/antStats';
import {
  COMPONENT,
  AntRole,
  AntState,
  FoodType,
  Layer,
  isOreLoad,
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
  PORTER_MAX_COUNT,
  PORTER_PILE_PER_EXTRA,
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
 *   is full, a worker keeps the load and waits for room (WaitingForPantry).
 * - WaitingForPantry: the designer's rule, "cuando la despensa está llena,
 *   tienen que esperar a que haya más espacio". The worker stands in the
 *   storage area below ground holding its load and deposits it the moment a
 *   pile of that type has room (the colony ate, an egg was paid, the player
 *   marked more Almacén). If it gets hungry it eats the load (HungerSystem).
 *   It waits BELOW, on the pantry tiles, not at the entrance: it rides the
 *   shaft once instead of twice, it stands off the shaft foot so porters,
 *   miners and diggers keep moving through it, it is out of reach of the
 *   crickets that raid the entrance, and it is a few steps from the pile
 *   that frees up. Its load counts as "en camino" on the HUD, so no food is
 *   hidden, and idle workers start no new foraging while the pantry is full
 *   (AntAISystem), so the wait never takes the whole workforce.
 * - Scavenging: walk to loose food lying on the underground layer (meat
 *   dropped by invaders killed inside the nest), load it, then deposit it
 *   through the same Hauling flow.
 *
 * Stand-in porters: porters are workers, but a colony that lost its workers
 * (or whose pile outgrows them) must not starve with food at the door. When
 * no worker is free to fetch and the colony has no workers, or the entrance
 * pile reaches STAND_IN_PILE, the job falls to the next caste that can reach
 * the pile: soldiers and scouts on the surface run the same porter trip;
 * failing those, nurses take loads at the foot of the shaft (they never go
 * up) and carry them to the pantry, at most half of them so the queen and the
 * brood keep their care. Defenders keep guarding.
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
  /** Non-workers on porter duty (soldiers, scouts, nurses at the shaft) */
  private standIns = new Set<number>();
  /** Nurses fetching loose meat inside the nest because no worker was free to (they never leave the nest) */
  private nurseScavengers = new Set<number>();
  /** Whether stand-ins are wanted this tick: no workers, or a pile too big for them */
  private standInsWanted = false;
  /** Game seconds the entrance pile has waited with nobody carrying it down */
  private unattendedPile = 0;

  /** Retained for GameManager compatibility — the dig-jobs gate was removed (Bug 2 fix) */
  setDigJobsProvider(_fn: () => number): void {
    // No-op: with the pantry full a hauler waits in the storage area with its
    // load, whatever the pending dig jobs.
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

    // No free pantry tile: merge partial piles so a type the piles do not
    // hold yet can still be stored while there is room
    this.grid.compactPiles();

    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER, COMPONENT.CARRYING);
    let workers = 0;
    for (const id of ants) {
      if (this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role === AntRole.Worker) workers++;
    }
    const haulable = this.hasHaulableFood(nest);
    this.standInsWanted = haulable && (workers === 0 || nest.foodStored >= STAND_IN_PILE);
    this.warnFewWorkers(workers);

    // Drive active porters. The state itself is the registry — a dead porter
    // simply stops being counted (its load is lost with it, like a real ant).
    let activePorters = 0;
    let activeScavengers = 0;
    let nurses = 0;
    let nurseRelays = 0;
    const idleSurfaceWorkers: number[] = [];
    const idleUndergroundWorkers: number[] = [];
    const idleSurfaceHelpers: number[] = [];
    const idleNurses: number[] = [];
    const idleUndergroundNurses: number[] = [];

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role === AntRole.Nurse) nurses++;
      if (this.nurseScavengers.has(id)) {
        if (ant.state === AntState.Scavenging) {
          activeScavengers++;
          this.handleScavenging(id, ant, nest, dt);
        } else if (ant.state === AntState.Hauling) {
          this.handleHauling(id, ant, nest, nestPos, dt);
        } else {
          this.nurseScavengers.delete(id); // hunger, a fight or the nursery took it back
        }
        continue;
      }
      if (ant.role === AntRole.Nurse && this.isIdleBelow(id, ant)) idleUndergroundNurses.push(id);
      if (ant.role !== AntRole.Worker) {
        if (this.standIns.has(id)) {
          if (this.driveStandIn(id, ant, nest, nestPos, dt)) {
            activePorters++;
            if (ant.role === AntRole.Nurse) nurseRelays++;
          }
        } else if (this.standInsWanted) {
          this.sortStandInCandidate(id, ant, idleSurfaceHelpers, idleNurses);
        }
        continue;
      }
      // The player gave this ant an order: it is not a porter until the order ends
      if (hasPlayerOrder(this.world, id)) continue;

      if (ant.state === AntState.FetchingFood) {
        if (this.reactToSurfaceThreat(id, ant, nestPos)) continue;
        activePorters++;
        this.handleFetchingFood(id, ant, nest, nestPos);
        continue;
      }
      if (ant.state === AntState.Hauling) {
        if (this.sendOreUp(id, ant)) continue;
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
      if (ant.state === AntState.WaitingForPantry) {
        if (this.sendOreUp(id, ant)) continue;
        this.handleWaiting(id, ant, nest, dt);
        continue;
      }

      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (this.transitSystem.isInTransit(id)) continue;

      // A worker holding ore is a miner on its way to the minerals bank, never
      // a porter or a scavenger (both would treat the ore as food)
      if (this.sendOreUp(id, ant)) continue;
      const load = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
      if (isOreLoad(load.resourceType) && load.amount > 0) continue;

      // A loaded idle ant below (it finished a dig with food in its mouth)
      // delivers it: to a pile if there is room, else it waits for room
      if (layer.layer === Layer.Underground && ant.state === AntState.Idle && load.amount > 0) {
        ant.state = AntState.Hauling;
        ant.stateTimer = 0;
        continue;
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

    // Forget stand-ins that died
    for (const id of this.standIns) if (!this.world.getComponent(id, COMPONENT.ANT)) this.standIns.delete(id);
    for (const id of this.nurseScavengers) if (!this.world.getComponent(id, COMPONENT.ANT)) this.nurseScavengers.delete(id);
    this.warnUnattendedPile(haulable && nest.foodStored >= 1 && activePorters === 0, dt);

    // Assign at most ONE recruit per cooldown window — requesting in a loop here
    // once vacuumed the entire idle workforce in a second (see ExcavationSystem)
    if (this.assignTimer > 0) return;

    // Scavenging beats porter duty: invader meat lying in the nest rots player
    // attention — underground idlers first (they're already down there)
    const looseFood = this.countLooseUndergroundFood();
    if (looseFood > 0 && this.grid.hasDepositSpace() && activeScavengers < Math.min(SCAVENGER_MAX_COUNT, looseFood)) {
      // No worker free (or none left at all): a nurse already down there picks it up
      const recruitId = idleUndergroundWorkers[0] ?? idleSurfaceWorkers[0] ?? idleUndergroundNurses[0];
      if (recruitId !== undefined) {
        if (idleUndergroundWorkers[0] === undefined && idleSurfaceWorkers[0] === undefined) this.nurseScavengers.add(recruitId);
        const recruit = this.world.getComponent<AntComponent>(recruitId, COMPONENT.ANT)!;
        recruit.state = AntState.Scavenging;
        recruit.stateTimer = 0;
        this.assignTimer = PORTER_ASSIGN_COOLDOWN;
        return;
      }
    }

    // Bug 1: dispatch remaining idle unloaded underground workers back to surface.
    // Runs after the loaded-idle resume check (lines 118-125) so ants with food
    // that can now deposit resume Hauling rather than being sent up.
    for (const ugId of idleUndergroundWorkers) {
      const ugCarrying = this.world.getComponent<CarryingComponent>(ugId, COMPONENT.CARRYING)!;
      if (ugCarrying.amount === 0 && !this.transitSystem.isInTransit(ugId)) {
        this.transitSystem.requestTransit(ugId, 'exit');
      }
    }

    if (!haulable) return;

    // Demand-driven: one porter per load on the pile, no point sending 4 for
    // half a load. The ceiling grows with the pile (a flat 4 left a big haul
    // rotting at the entrance) and with the queen's 'porters' upgrade.
    const porterCapacity = Math.max(1, antSpawnStats(this.world, AntRole.Worker).carryCapacity);
    const desired = Math.min(porterCeiling(nest.foodStored, this.world.upgrades.porterBonus), Math.ceil(nest.foodStored / porterCapacity));
    if (activePorters >= desired) return;

    if (idleSurfaceWorkers.length > 0) {
      const recruit = this.world.getComponent<AntComponent>(idleSurfaceWorkers[0], COMPONENT.ANT)!;
      recruit.state = AntState.FetchingFood;
      recruit.stateTimer = 0;
      this.assignTimer = PORTER_ASSIGN_COOLDOWN;
      return;
    }

    // No worker free to fetch: a stand-in takes the job (see the class comment)
    if (!this.standInsWanted) return;
    const helperId = idleSurfaceHelpers[0] ?? (nurseRelays < Math.ceil(nurses / 2) ? idleNurses[0] : undefined);
    if (helperId === undefined) return;
    const helper = this.world.getComponent<AntComponent>(helperId, COMPONENT.ANT)!;
    // Soldiers and scouts run the porter trip; a nurse works the foot of the shaft (Hauling, empty)
    helper.state = helper.role === AntRole.Nurse ? AntState.Hauling : AntState.FetchingFood;
    helper.stateTimer = 0;
    this.clearPath(helperId);
    this.standIns.add(helperId);
    this.assignTimer = PORTER_ASSIGN_COOLDOWN;
  }

  /** A soldier or scout idling on the surface, or a free nurse below, with empty jaws and no order. */
  private sortStandInCandidate(id: number, ant: AntComponent, surface: number[], nurses: number[]): void {
    // Cheap fields first: most ants are busy and never reach the component lookups
    if (ant.state !== AntState.Idle && ant.state !== AntState.Searching && ant.state !== AntState.PatrollingNest) return;
    if (hasPlayerOrder(this.world, id) || this.transitSystem.isInTransit(id)) return;
    const load = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
    if (load.amount > 0) return;
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer;
    if ((ant.role === AntRole.Soldier || ant.role === AntRole.Scout) && layer === Layer.Surface) {
      if (ant.state === AntState.Idle || ant.state === AntState.Searching || ant.state === AntState.PatrollingNest) {
        surface.push(id);
      }
    } else if (ant.role === AntRole.Nurse && layer === Layer.Underground) {
      if (ant.state === AntState.Idle || ant.state === AntState.Searching) nurses.push(id);
    }
  }

  /** An unloaded idle ant below ground, free for a quick errand */
  private isIdleBelow(id: number, ant: AntComponent): boolean {
    if (ant.state !== AntState.Idle && ant.state !== AntState.Searching) return false;
    if (hasPlayerOrder(this.world, id) || this.transitSystem.isInTransit(id)) return false;
    if (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer !== Layer.Underground) return false;
    return this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!.amount === 0;
  }

  /** Run one stand-in's porter job; false (and released) once another system took the ant. */
  private driveStandIn(id: number, ant: AntComponent, nest: NestComponent, nestPos: PositionComponent, dt: number): boolean {
    if (ant.role === AntRole.Nurse) {
      if (ant.state !== AntState.Hauling) {
        this.standIns.delete(id);
        return false;
      }
      this.handleShaftRelay(id, ant, nest, dt);
      return true;
    }
    if (ant.state === AntState.FetchingFood) {
      if (this.reactToSurfaceThreat(id, ant, nestPos)) return false;
      this.handleFetchingFood(id, ant, nest, nestPos);
      return true;
    }
    if (ant.state === AntState.Hauling) {
      if (this.reactToSurfaceThreat(id, ant, nestPos)) return false;
      this.handleHauling(id, ant, nest, nestPos, dt);
      return true;
    }
    // A fight, a hunger trip or an order took it: it is a soldier again
    this.standIns.delete(id);
    return false;
  }

  /**
   * A nurse stand-in: walk to the foot of the shaft, take a load off the
   * entrance pile (it sits at the top of that same shaft), carry it to a pile,
   * and repeat while the colony still needs it. Nurses never leave the nest.
   */
  private handleShaftRelay(id: number, ant: AntComponent, nest: NestComponent, dt: number): void {
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;
    ant.stateTimer += dt;

    const release = () => {
      ant.state = AntState.Idle;
      ant.stateTimer = 0;
      this.clearPath(id);
      this.standIns.delete(id);
    };

    if (carrying.amount > 0) {
      const type = this.asPantryType(carrying.resourceType) ?? 'leaf';
      const target = this.grid.findDepositTile(type, pos.x, pos.y);
      if (!target) {
        // Pantry full after all: the load goes back on the pile
        this.dropOnEntrancePile(nest, carrying, type);
        release();
        return;
      }
      if (Math.hypot(target.x + 0.5 - pos.x, target.y + 0.5 - pos.y) < 1.2) {
        carrying.amount -= this.grid.depositFood(target.x, target.y, type, carrying.amount);
        if (carrying.amount <= 1e-6) {
          carrying.amount = 0;
          carrying.resourceType = null;
          ant.stateTimer = 0;
          if (!this.standInsWanted) release();
        } else {
          this.clearPath(id);
        }
      } else {
        this.setUndergroundPath(id, pos, target.x + 0.5, target.y + 0.5);
      }
      return;
    }

    if (!this.standInsWanted || ant.stateTimer > 60) {
      release();
      return;
    }
    const foot = this.grid.findNearestEntrance(pos.x, pos.y);
    if (!foot) {
      release();
      return;
    }
    if (Math.hypot(foot.x - pos.x, foot.y - pos.y) < 1.5) {
      const load = this.takeFromStockpile(nest, carrying.maxCapacity);
      if (load.amount <= 0) {
        release();
        return;
      }
      carrying.resourceType = load.type;
      carrying.amount = load.amount;
      this.clearPath(id);
    } else {
      this.setUndergroundPath(id, pos, foot.x, foot.y);
    }
  }

  /** "¡Sin obreras!": nobody left to forage or carry food, and only eggs bring them back. */
  private warnFewWorkers(workers: number): void {
    if (workers === 0) {
      this.world.pushNotification('danger', '¡Sin obreras! Cría obreras para recolectar y llevar comida', 'no-workers', 60_000);
    } else if (workers <= FEW_WORKERS) {
      this.world.pushNotification('warning', '¡Quedan muy pocas obreras! Cría obreras para recolectar y llevar comida', 'few-workers', 60_000);
    }
  }

  /** Food waiting at the entrance with room below and nobody carrying it down, for a while. */
  private warnUnattendedPile(unattended: boolean, dt: number): void {
    this.unattendedPile = unattended ? this.unattendedPile + dt : 0;
    if (this.unattendedPile < UNATTENDED_PILE_SECONDS) return;
    this.world.pushNotification('warning', 'Hay comida en la entrada y nadie la baja a la despensa', 'unattended-pile', 60_000);
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
    if (type === null) return; // ore: sendOreUp already took it off porter duty

    if (layer.layer === Layer.Surface) {
      // A loaded ant on the surface walks to the nest and rides down. A worker
      // rides down even with the pantry full: it waits below for room. A
      // stand-in soldier or scout puts the load back on the entrance pile it
      // took it from and goes back to its own job.
      const dx = nestPos.x - pos.x;
      const dy = nestPos.y - pos.y;
      if (Math.sqrt(dx * dx + dy * dy) < ANT_DEPOSIT_RANGE) {
        if (ant.role === AntRole.Worker || this.grid.hasDepositSpace([type])) {
          this.transitSystem.requestTransit(id, 'enter');
        } else {
          this.dropOnEntrancePile(nest, carrying, type);
          ant.state = AntState.Searching;
          ant.stateTimer = 0;
          this.clearPath(id);
        }
      } else {
        this.setSurfacePathToNest(id, pos, nestPos);
      }
      return;
    }

    // Underground — AntAISystem skips this layer, so the porter ticks its own timer
    ant.stateTimer += dt;

    // Still walking the route to its pile: the deposit tile is re-picked on arrival
    // (searching the pantry every tick per porter was a hot spot with many loads below)
    const route = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (route && route.currentIndex < route.waypoints.length) return;

    const target = this.grid.findDepositTile(type, pos.x, pos.y);
    if (!target) {
      // Pantry is FULL: a worker keeps the load and waits for room in the
      // storage area (see WaitingForPantry in the class comment). A stand-in
      // soldier or scout rides up still Hauling and puts the load back on the
      // entrance pile (surface branch): it has its own job to get back to.
      this.notifyPantryFull();
      this.clearPath(id);
      if (ant.role === AntRole.Worker) {
        ant.state = AntState.WaitingForPantry;
        ant.stateTimer = 0;
      } else {
        this.transitSystem.requestTransit(id, 'exit');
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

  /**
   * Wait in the storage area with the load until a pile of its type has room,
   * then deposit it (Hauling). A load eaten while waiting ends the wait.
   */
  private handleWaiting(id: number, ant: AntComponent, nest: NestComponent, dt: number): void {
    if (this.transitSystem.isInTransit(id)) return;
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING)!;

    if (carrying.amount <= 1e-6) {
      // It ate the whole load while waiting: nothing left to store
      carrying.amount = 0;
      carrying.resourceType = null;
      this.finishTrip(id, ant, nest, layer);
      return;
    }
    const type = this.asPantryType(carrying.resourceType);
    if (type === null) return; // ore: sendOreUp took it

    if (layer.layer === Layer.Surface) {
      // Brought up by something else: walk back to the nest and ride down
      ant.state = AntState.Hauling;
      ant.stateTimer = 0;
      return;
    }

    ant.stateTimer += dt;
    if (this.grid.findDepositTile(type, pos.x, pos.y)) {
      // Room at last (eaten, spent on an egg, merged, or new Almacén): deposit
      ant.state = AntState.Hauling;
      ant.stateTimer = 0;
      this.clearPath(id);
      return;
    }

    const spot = this.waitSpot(id);
    if (spot && Math.hypot(spot.x - pos.x, spot.y - pos.y) > 0.4) {
      this.setUndergroundPath(id, pos, spot.x, spot.y);
    }
  }

  /**
   * Where a worker waits for room: on one of the pantry tiles, spread by id so
   * a crowd does not stack on one tile, never at the foot of the shaft.
   */
  private waitSpot(id: number): { x: number; y: number } | null {
    const tiles = this.grid.getPantryTiles();
    if (tiles.length === 0) return null;
    const tile = tiles[id % tiles.length];
    const jitterX = ((id * 7) % 5 - 2) * 0.12;
    const jitterY = ((id * 3) % 5 - 2) * 0.12;
    return { x: tile.x + 0.5 + jitterX, y: tile.y + 0.5 + jitterY };
  }

  /** Load delivered — loop for more if there's work, otherwise back to the surface to forage */
  private finishTrip(id: number, ant: AntComponent, nest: NestComponent, layer: LayerComponent): void {
    ant.stateTimer = 0;
    // A nurse that fetched loose meat goes back to the brood, below
    if (this.nurseScavengers.delete(id)) {
      ant.state = AntState.Idle;
      return;
    }
    // A stand-in loops only while the colony still needs it
    const loop = this.standIns.has(id) ? this.standInsWanted : true;
    if (!loop) this.standIns.delete(id);
    if (loop && this.hasHaulableFood(nest)) {
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

  /** Leave a typed load on the entrance pile: porters carry it down once the pantry has room. */
  private dropOnEntrancePile(nest: NestComponent, carrying: CarryingComponent, type: PantryFoodType): void {
    nest.foodStored += carrying.amount;
    if (type === 'mushroom') nest.mushroomStored += carrying.amount;
    else if (type === 'meat') nest.meatStored += carrying.amount;
    carrying.amount = 0;
    carrying.resourceType = null;
  }

  /**
   * Porter loads are pantry-typed; anything unknown defaults defensively to
   * leaf. Ore is the exception: it is not food and has no pantry type (null).
   */
  private asPantryType(resourceType: string | null): PantryFoodType | null {
    if (isOreLoad(resourceType)) return null;
    return resourceType === 'mushroom' || resourceType === 'meat' ? resourceType : 'leaf';
  }

  /**
   * A worker below ground with ore in its jaws (an excavation or a haul
   * caught it loaded) rides back up and walks it to the minerals bank at the
   * entrance (AntAISystem's ReturningHome). Returns true when it took the ant.
   */
  private sendOreUp(id: number, ant: AntComponent): boolean {
    const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
    if (!carrying || carrying.amount <= 0 || !isOreLoad(carrying.resourceType)) return false;
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    if (!layer || layer.layer !== Layer.Underground) {
      // Already on the surface: hand it back to AntAISystem to bank the ore
      if (ant.state === AntState.Hauling) {
        ant.state = AntState.ReturningHome;
        ant.stateTimer = 0;
        this.clearPath(id);
        return true;
      }
      return false;
    }
    if (this.transitSystem.isInTransit(id)) return true;
    ant.state = AntState.ReturningHome;
    ant.stateTimer = 0;
    this.clearPath(id);
    this.transitSystem.requestTransit(id, 'exit');
    return true;
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
    this.world.pushNotification('warning', '🍖 ¡Despensa llena! Las obreras esperan con la comida: marca más casillas de Almacén en el nido');
  }
}

/**
 * Most porters at once: the base ceiling plus the queen's upgrade, and one
 * more for every PORTER_PILE_PER_EXTRA food waiting on the entrance pile.
 */
/** Entrance pile from which soldiers, scouts and nurses help the workers carry it down */
const STAND_IN_PILE = 150;
/** Workers at or below this count trigger the "pocas obreras" warning */
const FEW_WORKERS = 2;
/** Game seconds a pile may wait with nobody hauling before the player is told */
const UNATTENDED_PILE_SECONDS = 10;

export function porterCeiling(entrancePile: number, upgradeBonus: number): number {
  return PORTER_MAX_COUNT + upgradeBonus + Math.floor(Math.max(0, entrancePile) / PORTER_PILE_PER_EXTRA);
}
