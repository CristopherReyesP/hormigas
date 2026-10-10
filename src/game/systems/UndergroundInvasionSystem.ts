import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import type { TransitSystem } from './TransitSystem';
import { hasPlayerOrder } from './helpers/playerOrders';
import type { DayNightSystem, DayPhase } from './DayNightSystem';
import type { EntityId, Vector2 } from '../../shared/types';
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
  type HealthComponent,
  type NestComponent,
  type RenderComponent,
  type FacingComponent,
} from '../components/components';
import { FactionId, isHostileTo, ownerOf } from '../factions/factions';
import { createBeetle } from '../entities/factories';
import { findPath, type PathGrid } from '../../simulation/pathfinding/AStar';
import { emitAudio } from '../../audio/events';
import {
  waveComposition,
  YOUNG_BEETLE_SCALE,
  type EliteAffix,
  type MiniBossKind,
  type WaveComposition,
  type WaveRival,
  type WaveUnitKind,
} from '../run/waveComposition';
import { ELITE_AFFIXES, makeElite } from '../run/eliteAffixes';
import {
  BOSS_COMPONENT,
  MINI_BOSSES,
  makeMiniBoss,
  markCrystalQueen,
  type BossComponent,
  type BossKind,
} from '../run/miniBoss';
import { BOSS_REWARD, waveClearReward, type WaveReward } from '../run/waveRewards';
import { dealDamage, pushWaveFx, setSpeedFactor, waveRuntimeFor } from '../run/waveRuntime';
import { STRUCTURE_COMPONENT, type StructureComponent } from '../run/defenses';
import { floodFromNest } from '../run/craterSite';
import {
  MARCH_SPEED_KEY,
  MARCH_TUNING,
  SIEGE_TUNING,
  WAVE_MARCH_COMPONENT,
  columnInterval,
  columnSlot,
  compassVector,
  edgePoint,
  marchSpeedFactor,
  scoutedCompass,
  surfaceHoleFor,
  type SurfaceMap,
  type TilePos,
  type WaveMarchComponent,
} from '../run/waveMarch';
import type { ShieldComponent } from '../rival/crystalShield';
import {
  UNDERGROUND_WIDTH,
  INVASION_BOSS_NIGHT,
  INVASION_ARM_LEAD,
  WAVE_WARNING_LEAD,
  WAVE_BANNER_SECONDS,
  INVASION_SOLDIER_RESPONDERS,
  INVASION_CIVILIAN_ATTACK_DAMAGE,
  NURSE_DEFENSE_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  BEETLE_STATS,
  ENTRANCE_ROW,
} from '../../shared/constants';

/** The big wave messages the HUD shows: the 30 s warning, the arrival, the clear, a boss falling */
export type WaveBannerKind = 'warning' | 'arrival' | 'cleared' | 'bossDown';

export interface WaveBanner {
  /** Changes every time a new banner goes up, so the HUD can replay its entrance */
  id: number;
  kind: WaveBannerKind;
  wave: number;
  /** Enemies the wave sends */
  count: number;
  /** The Crystal Queen leads this wave (the boss night) */
  boss?: boolean;
  /** The boss leading (warning, arrival) or killed (bossDown): its name */
  bossName?: string;
  /** Its ability, for the arrival announcement */
  bossAbility?: string;
  /** Warning: elites in the wave */
  elites?: number;
  /** Cleared: no ant was lost while the wave was on */
  perfect?: boolean;
  /** Cleared and bossDown: what it paid */
  reward?: WaveReward;
}

/** Where a wave's enemies come from (before it strikes) or are (while it is on), in tiles of that layer */
export interface WaveThreat {
  x: number;
  y: number;
  layer: 'surface' | 'underground';
}

/** What scouting tells about the next wave: shown all day on the "Próxima oleada" card */
export interface NextWaveIntel {
  wave: number;
  total: number;
  /** Plain units by type, for the card (the boss and elites are listed apart) */
  groups: Array<{ id: WaveUnitKind; label: string; count: number }>;
  /** Elites by affix, in the order they come */
  elites: Array<{ affix: EliteAffix; name: string; icon: string; color: string; count: number }>;
  boss: { kind: BossKind; name: string; ability: string } | null;
  /** The entrance the wave breaks in through (underground tiles), announced ahead */
  entrance: { x: number; y: number; label: string } | null;
  /** Where the rival's raiders leave from (surface tiles) and the compass direction from the nest */
  surface: { x: number; y: number; direction: string } | null;
  /** Where the beetles that break in leave from: a tile on the map edge (surface) and its compass direction */
  wildlife: { x: number; y: number; direction: string } | null;
  /** The hole on the nest mound they march on (surface tiles): it leads down to `entrance` */
  hole: { x: number; y: number } | null;
}

/** A boss on the field, for the health bar at the top of the screen */
export interface BossBarInfo {
  kind: BossKind;
  name: string;
  health: number;
  maxHealth: number;
  shield: number;
  maxShield: number;
}

export interface InvasionInfo {
  waveNumber: number;
  /** Seconds until the next wave strikes (its first invader spawns). 0 while a wave is active. */
  nextWaveIn: number;
  active: boolean;
  /** Wave enemies alive right now (beetles in the nest and hive drones on the surface) */
  invadersAlive: number;
  /** Telegraphed: the wave strikes at the coming nightfall */
  armed: boolean;
  /** Enemies of the wave on now, or of the next wave while none is on */
  waveSize: number;
  /** Enemies left before the wave is cleared: alive plus those still to break in */
  remaining: number;
  banner: WaveBanner | null;
  /** Arrow and minimap ping targets: the breach and the hive before the wave, the live enemies during it */
  threats: WaveThreat[];
  /** The scouted next wave (null while a wave is on) */
  next?: NextWaveIntel | null;
  /** The boss alive right now, for its health bar */
  boss?: BossBarInfo | null;
}

/** The rival base's side of a wave: drones (or troops) sent at the player's nest on the surface */
export interface RaidSource {
  /** Whose base it is; it sets the wave mix (default: the Crystal Hive) */
  rival?: WaveRival;
  /** How the notification names `count` raiders (default: "drones de cristal") */
  unitLabel?: (count: number) => string;
  /** Send up to `count` drones; returns the ones actually sent (none when the hive is gone) */
  launch(count: number): EntityId[];
  /** Where the drones leave from, in surface tiles (null when there is no hive) */
  origin(): Vector2 | null;
  /** The boss night: send the Crystal Queen, once per run (null when she cannot come) */
  launchBoss?(): EntityId | null;
}

/** Night 7 (the first milestone of the endless run) also brings the boss: the Crystal Queen, once, when the rival is the Crystal Hive. */
export function isBossNight(night: number): boolean {
  return night === INVASION_BOSS_NIGHT;
}

/** 8-way compass from (fx, fy) toward (tx, ty), y down */
export function compassLabel(fx: number, fy: number, tx: number, ty: number): string {
  const angle = (Math.atan2(-(ty - fy), tx - fx) * 180) / Math.PI; // 0 = east, 90 = north
  const names = ['este', 'noreste', 'norte', 'noroeste', 'oeste', 'suroeste', 'sur', 'sureste'];
  return names[(Math.round(angle / 45) + 8) % 8];
}

