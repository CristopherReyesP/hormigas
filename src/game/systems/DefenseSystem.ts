import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { UndergroundTerrainType, ChamberType } from '../../simulation/world/types';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type LayerValue,
  type OwnerComponent,
  type PathComponent,
  type PositionComponent,
} from '../components/components';
import { FactionId, isHostileTo } from '../factions/factions';
import { HUMAN_COMPONENT } from '../rival/humanComponents';
import {
  DEFENSE_AREA,
  DEFENSE_STATS,
  STRUCTURE_COMPONENT,
  checkPlacement,
  type DefenseKind,
  type DefenseLayer,
  type PlacementQuery,
  type PlacementRefusal,
  type StructureComponent,
} from '../run/defenses';
import { dealDamage, pushWaveFx, setSpeedFactor, speedFactorOf } from '../run/waveRuntime';
import { ARMOR_COMPONENT, type ArmorComponent } from './helpers/combatHelpers';
import { emitAudio } from '../../audio/events';
import { ENTRANCE_ROW, WORLD_HEIGHT, WORLD_WIDTH } from '../../shared/constants';

export { STRUCTURE_COMPONENT, type StructureComponent };

/** What a spine shoots and a trap catches: the units that attack the colony */
const HOSTILE_STORES = [COMPONENT.BEETLE, COMPONENT.CRICKET, COMPONENT.CRYSTAL_UNIT, HUMAN_COMPONENT.UNIT] as const;

/** Seconds a trap's slow lingers after an enemy steps out of the resin */
const TRAP_LINGER = 0.5;
const TRAP_SLOW_KEY = 'resin';

export type PlaceResult =
  | { ok: true; id: EntityId; message: string }
  | { ok: false; reason: PlacementRefusal; message: string; id?: undefined };

interface Victim {
  id: EntityId;
  pos: PositionComponent;
}

/**
 * The colony's nest defenses (P7.3): places them (paid from the minerals
 * bank, with the placement rules of defenses.ts) and runs them. Espinas shoot
 * the nearest hostile in range; Trampas de resina slow and bite what stands
 * in them until the resin runs dry, then refill; Muros de quitina are
 * unwalkable tiles with health that enemies route around or break. When a
 * wall falls, its tile is walkable again.
 * Surface: around the nest. Underground: around the entrances (the breach).
 */
export class DefenseSystem implements System {
  readonly name = 'DefenseSystem';
  readonly priority = 6.6; // after the AIs, before CombatSystem (7) buries what it killed

  private world: World;
  private surface: TileGrid;
  private underground: UndergroundGrid;
  /** Walls standing, by entity: the tile to free when one falls */
  private walls = new Map<EntityId, { layer: DefenseLayer; x: number; y: number }>();
  /** Enemies slowed by resin: seconds of slow left after leaving it */
  private slowed = new Map<EntityId, number>();

  constructor(world: World, surface: TileGrid, underground: UndergroundGrid) {
    this.world = world;
    this.surface = surface;
    this.underground = underground;
  }

  /** The nest tile on the surface (the map centre when there is no nest) */
  private nestTile(): { x: number; y: number } {
    const nest = this.world.query(COMPONENT.NEST, COMPONENT.POSITION)[0];
    const pos = nest !== undefined ? this.world.getComponent<PositionComponent>(nest, COMPONENT.POSITION) : undefined;
    return pos ? { x: Math.round(pos.x), y: Math.round(pos.y) } : { x: Math.floor(WORLD_WIDTH / 2), y: Math.floor(WORLD_HEIGHT / 2) };
  }

  /** The queen's tile below (the nest's heart, what a wall may never cut off) */
  private queenTile(): { x: number; y: number } {
    const queen = this.world.query(COMPONENT.QUEEN_ENTITY, COMPONENT.POSITION)[0];
    const pos = queen !== undefined ? this.world.getComponent<PositionComponent>(queen, COMPONENT.POSITION) : undefined;
    if (pos && this.underground.isWalkable(Math.floor(pos.x), Math.floor(pos.y))) return { x: Math.floor(pos.x), y: Math.floor(pos.y) };
    return { x: Math.floor(this.underground.width / 2), y: Math.floor(this.underground.height / 2) };
  }

