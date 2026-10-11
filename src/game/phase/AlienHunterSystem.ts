import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId, Vector2 } from '../../shared/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import { randomEdgeTile } from '../../simulation/world/frontier';
import { findPath } from '../../simulation/pathfinding/AStar';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import { dealDamage } from '../run/waveRuntime';
import { FRONTIER_CREATURE_COMPONENT, createFrontierCreature, frontierCreatureOf, type FrontierCreatureKind } from './frontierCreatures';
import { threatMultipliers } from './threat';

/** How a hunter fights */
type HunterStyle = 'melee' | 'kamikaze' | 'ranged';

export type AlienHunterKind = Extract<FrontierCreatureKind, 'centipede' | 'spore_jelly' | 'acid_spitter'>;

interface HunterRule {
  style: HunterStyle;
  /** The first day it comes */
  firstDay: number;
  /** How many may roam at once: base, one more every `threatPerExtra` threat levels, up to `max` (Phase 2 adds `phase2Extra`) */
  base: number;
  threatPerExtra: number;
  max: number;
  phase2Extra: number;
  /** Seconds between two arrivals while short of the cap */
  spawnEvery: number;
  /** How many arrive together */
  pack: number;
  /** It senses prey this far (tiles); beyond that it heads for the colony */
  sense: number;
  announce: string;
}

/**
 * The alien hunters, each coming from its own day on, more of them as the
 * threat rises (threat.ts):
 * - the plasma centipede: fast, it runs down the ants and bites quickly;
 * - the spore jelly: drifts at the colony and bursts on the first ants it
 *   touches, hurting everything around;
 * - the acid spitter: keeps its distance and spits acid from 5 tiles,
 *   backing off from ants that close in.
 */
export const ALIEN_HUNTERS: Readonly<Record<AlienHunterKind, HunterRule>> = {
  centipede: {
    style: 'melee', firstDay: 4, base: 1, threatPerExtra: 8, max: 4, phase2Extra: 2, spawnEvery: 100, pack: 1, sense: 26,
    announce: '🐛 ¡Un ciempiés de plasma recorre el territorio! Es rapidísimo: no dejes obreras solas',
  },
  spore_jelly: {
    style: 'kamikaze', firstDay: 5, base: 2, threatPerExtra: 6, max: 6, phase2Extra: 3, spawnEvery: 90, pack: 2, sense: 22,
    announce: '🎐 ¡Medusas de esporas flotan hacia la colonia! Revientan al tocar a las hormigas: mátalas de lejos o en grupo',
  },
  acid_spitter: {
    style: 'ranged', firstDay: 6, base: 1, threatPerExtra: 7, max: 5, phase2Extra: 2, spawnEvery: 110, pack: 1, sense: 24,
    announce: '🦗 ¡Un escupidor ácido acecha! Ataca desde lejos: envía soldados a cazarlo',
  },
};

/** The spore jelly's burst: damage to every unit of the colony within `radius` tiles */
export const JELLY_BURST = { radius: 2.5, damage: 40, trigger: 1.3 } as const;
/** The spitter backs off when an ant comes this close */
const SPITTER_BACKOFF = 2.2;
const REPATH = 1;
const PATH_STEPS = 6000;

export interface HunterClock {
  getDayNumber(): number;
}

export class AlienHunterSystem implements System {
  readonly name = 'AlienHunterSystem';
  readonly priority = 52; // with the tarantula, before movement

  private world: World;
  private grid: TileGrid;
  private clock: HunterClock;
  private colony: () => Vector2 | null;
  private threat: () => number;
  phase2 = false;
  /** Seconds until each kind's next arrival */
  timers: Record<AlienHunterKind, number> = { centipede: 30, spore_jelly: 30, acid_spitter: 30 };
  /** Kinds already announced */
  announced: AlienHunterKind[] = [];
  private repath = new Map<EntityId, number>();

  constructor(world: World, grid: TileGrid, clock: HunterClock, colony: () => Vector2 | null, threat: () => number) {
    this.world = world;
    this.grid = grid;
    this.clock = clock;
    this.colony = colony;
    this.threat = threat;
  }

  setPhase2(): void {
    this.phase2 = true;
  }

  /** How many of `kind` may roam at once now */
  cap(kind: AlienHunterKind): number {
    const rule = ALIEN_HUNTERS[kind];
    if (!this.phase2 && this.clock.getDayNumber() < rule.firstDay) return 0;
    const fromThreat = Math.floor(this.threat() / rule.threatPerExtra);
    return Math.min(rule.max + (this.phase2 ? rule.phase2Extra : 0), rule.base + fromThreat + (this.phase2 ? rule.phase2Extra : 0));
  }

  hunters(kind?: AlienHunterKind): EntityId[] {
    return this.world.query(FRONTIER_CREATURE_COMPONENT).filter((id) => {
      const k = frontierCreatureOf(this.world, id)!.kind;
      return kind ? k === kind : k in ALIEN_HUNTERS;
    });
  }

