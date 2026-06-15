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
} from '../components/components';
import { createFood } from '../entities/factories';
import {
  BEETLE_MEAT_AMOUNT,
  CRICKET_MEAT_AMOUNT,
  PHEROMONE_MAX,
  FLANKING_BONUS_PER_ALLY,
  FLANKING_MAX_ALLIES,
} from '../../shared/constants';

export class CombatSystem implements System {
  readonly name = 'CombatSystem';
  readonly priority = 7;

  private world: World;
  private grid: TileGrid;

  constructor(world: World, grid: TileGrid) {
    this.world = world;
    this.grid = grid;
  }

  update(dt: number): void {
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

      // Attack direction (attacker → victim) for hit effect orientation
      const attackAngle = Math.atan2(targetPos.y - pos.y, targetPos.x - pos.x);

      // Flanking bonus: ants hit harder when swarming the same target
      let damage = combat.attackDamage;
      if (this.world.getComponent<AntComponent>(id, COMPONENT.ANT)) {
        const allies = (antAttackersPerTarget.get(targetId) ?? 1) - 1;
        damage *= 1 + FLANKING_BONUS_PER_ALLY * Math.min(allies, FLANKING_MAX_ALLIES);
      }

      // Attack beetle den directly
      const beetleDen = this.world.getComponent<BeetleDenComponent>(targetId, COMPONENT.BEETLE_DEN);
      if (beetleDen) {
        beetleDen.health -= damage;
        this.syncDenHealthBar(targetId, beetleDen.health);
        combat.attackTimer = combat.attackCooldown;
        this.pushHitEffect(targetPos.x, targetPos.y, attackAngle);
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
        this.pushHitEffect(targetPos.x, targetPos.y, attackAngle);
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
      this.pushHitEffect(targetPos.x, targetPos.y, attackAngle);

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

  /** Push a short hit-feedback effect (rendered by RenderSystem). Capped to avoid unbounded growth. */
  private pushHitEffect(x: number, y: number, angle: number): void {
    const effects = this.world.hitEffects;
    if (effects.length >= 80) return; // safety cap — feedback is already saturated
    effects.push({ x, y, timer: 0.3, maxTime: 0.3, angle });
  }

  private handleDeath(entityId: EntityId, _toDestroy: EntityId[]): void {
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
    // Ant death — push death effect
    const pos = this.world.getComponent<PositionComponent>(entityId, COMPONENT.POSITION);
    if (pos) {
      this.world.deathEffects.push({
        x: pos.x, y: pos.y,
        timer: 0.8, maxTime: 0.8,
        color: '#e8c170', radius: 0.35,
      });
    }
  }

  private handleBeetleDeath(entityId: EntityId, beetle: BeetleComponent): void {
    const pos = this.world.getComponent<PositionComponent>(entityId, COMPONENT.POSITION);

    // Death effect for beetle
    if (pos) {
      this.world.deathEffects.push({
        x: pos.x, y: pos.y,
        timer: 1.0, maxTime: 1.0,
        color: '#2a1a0a', radius: 0.55,
      });
    }

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
      createFood(this.world, pos.x, pos.y, BEETLE_MEAT_AMOUNT, FoodType.BeetleMeat, deathLayer);

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

    // Death effect for cricket (larger, greenish)
    if (pos) {
      this.world.deathEffects.push({
        x: pos.x, y: pos.y,
        timer: 1.0, maxTime: 1.0,
        color: '#2a4a10', radius: 0.6,
      });
    }

    // Decrement den's active cricket count
    if (cricket.denEntityId !== null && this.world.hasEntity(cricket.denEntityId)) {
      const den = this.world.getComponent<CricketDenComponent>(cricket.denEntityId, COMPONENT.CRICKET_DEN);
      if (den) den.activeCrickets = Math.max(0, den.activeCrickets - 1);
    }

    // Drop cricket meat on the layer where it died (see handleBeetleDeath)
    if (pos) {
      const layerComp = this.world.getComponent<LayerComponent>(entityId, COMPONENT.LAYER);
      const deathLayer = layerComp ? layerComp.layer : Layer.Surface;
      createFood(this.world, pos.x, pos.y, CRICKET_MEAT_AMOUNT, FoodType.CricketMeat, deathLayer);

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
    // Death effect for beetle den
    const pos = this.world.getComponent<PositionComponent>(denId, COMPONENT.POSITION);
    if (pos) {
      this.world.deathEffects.push({
        x: pos.x, y: pos.y,
        timer: 1.5, maxTime: 1.5,
        color: '#1a0a00', radius: 0.8,
      });
    }

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
    if (pos) {
      this.world.deathEffects.push({
        x: pos.x, y: pos.y,
        timer: 1.5, maxTime: 1.5,
        color: '#2a4a10', radius: 0.9,
      });
    }

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
