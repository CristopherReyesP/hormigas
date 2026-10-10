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
} from '../components/components';
import { createBeetle } from '../entities/factories';
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
  createColossus,
  makeMiniBoss,
  markCrystalQueen,
  type BossComponent,
  type BossKind,
} from '../run/miniBoss';
import { BOSS_REWARD, waveClearReward, type WaveReward } from '../run/waveRewards';
import { waveRuntimeFor } from '../run/waveRuntime';
import { STRUCTURE_COMPONENT } from '../run/defenses';
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

interface PendingInvader {
  kind: InvaderKind;
  affix?: EliteAffix;
}

/**
 * Survival waves: predators periodically break into the nest through the
 * entrance tunnel and march on the queen. Soldiers are auto-deployed to defend.
 *
 * Every nightfall launches the next wave, sized and mixed by waveComposition()
 * (3 young beetles on wave 1, then a fast rising curve, elites from wave 3 and
 * a mini-boss every third wave). Beetles break into the nest through one
 * entrance, scouted and announced all day ahead (the "Próxima oleada" card);
 * the rival base (RaidSource) sends its share at the nest on the surface, and
 * it counts as part of the wave. The wave is ARMED (telegraphed)
 * INVASION_ARM_LEAD seconds before dusk, the HUD banner warns
 * WAVE_WARNING_LEAD seconds ahead, and the countdown always points at the
 * real attack. Clearing a wave pays minerals and food, more for a perfect
 * defense (no ant lost); killing a mini-boss always pays its reward.
 *
 * Waves never stack: if the previous wave is still inside the nest at
 * nightfall, that night's wave is skipped and the next one keeps its own size.
 * Drones still roaming the surface do not block it: the new wave supersedes them.
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
    dayNight: DayNightSystem
  ) {
    this.world = world;
    this.grid = grid;
    this.transitSystem = transitSystem;
    this.dayNight = dayNight;
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
    return {
      wave: wave.wave,
      total: wave.total,
      groups,
      elites,
      boss,
      entrance: breach ? { x: breach.x, y: breach.y, label: this.entranceLabel(breach.x) } : null,
      surface: surfaceOrigin ? { x: surfaceOrigin.x, y: surfaceOrigin.y, direction: compassLabel(nest.x, nest.y, surfaceOrigin.x, surfaceOrigin.y) } : null,
    };
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
      // One marker per layer: the centre of the wave's live units there
      const sums = { surface: { x: 0, y: 0, n: 0 }, underground: { x: 0, y: 0, n: 0 } };
      for (const id of this.invaders) {
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
        if (!pos) continue;
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground ? 'underground' : 'surface';
        sums[layer].x += pos.x;
        sums[layer].y += pos.y;
        sums[layer].n++;
      }
      for (const layer of ['surface', 'underground'] as const) {
        const sum = sums[layer];
        if (sum.n > 0) out.push({ x: sum.x / sum.n, y: sum.y / sum.n, layer });
      }
      if (sums.underground.n === 0 && this.pendingSpawns.length > 0 && this.waveEntrance) {
        out.push({ x: this.waveEntrance.x + 0.5, y: this.waveEntrance.y + 0.5, layer: 'underground' });
      }
      return out;
    }
    if (!this.warned) return out;
    if (this.waveEntrance) out.push({ x: this.waveEntrance.x + 0.5, y: this.waveEntrance.y + 0.5, layer: 'underground' });
    const next = this.nextComposition();
    const origin = next.drones > 0 || (next.boss !== null && next.boss !== 'colossus') ? this.raidSource?.origin() ?? null : null;
    if (origin) out.push({ x: origin.x, y: origin.y, layer: 'surface' });
    return out;
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

    // Staged entry: one invader breaks in at a time (faster for big waves)
    if (this.pendingSpawns.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.spawnInterval;
        this.spawnInvader(this.pendingSpawns.shift()!);
      }
    }

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
    if (phase === 'day' && !this.waveActive && !this.waveArmed
        && this.dayNight.getPhaseRemaining() <= INVASION_ARM_LEAD) {
      this.armWave();
    }

    // Half a minute out, the big warning banner
    if (phase === 'day' && !this.waveActive && !this.warned
        && this.dayNight.getPhaseRemaining() <= WAVE_WARNING_LEAD) {
      this.warnWave();
    }

    // Drones still roaming the surface do not hold the next wave back
    if (nightfall && this.waveActive && this.pendingSpawns.length === 0 && this.undergroundInvaders() === 0) {
      this.invaders.clear();
      this.waveActive = false;
    }

    // Nightfall LAUNCHES it; the !waveActive guard means waves never stack.
    if (nightfall && !this.waveActive) {
      this.launchWave();
    }
    // The boss night: the Crystal Queen joins whatever wave is on
    if (nightfall && isBossNight(this.dayNight.getDayNumber())) this.launchBoss();

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

  private undergroundInvaders(): number {
    let n = 0;
    for (const id of this.invaders) {
      if (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground) n++;
    }
    return n;
  }

  private spawnInvader(next: PendingInvader): void {
    const e = this.waveEntrance;
    const ex = e ? e.x + 0.5 : Math.floor(UNDERGROUND_WIDTH / 2) + 0.5;
    const ey = e ? e.y + 0.5 : 1.5;
    if (next.kind === 'boss') {
      const id = createColossus(this.world, ex, ey, this.bossTier);
      this.scaleUnit(id, this.statScale, this.statScale);
      this.invaders.add(id);
      this.bosses.add(id);
      emitAudio({ type: 'waveFx', kind: 'boss' });
      this.world.pushNotification('danger', `👑 ¡El ${MINI_BOSSES.colossus.name} irrumpe en el nido${this.whereLabel()}!`);
      return;
    }
    const id = createBeetle(this.world, ex, ey, null);
    const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
    if (layer) layer.layer = Layer.Underground;
    const young = next.kind === 'young';
    this.scaleUnit(
      id,
      (young ? YOUNG_BEETLE_SCALE.health : 1) * this.statScale,
      (young ? YOUNG_BEETLE_SCALE.damage : 1) * this.statScale,
    );
    if (next.affix) makeElite(this.world, id, next.affix);
    this.invaders.add(id);
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
      `⚠️ ¡Oleada ${this.waveNumber + 1} en ${WAVE_WARNING_LEAD} s! ${wave.total} enemigos${this.extrasLabel(wave)}${this.whereLabel()}`
    );
  }

  private launchWave(): void {
    emitAudio({ type: 'wave' });
    const wave = this.nextComposition();
    this.pickEntrance();
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
    // Young beetles lead, the full-strength ones follow, the Colosal comes last; the first breaks in now.
    const youngAffixes = affixesOf('young');
    const beetleAffixes = [...affixesOf('beetle'), ...droneAffixes.slice(drones.length)];
    this.pendingSpawns = [
      ...Array.from({ length: wave.youngBeetles }, (_, i): PendingInvader => ({ kind: 'young', affix: youngAffixes[i] })),
      ...Array.from({ length: beetles }, (_, i): PendingInvader => ({ kind: 'adult', affix: beetleAffixes[i] })),
      ...(undergroundBoss ? [{ kind: 'boss' as const }] : []),
    ];
    const underground = this.pendingSpawns.length;
    this.spawnInterval = Math.min(1.2, 15 / Math.max(1, underground));
    if (underground > 0) this.spawnInvader(this.pendingSpawns.shift()!);
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
    const parts = drones.length > 0 || bossId !== null
      ? ` ${underground} acorazados al nido y ${drones.length + (bossId !== null ? 1 : 0)} ${this.raidSource?.unitLabel?.(drones.length) ?? 'drones de cristal'} por la superficie`
      : ` Los acorazados están entrando${this.whereLabel()}`;
    this.world.pushNotification('danger', `🪲 ¡OLEADA ${this.waveNumber} · ${this.waveSize} enemigos!${parts}`);
    if (bossId !== null && bossKind) this.world.pushNotification('danger', `👑 ¡El ${MINI_BOSSES[bossKind].name} encabeza el asalto!`);

    if (underground > 0) this.deploySoldiers(Math.max(underground + 1, 3));
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
