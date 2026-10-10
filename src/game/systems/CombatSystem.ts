import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  FoodType,
  Layer,
  type PositionComponent,
  type HealthComponent,
  type CombatComponent,
  type AntComponent,
  type LayerComponent,
  type BeetleComponent,
  type BeetleDenComponent,
  type CricketComponent,
  type CricketDenComponent,
  type FacingComponent,
  type LayerValue,
} from '../components/components';
import { createFood } from '../entities/factories';
import { emitAudio } from '../../audio/events';
import { deathAudio, hitAudio } from '../../audio/gameHooks';
import {
  BEETLE_MEAT_AMOUNT,
  CRICKET_MEAT_AMOUNT,
  PHEROMONE_MAX,
  FLANKING_BONUS_PER_ALLY,
  FLANKING_MAX_ALLIES,
} from '../../shared/constants';
import { combatVfxFor, type BodyKind, type CombatVfx, type VictimKind } from '../vfx/CombatVfx';

export class CombatSystem implements System {
  readonly name = 'CombatSystem';
  readonly priority = 7;

  private world: World;
  private grid: TileGrid;
  /** Hits and deaths emit pixel-art VFX here; RenderSystem draws the same pool */
  private vfx: CombatVfx;

  constructor(world: World, grid: TileGrid) {
    this.world = world;
    this.grid = grid;
    this.vfx = combatVfxFor(world);
  }

  update(dt: number): void {
    // VFX age in game time: frozen while paused, faster at 2×/3×
    this.vfx.advance(dt);

    const combatants = this.world.query(COMPONENT.COMBAT, COMPONENT.POSITION);

    // Tick attack timers
    for (const id of combatants) {
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      if (combat.attackTimer > 0) {
        combat.attackTimer = Math.max(0, combat.attackTimer - dt);
      }
    }

    // Collect entities to destroy after iteration (avoid mutation during iteration)
    const toDestroy: EntityId[] = [];

    // Flanking: count ANT attackers per target — ants coordinate, predators don't
    const antAttackersPerTarget = new Map<EntityId, number>();
    for (const id of combatants) {
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      if (combat.targetEntityId === null) continue;
      if (!this.world.getComponent<AntComponent>(id, COMPONENT.ANT)) continue;
      antAttackersPerTarget.set(
        combat.targetEntityId,
        (antAttackersPerTarget.get(combat.targetEntityId) ?? 0) + 1
      );
    }

    // Resolve attacks
    for (const id of combatants) {
      if (toDestroy.includes(id)) continue;
      const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      if (combat.targetEntityId === null) continue;
      if (combat.attackTimer > 0) continue;

      const targetId = combat.targetEntityId;

      // Check target still exists
      if (toDestroy.includes(targetId) || !this.world.hasEntity(targetId)) {
        combat.targetEntityId = null;
        continue;
      }

      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const targetPos = this.world.getComponent<PositionComponent>(targetId, COMPONENT.POSITION);
      if (!targetPos) {
        combat.targetEntityId = null;
        continue;
      }

      // Never fight across layers — surface and underground share coordinates
      const attackerLayer = this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      const targetLayer = this.world.getComponent<LayerComponent>(targetId, COMPONENT.LAYER);
      if (attackerLayer && targetLayer && attackerLayer.layer !== targetLayer.layer) {
        combat.targetEntityId = null;
        continue;
      }

      const dx = pos.x - targetPos.x;
      const dy = pos.y - targetPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > combat.attackRange) continue;

      emitAudio(hitAudio(this.world, id, targetPos, attackerLayer?.layer));

      // Flanking bonus: ants hit harder when swarming the same target
      let damage = combat.attackDamage;
      if (this.world.getComponent<AntComponent>(id, COMPONENT.ANT)) {
        const run = this.world.runModifiers;
        const allies = (antAttackersPerTarget.get(targetId) ?? 1) - 1;
        damage *= 1 + FLANKING_BONUS_PER_ALLY * run.flankingBonusMult * Math.min(allies, FLANKING_MAX_ALLIES);
        if (attackerLayer?.layer === Layer.Underground) damage *= run.undergroundDamageMult;
      }

      // Attack beetle den directly
      const beetleDen = this.world.getComponent<BeetleDenComponent>(targetId, COMPONENT.BEETLE_DEN);
      if (beetleDen) {
        beetleDen.health -= damage;
        this.syncDenHealthBar(targetId, beetleDen.health);
        combat.attackTimer = combat.attackCooldown;
        this.emitHit(id, pos, targetPos, targetLayer?.layer ?? Layer.Surface, 'beetleDen');
        if (beetleDen.health <= 0) {
          this.destroyDen(targetId);
          toDestroy.push(targetId);
          combat.targetEntityId = null;
        }
        continue;
      }

      // Attack cricket den directly
      const cricketDen = this.world.getComponent<CricketDenComponent>(targetId, COMPONENT.CRICKET_DEN);
      if (cricketDen) {
        cricketDen.health -= damage;
        this.syncDenHealthBar(targetId, cricketDen.health);
        combat.attackTimer = combat.attackCooldown;
        this.emitHit(id, pos, targetPos, targetLayer?.layer ?? Layer.Surface, 'cricketDen');
        if (cricketDen.health <= 0) {
          this.destroyCricketDen(targetId);
          toDestroy.push(targetId);
          combat.targetEntityId = null;
        }
        continue;
      }

      // Attack entity with health
      const targetHealth = this.world.getComponent<HealthComponent>(targetId, COMPONENT.HEALTH);
      if (!targetHealth) {
        combat.targetEntityId = null;
        continue;
      }

      targetHealth.current -= damage;
      combat.attackTimer = combat.attackCooldown;
      this.emitHit(id, pos, targetPos, targetLayer?.layer ?? Layer.Surface, this.victimKind(targetId));

      if (targetHealth.current <= 0) {
        this.handleDeath(targetId, toDestroy);
        toDestroy.push(targetId);
        combat.targetEntityId = null;
      }
    }

