import type { System } from '../../../engine/ecs/types';
import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import { findPath, type PathGrid } from '../../../simulation/pathfinding/AStar';
import {
  BeetleState,
  COMPONENT,
  type BeetleComponent,
  type CombatComponent,
  type HealthComponent,
  type PathComponent,
} from '../../components/components';
import { createBeetle } from '../../entities/factories';
import { emitAudio } from '../../../audio/events';
import { waveComposition, YOUNG_BEETLE_SCALE, type WaveComposition } from '../../run/waveComposition';
import { isBossNight, type InvasionInfo, type RaidSource, type WaveBanner, type WaveBannerKind, type WaveThreat } from '../../systems/UndergroundInvasionSystem';
import type { DayPhase } from '../../systems/DayNightSystem';
import { BEETLE_STATS, INVASION_ARM_LEAD, ORDER_PATH_MAX_STEPS, WAVE_BANNER_SECONDS, WAVE_WARNING_LEAD } from '../../../shared/constants';
import { HUMAN_BUILDING_STATS } from '../../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent } from '../../rival/humanComponents';
import { HUMAN_PLAYER_COMPONENT } from './humanPlayerComponents';
import { playerBuildings, playerUnits, positionOf } from './humanPlayerQueries';

/** What the run's wave director offers GameManager, whichever race the player is. */
export interface WaveDirector extends System {
  getInfo(): InvasionInfo;
  setRaidSource(source: RaidSource | null): void;
  setGarrison(count: number): void;
  getGarrison(): number;
}

/** The day/night clock the waves read (DayNightSystem, or a test clock). */
export interface WaveClock {
  getPhase(): DayPhase;
  getDayNumber(): number;
  getPhaseRemaining(): number;
  getSecondsUntilNightfall(): number;
}

type InvaderKind = 'young' | 'adult';

/** Seconds between two steering passes over the wave's beetles */
const DRIVE_INTERVAL = 0.5;
/** A wave beetle turns on a Human unit or building this close instead of marching on */
const AGGRO_RADIUS = 5;
/** Spawn points sit this many tiles inside the map edge */
const EDGE_INSET = 3;
/** Rays tried from the command center when picking where a wave comes from */
const SPAWN_RAYS = 16;

/**
 * Night waves for a Human player. There is no nest to break into, so every
 * wave comes over the surface: beetles (waveComposition's mix) walk in from a
 * spot at the edge of the map and march on the command center, hitting any
 * Human unit or building in their way, while the rival's base (RaidSource)
 * sends its own share. Same rhythm as the Swarm's waves: armed late in the
 * day, a warning banner half a minute out, the attack at nightfall, the
 * boss on the last night. These beetles are steered here, not by BeetleAI.
 */
export class HumanWaveSystem implements WaveDirector {
  readonly name = 'HumanWaveSystem';
  readonly priority = 6.5; // after the unit AIs (6), before Combat (7)

  private world: World;
  private grid: PathGrid & { width: number; height: number };
  private clock: WaveClock;
  private core: () => EntityId | null;
  private raidSource: RaidSource | null = null;

  private waveNumber = 0;
  private active = false;
  private armed = false;
  private warned = false;
  private prevPhase: DayPhase;
  private invaders = new Set<EntityId>();
  private pending: InvaderKind[] = [];
  private spawnTimer = 0;
  private spawnInterval = 1.2;
  private statScale = 1;
  private waveSize = 0;
  private banner: WaveBanner | null = null;
  private bannerTimer = 0;
  private nextBannerId = 1;
  private driveTimer = 0;
  private spawnPoint: Vector2 | null = null;

