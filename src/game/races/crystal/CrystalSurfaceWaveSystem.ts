import type { System } from '../../../engine/ecs/types';
import type { World } from '../../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../../shared/types';
import { findPath, type PathGrid } from '../../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
} from '../../components/components';
import { createBeetle } from '../../entities/factories';
import { FactionId, ownerOf } from '../../factions/factions';
import { emitAudio } from '../../../audio/events';
import { waveComposition, YOUNG_BEETLE_SCALE } from '../../run/waveComposition';
import type { InvasionInfo, RaidSource, WaveBanner, WaveBannerKind } from '../../systems/UndergroundInvasionSystem';
import type { DayPhase } from '../../systems/DayNightSystem';
import {
  INVASION_ARM_LEAD,
  INVASION_BOSS_NIGHT,
  ORDER_PATH_MAX_STEPS,
  WAVE_BANNER_SECONDS,
  WAVE_WARNING_LEAD,
} from '../../../shared/constants';
import { crystalWaveBeetles } from './crystalPlayerRules';
import { CRYSTAL_PLAYER_COMPONENT } from './crystalPlayerComponents';

/** What the waves read from the day/night cycle (DayNightSystem, or a test clock) */
export interface WaveClock {
  getPhase(): DayPhase;
  getDayNumber(): number;
  getPhaseRemaining(): number;
  getSecondsUntilNightfall(): number;
}

/** A raider fights a Crystal unit or structure this close instead of marching on */
const RAIDER_AGGRO = 5;
/** Seconds between two re-aims of the raiders */
const DRIVE_INTERVAL = 0.5;
/** Seconds between two beetles stepping onto the map */
const SPAWN_INTERVAL = 0.8;

type Kind = 'young' | 'adult';

/**
 * Night waves against a Crystal player (P10). There is no cave to breach:
 * every nightfall the wave's beetles walk in from a map edge and march on the
 * Hive across the surface, and the rival base (RaidSource) sends its troops or
 * drones at the Hive too. Raiders fight the Crystal units and structures they
 * meet on the way. Reports the same InvasionInfo the HUD reads for the Swarm.
 */
export class CrystalSurfaceWaveSystem implements System {
  readonly name = 'CrystalSurfaceWaveSystem';
  readonly priority = 8;

  private world: World;
  private grid: PathGrid;
  private clock: WaveClock;
  private raidSource: RaidSource | null = null;
  private prevPhase: DayPhase;
  private waveNumber = 0;
  private waveActive = false;
  private waveArmed = false;
  private warned = false;
  private waveSize = 0;
  private statScale = 1;
  private invaders = new Set<EntityId>();
  private pending: Kind[] = [];
  private spawnTimer = 0;
  private driveTimer = 0;
  private banner: WaveBanner | null = null;
  private bannerTimer = 0;
  private nextBannerId = 1;

