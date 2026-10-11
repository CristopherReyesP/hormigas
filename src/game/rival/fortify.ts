// Rival bases dig in as time goes by: the longer a base stands, the harder it
// is to take. Every FORTIFY.interval seconds each rival core (a Crystal Hive or
// a Human command center, the start one and Phase 2's alike):
// - grows its hull (up to FORTIFY.maxCoreScale times what it started with);
// - raises one more defense on a ring around it, up to FORTIFY.maxDefenses:
//   a bunker for the Humans, a shielded crystal obelisk that fires for the Hive;
// - toughens the defenses it already has;
// - adds to the army guarding it (drones and sentinels, soldiers and marksmen).
// A base starts already dug in (FORTIFY.startSteps steps), and its ring widens as it grows.

import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, ownerOf, relation } from '../factions/factions';
import { HUMAN_COMPONENT, type HumanBuildingComponent } from './humanComponents';
import { createHumanBuilding, createHumanUnit } from './humanFactories';
import { createCrystalSpire, createCrystalUnit } from './crystalFactories';

export const FORTIFY = {
  /** Game seconds between two fortification steps of a base */
  interval: 60,
  /** Steps a base has taken when it is first seen: it starts dug in */
  startSteps: 3,
  /** Defenses a base raises at most */
  maxDefenses: 20,
  /** Guards it keeps around itself: start + perStep for every step, up to max */
  guards: { start: 3, perStep: 1, max: 24 },
  /** Every this many steps a guard is the heavy kind (a sentinel, a marksman) */
  heavyEvery: 3,
  /** Each step the core's max health grows by this share of what it started with */
  coreGrowth: 0.1,
  maxCoreScale: 3,
  /** Each step the defenses already standing grow by this share */
  defenseGrowth: 0.06,
  /** The ring the defenses stand on (tiles from the core) */
  ringMin: 4,
  ringMax: 11,
  /** The Hive's obelisk: a spire that fires at the player's units */
  obelisk: { damage: 16, range: 5, cooldown: 1.5 },
} as const;

export const FORTIFY_CORE_COMPONENT = 'fortify_core';
export const FORTIFY_DEFENSE_COMPONENT = 'fortify_defense';

export interface FortifyCoreComponent {
  /** Seconds until the next step */
  timer: number;
  /** The core's max health when it started */
  baseHealth: number;
  /** Steps taken so far */
  steps: number;
  /** The defenses it raised */
  defenses: EntityId[];
  /** The guards it called in */
  guards?: EntityId[];
}

export interface FortifyDefenseComponent {
  coreId: EntityId;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export class RivalFortifySystem implements System {
  readonly name = 'RivalFortifySystem';
  readonly priority = 53;

  private world: World;
  private grid: TileGrid;

  constructor(world: World, grid: TileGrid) {
    this.world = world;
    this.grid = grid;
  }

  /** The rival cores standing now: Crystal Hives and Human command centers not owned by the player */
  cores(): EntityId[] {
    const rival = (id: EntityId) => ownerOf(this.world, id) !== FactionId.PLAYER;
    const hives = this.world.query(COMPONENT.CRYSTAL_HIVE, COMPONENT.POSITION).filter(rival);
    const centers = this.world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION).filter((id) =>
      rival(id) && this.world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind === 'command_center');
    return [...hives, ...centers];
  }

  update(dt: number): void {
    for (const core of this.cores()) {
      let state = this.world.getComponent<FortifyCoreComponent>(core, FORTIFY_CORE_COMPONENT);
      if (!state) {
        const health = this.world.getComponent<HealthComponent>(core, COMPONENT.HEALTH);
        state = { timer: FORTIFY.interval, baseHealth: health?.max ?? 1, steps: 0, defenses: [], guards: [] };
        this.world.addComponent<FortifyCoreComponent>(core, FORTIFY_CORE_COMPONENT, state);
        // It starts dug in: a few steps at once, quietly
        for (let i = 0; i < FORTIFY.startSteps; i++) this.step(core, state, false);
      }
      state.timer -= dt;
      if (state.timer > 0) continue;
      state.timer = FORTIFY.interval;
      this.step(core, state);
    }
    this.aimObelisks();
  }

  /** One fortification step of `core` */
  step(core: EntityId, state: FortifyCoreComponent, announce = true): void {
    state.steps++;
    this.callGuards(core, state);
    // The core's hull grows
    const health = this.world.getComponent<HealthComponent>(core, COMPONENT.HEALTH);
    if (health) {
      const max = Math.min(state.baseHealth * FORTIFY.maxCoreScale, health.max + state.baseHealth * FORTIFY.coreGrowth);
      health.current += max - health.max;
      health.max = Math.round(max);
    }
    // Its defenses toughen
    state.defenses = state.defenses.filter((id) => this.world.hasEntity(id));
    for (const id of state.defenses) {
      const h = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (!h) continue;
      const add = Math.round(h.max * FORTIFY.defenseGrowth);
      h.max += add;
      h.current += add;
    }
    // And one more goes up
    if (state.defenses.length >= FORTIFY.maxDefenses) return;
    const at = this.ringSlot(core, state.steps);
    if (!at) return;
    const id = this.raise(core, at.x, at.y);
    if (id === null) return;
    state.defenses.push(id);
    this.world.addComponent<FortifyDefenseComponent>(id, FORTIFY_DEFENSE_COMPONENT, { coreId: core });
    if (announce) this.world.pushNotification('warning', '🛡️ Una base rival se fortifica: más defensas y más tropas', 'rival-fortify', 20_000);
  }

