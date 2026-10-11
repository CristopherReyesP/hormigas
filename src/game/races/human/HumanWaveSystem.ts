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
import {
  waveComposition,
  YOUNG_BEETLE_SCALE,
  type EliteAffix,
  type MiniBossKind,
  type WaveComposition,
  type WaveRival,
  type WaveUnitKind,
} from '../../run/waveComposition';
import { ELITE_AFFIXES, makeElite } from '../../run/eliteAffixes';
import { BOSS_COMPONENT, MINI_BOSSES, makeMiniBoss, markCrystalQueen, type BossComponent } from '../../run/miniBoss';
import { BOSS_REWARD, waveClearReward, type WaveReward } from '../../run/waveRewards';
import { waveRuntimeFor } from '../../run/waveRuntime';
import type { ShieldComponent } from '../../rival/crystalShield';
import {
  compassLabel,
  isBossNight,
  type BossBarInfo,
  type InvasionInfo,
  type NextWaveIntel,
  type RaidSource,
  type WaveBanner,
  type WaveBannerKind,
  type WaveThreat,
} from '../../systems/UndergroundInvasionSystem';
import type { DayPhase } from '../../systems/DayNightSystem';
import { BEETLE_STATS, INVASION_ARM_LEAD, ORDER_PATH_MAX_STEPS, WAVE_BANNER_SECONDS, WAVE_WARNING_LEAD } from '../../../shared/constants';
import { HUMAN_BUILDING_STATS } from '../../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent } from '../../rival/humanComponents';
import { HUMAN_PLAYER_COMPONENT } from './humanPlayerComponents';
import { playerBuildings, playerUnits, positionOf } from './humanPlayerQueries';
import { humanWaveBeetles } from './humanPlayerRules';

/** What the run's wave director offers GameManager, whichever race the player is. */
export interface WaveDirector extends System {
  getInfo(): InvasionInfo;
  setRaidSource(source: RaidSource | null): void;
  setGarrison(count: number): void;
  getGarrison(): number;
  /** A unit that joined the wave on now (a Prisma Guardián's shard) */
  addInvader(id: EntityId): void;
  /** Pay a reward (a night milestone): minerals to the bank, the food share as the race keeps it; returns what was paid */
  pay(reward: WaveReward): WaveReward;
}

/** The day/night clock the waves read (DayNightSystem, or a test clock). */
export interface WaveClock {
  getPhase(): DayPhase;
  getDayNumber(): number;
  getPhaseRemaining(): number;
  getSecondsUntilNightfall(): number;
}

export interface HumanWaveOptions {
  /** Where the food share of a wave or boss reward goes (a Human player banks it as rations) */
  onFood?: (amount: number) => void;
}

interface PendingInvader {
  kind: 'young' | 'adult' | 'boss';
  affix?: EliteAffix;
}

const GROUP_LABELS: Record<WaveUnitKind, (rival: WaveRival) => string> = {
  young: () => 'Acorazados jóvenes',
  beetle: () => 'Acorazados',
  drone: (rival) => (rival === 'human' ? 'Tropas humanas' : 'Drones de cristal'),
};

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
 * wave comes over the surface: beetles (waveComposition's mix, elites
 * included) walk in from a spot at the edge of the map and march on the
 * command center, hitting any Human unit or building in their way, while the
 * rival's base (RaidSource) sends its own share. Every third wave a mini-boss
 * leads: the rival's (Prisma Guardián, Coronel) leaves with the raiders, the
 * Acorazado Colosal walks in with the beetles. Same rhythm as the Swarm's
 * waves: armed late in the day, scouted on the "Próxima oleada" card, a
 * warning banner half a minute out, the attack at nightfall, rewards on a
 * clear and on a boss kill. The beetles are steered here, not by BeetleAI.
 */
export class HumanWaveSystem implements WaveDirector {
  readonly name = 'HumanWaveSystem';
  readonly priority = 6.5; // after the unit AIs (6), before Combat (7)

  private world: World;
  private grid: PathGrid & { width: number; height: number };
  private clock: WaveClock;
  private core: () => EntityId | null;
  private onFood: (amount: number) => void;
  private raidSource: RaidSource | null = null;

