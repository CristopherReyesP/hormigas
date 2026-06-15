import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { TransitSystem } from './TransitSystem';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  AntRole,
  AntState,
  Layer,
  type AntComponent,
  type PositionComponent,
  type PathComponent,
  type CombatComponent,
  type LayerComponent,
  type CarryingComponent,
} from '../components/components';
import { createBeetle } from '../entities/factories';
import {
  UNDERGROUND_WIDTH,
  INVASION_FIRST_WAVE_TIME,
  INVASION_WAVE_INTERVAL,
  INVASION_MAX_INVADERS,
  INVASION_SOLDIER_RESPONDERS,
  INVASION_CIVILIAN_ATTACK_DAMAGE,
  NURSE_DEFENSE_RADIUS,
} from '../../shared/constants';

export interface InvasionInfo {
  waveNumber: number;
  nextWaveIn: number; // seconds (0 while a wave is active)
  active: boolean;
  invadersAlive: number;
}

/**
 * Survival waves: predators periodically break into the nest through the
 * entrance tunnel and march on the queen. Soldiers are auto-deployed to defend.
 */
export class UndergroundInvasionSystem implements System {
  readonly name = 'UndergroundInvasionSystem';
  readonly priority = 8;

  private world: World;
  private grid: UndergroundGrid;
  private transitSystem: TransitSystem;

  private waveTimer = INVASION_FIRST_WAVE_TIME;
  private waveNumber = 0;
  private waveActive = false;
  private invaders = new Set<EntityId>();
  private repathTimer = 0;
  /** Invaders enter one by one (staged break-in, not a teleported blob) */
  private pendingSpawns = 0;
  private spawnTimer = 0;
  /** Soldiers the player wants permanently stationed underground */
  private garrisonTarget = 0;
  /** Non-soldier ants drafted into total defense while a wave is inside the nest */
  private drafted = new Set<EntityId>();

  setGarrison(count: number): void {
    this.garrisonTarget = Math.max(0, Math.min(8, Math.floor(count)));
  }

  getGarrison(): number {
    return this.garrisonTarget;
  }

  constructor(world: World, grid: UndergroundGrid, transitSystem: TransitSystem) {
    this.world = world;
    this.grid = grid;
    this.transitSystem = transitSystem;
  }

  getInfo(): InvasionInfo {
    return {
      waveNumber: this.waveNumber,
      nextWaveIn: this.waveActive ? 0 : Math.max(0, this.waveTimer),
      active: this.waveActive,
      invadersAlive: this.invaders.size,
    };
  }

  update(dt: number): void {
    // Prune dead invaders and dead draftees
    for (const id of [...this.invaders]) {
      if (!this.world.hasEntity(id)) this.invaders.delete(id);
    }
    for (const id of [...this.drafted]) {
      if (!this.world.hasEntity(id)) this.drafted.delete(id);
    }

    // Staged entry: one invader breaks in every 1.2s
    if (this.pendingSpawns > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 1.2;
        this.spawnInvader();
        this.pendingSpawns--;
      }
    }

    // Wave repelled?
    if (this.waveActive && this.pendingSpawns === 0 && this.invaders.size === 0) {
      this.waveActive = false;
      this.waveTimer = INVASION_WAVE_INTERVAL;
      this.restoreDrafted();
      this.world.metrics.wavesRepelled++;
      this.world.pushNotification('success', `🛡️ ¡Oleada ${this.waveNumber} repelida!`);
    }

