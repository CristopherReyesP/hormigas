import type { WaveDirector } from '../human/HumanWaveSystem';
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
import {
  waveComposition,
  YOUNG_BEETLE_SCALE,
  type EliteAffix,
  type MiniBossKind,
  type WaveElite,
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
} from '../../systems/UndergroundInvasionSystem';
import type { DayPhase } from '../../systems/DayNightSystem';
import {
  INVASION_ARM_LEAD,
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

interface Pending {
  kind: 'young' | 'adult' | 'boss';
  affix?: EliteAffix;
}

/** One night's wave against the Crystal Hive */
interface CrystalWave {
  wave: number;
  young: number;
  beetles: number;
  /** The rival base's raiders (none against the wildlife) */
  raiders: number;
  elites: WaveElite[];
  boss: MiniBossKind | null;
  total: number;
  statScale: number;
}

const GROUP_LABELS: Record<WaveUnitKind, (rival: WaveRival) => string> = {
  young: () => 'Acorazados jóvenes',
  beetle: () => 'Acorazados',
  drone: (rival) => (rival === 'human' ? 'Tropas humanas' : 'Drones de cristal'),
};

/**
 * Night waves against a Crystal player (P10). There is no cave to breach:
 * every nightfall the wave's beetles (half the Swarm's count, the Crystal Hive
 * has fewer units) walk in from a map edge and march on the Hive across the
 * surface, and the rival base (RaidSource) sends its raiders at the Hive too.
 * The waves follow waveComposition: elites from wave 3, a mini-boss every
 * third wave (the rival's own leads its raiders; the Acorazado Colosal walks
 * in with the beetles), the Crystal Queen on night 7, and the run is endless.
 * Clearing a wave and killing a boss pay minerals. Raiders fight the Crystal
 * units and structures they meet. Reports the same InvasionInfo the HUD reads.
 */
export class CrystalSurfaceWaveSystem implements WaveDirector {
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
  private bossTier = 1;
  private invaders = new Set<EntityId>();
  private bosses = new Set<EntityId>();
  private pending: Pending[] = [];
  private spawnTimer = 0;
  private driveTimer = 0;
  private banner: WaveBanner | null = null;
  private bannerTimer = 0;
  private nextBannerId = 1;
  /** Own units alive when the wave struck: losing none makes a perfect defense */
  private watched = new Set<EntityId>();
  private lost = 0;

  constructor(world: World, grid: PathGrid, clock: WaveClock) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.prevPhase = clock.getPhase();
  }

  setRaidSource(source: RaidSource | null): void {
    this.raidSource = source;
  }

  /**
   * Pay a reward (a night milestone). The Crystal Hive eats nothing: the food
   * share comes as minerals too, so the whole reward lands in the bank.
   */
  pay(reward: WaveReward): WaveReward {
    const minerals = Math.max(0, reward.minerals) + Math.max(0, reward.food);
    this.world.minerals.deposit(minerals);
    return { minerals, food: 0 };
  }

  /** No cave, no garrison below: the Swarm's garrison setting does nothing here */
  setGarrison(_count: number): void {}

  getGarrison(): number {
    return 0;
  }

  /** A unit that joined the wave on now (a Prisma Guardián's shard): it counts until it dies */
  addInvader(id: EntityId): void {
    if (!this.world.hasEntity(id)) return;
    this.invaders.add(id);
    if (this.waveActive) this.waveSize++;
  }

  private rival(): WaveRival {
    return this.raidSource ? this.raidSource.rival ?? 'crystal' : 'wildlife';
  }

  /** The next wave: the rival's raiders in full, the beetles thinned; elites kept within each kind */
  private nextWave(): CrystalWave {
    const base = waveComposition(this.waveNumber + 1, this.rival());
    const raiders = this.raidSource ? base.drones : 0;
    const extra = Math.max(0, this.world.runModifiers.extraInvadersPerWave);
    const allBeetles = crystalWaveBeetles(base.youngBeetles + base.beetles + (base.drones - raiders) + extra);
    const young = Math.min(allBeetles, Math.round((allBeetles * base.youngBeetles) / Math.max(1, base.youngBeetles + base.beetles)));
    const beetles = allBeetles - young;
    const limit: Record<WaveUnitKind, number> = { young, beetle: beetles, drone: raiders };
    const used: Record<WaveUnitKind, number> = { young: 0, beetle: 0, drone: 0 };
    const elites: WaveElite[] = [];
    for (const e of base.elites) {
      const unit: WaveUnitKind = e.unit === 'drone' && raiders === 0 ? 'beetle' : e.unit;
      if (used[unit] >= limit[unit]) continue;
      used[unit]++;
      elites.push({ unit, affix: e.affix });
    }
    let boss: MiniBossKind | null = base.boss;
    if (boss && boss !== 'colossus' && !this.raidSource) boss = 'colossus';
    // On the Crystal Queen's night she is the boss: no mini-boss joins her
    if (boss && isBossNight(this.clock.getDayNumber()) && this.raidSource?.launchBoss) boss = null;
    return { wave: base.wave, young, beetles, raiders, elites, boss, total: allBeetles + raiders + (boss ? 1 : 0), statScale: base.statScale };
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
      next: this.waveActive ? null : this.nextIntel(),
      boss: this.bossBar(),
    };
  }

  /** The scouted next wave: its mix, elites, boss and the edge it walks in from */
  private nextIntel(): NextWaveIntel {
    const wave = this.nextWave();
    const rival = this.rival();
    const groups = ([['young', wave.young], ['beetle', wave.beetles], ['drone', wave.raiders]] as const)
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
    const edge = this.edgeOf(this.waveNumber + 1);
    const hive = this.hiveTile();
    return {
      wave: wave.wave,
      total: wave.total,
      groups,
      elites,
      boss,
      entrance: null,
      surface: { x: edge.x, y: edge.y, direction: compassLabel(hive.x, hive.y, edge.x, edge.y) },
    };
  }

  private hiveTile(): Vector2 {
    const core = this.world.factions.get(FactionId.PLAYER)?.coreId;
    const pos = core !== undefined ? this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION) : undefined;
    return pos ? { x: pos.x, y: pos.y } : { x: Math.floor(this.grid.width / 2), y: Math.floor(this.grid.height / 2) };
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

  update(dt: number): void {
    for (const id of [...this.invaders]) if (!this.world.hasEntity(id)) this.invaders.delete(id);
    for (const id of [...this.bosses]) if (!this.world.hasEntity(id)) this.bosses.delete(id);
    if (this.waveActive) this.watchUnits();
    this.payBossKills();

    if (this.pending.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = SPAWN_INTERVAL;
        this.spawn(this.pending.shift()!);
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
      this.payClear();
    }

    if (phase === 'day' && !this.waveActive && !this.waveArmed && this.clock.getPhaseRemaining() <= INVASION_ARM_LEAD) {
      this.waveArmed = true;
      const wave = this.nextWave();
      this.world.pushNotification('warning', `🪲 Algo se mueve en los bordes del mapa: la oleada ${this.waveNumber + 1} (${wave.total} enemigos${this.extrasLabel(wave)}) atacará la colmena al anochecer`);
    }
    if (phase === 'day' && !this.waveActive && !this.warned && this.clock.getPhaseRemaining() <= WAVE_WARNING_LEAD) {
      this.warned = true;
      const wave = this.nextWave();
      const intel = this.nextIntel();
      this.showBanner('warning', this.waveNumber + 1, wave.total, { elites: wave.elites.length, ...(intel.boss ? { bossName: intel.boss.name } : {}) });
      this.world.pushNotification('danger', `⚠️ ¡Oleada ${this.waveNumber + 1} en ${WAVE_WARNING_LEAD} s! ${wave.total} enemigos${this.extrasLabel(wave)} hacia la colmena`);
    }

    // A wave still marching never holds the next one back: the new one joins it
    if (nightfall) this.launchWave();
    if (nightfall && isBossNight(this.clock.getDayNumber())) this.launchQueen();

    this.driveTimer -= dt;
    if (this.driveTimer <= 0) {
      this.driveTimer = DRIVE_INTERVAL;
      this.driveRaiders();
    }
  }

  private extrasLabel(wave: CrystalWave): string {
    const parts: string[] = [];
    if (wave.elites.length > 0) parts.push(`${wave.elites.length} ${wave.elites.length === 1 ? 'élite' : 'élites'}`);
    if (wave.boss) parts.push(`el ${MINI_BOSSES[wave.boss].name}`);
    return parts.length > 0 ? `, con ${parts.join(' y ')}` : '';
  }

  private showBanner(kind: WaveBannerKind, wave: number, count: number, extra: Partial<WaveBanner> = {}): void {
    this.banner = { id: this.nextBannerId++, kind, wave, count, ...extra };
    this.bannerTimer = WAVE_BANNER_SECONDS;
  }

  private ownUnits(): EntityId[] {
    return this.world.query(COMPONENT.CRYSTAL_UNIT).filter((id) => ownerOf(this.world, id) === FactionId.PLAYER);
  }

  private watchUnits(): void {
    for (const id of this.watched) {
      if (this.world.hasEntity(id)) continue;
      this.watched.delete(id);
      this.lost++;
    }
    for (const id of this.ownUnits()) this.watched.add(id);
  }

  /** The wave is cleared: minerals, more for a defense that lost no unit */
  private payClear(): void {
    const perfect = this.lost === 0;
    const reward = waveClearReward(this.waveNumber, perfect);
    this.world.minerals.deposit(reward.minerals);
    this.watched.clear();
    this.showBanner('cleared', this.waveNumber, this.waveSize, { perfect, reward: { minerals: reward.minerals, food: 0 } });
    if (perfect) emitAudio({ type: 'waveFx', kind: 'perfect' });
    this.world.pushNotification('success', `🛡️ ¡Oleada ${this.waveNumber} superada!${perfect ? ' ¡Defensa perfecta!' : ''} +${reward.minerals} minerales`);
  }

  /** A mini-boss fell: its mineral reward, always */
  private payBossKills(): void {
    const kills = waveRuntimeFor(this.world).bossKills;
    if (kills.length === 0) return;
    for (const kill of kills.splice(0)) {
      this.world.minerals.deposit(BOSS_REWARD.minerals);
      emitAudio({ type: 'waveFx', kind: 'bossDown' });
      this.world.pushNotification('success', `👑 ¡Derrotaste al ${kill.name}! +${BOSS_REWARD.minerals} minerales`);
      this.showBanner('bossDown', this.waveNumber, this.waveSize, { bossName: kill.name, reward: { minerals: BOSS_REWARD.minerals, food: 0 } });
    }
  }

  private launchWave(): void {
    emitAudio({ type: 'wave' });
    const wave = this.nextWave();
    this.waveNumber++;
    this.waveActive = true;
    this.waveArmed = false;
    this.warned = false;
    this.statScale = wave.statScale;
    this.bossTier = Math.max(1, Math.floor(wave.wave / 3));
    this.lost = 0;
    this.watched = new Set(this.ownUnits());
    const affixesOf = (unit: WaveUnitKind) => wave.elites.filter((e) => e.unit === unit).map((e) => e.affix);

    // The rival's raiders march on the Hive; its mini-boss leaves with them as the last one sent
    const surfaceBoss = wave.boss === 'prism' || wave.boss === 'colonel' ? wave.boss : null;
    const asked = wave.raiders + (surfaceBoss ? 1 : 0);
    const sent = asked > 0 && this.raidSource ? this.raidSource.launch(asked) : [];
    let bossId: EntityId | null = null;
    if (surfaceBoss && sent.length > 0) {
      bossId = sent[sent.length - 1];
      makeMiniBoss(this.world, bossId, surfaceBoss, this.bossTier);
      this.scale(bossId, wave.statScale, wave.statScale);
      this.bosses.add(bossId);
      this.invaders.add(bossId);
    }
    const raiders = sent.filter((id) => id !== bossId);
    const raiderAffixes = affixesOf('drone');
    raiders.forEach((id, i) => {
      this.scale(id, wave.statScale, wave.statScale);
      if (i < raiderAffixes.length) makeElite(this.world, id, raiderAffixes[i]);
      this.invaders.add(id);
    });
    // Raiders the rival could not send come as beetles; a boss with no base behind it is the Colosal
    const missing = asked - sent.length;
    const colossus = wave.boss === 'colossus' || (surfaceBoss !== null && bossId === null);
    const beetles = wave.beetles + Math.max(0, missing - (surfaceBoss && bossId === null ? 1 : 0));
    const youngAffixes = affixesOf('young');
    const beetleAffixes = [...affixesOf('beetle'), ...raiderAffixes.slice(raiders.length)];
    this.pending.push(
      ...Array.from({ length: wave.young }, (_, i): Pending => ({ kind: 'young', affix: youngAffixes[i] })),
      ...Array.from({ length: beetles }, (_, i): Pending => ({ kind: 'adult', affix: beetleAffixes[i] })),
      ...(colossus ? [{ kind: 'boss' as const }] : []),
    );
    this.waveSize = wave.young + beetles + raiders.length + (bossId !== null || colossus ? 1 : 0);
    if (this.pending.length > 0) this.spawn(this.pending.shift()!);
    this.spawnTimer = SPAWN_INTERVAL;

    const bossKind: MiniBossKind | null = bossId !== null ? surfaceBoss : colossus ? 'colossus' : null;
    this.showBanner('arrival', this.waveNumber, this.waveSize, bossKind ? { bossName: MINI_BOSSES[bossKind].name, bossAbility: MINI_BOSSES[bossKind].ability } : {});
    if (bossKind) {
      this.bannerTimer = WAVE_BANNER_SECONDS + 3;
      emitAudio({ type: 'waveFx', kind: 'boss' });
    }
    const side = compassLabel(this.hiveTile().x, this.hiveTile().y, this.edgeOf(this.waveNumber).x, this.edgeOf(this.waveNumber).y);
    const rival = raiders.length > 0 || bossId !== null
      ? ` y ${raiders.length + (bossId !== null ? 1 : 0)} ${this.raidSource?.unitLabel?.(raiders.length) ?? 'drones de cristal'} desde su base`
      : '';
    this.world.pushNotification('danger', `🪲 ¡OLEADA ${this.waveNumber} · ${this.waveSize} enemigos! Acorazados desde el ${side}${rival}, hacia tu colmena`);
    if (bossId !== null && bossKind) this.world.pushNotification('danger', `👑 ¡El ${MINI_BOSSES[bossKind].name} encabeza el asalto!`);
  }

  /** The boss night: the Crystal Queen (a Crystal rival only) joins whatever wave is on */
  private launchQueen(): void {
    const boss = this.raidSource?.launchBoss?.() ?? null;
    if (boss === null) return;
    markCrystalQueen(this.world, boss);
    this.bosses.add(boss);
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
    const start = (((wave - 1) % edges.length) + edges.length) % edges.length;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[(start + i) % edges.length];
      if (this.grid.isWalkable(edge.x, edge.y)) return edge;
    }
    return edges[start];
  }

  private spawn(next: Pending): void {
    const edge = this.edgeOf(this.waveNumber);
    const id = createBeetle(this.world, edge.x, edge.y, null);
    this.world.addComponent(id, CRYSTAL_PLAYER_COMPONENT.SURFACE_RAIDER, { wave: this.waveNumber });
    if (next.kind === 'boss') {
      makeMiniBoss(this.world, id, 'colossus', this.bossTier);
      this.scale(id, this.statScale, this.statScale);
      this.bosses.add(id);
      this.invaders.add(id);
      emitAudio({ type: 'waveFx', kind: 'boss' });
      this.world.pushNotification('danger', `👑 ¡El ${MINI_BOSSES.colossus.name} avanza hacia tu colmena!`);
      return;
    }
    const young = next.kind === 'young';
    this.scale(id, (young ? YOUNG_BEETLE_SCALE.health : 1) * this.statScale, (young ? YOUNG_BEETLE_SCALE.damage : 1) * this.statScale);
    if (next.affix) makeElite(this.world, id, next.affix);
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
    const next = this.nextWave();
    const origin = next.raiders > 0 || (next.boss !== null && next.boss !== 'colossus') ? this.raidSource?.origin() ?? null : null;
    if (origin) out.push({ x: origin.x, y: origin.y, layer: 'surface' });
    return out;
  }
}