  private waveNumber = 0;
  private active = false;
  private armed = false;
  private warned = false;
  private prevPhase: DayPhase;
  private invaders = new Set<EntityId>();
  private bosses = new Set<EntityId>();
  private pending: PendingInvader[] = [];
  private spawnTimer = 0;
  private spawnInterval = 1.2;
  private statScale = 1;
  private bossTier = 1;
  private waveSize = 0;
  private banner: WaveBanner | null = null;
  private bannerTimer = 0;
  private nextBannerId = 1;
  private driveTimer = 0;
  private spawnPoint: Vector2 | null = null;
  /** The player's units alive while the wave is on; one gone spoils the perfect defense */
  private watched = new Set<EntityId>();
  private lost = 0;

  constructor(
    world: World,
    grid: PathGrid & { width: number; height: number },
    clock: WaveClock,
    core: () => EntityId | null,
    options: HumanWaveOptions = {},
  ) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.core = core;
    this.onFood = options.onFood ?? (() => {});
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

  addInvader(id: EntityId): void {
    if (!this.world.hasEntity(id)) return;
    this.invaders.add(id);
    if (this.active) this.waveSize++;
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
      next: this.active ? null : this.nextIntel(),
      boss: this.bossBar(),
    };
  }

  private rival(): WaveRival {
    return this.raidSource ? this.raidSource.rival ?? 'crystal' : 'wildlife';
  }

  /**
   * The next wave, as the Swarm's: with no rival base the raiders' share (and
   * their elites) are beetles and a rival boss is the Acorazado Colosal; on
   * the Crystal Queen's night she is the boss.
   */
  private nextComposition(): WaveComposition {
    const base = waveComposition(this.waveNumber + 1, this.rival());
    const drones = this.raidSource ? base.drones : 0;
    const elites = drones === base.drones ? base.elites : base.elites.map((e) => (e.unit === 'drone' ? { ...e, unit: 'beetle' as const } : e));
    let boss: MiniBossKind | null = base.boss;
    if (boss && boss !== 'colossus' && !this.raidSource) boss = 'colossus';
    let total = base.total;
    if (boss && isBossNight(this.clock.getDayNumber()) && this.raidSource?.launchBoss) {
      boss = null;
      total--;
    }
    // The beetles are thinned against an expedition (HUMAN_WAVE_BEETLE_SHARE); elites stay within each kind
    const young = humanWaveBeetles(base.youngBeetles);
    const beetles = humanWaveBeetles(base.beetles + (base.drones - drones));
    const kept: Record<WaveUnitKind, number> = { young: 0, beetle: 0, drone: 0 };
    const limit: Record<WaveUnitKind, number> = { young, beetle: beetles, drone: drones };
    const thinned = elites.filter((e) => {
      if (kept[e.unit] >= limit[e.unit]) return false;
      kept[e.unit]++;
      return true;
    });
    total -= base.youngBeetles - young + (base.beetles + (base.drones - drones)) - beetles;
    return { ...base, drones, elites: thinned, boss, youngBeetles: young, beetles, total };
  }

  private coreTile(): Vector2 {
    const core = this.core();
    const p = core !== null ? positionOf(this.world, core) : undefined;
    return p ? { x: p.x, y: p.y } : { x: this.grid.width / 2, y: this.grid.height / 2 };
  }

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
    if (!boss && isBossNight(this.clock.getDayNumber()) && this.raidSource?.launchBoss) {
      boss = { kind: 'crystal_queen', name: 'Reina de Cristal', ability: 'Su aura recarga los escudos de su escolta y su pulso daña a quien se acerca.' };
    }
    const core = this.coreTile();
    const from = this.raidSource?.origin() ?? this.spawnPoint;
    return {
      wave: wave.wave,
      total: wave.total,
      groups,
      elites,
      boss,
      entrance: null,
      surface: from ? { x: from.x, y: from.y, direction: compassLabel(core.x, core.y, from.x, from.y) } : null,
      // A Human base has no nest to march on: its waves keep their own surface approach
      wildlife: null,
      hole: null,
    };
  }

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

  private showBanner(kind: WaveBannerKind, wave: number, count: number, extra: Partial<WaveBanner> = {}): void {
    this.banner = { id: this.nextBannerId++, kind, wave, count, ...extra };
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
    const next = this.nextComposition();
    const origin = next.drones > 0 || (next.boss !== null && next.boss !== 'colossus') ? this.raidSource?.origin() ?? null : null;
    if (origin) out.push({ x: origin.x, y: origin.y, layer: 'surface' });
    return out;
  }

  update(dt: number): void {
    for (const id of [...this.invaders]) if (!this.world.hasEntity(id)) this.invaders.delete(id);
    for (const id of [...this.bosses]) if (!this.world.hasEntity(id)) this.bosses.delete(id);
    if (this.active) this.watchUnits();
    this.payBossKills();

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
      this.payClear();
    }

    if (phase === 'day' && !this.active && !this.armed && this.clock.getPhaseRemaining() <= INVASION_ARM_LEAD) {
      this.armed = true;
      const wave = this.nextComposition();
      this.world.pushNotification('warning', `🪲 Algo se mueve en la maleza: la oleada ${this.waveNumber + 1} (${wave.total} enemigos${this.extrasLabel(wave)}) llegará al anochecer`);
    }
    if (phase === 'day' && !this.active && !this.warned && this.clock.getPhaseRemaining() <= WAVE_WARNING_LEAD) {
      this.warned = true;
      this.spawnPoint = this.pickSpawnPoint();
      const wave = this.nextComposition();
      const intel = this.nextIntel();
      this.showBanner('warning', this.waveNumber + 1, wave.total, {
        elites: wave.elites.length,
        ...(intel.boss ? { bossName: intel.boss.name } : {}),
      });
      this.world.pushNotification('danger', `⚠️ ¡Oleada ${this.waveNumber + 1} en ${WAVE_WARNING_LEAD} s! ${wave.total} enemigos${this.extrasLabel(wave)} vienen hacia tu Centro de Mando`);
    }

    // Waves never stop: one a night, past night 7 and beyond the size cap (the units grow stronger)
    if (nightfall) this.launchWave();
    if (nightfall && isBossNight(this.clock.getDayNumber())) this.launchBoss();

    this.driveTimer -= dt;
    if (this.driveTimer <= 0) {
      this.driveTimer = DRIVE_INTERVAL;
      this.driveInvaders();
    }
  }

  private extrasLabel(wave: WaveComposition): string {
    const parts: string[] = [];
    if (wave.elites.length > 0) parts.push(`${wave.elites.length} ${wave.elites.length === 1 ? 'élite' : 'élites'}`);
    if (wave.boss) parts.push(`el ${MINI_BOSSES[wave.boss].name}`);
    return parts.length > 0 ? `, con ${parts.join(' y ')}` : '';
  }

  private watchUnits(): void {
    for (const id of this.watched) {
      if (this.world.hasEntity(id)) continue;
      this.watched.delete(id);
      this.lost++;
    }
    for (const id of playerUnits(this.world)) this.watched.add(id);
  }

  /** Minerals to the bank; the food share becomes rations */
  pay(reward: WaveReward): WaveReward {
    this.world.minerals.deposit(reward.minerals);
    this.onFood(reward.food);
    return { minerals: reward.minerals, food: reward.food };
  }

  private payClear(): void {
    const perfect = this.lost === 0;
    const reward = waveClearReward(this.waveNumber, perfect);
    this.pay(reward);
    this.watched.clear();
    this.showBanner('cleared', this.waveNumber, this.waveSize, { perfect, reward });
    if (perfect) emitAudio({ type: 'waveFx', kind: 'perfect' });
    this.world.pushNotification(
      'success',
      `🛡️ ¡Oleada ${this.waveNumber} superada!${perfect ? ' ¡Defensa perfecta!' : ''} +${reward.minerals} minerales · +${reward.food} raciones`,
    );
  }

  private payBossKills(): void {
    const kills = waveRuntimeFor(this.world).bossKills;
    if (kills.length === 0) return;
    for (const kill of kills.splice(0)) {
      this.pay(BOSS_REWARD);
      emitAudio({ type: 'waveFx', kind: 'bossDown' });
      this.world.pushNotification('success', `👑 ¡Derrotaste al ${kill.name}! +${BOSS_REWARD.minerals} minerales · +${BOSS_REWARD.food} raciones`);
      this.showBanner('bossDown', this.waveNumber, this.waveSize, { bossName: kill.name, reward: { ...BOSS_REWARD } });
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
    this.bossTier = Math.max(1, Math.floor(wave.wave / 3));
    this.lost = 0;
    this.watched = new Set(playerUnits(this.world));
    if (!this.spawnPoint) this.spawnPoint = this.pickSpawnPoint();
    const affixesOf = (unit: WaveUnitKind) => wave.elites.filter((e) => e.unit === unit).map((e) => e.affix);

    // The rival's raiders (and its mini-boss, the last one sent) march on the command center
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
    const raiders = sent.filter((id) => id !== bossId);
    const droneAffixes = affixesOf('drone');
    raiders.forEach((id, i) => {
      this.scaleUnit(id, wave.statScale, wave.statScale);
      if (i < droneAffixes.length) makeElite(this.world, id, droneAffixes[i]);
      this.invaders.add(id);
    });
    // Raiders the base could not send come as beetles; a rival boss with no base behind it is the Colosal
    const missing = asked - sent.length;
    const colossus = wave.boss === 'colossus' || (surfaceBoss !== null && bossId === null);
    const beetles = wave.beetles + Math.max(0, missing - (surfaceBoss && bossId === null ? 1 : 0));
    const youngAffixes = affixesOf('young');
    const beetleAffixes = [...affixesOf('beetle'), ...droneAffixes.slice(raiders.length)];
    this.pending = [
      ...Array.from({ length: wave.youngBeetles }, (_, i): PendingInvader => ({ kind: 'young', affix: youngAffixes[i] })),
      ...Array.from({ length: beetles }, (_, i): PendingInvader => ({ kind: 'adult', affix: beetleAffixes[i] })),
      ...(colossus ? [{ kind: 'boss' as const }] : []),
    ];
    this.waveSize = this.pending.length + raiders.length + (bossId !== null ? 1 : 0);
    this.spawnInterval = Math.min(1.2, 15 / Math.max(1, this.pending.length));
    if (this.pending.length > 0) this.spawnInvader(this.pending.shift()!);
    this.spawnTimer = this.spawnInterval;

    const bossKind: MiniBossKind | null = bossId !== null ? surfaceBoss : colossus ? 'colossus' : null;
    this.showBanner('arrival', this.waveNumber, this.waveSize, bossKind ? {
      bossName: MINI_BOSSES[bossKind].name,
      bossAbility: MINI_BOSSES[bossKind].ability,
    } : {});
    if (bossKind) {
      this.bannerTimer = WAVE_BANNER_SECONDS + 3;
      emitAudio({ type: 'waveFx', kind: 'boss' });
    }
    const others = raiders.length + (bossId !== null ? 1 : 0);
    const rivals = others > 0 ? ` y ${others} ${this.raidSource?.unitLabel?.(others) ?? 'drones de cristal'}` : '';
    this.world.pushNotification('danger', `🪲 ¡OLEADA ${this.waveNumber} · ${this.waveSize} enemigos! Acorazados${rivals} van hacia tu Centro de Mando`);
    if (bossKind) this.world.pushNotification('danger', `👑 ¡El ${MINI_BOSSES[bossKind].name} encabeza el asalto!`);
  }

  private launchBoss(): void {
    const boss = this.raidSource?.launchBoss?.() ?? null;
    if (boss === null) return;
    markCrystalQueen(this.world, boss);
    this.bosses.add(boss);
    this.invaders.add(boss);
    this.active = true;
    this.waveSize++;
    this.showBanner('arrival', this.waveNumber, this.waveSize);
    this.banner!.boss = true;
    this.bannerTimer = WAVE_BANNER_SECONDS + 3;
  }

  private spawnInvader(next: PendingInvader): void {
    const at = this.spawnPoint ?? { x: 2, y: 2 };
    const id = createBeetle(this.world, at.x, at.y, null);
    this.world.addComponent(id, HUMAN_PLAYER_COMPONENT.WAVE_INVADER, {});
    this.invaders.add(id);
    if (next.kind === 'boss') {
      // The Acorazado Colosal walks in over the surface
      makeMiniBoss(this.world, id, 'colossus', this.bossTier);
      this.scaleUnit(id, this.statScale, this.statScale);
      this.bosses.add(id);
      emitAudio({ type: 'waveFx', kind: 'boss' });
      this.world.pushNotification('danger', `👑 ¡El ${MINI_BOSSES.colossus.name} avanza hacia tu Centro de Mando!`);
      return;
    }
    const young = next.kind === 'young';
    this.scaleUnit(id, (young ? YOUNG_BEETLE_SCALE.health : 1) * this.statScale, (young ? YOUNG_BEETLE_SCALE.damage : 1) * this.statScale);
    if (next.affix) makeElite(this.world, id, next.affix);
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
      const reach = combat.attackRange || BEETLE_STATS.attackRange;
      if (beetle) {
        beetle.targetEntityId = target.id;
        beetle.state = dist < reach ? BeetleState.Attacking : BeetleState.ChasingAnt;
      }
      // The target is named even out of reach, so a Colosal can charge it; CombatSystem hits only in range
      combat.targetEntityId = target.id;
      if (dist < reach) {
        path.waypoints = [];
        path.currentIndex = 0;
        continue;
      }
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