  constructor(world: World, grid: PathGrid & { width: number; height: number }, clock: WaveClock, core: () => EntityId | null) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.core = core;
    this.prevPhase = 'day';
  }

  setRaidSource(source: RaidSource | null): void {
    this.raidSource = source;
  }

  /** The Swarm's underground garrison: Humans have none */
  setGarrison(): void {}

  getGarrison(): number {
    return 0;
  }

  getInfo(): InvasionInfo {
    return {
      waveNumber: this.waveNumber,
      nextWaveIn: this.active ? 0 : this.clock.getSecondsUntilNightfall(),
      active: this.active,
      invadersAlive: this.invaders.size,
      armed: this.armed,
      waveSize: this.active ? this.waveSize : this.nextComposition().total,
      remaining: this.active ? this.invaders.size + this.pending.length : 0,
      banner: this.banner ? { ...this.banner } : null,
      threats: this.threats(),
    };
  }

  private nextComposition(): WaveComposition {
    const base = waveComposition(this.waveNumber + 1, this.raidSource?.rival);
    const drones = this.raidSource ? base.drones : 0;
    return { ...base, drones, beetles: base.beetles + (base.drones - drones) };
  }

  private showBanner(kind: WaveBannerKind, wave: number, count: number): void {
    this.banner = { id: this.nextBannerId++, kind, wave, count };
    this.bannerTimer = WAVE_BANNER_SECONDS;
  }

  private threats(): WaveThreat[] {
    if (this.active) {
      let x = 0;
      let y = 0;
      let n = 0;
      for (const id of this.invaders) {
        const pos = positionOf(this.world, id);
        if (!pos) continue;
        x += pos.x;
        y += pos.y;
        n++;
      }
      if (n > 0) return [{ x: x / n, y: y / n, layer: 'surface' }];
      return this.spawnPoint && this.pending.length > 0 ? [{ ...this.spawnPoint, layer: 'surface' }] : [];
    }
    if (!this.warned) return [];
    const out: WaveThreat[] = [];
    if (this.spawnPoint) out.push({ x: this.spawnPoint.x, y: this.spawnPoint.y, layer: 'surface' });
    const origin = this.nextComposition().drones > 0 ? this.raidSource?.origin() ?? null : null;
    if (origin) out.push({ x: origin.x, y: origin.y, layer: 'surface' });
    return out;
  }

  update(dt: number): void {
    for (const id of [...this.invaders]) if (!this.world.hasEntity(id)) this.invaders.delete(id);

    if (this.pending.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spawnInterval;
        this.spawnInvader(this.pending.shift()!);
      }
    }

    if (this.banner && this.banner.kind !== 'warning') {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner = null;
    }

    const phase = this.clock.getPhase();
    const nightfall = phase === 'night' && this.prevPhase === 'day';
    this.prevPhase = phase;

    if (this.active && this.pending.length === 0 && this.invaders.size === 0) {
      this.active = false;
      this.armed = false;
      this.world.metrics.wavesRepelled++;
      this.showBanner('cleared', this.waveNumber, this.waveSize);
      this.world.pushNotification('success', `🛡️ ¡Oleada ${this.waveNumber} superada!`);
    }

    if (phase === 'day' && !this.active && !this.armed && this.clock.getPhaseRemaining() <= INVASION_ARM_LEAD) {
      this.armed = true;
      const count = this.nextComposition().total;
      this.world.pushNotification('warning', `🪲 Algo se mueve en la maleza: la oleada ${this.waveNumber + 1} (${count} enemigos) llegará al anochecer`);
    }
    if (phase === 'day' && !this.active && !this.warned && this.clock.getPhaseRemaining() <= WAVE_WARNING_LEAD) {
      this.warned = true;
      this.spawnPoint = this.pickSpawnPoint();
      const count = this.nextComposition().total;
      this.showBanner('warning', this.waveNumber + 1, count);
      this.world.pushNotification('danger', `⚠️ ¡Oleada ${this.waveNumber + 1} en ${WAVE_WARNING_LEAD} s! ${count} enemigos vienen hacia tu Centro de Mando`);
    }

    if (nightfall) this.launchWave();
    if (nightfall && isBossNight(this.clock.getDayNumber())) this.launchBoss();

    this.driveTimer -= dt;
    if (this.driveTimer <= 0) {
      this.driveTimer = DRIVE_INTERVAL;
      this.driveInvaders();
    }
  }

  /** A walkable spot near the map edge that a beetle can walk from to the command center */
  private pickSpawnPoint(): Vector2 | null {
    const core = this.core();
    const at = core !== null ? positionOf(this.world, core) : null;
    if (!at) return null;
    const from = { x: Math.round(at.x), y: Math.round(at.y) };
    const options: Vector2[] = [];
    for (let i = 0; i < SPAWN_RAYS; i++) {
      const angle = (i / SPAWN_RAYS) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      // Distance to the inset border along this ray
      const tx = dx > 0 ? (this.grid.width - 1 - EDGE_INSET - from.x) / dx : dx < 0 ? (EDGE_INSET - from.x) / dx : Infinity;
      const ty = dy > 0 ? (this.grid.height - 1 - EDGE_INSET - from.y) / dy : dy < 0 ? (EDGE_INSET - from.y) / dy : Infinity;
      const reach = Math.min(tx, ty);
      for (let d = reach; d > reach * 0.6; d -= 1) {
        const x = Math.round(from.x + dx * d);
        const y = Math.round(from.y + dy * d);
        if (!this.grid.isWalkable(x, y)) continue;
        options.push({ x, y });
        break;
      }
    }
    // A different side every wave, and only from where the base can be reached
    for (let k = 0; k < options.length; k++) {
      const pick = options[(this.waveNumber * 7 + k * 5) % options.length];
      if (findPath(this.grid, pick, from, ORDER_PATH_MAX_STEPS)) return pick;
    }
    return options[0] ?? null;
  }

  private launchWave(): void {
    emitAudio({ type: 'wave' });
    const wave = this.nextComposition();
    this.waveNumber++;
    this.active = true;
    this.armed = false;
    this.warned = false;
    this.statScale = wave.statScale;
    if (!this.spawnPoint) this.spawnPoint = this.pickSpawnPoint();

    const raiders = wave.drones > 0 && this.raidSource ? this.raidSource.launch(wave.drones) : [];
    for (const id of raiders) {
      this.scaleUnit(id, wave.statScale, wave.statScale);
      this.invaders.add(id);
    }
    const beetles = wave.beetles + (wave.drones - raiders.length);
    this.pending = [...Array<InvaderKind>(wave.youngBeetles).fill('young'), ...Array<InvaderKind>(beetles).fill('adult')];
    this.waveSize = this.pending.length + raiders.length;
    this.spawnInterval = Math.min(1.2, 15 / Math.max(1, this.pending.length));
    if (this.pending.length > 0) this.spawnInvader(this.pending.shift()!);
    this.spawnTimer = this.spawnInterval;

    this.showBanner('arrival', this.waveNumber, this.waveSize);
    const rivals = raiders.length > 0 ? ` y ${raiders.length} ${this.raidSource?.unitLabel?.(raiders.length) ?? 'drones de cristal'}` : '';
    this.world.pushNotification('danger', `🪲 ¡OLEADA ${this.waveNumber} · ${this.waveSize} enemigos! Acorazados${rivals} van hacia tu Centro de Mando`);
  }

  private launchBoss(): void {
    const boss = this.raidSource?.launchBoss?.() ?? null;
    if (boss === null) return;
    this.invaders.add(boss);
    this.active = true;
    this.waveSize++;
    this.showBanner('arrival', this.waveNumber, this.waveSize);
    this.banner!.boss = true;
    this.bannerTimer = WAVE_BANNER_SECONDS + 3;
  }

  private spawnInvader(kind: InvaderKind): void {
    const at = this.spawnPoint ?? { x: 2, y: 2 };
    const id = createBeetle(this.world, at.x, at.y, null);
    this.world.addComponent(id, HUMAN_PLAYER_COMPONENT.WAVE_INVADER, {});
    const young = kind === 'young';
    this.scaleUnit(id, (young ? YOUNG_BEETLE_SCALE.health : 1) * this.statScale, (young ? YOUNG_BEETLE_SCALE.damage : 1) * this.statScale);
    this.invaders.add(id);
  }

  private scaleUnit(id: EntityId, health: number, damage: number): void {
    if (health === 1 && damage === 1) return;
    const hp = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (hp) {
      hp.max = Math.max(1, Math.round(hp.max * health));
      hp.current = hp.max;
      hp.damage = Math.max(1, Math.round(hp.damage * damage));
    }
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat) combat.attackDamage = Math.max(1, Math.round(combat.attackDamage * damage));
  }

  /** Wave beetles: hit the nearest Human unit or building in reach, else march on the command center */
  private driveInvaders(): void {
    if (this.invaders.size === 0) return;
    const marks: Array<{ id: EntityId; x: number; y: number; reach: number }> = [];
    for (const id of [...playerUnits(this.world), ...playerBuildings(this.world)]) {
      const p = positionOf(this.world, id)!;
      const building = this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING);
      marks.push({ id, x: p.x, y: p.y, reach: building ? HUMAN_BUILDING_STATS[building.kind].halfWidth : 0 });
    }
    if (marks.length === 0) return;
    const core = this.core();
    const coreMark = marks.find((m) => m.id === core) ?? marks.find((m) => m.reach > 0) ?? marks[0];
    for (const id of this.invaders) {
      if (!this.world.getComponent(id, HUMAN_PLAYER_COMPONENT.WAVE_INVADER)) continue; // the rival's raiders steer themselves
      const pos = positionOf(this.world, id);
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      const beetle = this.world.getComponent<BeetleComponent>(id, COMPONENT.BEETLE);
      if (!pos || !combat || !path) continue;
      let target = coreMark;
      let best = Infinity;
      for (const m of marks) {
        const d = Math.hypot(m.x - pos.x, m.y - pos.y) - m.reach;
        if (d < AGGRO_RADIUS && d < best) {
          best = d;
          target = m;
        }
      }
      const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
      if (beetle) {
        beetle.targetEntityId = target.id;
        beetle.state = dist < BEETLE_STATS.attackRange ? BeetleState.Attacking : BeetleState.ChasingAnt;
      }
      if (dist < BEETLE_STATS.attackRange) {
        combat.targetEntityId = target.id;
        path.waypoints = [];
        path.currentIndex = 0;
        continue;
      }
      combat.targetEntityId = null;
      const end = path.waypoints[path.waypoints.length - 1];
      const onCourse = path.currentIndex < path.waypoints.length && end !== undefined
        && Math.hypot(end.x - target.x, end.y - target.y) < 1.5;
      if (onCourse) continue;
      const route = findPath(this.grid, { x: Math.round(pos.x), y: Math.round(pos.y) }, { x: Math.round(target.x), y: Math.round(target.y) }, ORDER_PATH_MAX_STEPS);
      if (route && route.length > 0) {
        path.waypoints = route;
        path.currentIndex = 0;
      }
    }
  }
}