    // Destroy dead entities
    for (const id of toDestroy) {
      if (this.world.hasEntity(id)) {
        this.world.destroyEntity(id);
      }
    }
  }

  /** Dens track health in their own component; mirror it into HealthComponent so the bar drains */
  private syncDenHealthBar(denId: EntityId, denHealth: number): void {
    const health = this.world.getComponent<HealthComponent>(denId, COMPONENT.HEALTH);
    if (health) {
      health.current = Math.max(0, denHealth);
    }
  }

  /** Swarm attackers spit acid; every victim sheds chips of its own material */
  private emitHit(
    attackerId: EntityId,
    from: PositionComponent,
    to: PositionComponent,
    layer: LayerValue,
    victim: VictimKind,
  ): void {
    const attacker = this.world.getComponent<AntComponent>(attackerId, COMPONENT.ANT) ? 'swarm' : 'wildlife';
    this.vfx.hit(from.x, from.y, to.x, to.y, layer, attacker, victim);
  }

  private layerOf(id: EntityId): LayerValue {
    return this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
  }

  /** Anything that is not wildlife is Swarm flesh (ants, the queen) */
  private bodyKind(id: EntityId): BodyKind {
    if (this.world.getComponent<BeetleComponent>(id, COMPONENT.BEETLE)) return 'beetle';
    if (this.world.getComponent<CricketComponent>(id, COMPONENT.CRICKET)) return 'cricket';
    return 'ant';
  }

  /** Crystal units and the hive shed shards; everything else sheds its body's material */
  private victimKind(id: EntityId): VictimKind {
    if (this.isCrystal(id)) return 'crystal';
    return this.bodyKind(id);
  }

  private isCrystal(id: EntityId): boolean {
    return this.world.getComponent(id, COMPONENT.CRYSTAL_UNIT) !== undefined
      || this.world.getComponent(id, COMPONENT.CRYSTAL_HIVE) !== undefined;
  }

  /** The death pop plus what the body leaves: goo for the Swarm, a carcass for wildlife */
  private emitDeath(entityId: EntityId, pos: PositionComponent, body: BodyKind): void {
    const facing = this.world.getComponent<FacingComponent>(entityId, COMPONENT.FACING);
    this.vfx.death(pos.x, pos.y, this.layerOf(entityId), body, facing?.angle ?? 0);
  }

  private handleDeath(entityId: EntityId, _toDestroy: EntityId[]): void {
    if (this.isCrystal(entityId)) {
      this.handleCrystalDeath(entityId);
      return;
    }
    emitAudio(deathAudio(this.world, entityId));
    const beetle = this.world.getComponent<BeetleComponent>(entityId, COMPONENT.BEETLE);
    if (beetle) {
      this.handleBeetleDeath(entityId, beetle);
      return;
    }
    const cricket = this.world.getComponent<CricketComponent>(entityId, COMPONENT.CRICKET);
    if (cricket) {
      this.handleCricketDeath(entityId, cricket);
      return;
    }
    // Ant death — Swarm goo
    const pos = this.world.getComponent<PositionComponent>(entityId, COMPONENT.POSITION);
    if (pos) this.emitDeath(entityId, pos, 'ant');
  }

  /** A Crystal unit or the hive shatters: no carcass, only a burst of cyan shards */
  private handleCrystalDeath(entityId: EntityId): void {
    const pos = this.world.getComponent<PositionComponent>(entityId, COMPONENT.POSITION);
    const hive = this.world.getComponent(entityId, COMPONENT.CRYSTAL_HIVE) !== undefined;
    if (pos) this.vfx.crystalShards(pos.x, pos.y, this.layerOf(entityId), hive ? 32 : 10);
    if (hive) this.world.pushNotification('success', '💎 ¡La Colmena de Cristal se hizo añicos!');
  }

  /** Meat left by a kill, scaled by run mutations (carrion_gut) */
  private meatDrop(amount: number): number {
    return Math.round(amount * this.world.runModifiers.meatDropMult);
  }

  private handleBeetleDeath(entityId: EntityId, beetle: BeetleComponent): void {
    const pos = this.world.getComponent<PositionComponent>(entityId, COMPONENT.POSITION);

    // Death pop and carcass (the meat below is the carcass's food)
    if (pos) this.emitDeath(entityId, pos, 'beetle');

    // Decrement den's active beetle count
    if (beetle.denEntityId !== null && this.world.hasEntity(beetle.denEntityId)) {
      const den = this.world.getComponent<BeetleDenComponent>(beetle.denEntityId, COMPONENT.BEETLE_DEN);
      if (den) den.activeBeetles = Math.max(0, den.activeBeetles - 1);
    }

    // Drop beetle meat on the layer where it died — invaders killed inside
    // the nest leave their meat underground for scavengers (PorterSystem)
    if (pos) {
      const layerComp = this.world.getComponent<LayerComponent>(entityId, COMPONENT.LAYER);
      const deathLayer = layerComp ? layerComp.layer : Layer.Surface;
      createFood(this.world, pos.x, pos.y, this.meatDrop(BEETLE_MEAT_AMOUNT), FoodType.BeetleMeat, deathLayer);

      // Burst danger pheromone at death site — surface grid only; an
      // underground death must not stamp pheromone on surface tiles that
      // happen to share the same coordinates
      if (deathLayer === Layer.Surface) {
        const tileX = Math.round(pos.x);
        const tileY = Math.round(pos.y);
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const tile = this.grid.getTile(tileX + dx, tileY + dy);
            if (tile) {
              tile.dangerPheromone = Math.min(PHEROMONE_MAX, tile.dangerPheromone + 40);
            }
          }
        }
      }
    }
  }

  private handleCricketDeath(entityId: EntityId, cricket: CricketComponent): void {
    const pos = this.world.getComponent<PositionComponent>(entityId, COMPONENT.POSITION);

    // Death pop and carcass (see handleBeetleDeath)
    if (pos) this.emitDeath(entityId, pos, 'cricket');

    // Decrement den's active cricket count
    if (cricket.denEntityId !== null && this.world.hasEntity(cricket.denEntityId)) {
      const den = this.world.getComponent<CricketDenComponent>(cricket.denEntityId, COMPONENT.CRICKET_DEN);
      if (den) den.activeCrickets = Math.max(0, den.activeCrickets - 1);
    }

    // Drop cricket meat on the layer where it died (see handleBeetleDeath)
    if (pos) {
      const layerComp = this.world.getComponent<LayerComponent>(entityId, COMPONENT.LAYER);
      const deathLayer = layerComp ? layerComp.layer : Layer.Surface;
      createFood(this.world, pos.x, pos.y, this.meatDrop(CRICKET_MEAT_AMOUNT), FoodType.CricketMeat, deathLayer);

      if (deathLayer === Layer.Surface) {
        const tileX = Math.round(pos.x);
        const tileY = Math.round(pos.y);
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const tile = this.grid.getTile(tileX + dx, tileY + dy);
            if (tile) {
              tile.dangerPheromone = Math.min(PHEROMONE_MAX, tile.dangerPheromone + 40);
            }
          }
        }
      }
    }
  }

  private destroyDen(denId: EntityId): void {
    this.world.pushNotification('success', '💥 ¡Nido de escarabajos destruido!');
    this.world.metrics.densDestroyed++;
    // The den caves in: dust ring, soil and crystal shards
    const pos = this.world.getComponent<PositionComponent>(denId, COMPONENT.POSITION);
    if (pos) this.vfx.denCollapse(pos.x, pos.y, this.layerOf(denId), 'beetleDen');

    // Orphan all beetles from this den
    const beetles = this.world.query(COMPONENT.BEETLE);
    for (const bid of beetles) {
      const b = this.world.getComponent<BeetleComponent>(bid, COMPONENT.BEETLE)!;
      if (b.denEntityId === denId) {
        b.denEntityId = null;
      }
    }
  }

  private destroyCricketDen(denId: EntityId): void {
    this.world.pushNotification('success', '💥 ¡Nido de grillos destruido!');
    this.world.metrics.densDestroyed++;
    const pos = this.world.getComponent<PositionComponent>(denId, COMPONENT.POSITION);
    if (pos) this.vfx.denCollapse(pos.x, pos.y, this.layerOf(denId), 'cricketDen');

    // Orphan all crickets from this den
    const crickets = this.world.query(COMPONENT.CRICKET);
    for (const cid of crickets) {
      const c = this.world.getComponent<CricketComponent>(cid, COMPONENT.CRICKET)!;
      if (c.denEntityId === denId) {
        c.denEntityId = null;
      }
    }
  }
}