  /** Bring the base's guard up to its size for this step: a few more troops each time */
  private callGuards(core: EntityId, state: FortifyCoreComponent): void {
    state.guards = (state.guards ?? []).filter((id) => this.world.hasEntity(id));
    const want = Math.min(FORTIFY.guards.max, FORTIFY.guards.start + FORTIFY.guards.perStep * state.steps);
    const pos = this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
    const owner = ownerOf(this.world, core) ?? FactionId.RIVAL;
    const hive = this.world.getComponent(core, COMPONENT.CRYSTAL_HIVE) !== undefined;
    for (let i = state.guards.length; i < want; i++) {
      const heavy = (i + 1) % FORTIFY.heavyEvery === 0;
      const at = this.freeTileNear(pos, 3);
      if (!at) break;
      const id = hive
        ? createCrystalUnit(this.world, heavy ? 'sentinel' : 'drone', at.x, at.y, core, owner)
        : createHumanUnit(this.world, heavy ? 'marksman' : 'soldier', at.x, at.y, core, owner);
      state.guards.push(id);
    }
  }

  private freeTileNear(center: { x: number; y: number }, radius: number): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 16; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 1.5 + Math.random() * radius;
      const x = Math.round(center.x + Math.cos(a) * d);
      const y = Math.round(center.y + Math.sin(a) * d);
      if (this.grid.isWalkable(x, y)) return { x, y };
    }
    return null;
  }

  /** A bunker by a Human core, a firing obelisk by a Hive */
  private raise(core: EntityId, x: number, y: number): EntityId | null {
    const owner = ownerOf(this.world, core) ?? FactionId.RIVAL;
    if (this.world.getComponent(core, COMPONENT.CRYSTAL_HIVE) !== undefined) {
      const id = createCrystalSpire(this.world, 'prism', x, y, null, owner);
      this.world.addComponent<CombatComponent>(id, COMPONENT.COMBAT, {
        attackDamage: FORTIFY.obelisk.damage,
        attackRange: FORTIFY.obelisk.range,
        attackCooldown: FORTIFY.obelisk.cooldown,
        attackTimer: 0,
        targetEntityId: null,
      });
      return id;
    }
    return createHumanBuilding(this.world, 'bunker', x, y, owner);
  }

  /** A free walkable tile on the ring around the core, spread by the golden angle */
  private ringSlot(core: EntityId, step: number): { x: number; y: number } | null {
    const pos = this.world.getComponent<PositionComponent>(core, COMPONENT.POSITION)!;
    const taken = this.world.query(COMPONENT.POSITION, COMPONENT.HEALTH)
      .filter((id) => ownerOf(this.world, id) === ownerOf(this.world, core))
      .map((id) => this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!);
    for (let attempt = 0; attempt < 24; attempt++) {
      // The ring widens as the base grows
      const a = (step + attempt) * GOLDEN_ANGLE;
      const reach = Math.min(FORTIFY.ringMax, FORTIFY.ringMin + 1 + Math.floor(step / 3));
      const r = FORTIFY.ringMin + ((step + attempt * 3) % (reach - FORTIFY.ringMin + 1));
      const x = Math.round(pos.x + Math.cos(a) * r);
      const y = Math.round(pos.y + Math.sin(a) * r);
      if (!this.grid.isWalkable(x, y)) continue;
      if (taken.some((t) => Math.hypot(t.x - x, t.y - y) < 2)) continue;
      return { x, y };
    }
    return null;
  }

  /** The Hive's obelisks fire at the nearest hostile unit on the surface in range */
  private aimObelisks(): void {
    const obelisks = this.world.query(FORTIFY_DEFENSE_COMPONENT, COMPONENT.CRYSTAL_SPIRE, COMPONENT.COMBAT, COMPONENT.POSITION);
    if (obelisks.length === 0) return;
    const foes: Array<{ id: EntityId; pos: PositionComponent; owner: FactionId }> = [];
    for (const id of this.world.query(COMPONENT.HEALTH, COMPONENT.POSITION, COMPONENT.COMBAT)) {
      const owner = ownerOf(this.world, id);
      if (owner === null) continue;
      const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue;
      foes.push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!, owner });
    }
    for (const id of obelisks) {
      const own = ownerOf(this.world, id) ?? FactionId.RIVAL;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const inRange = (p: PositionComponent) => Math.hypot(p.x - pos.x, p.y - pos.y) <= combat.attackRange;
      const current = combat.targetEntityId !== null ? foes.find((f) => f.id === combat.targetEntityId) : undefined;
      if (current && inRange(current.pos)) continue;
      let best: EntityId | null = null;
      let bestD = Infinity;
      for (const f of foes) {
        if (relation(own, f.owner) !== 'enemy' || !inRange(f.pos)) continue;
        const d = Math.hypot(f.pos.x - pos.x, f.pos.y - pos.y);
        if (d < bestD) { bestD = d; best = f.id; }
      }
      combat.targetEntityId = best;
    }
  }
}