  constructor(world: World, grid: PathGrid, clock: WaveClock) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.prevPhase = clock.getPhase();
  }

  setRaidSource(source: RaidSource | null): void {
    this.raidSource = source;
  }

  /** The mix of the next wave: the rival's raiders plus the (thinned) beetles */
  private nextWave(): { beetles: number; young: number; raiders: number; total: number; statScale: number } {
    const base = waveComposition(this.waveNumber + 1, this.raidSource?.rival ?? 'crystal');
    const raiders = this.raidSource ? base.drones : 0;
    const extra = Math.max(0, this.world.runModifiers.extraInvadersPerWave);
    const allBeetles = crystalWaveBeetles(base.youngBeetles + base.beetles + (base.drones - raiders) + extra);
    const young = Math.min(allBeetles, Math.round((allBeetles * base.youngBeetles) / Math.max(1, base.youngBeetles + base.beetles)));
    return { beetles: allBeetles - young, young, raiders, total: allBeetles + raiders, statScale: base.statScale };
  }

  getInfo(): InvasionInfo {
    return {
      waveNumber: this.waveNumber,
      nextWaveIn: this.waveActive ? 0 : this.clock.getSecondsUntilNightfall(),
      active: this.waveActive,
      invadersAlive: this.invaders.size,
      armed: this.waveArmed,
      waveSize: this.waveActive ? this.waveSize : this.nextWave().total,
      remaining: this.waveActive ? this.invaders.size + this.pending.length : 0,
      banner: this.banner ? { ...this.banner } : null,
      threats: this.threats(),
    };
  }

  update(dt: number): void {
    for (const id of [...this.invaders]) if (!this.world.hasEntity(id)) this.invaders.delete(id);

    if (this.pending.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        this.spawnBeetle(this.pending.shift()!);
      }
    }

    if (this.banner && this.banner.kind !== 'warning') {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner = null;
    }

    const phase = this.clock.getPhase();
    const nightfall = phase === 'night' && this.prevPhase === 'day';
    this.prevPhase = phase;

    if (this.waveActive && this.pending.length === 0 && this.invaders.size === 0) {
      this.waveActive = false;
      this.waveArmed = false;
      this.world.metrics.wavesRepelled++;
      this.showBanner('cleared', this.waveNumber, this.waveSize);
      this.world.pushNotification('success', `🛡️ ¡Oleada ${this.waveNumber} superada!`);
    }

    if (phase === 'day' && !this.waveActive && !this.waveArmed && this.clock.getPhaseRemaining() <= INVASION_ARM_LEAD) {
      this.waveArmed = true;
      this.world.pushNotification('warning', `🪲 Algo se mueve en los bordes del mapa: la oleada ${this.waveNumber + 1} (${this.nextWave().total} enemigos) atacará la colmena al anochecer`);
    }
    if (phase === 'day' && !this.waveActive && !this.warned && this.clock.getPhaseRemaining() <= WAVE_WARNING_LEAD) {
      this.warned = true;
      const count = this.nextWave().total;
      this.showBanner('warning', this.waveNumber + 1, count);
      this.world.pushNotification('danger', `⚠️ ¡Oleada ${this.waveNumber + 1} en ${WAVE_WARNING_LEAD} s! ${count} enemigos hacia la colmena`);
    }

    // A wave still marching never holds the next one back: the new one joins it
    if (nightfall) this.launchWave();
    if (nightfall && this.clock.getDayNumber() === INVASION_BOSS_NIGHT) this.launchBoss();

    this.driveTimer -= dt;
    if (this.driveTimer <= 0) {
      this.driveTimer = DRIVE_INTERVAL;
      this.driveRaiders();
    }
  }

  private showBanner(kind: WaveBannerKind, wave: number, count: number): void {
    this.banner = { id: this.nextBannerId++, kind, wave, count };
    this.bannerTimer = WAVE_BANNER_SECONDS;
  }

  private launchWave(): void {
    emitAudio({ type: 'wave' });
    const wave = this.nextWave();
    this.waveNumber++;
    this.waveActive = true;
    this.waveArmed = false;
    this.warned = false;
    this.statScale = wave.statScale;
    const raiders = wave.raiders > 0 && this.raidSource ? this.raidSource.launch(wave.raiders) : [];
    for (const id of raiders) {
      this.scale(id, wave.statScale, wave.statScale);
      this.invaders.add(id);
    }
    // Raiders the rival could not send come as beetles
    const beetles = wave.beetles + (wave.raiders - raiders.length);
    this.pending.push(...Array<Kind>(wave.young).fill('young'), ...Array<Kind>(beetles).fill('adult'));
    this.waveSize = wave.young + beetles + raiders.length;
    if (this.pending.length > 0) this.spawnBeetle(this.pending.shift()!);
    this.spawnTimer = SPAWN_INTERVAL;
    this.showBanner('arrival', this.waveNumber, this.waveSize);
    const side = this.edgeLabel(this.edgeOf(this.waveNumber));
    const rival = raiders.length > 0 ? ` y ${raiders.length} ${this.raidSource?.unitLabel?.(raiders.length) ?? 'drones de cristal'} desde su base` : '';
    this.world.pushNotification('danger', `🪲 ¡OLEADA ${this.waveNumber} · ${this.waveSize} enemigos! Acorazados desde el ${side}${rival}, hacia tu colmena`);
  }

  private launchBoss(): void {
    const boss = this.raidSource?.launchBoss?.() ?? null;
    if (boss === null) return;
    this.invaders.add(boss);
    this.waveActive = true;
    this.waveSize++;
    this.showBanner('arrival', this.waveNumber, this.waveSize);
    this.banner!.boss = true;
    this.bannerTimer = WAVE_BANNER_SECONDS + 3;
  }

  /** The four map edges, by the corridors the map keeps open from the center */
  private edgeOf(wave: number): Vector2 {
    const cx = Math.floor(this.grid.width / 2);
    const cy = Math.floor(this.grid.height / 2);
    const edges: Vector2[] = [
      { x: this.grid.width - 2, y: cy },
      { x: 1, y: cy },
      { x: cx, y: this.grid.height - 2 },
      { x: cx, y: 1 },
    ];
    const start = (wave - 1) % edges.length;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[(start + i) % edges.length];
      if (this.grid.isWalkable(edge.x, edge.y)) return edge;
    }
    return edges[start];
  }

  private edgeLabel(edge: Vector2): string {
    if (edge.x <= 1) return 'oeste';
    if (edge.x >= this.grid.width - 2) return 'este';
    return edge.y <= 1 ? 'norte' : 'sur';
  }

  private spawnBeetle(kind: Kind): void {
    const edge = this.edgeOf(this.waveNumber);
    const id = createBeetle(this.world, edge.x, edge.y, null);
    this.world.addComponent(id, CRYSTAL_PLAYER_COMPONENT.SURFACE_RAIDER, { wave: this.waveNumber });
    const young = kind === 'young';
    this.scale(id, (young ? YOUNG_BEETLE_SCALE.health : 1) * this.statScale, (young ? YOUNG_BEETLE_SCALE.damage : 1) * this.statScale);
    this.invaders.add(id);
  }

  private scale(id: EntityId, health: number, damage: number): void {
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

  /** The player's Crystal units and structures on the surface, for the raiders to bite */
  private crystalTargets(): Array<{ id: EntityId; x: number; y: number }> {
    const out: Array<{ id: EntityId; x: number; y: number }> = [];
    for (const store of [COMPONENT.CRYSTAL_UNIT, COMPONENT.CRYSTAL_SPIRE, COMPONENT.CRYSTAL_HIVE]) {
      for (const id of this.world.query(store, COMPONENT.POSITION)) {
        if (ownerOf(this.world, id) !== FactionId.PLAYER) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        out.push({ id, x: pos.x, y: pos.y });
      }
    }
    return out;
  }

  /** Every wave beetle on the map: fight what is close, else march on the Hive */
  private driveRaiders(): void {
    const raiders = this.world.query(CRYSTAL_PLAYER_COMPONENT.SURFACE_RAIDER, COMPONENT.POSITION, COMPONENT.PATH);
    if (raiders.length === 0) return;
    const hive = this.world.factions.get(FactionId.PLAYER)?.coreId;
    const hivePos = hive !== undefined && this.world.hasEntity(hive)
      ? this.world.getComponent<PositionComponent>(hive, COMPONENT.POSITION) ?? null
      : null;
    const targets = this.crystalTargets();
    for (const id of raiders) {
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      let target: { id: EntityId; x: number; y: number } | null = null;
      let best = RAIDER_AGGRO;
      for (const t of targets) {
        const d = Math.hypot(t.x - pos.x, t.y - pos.y);
        if (d < best) {
          best = d;
          target = t;
        }
      }
      if (!target && hive !== undefined && hivePos) target = { id: hive, x: hivePos.x, y: hivePos.y };
      if (!target) {
        if (combat) combat.targetEntityId = null;
        continue;
      }
      const changed = combat?.targetEntityId !== target.id;
      if (combat) combat.targetEntityId = target.id;
      const dist = Math.hypot(target.x - pos.x, target.y - pos.y);
      if (dist <= (combat?.attackRange ?? 1.2)) {
        path.waypoints = [];
        path.currentIndex = 0;
        continue;
      }
      const routeDone = path.currentIndex >= path.waypoints.length;
      if (!routeDone && !changed && target.id === hive) continue;
      const route = findPath(this.grid, { x: Math.round(pos.x), y: Math.round(pos.y) }, { x: Math.round(target.x), y: Math.round(target.y) }, ORDER_PATH_MAX_STEPS);
      if (route && route.length > 0) {
        path.waypoints = route;
        path.currentIndex = route.length > 1 ? 1 : 0;
      }
    }
  }

  private threats(): InvasionInfo['threats'] {
    if (this.waveActive) {
      let x = 0;
      let y = 0;
      let n = 0;
      for (const id of this.invaders) {
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
        if (layer && layer.layer !== Layer.Surface) continue;
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
        if (!pos) continue;
        x += pos.x;
        y += pos.y;
        n++;
      }
      if (n > 0) return [{ x: x / n, y: y / n, layer: 'surface' }];
      if (this.pending.length > 0) {
        const edge = this.edgeOf(this.waveNumber);
        return [{ x: edge.x, y: edge.y, layer: 'surface' }];
      }
      return [];
    }
    if (!this.warned) return [];
    const out: InvasionInfo['threats'] = [];
    const edge = this.edgeOf(this.waveNumber + 1);
    out.push({ x: edge.x, y: edge.y, layer: 'surface' });
    const origin = this.nextWave().raiders > 0 ? this.raidSource?.origin() ?? null : null;
    if (origin) out.push({ x: origin.x, y: origin.y, layer: 'surface' });
    return out;
  }
}