  /** A pack of `kind` comes in at the edge of the area the run plays on */
  spawn(kind: AlienHunterKind): EntityId[] {
    const rule = ALIEN_HUNTERS[kind];
    for (let attempt = 0; attempt < 20; attempt++) {
      const at = randomEdgeTile(this.grid.bounds, Math.floor(Math.random() * 4), Math.random, 2);
      if (!this.grid.isWalkable(at.x, at.y)) continue;
      const out: EntityId[] = [];
      for (let i = 0; i < rule.pack; i++) out.push(createFrontierCreature(this.world, kind, at.x + (i % 2), at.y + Math.floor(i / 2), null));
      if (!this.announced.includes(kind)) {
        this.announced.push(kind);
        this.world.pushNotification('danger', rule.announce);
      }
      return out;
    }
    return [];
  }

  update(dt: number): void {
    for (const kind of Object.keys(ALIEN_HUNTERS) as AlienHunterKind[]) {
      this.timers[kind] -= dt;
      if (this.timers[kind] > 0) continue;
      this.timers[kind] = ALIEN_HUNTERS[kind].spawnEvery * (this.phase2 ? 0.6 : 1);
      if (this.hunters(kind).length < this.cap(kind)) this.spawn(kind);
    }
    const hunters = this.hunters();
    if (hunters.length === 0) return;
    const prey = this.prey();
    for (const id of hunters) {
      if (!this.world.hasEntity(id)) continue;
      const kind = frontierCreatureOf(this.world, id)!.kind as AlienHunterKind;
      this.hunt(id, kind, prey, dt);
    }
  }

  /** The player's units on the surface: ants first (other races' units when there are none) */
  private prey(): Array<{ id: EntityId; pos: PositionComponent }> {
    const out: Array<{ id: EntityId; pos: PositionComponent }> = [];
    const collect = (ids: readonly EntityId[], playerOnly: boolean) => {
      for (const id of ids) {
        if (playerOnly && ownerOf(this.world, id) !== FactionId.PLAYER) continue;
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
        if (layer && layer.layer !== Layer.Surface) continue;
        const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
        if (health && health.current <= 0) continue;
        out.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
      }
    };
    collect(this.world.query(COMPONENT.ANT, COMPONENT.POSITION), false);
    if (out.length === 0) collect(this.world.query(COMPONENT.HEALTH, COMPONENT.POSITION, COMPONENT.COMBAT), true);
    return out;
  }

  private hunt(id: EntityId, kind: AlienHunterKind, prey: ReadonlyArray<{ id: EntityId; pos: PositionComponent }>, dt: number): void {
    const rule = ALIEN_HUNTERS[kind];
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH);
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (!path || !combat) return;

    let target: { id: EntityId; pos: PositionComponent } | null = null;
    let best: number = rule.sense;
    for (const p of prey) {
      const d = Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y);
      if (d < best) { best = d; target = p; }
    }

    if (rule.style === 'kamikaze' && target && best <= JELLY_BURST.trigger) {
      this.burst(id, pos, prey);
      return;
    }
    if (rule.style === 'ranged' && target) {
      if (best <= SPITTER_BACKOFF) {
        // Too close: back off, away from the ant
        const len = best || 1;
        const away = { x: Math.round(pos.x + ((pos.x - target.pos.x) / len) * 3), y: Math.round(pos.y + ((pos.y - target.pos.y) / len) * 3) };
        combat.targetEntityId = null;
        if (this.grid.isWalkable(away.x, away.y)) {
          path.waypoints = [away];
          path.currentIndex = 0;
        }
        return;
      }
      if (best <= combat.attackRange) {
        // In range: stand and spit
        combat.targetEntityId = target.id;
        path.waypoints = [];
        path.currentIndex = 0;
        return;
      }
    } else if (rule.style === 'melee' && target && best <= combat.attackRange + 0.2) {
      combat.targetEntityId = target.id;
      path.waypoints = [];
      path.currentIndex = 0;
      return;
    }
    combat.targetEntityId = null;

    const wait = (this.repath.get(id) ?? 0) - dt;
    this.repath.set(id, wait);
    if (wait > 0 && path.currentIndex < path.waypoints.length) return;
    this.repath.set(id, REPATH);
    const goal = target ? { x: target.pos.x, y: target.pos.y } : this.colony();
    if (!goal) return;
    const route = findPath(this.grid, { x: Math.round(pos.x), y: Math.round(pos.y) }, { x: Math.round(goal.x), y: Math.round(goal.y) }, PATH_STEPS);
    if (route && route.length > 0) {
      path.waypoints = route;
      path.currentIndex = 0;
    }
  }

  /** The spore jelly bursts: everything of the colony around takes the blast, and the jelly is gone */
  private burst(id: EntityId, pos: PositionComponent, prey: ReadonlyArray<{ id: EntityId; pos: PositionComponent }>): void {
    const level = this.world.getComponent<{ level: number }>(id, 'threat_scaled')?.level ?? 0;
    const damage = JELLY_BURST.damage * threatMultipliers(level).damage;
    for (const p of prey) {
      if (Math.hypot(p.pos.x - pos.x, p.pos.y - pos.y) <= JELLY_BURST.radius) dealDamage(this.world, p.id, damage);
    }
    const self = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (self) dealDamage(this.world, id, self.current + 1);
    this.repath.delete(id);
  }
}