const GROUP_LABELS: Record<WaveUnitKind, (rival: WaveRival) => string> = {
  young: () => 'Acorazados jóvenes',
  beetle: () => 'Acorazados',
  drone: (rival) => (rival === 'human' ? 'Tropas humanas' : 'Drones de cristal'),
};

type InvaderKind = 'young' | 'adult' | 'boss';

/** A* budget for the march from the map edge (the default 2000 runs out on a long, winding way) */
const MARCH_PATH_STEPS = 8000;

/** A small fixed offset per unit (golden angle), inside its tile: units heading for one spot spread around it */
function spreadOffset(id: EntityId): { x: number; y: number } {
  const angle = id * 2.39996;
  const r = 0.12 + 0.18 * ((id * 7) % 5) / 4;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

interface PendingInvader {
  kind: InvaderKind;
  affix?: EliteAffix;
}

/**
 * Survival waves: predators cross the surface, break into the nest through
 * one of its holes and march on the queen. Soldiers are auto-deployed to defend.
 *
 * Every nightfall launches the next wave, sized and mixed by waveComposition()
 * (3 young beetles on wave 1, then a fast rising curve, elites from wave 3 and
 * a mini-boss every third wave). The beetles leave the map edge in a column
 * (from the side of the nearest wildlife den, else from a scouted compass
 * direction), march on the surface hole of the entrance the scout announced
 * all day ahead (the "Próxima oleada" card), fight the ants and defenses in
 * their way, dig in (a short shrink-into-the-hole animation) and come out at
 * that entrance below (waveMarch.ts). The Acorazado Colosal is too big for a
 * hole: it besieges it first (SIEGE_TUNING). The rival base (RaidSource) sends
 * its share at the nest on the surface, and it counts as part of the wave.
 * The wave is ARMED (telegraphed) INVASION_ARM_LEAD seconds before dusk, the
 * HUD banner warns WAVE_WARNING_LEAD seconds ahead, and the countdown always
 * points at the moment the column appears at the edge. Clearing a wave pays
 * minerals and food, more for a perfect defense (no ant lost); killing a
 * mini-boss always pays its reward.
 *
 * Waves never stack: if the previous wave is still on its way in or inside
 * the nest at nightfall, that night's wave is skipped and the next one keeps
 * its own size. Raiders still roaming the surface do not block it: the new
 * wave supersedes them.
 */
export class UndergroundInvasionSystem implements System {
  readonly name = 'UndergroundInvasionSystem';
  readonly priority = 8;

  private world: World;
  private grid: UndergroundGrid;
  private transitSystem: TransitSystem;
  private dayNight: DayNightSystem;

  private waveNumber = 0;
  private waveActive = false;
  /** Telegraphed late in the day: the wave strikes at the coming nightfall */
  private waveArmed = false;
  /** Previous tick's phase — used to detect the day->night edge */
  private prevPhase: DayPhase = 'day';
  /** The single entrance this wave breaches through. Picked once per wave so
   *  the attack reads as one breach the player can answer, not a scatter. */
  private waveEntrance: { x: number; y: number } | null = null;
  /** The entrance scouted for wave `wave`, kept until that wave strikes while it still exists */
  private scouted: { wave: number; x: number; y: number } | null = null;
  /** Every live unit of the wave on now: beetles in the nest and hive drones on the surface */
  private invaders = new Set<EntityId>();
  private repathTimer = 0;
  /** Invaders enter one by one (staged break-in, not a teleported blob) */
  private pendingSpawns: PendingInvader[] = [];
  private spawnTimer = 0;
  private spawnInterval = 1.2;
  /** Health and damage multiplier of the wave on now */
  private statScale = 1;
  /** Boss tier of the wave on now (1 on wave 3, 2 on wave 6, ...) */
  private bossTier = 1;
  /** Enemies the wave on now sent */
  private waveSize = 0;
  /** The 30 s warning went up for the coming wave */
  private warned = false;
  private banner: WaveBanner | null = null;
  private bannerTimer = 0;
  private nextBannerId = 1;
  private raidSource: RaidSource | null = null;
  /** Soldiers the player wants permanently stationed underground */
  private garrisonTarget = 0;
  /** Non-soldier ants drafted into total defense while a wave is inside the nest */
  private drafted = new Set<EntityId>();
  /** The bosses of the wave on now (the mini-boss, the Crystal Queen) */
  private bosses = new Set<EntityId>();
  /** Ants alive while the wave is on; one gone means the defense was not perfect */
  private watchedAnts = new Set<EntityId>();
  private antsLost = 0;
  /** The surface the wave marches across */
  private surface: SurfaceMap;
  /** The wave on now: where its column leaves the map edge, and the mound hole it marches on */
  private waveOrigin: TilePos | null = null;
  private waveHole: TilePos | null = null;
  /** The edge scouted for wave `wave` (toward hole `hole`), kept until that wave strikes */
  private scoutedOrigin: { wave: number; hole: TilePos; x: number; y: number } | null = null;
  /** Units of the wave on now that left the edge, for their lane in the column */
  private columnIndex = 0;
  /** The march speed boost of the wave on now */
  private marchFactor = 1;
  /** Units of the wave on now that got into the nest */
  private brokeIn = 0;
  /** March clock (seconds) and, per hole, when the next unit may squeeze through it */
  private marchClock = 0;
  private holeFreeAt = new Map<number, number>();

  /** Wire the Crystal Hive's drones into the waves */
  setRaidSource(source: RaidSource | null): void {
    this.raidSource = source;
  }

  setGarrison(count: number): void {
    this.garrisonTarget = Math.max(0, Math.min(8, Math.floor(count)));
  }

  getGarrison(): number {
    return this.garrisonTarget;
  }

  constructor(
    world: World,
    grid: UndergroundGrid,
    transitSystem: TransitSystem,
    dayNight: DayNightSystem,
    surface: SurfaceMap | null = null
  ) {
    this.world = world;
    this.grid = grid;
    this.transitSystem = transitSystem;
    this.dayNight = dayNight;
    // Without a map (tests), an open field the size of the world
    this.surface = surface ?? {
      width: WORLD_WIDTH,
      height: WORLD_HEIGHT,
      isWalkable: (x, y) => x >= 0 && y >= 0 && x < WORLD_WIDTH && y < WORLD_HEIGHT,
    };
  }

  getInfo(): InvasionInfo {
    return {
      waveNumber: this.waveNumber,
      nextWaveIn: this.waveActive ? 0 : this.dayNight.getSecondsUntilNightfall(),
      active: this.waveActive,
      invadersAlive: this.invaders.size,
      armed: this.waveArmed,
      waveSize: this.waveActive ? this.waveSize : this.nextComposition().total,
      remaining: this.waveActive ? this.invaders.size + this.pendingSpawns.length : 0,
      banner: this.banner ? { ...this.banner } : null,
      threats: this.threats(),
      next: this.waveActive ? null : this.nextIntel(),
      boss: this.bossBar(),
    };
  }

  /** Live units of the wave on now on one layer (the view tabs' badges) */
  invadersOn(layer: 'surface' | 'underground'): number {
    let n = 0;
    for (const id of this.invaders) {
      if (!this.world.hasEntity(id)) continue;
      const below = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground;
      if (below === (layer === 'underground')) n++;
    }
    return n;
  }

  /** A unit that joined the wave on now (a Prisma Guardián's shard): it counts until it dies */
  addInvader(id: EntityId): void {
    if (!this.world.hasEntity(id)) return;
    this.invaders.add(id);
    if (this.waveActive) this.waveSize++;
  }

  /** The rival of the run: the raid source's base, or the wildlife when there is none */
  private rival(): WaveRival {
    return this.raidSource ? this.raidSource.rival ?? 'crystal' : 'wildlife';
  }

  /** The night the coming wave strikes on (the current one once it is dark) */
  private comingNight(): number {
    return this.dayNight.getDayNumber();
  }

  /**
   * What the next wave sends, with the mutation surcharge (spore_bloom) as
   * extra full beetles. With no rival base the raiders' share is beetles (and
   * their elites beetle elites); a rival mini-boss that has no base to come
   * from is the Acorazado Colosal instead. On the Crystal Queen's night she is
   * the boss: no mini-boss joins her.
   */
  private nextComposition(): WaveComposition {
    const base = waveComposition(this.waveNumber + 1, this.rival());
    const extra = Math.max(0, this.world.runModifiers.extraInvadersPerWave);
    const drones = this.raidSource ? base.drones : 0;
    const elites = drones === base.drones ? base.elites : base.elites.map((e) => (e.unit === 'drone' ? { ...e, unit: 'beetle' as const } : e));
    let boss: MiniBossKind | null = base.boss;
    if (boss && boss !== 'colossus' && !this.raidSource) boss = 'colossus';
    let total = base.total + extra;
    if (boss && isBossNight(this.comingNight()) && this.raidSource?.launchBoss) {
      boss = null;
      total--;
    }
    return { ...base, drones, elites, boss, beetles: base.beetles + extra + (base.drones - drones), total };
  }

  private showBanner(kind: WaveBannerKind, wave: number, count: number, extra: Partial<WaveBanner> = {}): void {
    this.banner = { id: this.nextBannerId++, kind, wave, count, ...extra };
    this.bannerTimer = WAVE_BANNER_SECONDS;
  }

  /** The scouted next wave: its mix, elites, boss and where it comes from */
  private nextIntel(): NextWaveIntel {
    const wave = this.nextComposition();
    const rival = this.rival();
    const groups = ([['young', wave.youngBeetles], ['beetle', wave.beetles], ['drone', wave.drones]] as const)
      .filter(([, count]) => count > 0)
      .map(([id, count]) => ({ id, label: GROUP_LABELS[id](rival), count }));
    const elites: NextWaveIntel['elites'] = [];
    for (const e of wave.elites) {
      const row = elites.find((r) => r.affix === e.affix);
      if (row) row.count++;
      else elites.push({ affix: e.affix, ...ELITE_AFFIXES[e.affix], count: 1 });
    }
    let boss: NextWaveIntel['boss'] = wave.boss ? { kind: wave.boss, ...MINI_BOSSES[wave.boss] } : null;
    if (!boss && isBossNight(this.comingNight()) && this.raidSource?.launchBoss) {
      boss = { kind: 'crystal_queen', name: 'Reina de Cristal', ability: 'Su aura recarga los escudos de su escolta y su pulso daña a quien se acerca.' };
    }
    const breach = this.scoutEntrance(this.waveNumber + 1);
    const surfaceOrigin = (wave.drones > 0 || (wave.boss !== null && wave.boss !== 'colossus')) ? this.raidSource?.origin() ?? null : null;
    const nest = this.nestTile();
    const breakers = this.breakersOf(wave) > 0;
    const hole = breakers ? this.holeFor(breach) : null;
    const wild = breakers ? this.scoutOrigin(this.waveNumber + 1) : null;
    return {
      wave: wave.wave,
      total: wave.total,
      groups,
      elites,
      boss,
      entrance: breach ? { x: breach.x, y: breach.y, label: this.entranceLabel(breach.x) } : null,
      surface: surfaceOrigin ? { x: surfaceOrigin.x, y: surfaceOrigin.y, direction: compassLabel(nest.x, nest.y, surfaceOrigin.x, surfaceOrigin.y) } : null,
      wildlife: wild ? { x: wild.x, y: wild.y, direction: compassLabel(nest.x, nest.y, wild.x, wild.y) } : null,
      hole,
    };
  }

  /** The units of a wave that break into the nest (the beetles and the Colosal), as opposed to the rival's raiders */
  private breakersOf(wave: WaveComposition): number {
    return wave.youngBeetles + wave.beetles + (wave.boss === 'colossus' ? 1 : 0);
  }

  /** The nest's tile on the surface, rounded */
  private nestCell(): TilePos {
    const nest = this.nestTile();
    return { x: Math.round(nest.x), y: Math.round(nest.y) };
  }

  /** The mound hole an entrance below opens at (the nest tile when the nest has no entrance) */
  private holeFor(entrance: TilePos | null): TilePos {
    const nest = this.nestCell();
    return entrance ? surfaceHoleFor(this.surface, entrance, nest, this.grid.width) : nest;
  }

  /**
   * Where wave `wave`'s column leaves the map edge: on the side of the
   * wildlife den nearest the nest, or, with no den, from the scouted compass
   * direction. Only edge tiles that can walk to the hole count. Kept until
   * the wave strikes (while its hole stays the same).
   */
  private scoutOrigin(wave: number): TilePos {
    const hole = this.holeFor(this.scoutEntrance(wave));
    const kept = this.scoutedOrigin;
    if (kept && kept.wave === wave && kept.hole.x === hole.x && kept.hole.y === hole.y) return { x: kept.x, y: kept.y };
    const { width, height } = this.surface;
    // Walls do not close the road: the column breaks through them
    const walls = this.surfaceWalls();
    const reach = floodFromNest({ width, height, nest: hole, isWalkable: (x, y) => this.surface.isWalkable(x, y) || walls.has(y * width + x) });
    const map: SurfaceMap = { width, height, isWalkable: (x, y) => x >= 0 && y >= 0 && x < width && y < height && reach[y * width + x] === 1 };
    const den = this.nearestDen(hole);
    const dir = den && Math.hypot(den.x - hole.x, den.y - hole.y) > 1 ? { x: den.x - hole.x, y: den.y - hole.y } : compassVector(scoutedCompass(wave));
    const origin = edgePoint(map, hole, dir);
    this.scoutedOrigin = { wave, hole, x: origin.x, y: origin.y };
    return origin;
  }

  /** The wildlife den on the surface closest to `from` */
  private nearestDen(from: TilePos): TilePos | null {
    let best: TilePos | null = null;
    let bestDist = Infinity;
    for (const id of this.world.query(COMPONENT.BEETLE_DEN, COMPONENT.POSITION)) {
      if (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const d = Math.hypot(pos.x - from.x, pos.y - from.y);
      if (d < bestDist) {
        bestDist = d;
        best = { x: pos.x, y: pos.y };
      }
    }
    return best;
  }

  private nestTile(): { x: number; y: number } {
    const nest = this.world.query(COMPONENT.NEST, COMPONENT.POSITION)[0];
    const pos = nest !== undefined ? this.world.getComponent<PositionComponent>(nest, COMPONENT.POSITION) : undefined;
    return pos ? { x: pos.x, y: pos.y } : { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };
  }

  /** The live boss with the most health left (the mini-boss, or the Crystal Queen) */
  private bossBar(): BossBarInfo | null {
    let best: BossBarInfo | null = null;
    for (const id of this.bosses) {
      const boss = this.world.getComponent<BossComponent>(id, BOSS_COMPONENT);
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (!boss || !health || health.current <= 0) continue;
      const shield = this.world.getComponent<ShieldComponent>(id, COMPONENT.SHIELD);
      const info: BossBarInfo = {
        kind: boss.kind,
        name: boss.name,
        health: Math.max(0, Math.ceil(health.current)),
        maxHealth: health.max,
        shield: shield ? Math.max(0, Math.ceil(shield.current)) : 0,
        maxShield: shield?.max ?? 0,
      };
      if (!best || info.maxHealth > best.maxHealth) best = info;
    }
    return best;
  }

  private threats(): WaveThreat[] {
    const out: WaveThreat[] = [];
    if (this.waveActive) {
      // One marker per group: the column marching on the nest, the rival's raiders, the invaders inside
      const sums = { column: { x: 0, y: 0, n: 0 }, raiders: { x: 0, y: 0, n: 0 }, underground: { x: 0, y: 0, n: 0 } };
      for (const id of this.invaders) {
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
        if (!pos) continue;
        const below = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground;
        const group = below ? sums.underground : this.world.getComponent(id, WAVE_MARCH_COMPONENT) ? sums.column : sums.raiders;
        group.x += pos.x;
        group.y += pos.y;
        group.n++;
      }
      for (const key of ['column', 'raiders', 'underground'] as const) {
        const sum = sums[key];
        if (sum.n > 0) out.push({ x: sum.x / sum.n, y: sum.y / sum.n, layer: key === 'underground' ? 'underground' : 'surface' });
      }
      // The column has not shown up yet: point at the edge it comes from
      if (sums.column.n === 0 && sums.underground.n === 0 && this.pendingSpawns.length > 0 && this.waveOrigin) {
        out.push({ x: this.waveOrigin.x, y: this.waveOrigin.y, layer: 'surface' });
      }
      return out;
    }
    if (!this.warned) return out;
    if (this.waveEntrance) out.push({ x: this.waveEntrance.x + 0.5, y: this.waveEntrance.y + 0.5, layer: 'underground' });
    const next = this.nextComposition();
    if (this.breakersOf(next) > 0) {
      const edge = this.scoutOrigin(this.waveNumber + 1);
      out.push({ x: edge.x, y: edge.y, layer: 'surface' });
    }
    const origin = next.drones > 0 || (next.boss !== null && next.boss !== 'colossus') ? this.raidSource?.origin() ?? null : null;
    if (origin) out.push({ x: origin.x, y: origin.y, layer: 'surface' });
    return out;
  }

  /** Held (the tutorial): no wave is armed, warned of or launched; a wave already on plays out */
  private held = false;

  setHeld(held: boolean): void {
    this.held = held;
  }

  update(dt: number): void {
    // Prune dead invaders and dead draftees
    for (const id of [...this.invaders]) {
      if (!this.world.hasEntity(id)) this.invaders.delete(id);
    }
    for (const id of [...this.drafted]) {
      if (!this.world.hasEntity(id)) this.drafted.delete(id);
    }
    for (const id of [...this.bosses]) {
      if (!this.world.hasEntity(id)) this.bosses.delete(id);
    }
    if (this.waveActive) this.watchAnts();
    this.payBossKills();

    // The column leaves the map edge one unit at a time (faster for big waves)
    if (this.pendingSpawns.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spawnInterval;
        this.spawnInvader(this.pendingSpawns.shift()!);
      }
    }
    // Digging in, besieging a hole, arriving at it: every tick, it is cheap
    this.advanceMarch(dt);

    // Arrival and "cleared" banners fade after a few seconds; the warning lasts until the wave strikes
    if (this.banner && this.banner.kind !== 'warning') {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner = null;
    }

    // Track the day->night edge every tick, before any branch can skip it.
    // DayNightSystem has priority 4 and this system 8, so the flip is already
    // visible on the same tick it happens.
    const phase = this.dayNight.getPhase();
    const nightfall = phase === 'night' && this.prevPhase === 'day';
    this.prevPhase = phase;

    // Wave repelled?
    if (this.waveActive && this.pendingSpawns.length === 0 && this.invaders.size === 0) {
      this.waveActive = false;
      this.waveArmed = false;
      this.restoreDrafted();
      this.world.metrics.wavesRepelled++;
      this.payClear();
    }

    // Late in the day, ARM tonight's wave (never while one is still inside)
    if (!this.held && phase === 'day' && !this.waveActive && !this.waveArmed
        && this.dayNight.getPhaseRemaining() <= INVASION_ARM_LEAD) {
      this.armWave();
    }

    // Half a minute out, the big warning banner
    if (!this.held && phase === 'day' && !this.waveActive && !this.warned
        && this.dayNight.getPhaseRemaining() <= WAVE_WARNING_LEAD) {
      this.warnWave();
    }

    // Raiders still roaming the surface do not hold the next wave back
    if (nightfall && this.waveActive && this.pendingSpawns.length === 0 && this.nestBreakers() === 0) {
      this.invaders.clear();
      this.waveActive = false;
    }

    // Nightfall LAUNCHES it; the !waveActive guard means waves never stack.
    if (nightfall && !this.waveActive && !this.held) {
      this.launchWave();
    }
    // The boss night: the Crystal Queen joins whatever wave is on
    if (nightfall && !this.held && isBossNight(this.dayNight.getDayNumber())) this.launchBoss();

    // Drive invaders and defenders (throttled — pathfinding is not free)
    this.repathTimer -= dt;
    if (this.repathTimer <= 0) {
      this.repathTimer = 0.8;
      this.maintainGarrison();
      this.driveInvaders();
      this.driveDefenders();
    }
  }

  /** Count every ant that dies while the wave is on: one lost spoils the perfect defense */
  private watchAnts(): void {
    for (const id of this.watchedAnts) {
      if (this.world.hasEntity(id)) continue;
      this.watchedAnts.delete(id);
      this.antsLost++;
    }
    for (const id of this.world.query(COMPONENT.ANT)) this.watchedAnts.add(id);
  }

  /** Put food in the pantry, as much as fits; returns what went in */
  private stockPantry(amount: number): number {
    let left = amount;
    while (left > 0) {
      const tile = this.grid.findDepositTile('leaf');
      if (!tile) break;
      const accepted = this.grid.depositFood(tile.x, tile.y, 'leaf', left);
      if (accepted <= 0) break;
      left -= accepted;
    }
    return amount - left;
  }

  /** Pay a reward: minerals to the bank, food into the pantry as far as it fits; returns what was paid */
  pay(reward: WaveReward): WaveReward {
    this.world.minerals.deposit(reward.minerals);
    return { minerals: reward.minerals, food: Math.round(this.stockPantry(reward.food)) };
  }

  /** The wave is cleared: the bonus for a clean defense, a smaller reward otherwise */
  private payClear(): void {
    const perfect = this.antsLost === 0;
    const reward = waveClearReward(this.waveNumber, perfect);
    const paid = this.pay(reward);
    this.watchedAnts.clear();
    this.showBanner('cleared', this.waveNumber, this.waveSize, { perfect, reward });
    const gains = `+${paid.minerals} minerales${paid.food > 0 ? ` · +${paid.food} comida` : ''}`;
    if (perfect) emitAudio({ type: 'waveFx', kind: 'perfect' });
    this.world.pushNotification('success', `🛡️ ¡Oleada ${this.waveNumber} superada!${perfect ? ' ¡Defensa perfecta!' : ''} ${gains}`);
  }

  /** A mini-boss fell: its reward, always */
  private payBossKills(): void {
    const kills = waveRuntimeFor(this.world).bossKills;
    if (kills.length === 0) return;
    for (const kill of kills.splice(0)) {
      const paid = this.pay(BOSS_REWARD);
      emitAudio({ type: 'waveFx', kind: 'bossDown' });
      this.world.pushNotification('success', `👑 ¡Derrotaste al ${kill.name}! +${paid.minerals} minerales${paid.food > 0 ? ` · +${paid.food} comida` : ''}`);
      this.showBanner('bossDown', this.waveNumber, this.waveSize, { bossName: kill.name, reward: { ...BOSS_REWARD } });
    }
  }

  /** Rough compass label so the alert tells the player WHERE to send soldiers */
  private entranceLabel(x: number): string {
    if (x < UNDERGROUND_WIDTH / 3) return 'oeste';
    if (x > (UNDERGROUND_WIDTH * 2) / 3) return 'este';
    return 'centro';
  }

  /** Units of the wave inside the nest or still on their way in (marching, besieging, digging) */
  private nestBreakers(): number {
    let n = 0;
    for (const id of this.invaders) {
      if (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground || this.world.getComponent(id, WAVE_MARCH_COMPONENT)) n++;
    }
    return n;
  }

  /** The next unit of the column leaves the map edge, in its lane, and sets off for the hole */
  private spawnInvader(next: PendingInvader): void {
    const hole = this.waveHole ?? this.nestCell();
    const origin = this.waveOrigin ?? hole;
    const at = columnSlot(this.surface, this.columnIndex++, origin, hole);
    const id = createBeetle(this.world, at.x, at.y, null);
    const facing = this.world.getComponent<FacingComponent>(id, COMPONENT.FACING);
    if (facing) facing.angle = Math.atan2(hole.y - at.y, hole.x - at.x);
    if (next.kind === 'boss') {
      makeMiniBoss(this.world, id, 'colossus', this.bossTier);
      this.scaleUnit(id, this.statScale, this.statScale);
      this.bosses.add(id);
      emitAudio({ type: 'waveFx', kind: 'boss' });
      this.world.pushNotification('danger', `👑 ¡El ${MINI_BOSSES.colossus.name} avanza hacia el nido desde el ${this.originLabel()}!`);
    } else {
      const young = next.kind === 'young';
      this.scaleUnit(
        id,
        (young ? YOUNG_BEETLE_SCALE.health : 1) * this.statScale,
        (young ? YOUNG_BEETLE_SCALE.damage : 1) * this.statScale,
      );
      if (next.affix) makeElite(this.world, id, next.affix);
    }
    const entrance = this.waveEntrance ?? { x: Math.floor(this.grid.width / 2), y: ENTRANCE_ROW };
    this.world.addComponent<WaveMarchComponent>(id, WAVE_MARCH_COMPONENT, {
      phase: 'marching',
      hole: { x: hole.x, y: hole.y },
      entrance: { x: entrance.x, y: entrance.y },
      timer: 0,
      duration: 0,
      wallId: null,
      poundTimer: 0,
    });
    setSpeedFactor(this.world, id, MARCH_SPEED_KEY, this.marchFactor);
    this.invaders.add(id);
  }

  /** "oeste": where the column of the wave on now comes from, seen from the nest */
  private originLabel(): string {
    const nest = this.nestTile();
    const from = this.waveOrigin ?? nest;
    return compassLabel(nest.x, nest.y, from.x, from.y);
  }

  /** The Acorazado Colosal (and anything that big) cannot fit through a hole */
  private tooBigForHole(id: EntityId): boolean {
    return (this.world.getComponent<RenderComponent>(id, COMPONENT.RENDER)?.radius ?? 0) >= SIEGE_TUNING.minSize;
  }

  private stopMoving(id: EntityId): void {
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    if (path) {
      path.waypoints = [];
      path.currentIndex = 0;
    }
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat) combat.targetEntityId = null;
  }

  /** Every tick: arrivals at the hole, sieges and digs */
  private advanceMarch(dt: number): void {
    this.marchClock += dt;
    for (const id of this.invaders) {
      const march = this.world.getComponent<WaveMarchComponent>(id, WAVE_MARCH_COMPONENT);
      if (!march) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
      if (!pos) continue;
      if (march.phase === 'marching') {
        if (Math.hypot(pos.x - march.hole.x, pos.y - march.hole.y) <= MARCH_TUNING.digReach) {
          if (this.tooBigForHole(id)) this.startSiege(id, march);
          else this.startDig(id, march);
        } else if (march.wallId !== null) {
          // Breaking through a wall: at it, bite it; once it falls, plan the way on
          const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
          const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
          if (!this.world.hasEntity(march.wallId)) {
            march.wallId = null;
            this.stopMoving(id);
          } else if (combat && path && path.currentIndex >= path.waypoints.length) {
            combat.targetEntityId = march.wallId;
          }
        }
        continue;
      }
      const before = march.timer;
      march.timer -= dt;
      if (march.phase === 'siege') {
        march.poundTimer -= dt;
        if (march.poundTimer <= 0) {
          march.poundTimer += SIEGE_TUNING.poundEvery;
          this.pound(id, march);
        }
        if (march.timer <= 0) this.startDig(id, march);
        continue;
      }
      // Digging in: clods of dirt fly out of the hole
      if (Math.floor(before / 0.3) !== Math.floor(march.timer / 0.3)) {
        pushWaveFx(this.world, { kind: 'dig', x: march.hole.x, y: march.hole.y, layer: Layer.Surface, radius: 0.9, life: 0.6 });
      }
      if (march.timer <= 0) this.breakIn(id, march);
    }
  }

  /**
   * At the hole: it digs in, shrinking into it. One unit squeezes through a
   * hole at a time (MARCH_TUNING.holeGap apart): the rest wait their turn at
   * it, so they come out below one by one instead of in a heap.
   */
  private startDig(id: EntityId, march: WaveMarchComponent): void {
    const key = march.hole.y * this.surface.width + march.hole.x;
    const start = Math.max(this.marchClock, this.holeFreeAt.get(key) ?? 0);
    this.holeFreeAt.set(key, start + MARCH_TUNING.holeGap);
    march.phase = 'digging';
    march.timer = start - this.marchClock + MARCH_TUNING.digSeconds;
    march.duration = MARCH_TUNING.digSeconds;
    march.wallId = null;
    this.stopMoving(id);
    pushWaveFx(this.world, { kind: 'dig', x: march.hole.x, y: march.hole.y, layer: Layer.Surface, radius: 1.1, life: 0.7 });
  }

  /** Too big for the hole: it besieges it (SIEGE_TUNING) */
  private startSiege(id: EntityId, march: WaveMarchComponent): void {
    march.phase = 'siege';
    march.timer = SIEGE_TUNING.seconds;
    march.poundTimer = SIEGE_TUNING.poundEvery * 0.4;
    march.wallId = null;
    this.stopMoving(id);
    const name = this.world.getComponent<BossComponent>(id, BOSS_COMPONENT)?.name ?? MINI_BOSSES.colossus.name;
    emitAudio({ type: 'waveFx', kind: 'boss' });
    this.world.pushNotification('danger', `👑 ¡El ${name} no cabe por la entrada y asedia el nido! Si no lo detienes, en ${SIEGE_TUNING.seconds} s abrirá la brecha`);
  }

  /** A siege blow on the mound: the colony's units and defenses near the hole get hit, the stockpile spills */
  private pound(id: EntityId, march: WaveMarchComponent): void {
    const hole = march.hole;
    pushWaveFx(this.world, { kind: 'dig', x: hole.x, y: hole.y, layer: Layer.Surface, radius: SIEGE_TUNING.radius, life: 0.8 });
    emitAudio({ type: 'waveFx', kind: 'explode', at: { x: hole.x, y: hole.y, layer: Layer.Surface } });
    const side = ownerOf(this.world, id) ?? FactionId.WILDLIFE;
    for (const store of [COMPONENT.ANT, STRUCTURE_COMPONENT] as const) {
      for (const other of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
        if (this.world.getComponent<LayerComponent>(other, COMPONENT.LAYER)?.layer === Layer.Underground) continue;
        if (this.transitSystem.isInTransit(other) || !isHostileTo(this.world, side, other)) continue;
        const at = this.world.getComponent<PositionComponent>(other, COMPONENT.POSITION)!;
        if (Math.hypot(at.x - hole.x, at.y - hole.y) > SIEGE_TUNING.radius) continue;
        dealDamage(this.world, other, SIEGE_TUNING.damage);
      }
    }
    const nestId = this.world.query(COMPONENT.NEST)[0];
    const nest = nestId !== undefined ? this.world.getComponent<NestComponent>(nestId, COMPONENT.NEST) : undefined;
    if (nest) {
      const keep = 1 - SIEGE_TUNING.spill;
      nest.foodStored = Math.floor(nest.foodStored * keep);
      nest.mushroomStored = Math.floor(nest.mushroomStored * keep);
      nest.meatStored = Math.floor(nest.meatStored * keep);
    }
  }

  /** Through the hole: it comes out at the matching entrance below, and the fight moves into the nest */
  private breakIn(id: EntityId, march: WaveMarchComponent): void {
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
    if (!layer || !pos) return;
    // The entrance may have been filled in since: the closest one left
    const open = this.grid.getEntrances();
    const entrance = open.some((e) => e.x === march.entrance.x && e.y === march.entrance.y)
      ? march.entrance
      : this.grid.findNearestEntrance(march.entrance.x + 0.5, march.entrance.y + 0.5) ?? march.entrance;
    layer.layer = Layer.Underground;
    const off = spreadOffset(id);
    pos.x = entrance.x + 0.5 + off.x;
    pos.y = entrance.y + 0.5 + off.y;
    pos.prevX = pos.x;
    pos.prevY = pos.y;
    this.stopMoving(id);
    setSpeedFactor(this.world, id, MARCH_SPEED_KEY, 1);
    this.world.removeComponent(id, WAVE_MARCH_COMPONENT);
    pushWaveFx(this.world, { kind: 'dig', x: pos.x, y: pos.y, layer: Layer.Underground, radius: 1, life: 0.7 });
    this.brokeIn++;
    const boss = this.world.getComponent<BossComponent>(id, BOSS_COMPONENT);
    if (boss) {
      this.world.pushNotification('danger', `👑 ¡El ${boss.name} abrió la brecha y entra al nido${this.whereLabel()}!`);
    }
    if (this.brokeIn === 1) {
      this.world.pushNotification('danger', `🪲 ¡Los invasores entran al nido${this.whereLabel()}! Van por la reina`);
      this.deploySoldiers(Math.max(this.nestBreakers() + 1, 3));
    }
  }

  /** Surface walls by tile (y * width + x) */
  private surfaceWalls(): Map<number, EntityId> {
    const walls = new Map<number, EntityId>();
    for (const id of this.world.query(STRUCTURE_COMPONENT)) {
      const s = this.world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)!;
      if (s.kind === 'wall' && s.layer === 'surface') walls.set(s.y * this.surface.width + s.x, id);
    }
    return walls;
  }

  /**
   * The way to the hole. Walls are gone around, unless going around costs
   * more than MARCH_TUNING.wallDetour extra tiles: then it walks up to the
   * first wall on the straight way and breaks it.
   */
  private planMarch(pos: PositionComponent, path: PathComponent, march: WaveMarchComponent): void {
    const start = { x: Math.round(pos.x), y: Math.round(pos.y) };
    const around = findPath(this.surface, start, march.hole, MARCH_PATH_STEPS);
    const walls = this.surfaceWalls();
    if (walls.size > 0) {
      const width = this.surface.width;
      const open: PathGrid = {
        width,
        height: this.surface.height,
        isWalkable: (x, y) => this.surface.isWalkable(x, y) || walls.has(y * width + x),
      };
      const through = findPath(open, start, march.hole, MARCH_PATH_STEPS);
      if (through && (!around || around.length > through.length + MARCH_TUNING.wallDetour)) {
        const i = through.findIndex((p) => walls.has(p.y * width + p.x));
        if (i > 0) {
          const wall = through[i];
          const prev = through[i - 1];
          const dx = wall.x - prev.x;
          const dy = wall.y - prev.y;
          const len = Math.hypot(dx, dy) || 1;
          // Stop just short of the wall, close enough to bite it
          path.waypoints = [...through.slice(0, i), { x: prev.x + (dx / len) * 0.45, y: prev.y + (dy / len) * 0.45 }];
          path.currentIndex = 0;
          march.wallId = walls.get(wall.y * width + wall.x)!;
          return;
        }
      }
    }
    path.waypoints = around && around.length > 0 ? around : [{ x: march.hole.x, y: march.hole.y }];
    path.currentIndex = 0;
  }

  /** Short hop toward a target on the surface (a fight on the way) */
  private routeTo(id: EntityId, path: PathComponent, pos: PositionComponent, target: { x: number; y: number }): void {
    const route = findPath(this.surface, { x: Math.round(pos.x), y: Math.round(pos.y) }, { x: Math.round(target.x), y: Math.round(target.y) }, 600);
    const off = spreadOffset(id);
    const end = route && route.length > 0 ? route[route.length - 1] : { x: Math.round(target.x), y: Math.round(target.y) };
    path.waypoints = [...(route && route.length > 0 ? route.slice(0, -1) : []), { x: end.x + off.x, y: end.y + off.y }];
    path.currentIndex = 0;
  }

  /**
   * The column on the surface: each unit fights the ants that block its way
   * or bite it, breaks the Espinas and Trampas right by its way, and
   * otherwise marches on its hole (walls: see planMarch).
   */
  private driveMarchers(): void {
    const ants: Array<{ id: EntityId; pos: PositionComponent }> = [];
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.POSITION, COMPONENT.LAYER)) {
      if (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer !== Layer.Surface) continue;
      if (this.transitSystem.isInTransit(id)) continue;
      ants.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
    }
    const defenses: Array<{ id: EntityId; pos: PositionComponent }> = [];
    for (const id of this.world.query(STRUCTURE_COMPONENT, COMPONENT.POSITION)) {
      const s = this.world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)!;
      if (s.layer !== 'surface' || s.kind === 'wall') continue;
      defenses.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
    }
    for (const id of this.invaders) {
      const march = this.world.getComponent<WaveMarchComponent>(id, WAVE_MARCH_COMPONENT);
      if (!march || march.phase !== 'marching') continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
      if (!pos || !combat || !path) continue;

      let prey: { id: EntityId; pos: PositionComponent } | null = null;
      let best = Infinity;
      for (const a of ants) {
        const d = Math.hypot(a.pos.x - pos.x, a.pos.y - pos.y);
        const biting = d < MARCH_TUNING.retaliate && this.world.getComponent<CombatComponent>(a.id, COMPONENT.COMBAT)?.targetEntityId === id;
        if ((d < MARCH_TUNING.aggro || biting) && d < best) {
          best = d;
          prey = a;
        }
      }
      if (!prey) {
        for (const s of defenses) {
          const d = Math.hypot(s.pos.x - pos.x, s.pos.y - pos.y);
          if (d < MARCH_TUNING.structureAggro && d < best) {
            best = d;
            prey = s;
          }
        }
      }
      if (prey) {
        march.wallId = null;
        combat.targetEntityId = prey.id;
        if (best <= combat.attackRange * 0.9) {
          path.waypoints = [];
          path.currentIndex = 0;
        } else {
          this.routeTo(id, path, pos, prey.pos);
        }
        continue;
      }
      // Breaking through a wall (advanceMarch points the bite)
      if (march.wallId !== null && this.world.hasEntity(march.wallId)) continue;
      march.wallId = null;
      // On to the hole; a wall it is biting (DefenseSystem points it at walls it bumps into) stays its target
      const target = combat.targetEntityId;
      const atWall = target !== null && this.world.hasEntity(target) && this.world.getComponent<StructureComponent>(target, STRUCTURE_COMPONENT)?.kind === 'wall';
      if (!atWall) combat.targetEntityId = null;
      const end = path.waypoints[path.waypoints.length - 1];
      const done = path.currentIndex >= path.waypoints.length;
      if (done || !end || end.x !== march.hole.x || end.y !== march.hole.y) this.planMarch(pos, path, march);
    }
  }

  /** Multiply a unit's health and damage (young beetles, and every unit past the size cap) */
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

  /**
   * The entrance wave `wave` breaches through: announced as soon as the
   * wave is scouted and kept until it strikes, as long as that entrance still
   * exists. With several entrances the breach rotates over them from wave to
   * wave (sorted west to east), so it is never random at arrival.
   */
  private scoutEntrance(wave: number): { x: number; y: number } | null {
    const entrances = this.grid.getEntrances();
    if (entrances.length === 0) return null;
    const kept = this.scouted;
    if (kept && kept.wave === wave && entrances.some((e) => e.x === kept.x && e.y === kept.y)) return { x: kept.x, y: kept.y };
    const sorted = [...entrances].sort((a, b) => a.x - b.x || a.y - b.y);
    const pick = sorted[(wave * 7 + 3) % sorted.length];
    const moved = kept !== null && kept.wave === wave;
    this.scouted = { wave, x: pick.x, y: pick.y };
    if (moved) {
      this.world.pushNotification('warning', `🔎 La brecha cambió: la oleada ${wave} entrará por la entrada ${this.entranceLabel(pick.x)}`);
    }
    return { x: pick.x, y: pick.y };
  }

  /** The entrance this wave breaches through: the scouted one */
  private pickEntrance(): void {
    this.waveEntrance = this.scoutEntrance(this.waveNumber + (this.waveActive ? 0 : 1));
  }

  private whereLabel(): string {
    return this.waveEntrance !== null && this.grid.getEntrances().length > 1
      ? ` por la entrada ${this.entranceLabel(this.waveEntrance.x)}`
      : '';
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
      if (hasPlayerOrder(this.world, id)) continue; // under the player's orders
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!;

      if (layer.layer === Layer.Underground) {
        underground++;
      } else if (this.transitSystem.isInTransit(id)) {
        incoming++;
      } else if (ant.state === AntState.Idle || ant.state === AntState.Searching || ant.state === AntState.PatrollingNest) {
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

  /** "con 3 élites y el Acorazado Colosal": the wave's extras, for the notifications */
  private extrasLabel(wave: WaveComposition): string {
    const parts: string[] = [];
    if (wave.elites.length > 0) parts.push(`${wave.elites.length} ${wave.elites.length === 1 ? 'élite' : 'élites'}`);
    if (wave.boss) parts.push(`el ${MINI_BOSSES[wave.boss].name}`);
    return parts.length > 0 ? `, con ${parts.join(' y ')}` : '';
  }

  /** Dusk is near — telegraph the wave so the player can prepare */
  private armWave(): void {
    this.waveArmed = true;
    const wave = this.nextComposition();
    this.world.pushNotification(
      'warning',
      `🪲 Movimiento en el túnel: la oleada ${this.waveNumber + 1} (${wave.total} enemigos${this.extrasLabel(wave)}) atacará al anochecer`
    );
  }

  /** Half a minute out: the big banner goes up, and the breach point and the hive get marked */
  private warnWave(): void {
    this.warned = true;
    this.pickEntrance();
    const wave = this.nextComposition();
    const intel = this.nextIntel();
    this.showBanner('warning', this.waveNumber + 1, wave.total, {
      elites: wave.elites.length,
      ...(intel.boss ? { bossName: intel.boss.name } : {}),
    });
    this.world.pushNotification(
      'danger',
      `⚠️ ¡Oleada ${this.waveNumber + 1} en ${WAVE_WARNING_LEAD} s! ${wave.total} enemigos${this.extrasLabel(wave)}${this.whereLabel()}${intel.wildlife ? ` · los acorazados llegan desde el ${intel.wildlife.direction}` : ''}`
    );
  }

  private launchWave(): void {
    emitAudio({ type: 'wave' });
    const wave = this.nextComposition();
    this.pickEntrance();
    // The column's road: from the scouted edge to the hole of the scouted entrance
    this.waveHole = this.holeFor(this.waveEntrance);
    this.waveOrigin = this.scoutOrigin(this.waveNumber + 1);
    this.marchFactor = marchSpeedFactor(Math.hypot(this.waveOrigin.x - this.waveHole.x, this.waveOrigin.y - this.waveHole.y), BEETLE_STATS.speed);
    this.columnIndex = 0;
    this.brokeIn = 0;
    this.holeFreeAt.clear();
    this.waveNumber++;
    this.waveActive = true;
    this.waveArmed = false;
    this.warned = false;
    this.statScale = wave.statScale;
    this.bossTier = Math.max(1, Math.floor(wave.wave / 3));
    this.antsLost = 0;
    this.watchedAnts = new Set(this.world.query(COMPONENT.ANT));
    const affixesOf = (unit: WaveUnitKind) => wave.elites.filter((e) => e.unit === unit).map((e) => e.affix);

    // The rival's raiders march on the nest; any it cannot send break in as beetles instead.
    // A rival mini-boss leaves with them: the last raider sent becomes the boss.
    const surfaceBoss = wave.boss === 'prism' || wave.boss === 'colonel' ? wave.boss : null;
    const asked = wave.drones + (surfaceBoss ? 1 : 0);
    const sent = asked > 0 && this.raidSource ? this.raidSource.launch(asked) : [];
    let bossId: EntityId | null = null;
    if (surfaceBoss && sent.length > 0) {
      bossId = sent[sent.length - 1];
      makeMiniBoss(this.world, bossId, surfaceBoss, this.bossTier);
      this.scaleUnit(bossId, wave.statScale, wave.statScale);
      this.bosses.add(bossId);
      this.invaders.add(bossId);
    }
    const drones = sent.filter((id) => id !== bossId);
    const droneAffixes = affixesOf('drone');
    drones.forEach((id, i) => {
      this.scaleUnit(id, wave.statScale, wave.statScale);
      if (i < droneAffixes.length) makeElite(this.world, id, droneAffixes[i]);
      this.invaders.add(id);
    });
    const missing = asked - sent.length;
    // A surface boss with no base behind it breaks into the nest as the Colosal instead
    const undergroundBoss = wave.boss === 'colossus' || (surfaceBoss !== null && bossId === null);
    const beetles = wave.beetles + Math.max(0, missing - (surfaceBoss && bossId === null ? 1 : 0));
    this.waveSize = wave.youngBeetles + beetles + drones.length + (bossId !== null || undergroundBoss ? 1 : 0);

    // On the boss night the Crystal Queen joins right after (launchBoss).
    // Young beetles lead, the full-strength ones follow, the Colosal comes last; the first leaves the edge now.
    const youngAffixes = affixesOf('young');
    const beetleAffixes = [...affixesOf('beetle'), ...droneAffixes.slice(drones.length)];
    this.pendingSpawns = [
      ...Array.from({ length: wave.youngBeetles }, (_, i): PendingInvader => ({ kind: 'young', affix: youngAffixes[i] })),
      ...Array.from({ length: beetles }, (_, i): PendingInvader => ({ kind: 'adult', affix: beetleAffixes[i] })),
      ...(undergroundBoss ? [{ kind: 'boss' as const }] : []),
    ];
    const breakers = this.pendingSpawns.length;
    this.spawnInterval = columnInterval(breakers);
    if (breakers > 0) this.spawnInvader(this.pendingSpawns.shift()!);
    this.spawnTimer = this.spawnInterval;

    const bossKind: MiniBossKind | null = bossId !== null ? surfaceBoss : undergroundBoss ? 'colossus' : null;
    this.showBanner('arrival', this.waveNumber, this.waveSize, bossKind ? {
      bossName: MINI_BOSSES[bossKind].name,
      bossAbility: MINI_BOSSES[bossKind].ability,
    } : {});
    if (bossKind) {
      this.bannerTimer = WAVE_BANNER_SECONDS + 3; // the boss banner stays up longer
      emitAudio({ type: 'waveFx', kind: 'boss' });
    }
    const march = breakers > 0 ? ` ${breakers} acorazados marchan desde el ${this.originLabel()} hacia la entrada${this.whereLabel() ? ` ${this.entranceLabel(this.waveEntrance!.x)}` : ' del nido'}` : '';
    const raid = drones.length > 0 || bossId !== null
      ? `${breakers > 0 ? ' y' : ''} ${drones.length + (bossId !== null ? 1 : 0)} ${this.raidSource?.unitLabel?.(drones.length) ?? 'drones de cristal'} atacan por la superficie`
      : '';
    this.world.pushNotification('danger', `🪲 ¡OLEADA ${this.waveNumber} · ${this.waveSize} enemigos!${march}${raid}`);
    if (bossId !== null && bossKind) this.world.pushNotification('danger', `👑 ¡El ${MINI_BOSSES[bossKind].name} encabeza el asalto!`);
    // Soldiers stay up top to meet the column; they are sent below once it breaks in (breakIn)
  }

  /** The Crystal Queen leaves the hive; the wave on counts her, and the arrival banner announces her */
  private launchBoss(): void {
    const boss = this.raidSource?.launchBoss?.() ?? null;
    if (boss === null) return;
    markCrystalQueen(this.world, boss);
    this.bosses.add(boss);
    this.invaders.add(boss);
    if (!this.waveActive) {
      // The night's wave was skipped: she is a wave of her own
      this.waveActive = true;
      this.waveArmed = false;
      this.warned = false;
      this.waveSize = 0;
      this.antsLost = 0;
      this.watchedAnts = new Set(this.world.query(COMPONENT.ANT));
    }
    this.waveSize++;
    this.showBanner('arrival', this.waveNumber, this.waveSize);
    this.banner!.boss = true;
    this.bannerTimer = WAVE_BANNER_SECONDS + 3; // the boss banner stays up longer
  }

  /** Auto-deploy available surface soldiers to defend the queen */
  private deploySoldiers(needed: number): void {
    const ants = this.world.query(COMPONENT.ANT, COMPONENT.LAYER);
    let sent = 0;

    for (const id of ants) {
      if (sent >= Math.min(needed, INVASION_SOLDIER_RESPONDERS)) break;
      const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!;
      if (ant.role !== AntRole.Soldier) continue;
      if (hasPlayerOrder(this.world, id)) continue; // under the player's orders

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
    this.driveMarchers();

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
      // Ants riding the shaft cannot fight back: camping the entrance on them
      // froze the wave there for good, so invaders push past toward the queen
      if (this.transitSystem.isInTransit(id)) continue;
      ugAnts.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
    }

    const ugStructures: Array<{ id: EntityId; pos: PositionComponent }> = [];
    for (const id of this.world.query(STRUCTURE_COMPONENT, COMPONENT.POSITION, COMPONENT.LAYER)) {
      if (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer !== Layer.Underground) continue;
      ugStructures.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
    }

    for (const invaderId of this.invaders) {
      // The rival's raiders on the surface have their own AI
      if (this.world.getComponent<LayerComponent>(invaderId, COMPONENT.LAYER)?.layer !== Layer.Underground) continue;
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
      // Nest defenses in their way get broken (walls are handled by DefenseSystem)
      if (!target) {
        let structDist = 1.8;
        for (const s of ugStructures) {
          const d = Math.hypot(s.pos.x - pos.x, s.pos.y - pos.y);
          if (d < structDist) {
            structDist = d;
            target = { id: s.id, x: s.pos.x, y: s.pos.y };
          }
        }
        // Keep marching on the queen: only the bite lands on the defense
        if (target && queenId !== null && queenPos) {
          combat.targetEntityId = target.id;
          target = { id: target.id, x: queenPos.x, y: queenPos.y };
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
          // Each invader stops at its own spot in the last tile: a pack that shares a route does not pile up as one
          const last = route[route.length - 1];
          const off = spreadOffset(invaderId);
          route[route.length - 1] = { x: last.x + off.x, y: last.y + off.y };
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
      if (hasPlayerOrder(this.world, id)) continue; // under the player's orders: never drafted
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