    // Countdown to next wave (paused while one is active)
    if (!this.waveActive) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.launchWave();
    }

    // Drive invaders and defenders (throttled — pathfinding is not free)
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = 0.8;
      this.maintainGarrison();
      this.driveInvaders();
      this.driveDefenders();
    }
  }

  private spawnInvader(): void {
    const entranceX = Math.floor(UNDERGROUND_WIDTH / 2) + 0.5;
    const id = createBeetle(this.world, entranceX, 1.5, null);
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    if (layer) layer.layer = Layer.Underground;
    this.invaders.add(id);
  }

  /** Keep the requested number of soldiers stationed underground */
  private maintainGarrison(): void {
    if (this.garrisonTarget === 0) return;

    let underground = 0;
    let incoming = 0;
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.LAYER);
    const candidates: EntityId[] = [];

    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Soldier) continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;

      if (layer.layer === Layer.Underground) {
        underground++;
      } else if (this.transitSystem.isInTransit(id)) {
        incoming++;
      } else if (
        ant.commandTargetId === null &&
        (ant.state === AntState.Idle || ant.state === AntState.Searching || ant.state === AntState.PatrollingNest)
      ) {
        candidates.push(id);
      }
    }

    let deficit = this.garrisonTarget - underground - incoming;
    for (const id of candidates) {
      if (deficit <= 0) break;
      this.transitSystem.requestTransit(id, 'enter');
      deficit--;
    }
  }

  private launchWave(): void {
    this.waveNumber++;
    this.waveActive = true;

    const count = Math.min(1 + Math.floor((this.waveNumber - 1) / 2), INVASION_MAX_INVADERS);
    // First invader enters immediately, the rest break in one by one
    this.spawnInvader();
    this.pendingSpawns = count - 1;
    this.spawnTimer = 1.2;

    this.world.pushNotification(
      'danger',
      `🪲 ¡OLEADA ${this.waveNumber}! ${count > 1 ? `${count} escarabajos están entrando` : 'Un escarabajo entró'} al hormiguero`
    );

    this.deploySoldiers(Math.max(count + 1, 3));
  }

  /** Auto-deploy available surface soldiers to defend the queen */
  private deploySoldiers(needed: number): void {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.LAYER);
    let sent = 0;

    for (const id of ants) {
      if (sent >= Math.min(needed, INVASION_SOLDIER_RESPONDERS)) break;
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Soldier || ant.commandTargetId !== null) continue;

      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Surface) continue;
      if (this.transitSystem.isInTransit(id)) continue;

      if (
        ant.state === AntState.Idle ||
        ant.state === AntState.Searching ||
        ant.state === AntState.PatrollingNest
      ) {
        this.transitSystem.requestTransit(id, 'enter');
        sent++;
      }
    }

    if (sent > 0) {
      this.world.pushNotification('info', `🛡️ ${sent} soldados bajan a defender a la reina`);
    } else {
      this.world.pushNotification('warning', '⚠️ ¡No hay soldados disponibles para defender el hormiguero!');
    }
  }

  private driveInvaders(): void {
    if (this.invaders.size === 0) return;

    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION);
    const queenId = queens.length > 0 ? queens[0] : null;
    const queenPos = queenId !== null
      ? this.world.getComponent<PositionComponent>(queenId, COMPONENT.POSITION)!
      : null;

    // Underground ants are valid targets when they block the way
    const ugAnts: Array<{ id: EntityId; pos: PositionComponent }> = [];
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER);
    for (const id of ants) {
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;
      ugAnts.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
    }

    for (const invaderId of this.invaders) {
      const pos = this.world.getComponent<PositionComponent>(invaderId, COMPONENT.POSITION);
      const combat = this.world.getComponent<CombatComponent>(invaderId, COMPONENT.COMBAT);
      const path = this.world.getComponent<PathComponent>(invaderId, COMPONENT.PATH);
      if (!pos || !combat || !path) continue;

      // Fight any ant nearby, otherwise march on the queen
      let target: { id: EntityId; x: number; y: number } | null = null;
      let bestDist = 3.5;
      for (const a of ugAnts) {
        const d = Math.hypot(a.pos.x - pos.x, a.pos.y - pos.y);
        if (d < bestDist) {
          bestDist = d;
          target = { id: a.id, x: a.pos.x, y: a.pos.y };
        }
      }
      if (!target && queenId !== null && queenPos) {
        target = { id: queenId, x: queenPos.x, y: queenPos.y };
      }
      if (!target) continue;

      combat.targetEntityId = target.id;

      if (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) {
        const route = this.grid.findPath(pos.x, pos.y, target.x, target.y);
        if (route && route.length > 0) {
          path.waypoints = route;
          path.currentIndex = 0;
        }
      }
    }
  }

  private driveDefenders(): void {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER);

    // Underground soldiers, ordered by id — the first garrisonTarget hold their post.
    // Everyone else underground (workers, nurses, porters mid-haul) is a civilian
    // draftee: while invaders are inside, the whole nest fights.
    const ugSoldiers: EntityId[] = [];
    const ugCivilians: EntityId[] = [];
    for (const id of ants) {
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;
      if (layer.layer !== Layer.Underground) continue;
      if (this.transitSystem.isInTransit(id)) continue;
      if (ant.role === AntRole.Defender) continue; // DefenderAISystem drives them — area-bound sentinels
      if (ant.role === AntRole.Soldier) ugSoldiers.push(id);
      else ugCivilians.push(id);
    }
    ugSoldiers.sort((a, b) => a - b);

    this.driveCivilians(ugCivilians);

    const queens = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION);
    const queenPos = queens.length > 0
      ? this.world.getComponent<PositionComponent>(queens[0], COMPONENT.POSITION)!
      : null;

    for (let i = 0; i < ugSoldiers.length; i++) {
      const id = ugSoldiers[i];
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);

      if (this.invaders.size === 0) {
        if (combat) combat.targetEntityId = null;

        if (i < this.garrisonTarget) {
          // Garrisoned: hold a ring post around the queen
          if (queenPos && path) {
            const angle = ((id % 8) / 8) * Math.PI * 2;
            const postX = queenPos.x + Math.cos(angle) * 2.2;
            const postY = queenPos.y + Math.sin(angle) * 2.2;
            if (Math.hypot(postX - pos.x, postY - pos.y) > 1.2 &&
                (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length)) {
              const route = this.grid.findPath(pos.x, pos.y, postX, postY);
              if (route && route.length > 0) {
                path.waypoints = route;
                path.currentIndex = 0;
              }
            }
          }
        } else {
          // Beyond garrison — back to the surface
          this.transitSystem.requestTransit(id, 'exit');
        }
        continue;
      }

      // Hunt the nearest invader
      const prey = this.findNearestInvader(pos);
      if (!prey) continue;

      if (combat) {
        combat.targetEntityId = prey.id;
      } else {
        // Surface soldiers get COMBAT lazily via AntAISystem — give it here if missing
        const health = this.world.getComponent<{ damage: number }>(id, COMPONENT.HEALTH);
        this.world.addComponent<CombatComponent>(id, COMPONENT.COMBAT, {
          attackDamage: health ? health.damage : 8,
          attackRange: 1.2,
          attackCooldown: 1.0,
          attackTimer: 0,
          targetEntityId: prey.id,
        });
      }

      if (path && (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) && prey.dist > 1.0) {
        const route = this.grid.findPath(pos.x, pos.y, prey.pos.x, prey.pos.y);
        if (route && route.length > 0) {
          path.waypoints = route;
          path.currentIndex = 0;
        }
      }
    }
  }

  /** Nearest living invader to a given position */
  private findNearestInvader(pos: PositionComponent): { id: EntityId; pos: PositionComponent; dist: number } | null {
    let nearest: { id: EntityId; pos: PositionComponent; dist: number } | null = null;
    for (const invaderId of this.invaders) {
      const ipos = this.world.getComponent<PositionComponent>(invaderId, COMPONENT.POSITION);
      if (!ipos) continue;
      const d = Math.hypot(ipos.x - pos.x, ipos.y - pos.y);
      if (!nearest || d < nearest.dist) {
        nearest = { id: invaderId, pos: ipos, dist: d };
      }
    }
    return nearest;
  }

  /**
   * TOTAL DEFENSE: invaders target any underground ant, so every non-soldier
   * down here fights back — there is no fleeing inside the nest. Draftees are
   * re-targeted each tick like soldiers and restored when the wave is over.
   */
  private driveCivilians(ugCivilians: EntityId[]): void {
    if (this.invaders.size === 0) {
      // Mid-wave lull (staged spawns) or wave just ended — release the draft;
      // the wave-cleared branch also restores, this covers the gaps between spawns
      if (this.drafted.size > 0) this.restoreDrafted();
      return;
    }

    for (const id of ugCivilians) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const prey = this.findNearestInvader(pos);
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;

      // Nurses guard in place: they never abandon the queen/eggs to chase
      // across the nest — they only bite invaders that come to THEM
      if (ant.role === AntRole.Nurse && (!prey || prey.dist > NURSE_DEFENSE_RADIUS)) {
        if (this.drafted.has(id) && ant.state === AntState.AttackingEnemy) {
          // Threat moved away — release the nurse back to her duties mid-wave
          const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
          if (combat) combat.targetEntityId = null;
          ant.state = AntState.Idle;
          ant.stateTimer = 0;
          const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
          if (path) {
            path.waypoints = [];
            path.currentIndex = 0;
          }
          this.drafted.delete(id);
        }
        continue;
      }
      if (!prey) continue;

      if (ant.state !== AntState.AttackingEnemy) {
        // Fresh draft — abandon the current task cleanly. A nurse mid-egg-carry
        // must drop its claim (commandTargetId is the egg) or the egg leaks.
        ant.state = AntState.AttackingEnemy;
        ant.stateTimer = 0;
        ant.commandTargetId = null;
        ant.eggTargetTile = null;
        const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
        if (path) {
          path.waypoints = [];
          path.currentIndex = 0;
        }
      }
      this.drafted.add(id);

      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      if (combat) {
        combat.targetEntityId = prey.id;
      } else {
        // Civilians bite weaker than soldiers but a swarm still matters
        const health = this.world.getComponent<{ damage: number }>(id, COMPONENT.HEALTH);
        this.world.addComponent<CombatComponent>(id, COMPONENT.COMBAT, {
          attackDamage: Math.max(health ? health.damage : 0, INVASION_CIVILIAN_ATTACK_DAMAGE),
          attackRange: 1.2,
          attackCooldown: 1.0,
          attackTimer: 0,
          targetEntityId: prey.id,
        });
      }

      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      if (path && (path.waypoints.length === 0 || path.currentIndex >= path.waypoints.length) && prey.dist > 1.0) {
        const route = this.grid.findPath(pos.x, pos.y, prey.pos.x, prey.pos.y);
        if (route && route.length > 0) {
          path.waypoints = route;
          path.currentIndex = 0;
        }
      }
    }
  }

  /** Wave over — every surviving draftee goes back to its normal duties */
  private restoreDrafted(): void {
    for (const id of this.drafted) {
      if (!this.world.hasEntity(id)) continue;
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT);
      // Only restore ants still in draft state — anything re-tasked is left alone
      if (!ant || ant.state !== AntState.AttackingEnemy) continue;

      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      if (combat) combat.targetEntityId = null;

      const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
      if (ant.role === AntRole.Worker && carrying && carrying.amount > 0) {
        // Interrupted porter — resume the haul; PorterSystem re-queries the
        // deposit tile every leg, so it self-recovers from wherever it stands
        ant.state = AntState.Hauling;
      } else {
        // Idle hands get re-tasked by NurseAISystem / ExcavationSystem / PorterSystem
        ant.state = AntState.Idle;
      }
      ant.stateTimer = 0;

      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      if (path) {
        path.waypoints = [];
        path.currentIndex = 0;
      }
    }
    this.drafted.clear();
  }
}