  /** The structure standing on a tile, if any */
  structureAt(layer: DefenseLayer, x: number, y: number): EntityId | null {
    for (const id of this.world.query(STRUCTURE_COMPONENT)) {
      const s = this.world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)!;
      if (s.layer === layer && s.x === x && s.y === y) return id;
    }
    return null;
  }

  /** The tiles the build area is around, per layer (the minimap and the ghost show it) */
  buildAnchors(layer: DefenseLayer): Array<{ x: number; y: number }> {
    return layer === 'surface' ? [this.nestTile()] : this.underground.getEntrances();
  }

  private query(kind: DefenseKind, layer: DefenseLayer, x: number, y: number): PlacementQuery {
    const occupied = (tx: number, ty: number) => this.structureAt(layer, tx, ty) !== null;
    if (layer === 'surface') {
      const nest = this.nestTile();
      return {
        kind, x, y,
        minerals: this.world.minerals.stored,
        width: this.surface.width,
        height: this.surface.height,
        isWalkable: (tx, ty) => this.surface.isWalkable(tx, ty),
        isOccupied: occupied,
        home: nest,
        anchors: [nest],
        areaRadius: DEFENSE_AREA.surfaceRadius,
        keepClear: DEFENSE_AREA.nestClear,
      };
    }
    const grid = this.underground;
    return {
      kind, x, y,
      minerals: this.world.minerals.stored,
      width: grid.width,
      height: grid.height,
      isWalkable: (tx, ty) => grid.isWalkable(tx, ty),
      isOccupied: occupied,
      home: this.queenTile(),
      anchors: grid.getEntrances(),
      areaRadius: DEFENSE_AREA.breachRadius,
      // Walls only on plain tunnels: never the entrance row (it would close the
      // entrance itself) nor a chamber the colony uses
      canWall: (tx, ty) => {
        const tile = grid.getTile(tx, ty);
        return ty !== ENTRANCE_ROW && tile !== null && (tile.terrain === UndergroundTerrainType.Tunnel || (tile.terrain === UndergroundTerrainType.Chamber && tile.chamberType === null));
      },
    };
  }

  /** Whether `kind` may go on (x, y) of `layer` right now */
  check(kind: DefenseKind, layer: DefenseLayer, x: number, y: number) {
    if (layer === 'underground') {
      const tile = this.underground.getTile(x, y);
      if (tile?.chamberType === ChamberType.Queen) return { ok: false as const, reason: 'area' as const, message: 'No se puede construir en la cámara de la reina.' };
    }
    return checkPlacement(this.query(kind, layer, x, y));
  }

  /** Build `kind` on (x, y) of `layer`, paying its cost; refused (and nothing paid) when the rules say no */
  place(kind: DefenseKind, layer: DefenseLayer, x: number, y: number): PlaceResult {
    const verdict = this.check(kind, layer, x, y);
    if (!verdict.ok) return verdict;
    const stats = DEFENSE_STATS[kind];
    if (!this.world.minerals.spend(stats.cost)) return { ok: false, reason: 'minerals', message: 'Faltan minerales.' };
    const id = this.world.createEntity();
    this.world.addComponent<PositionComponent>(id, COMPONENT.POSITION, { x, y, prevX: x, prevY: y });
    this.world.addComponent<HealthComponent>(id, COMPONENT.HEALTH, { current: stats.health, max: stats.health, damage: stats.damage });
    if (stats.armor > 0) this.world.addComponent<ArmorComponent>(id, ARMOR_COMPONENT, { armor: stats.armor });
    this.world.addComponent<LayerComponent>(id, COMPONENT.LAYER, { layer: layer === 'surface' ? Layer.Surface : Layer.Underground });
    this.world.addComponent<OwnerComponent>(id, COMPONENT.OWNER, { faction: FactionId.PLAYER });
    this.world.addComponent<StructureComponent>(id, STRUCTURE_COMPONENT, {
      kind, layer, x, y,
      timer: 0,
      targetId: null,
      charges: stats.charges,
      rechargeTimer: 0,
    });
    if (kind === 'wall') {
      this.setWalkable(layer, x, y, false);
      this.walls.set(id, { layer, x, y });
    }
    return { ok: true, id, message: `${stats.name} ${kind === 'wall' ? 'construido' : 'construida'} (-${stats.cost} minerales)` };
  }

  /** What a spine last shot at (null when idle) */
  targetOf(id: EntityId): EntityId | null {
    return this.world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)?.targetId ?? null;
  }

  private setWalkable(layer: DefenseLayer, x: number, y: number, walkable: boolean): void {
    if (layer === 'surface') {
      const tile = this.surface.getTile(x, y);
      if (tile) tile.walkable = walkable;
    } else {
      const tile = this.underground.getTile(x, y);
      if (tile) tile.walkable = walkable;
      this.underground.markLayoutChanged();
    }
    if (!walkable) this.rerouteThrough(layer, x, y);
  }

  /** Units whose route crosses a new wall drop it, so their AI plans again around it */
  private rerouteThrough(layer: DefenseLayer, x: number, y: number): void {
    const want: LayerValue = layer === 'surface' ? Layer.Surface : Layer.Underground;
    for (const id of this.world.query(COMPONENT.PATH, COMPONENT.LAYER)) {
      if (this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)!.layer !== want) continue;
      const path = this.world.getComponent<PathComponent>(id, COMPONENT.PATH)!;
      const rest = path.waypoints.slice(path.currentIndex);
      if (rest.some((p) => Math.floor(p.x + (layer === 'surface' ? 0.5 : 0)) === x && Math.floor(p.y + (layer === 'surface' ? 0.5 : 0)) === y)) {
        path.waypoints = [];
        path.currentIndex = 0;
      }
    }
  }

  /** Held (the tutorial's calm): spines and traps stand idle, so the practice wave is the soldiers' to fight */
  private held = false;

  setHeld(held: boolean): void {
    this.held = held;
  }

  update(dt: number): void {
    // Fallen walls free their tile
    for (const [id, wall] of this.walls) {
      if (this.world.hasEntity(id)) continue;
      this.walls.delete(id);
      this.setWalkable(wall.layer, wall.x, wall.y, true);
    }
    if (this.held) return;
    const structures = this.world.query(STRUCTURE_COMPONENT);
    if (structures.length === 0 && this.slowed.size === 0) return;
    const victims = this.snapshotHostiles();
    const caught = new Set<EntityId>();
    for (const id of structures) {
      const s = this.world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)!;
      if (s.kind === 'spine') this.fireSpine(s, victims[s.layer], dt);
      else if (s.kind === 'trap') this.runTrap(s, victims[s.layer], dt, caught);
    }
    this.updateSlows(caught, dt);
    this.pressWalls(structures, victims);
  }

  /**
   * Enemies with nothing to fight that stand at a wall break it: the AIs never
   * chase a wall (its tile cannot be walked to), so this points them at the
   * ones they bump into. Runs after the AIs and before CombatSystem.
   */
  private pressWalls(structures: EntityId[], victims: Record<DefenseLayer, Victim[]>): void {
    const walls = structures
      .map((id) => ({ id, s: this.world.getComponent<StructureComponent>(id, STRUCTURE_COMPONENT)! }))
      .filter((w) => w.s.kind === 'wall');
    if (walls.length === 0) return;
    for (const layer of ['surface', 'underground'] as const) {
      for (const v of victims[layer]) {
        const combat = this.world.getComponent<CombatComponent>(v.id, COMPONENT.COMBAT);
        if (!combat || (combat.targetEntityId !== null && this.world.hasEntity(combat.targetEntityId) && !this.isFarQueen(combat.targetEntityId, v.pos))) continue;
        for (const w of walls) {
          if (w.s.layer !== layer) continue;
          if (Math.hypot(w.s.x - v.pos.x, w.s.y - v.pos.y) > combat.attackRange + 0.6) continue;
          combat.targetEntityId = w.id;
          break;
        }
      }
    }
  }

  /** Underground invaders always aim at the queen; a wall in their face comes first while she is far */
  private isFarQueen(targetId: EntityId, from: PositionComponent): boolean {
    if (!this.world.getComponent(targetId, COMPONENT.QUEEN_ENTITY)) return false;
    const queen = this.world.getComponent<PositionComponent>(targetId, COMPONENT.POSITION);
    return !queen || Math.hypot(queen.x - from.x, queen.y - from.y) > 3;
  }

  private snapshotHostiles(): Record<DefenseLayer, Victim[]> {
    const out: Record<DefenseLayer, Victim[]> = { surface: [], underground: [] };
    for (const store of HOSTILE_STORES) {
      for (const id of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
        if (!isHostileTo(this.world, FactionId.PLAYER, id)) continue;
        if (this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!.current <= 0) continue;
        const layer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer === Layer.Underground ? 'underground' : 'surface';
        out[layer].push({ id, pos: this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)! });
      }
    }
    return out;
  }

  /** Espina: reload, then shoot the nearest hostile in range (ties: the lower id) */
  private fireSpine(s: StructureComponent, victims: Victim[], dt: number): void {
    s.timer = Math.max(0, s.timer - dt);
    const stats = DEFENSE_STATS.spine;
    let best: Victim | null = null;
    let bestDist = Infinity;
    for (const v of victims) {
      const d = Math.hypot(v.pos.x - s.x, v.pos.y - s.y);
      if (d > stats.range) continue;
      if (d < bestDist || (d === bestDist && best !== null && v.id < best.id)) {
        best = v;
        bestDist = d;
      }
    }
    s.targetId = best?.id ?? null;
    if (!best || s.timer > 0) return;
    s.timer = stats.cooldown;
    dealDamage(this.world, best.id, stats.damage);
    const layer = s.layer === 'surface' ? Layer.Surface : Layer.Underground;
    pushWaveFx(this.world, { kind: 'spine', x: s.x, y: s.y, tx: best.pos.x, ty: best.pos.y, layer, life: 0.25 });
    emitAudio({ type: 'waveFx', kind: 'spine', at: { x: s.x, y: s.y, layer } });
  }

  /** Trampa: everything in the resin is slowed; each pulse bites and spends a charge; dry, it refills */
  private runTrap(s: StructureComponent, victims: Victim[], dt: number, caught: Set<EntityId>): void {
    const stats = DEFENSE_STATS.trap;
    if (s.charges <= 0) {
      s.rechargeTimer -= dt;
      if (s.rechargeTimer <= 0) {
        s.charges = stats.charges;
        s.timer = 0;
      }
      return;
    }
    const inside = victims.filter((v) => Math.hypot(v.pos.x - s.x, v.pos.y - s.y) <= stats.range);
    for (const v of inside) caught.add(v.id);
    s.timer -= dt;
    if (s.timer > 0 || inside.length === 0) {
      if (s.timer < 0) s.timer = 0;
      return;
    }
    s.timer = stats.tick;
    for (const v of inside) dealDamage(this.world, v.id, stats.damage);
    s.charges--;
    if (s.charges <= 0) s.rechargeTimer = stats.recharge;
    pushWaveFx(this.world, { kind: 'trap', x: s.x, y: s.y, layer: s.layer === 'surface' ? Layer.Surface : Layer.Underground, radius: stats.range, life: 0.5 });
  }

  /** Slow what the resin holds; release it a moment after it gets out */
  private updateSlows(caught: Set<EntityId>, dt: number): void {
    for (const id of caught) {
      this.slowed.set(id, TRAP_LINGER);
      if (speedFactorOf(this.world, id, TRAP_SLOW_KEY) !== DEFENSE_STATS.trap.slow) {
        setSpeedFactor(this.world, id, TRAP_SLOW_KEY, DEFENSE_STATS.trap.slow);
      }
    }
    for (const [id, left] of this.slowed) {
      if (caught.has(id)) continue;
      if (!this.world.hasEntity(id)) {
        this.slowed.delete(id);
        continue;
      }
      const next = left - dt;
      if (next > 0) {
        this.slowed.set(id, next);
        continue;
      }
      this.slowed.delete(id);
      setSpeedFactor(this.world, id, TRAP_SLOW_KEY, 1);
    }
  }
}
