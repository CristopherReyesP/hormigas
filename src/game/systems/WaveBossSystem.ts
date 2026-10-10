import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type LayerComponent,
  type LayerValue,
  type PositionComponent,
  type RenderComponent,
} from '../components/components';
import { FactionId, isHostileTo, ownerOf } from '../factions/factions';
import { createCrystalUnit } from '../rival/crystalFactories';
import type { ShieldComponent } from '../rival/crystalShield';
import { HUMAN_COMPONENT } from '../rival/humanComponents';
import { BOSS_COMPONENT, BOSS_TUNING, type BossComponent } from '../run/miniBoss';
import { STRUCTURE_COMPONENT } from '../run/defenses';
import { dealDamage, pushWaveFx, setSpeedFactor } from '../run/waveRuntime';
import { AURA_ARMOR_COMPONENT, type ArmorComponent } from './helpers/combatHelpers';

export interface WaveBossHooks {
  /** A unit a boss brought onto the field (the Prisma's shards): the wave counts it */
  onSpawn?: (id: EntityId) => void;
}

/** What the Acorazado Colosal rams: the colony's units and its defenses */
const RAM_STORES = [COMPONENT.ANT, COMPONENT.QUEEN_ENTITY, STRUCTURE_COMPONENT] as const;

/**
 * The mini-bosses' unique abilities:
 * - Acorazado Colosal: digs in, then charges the prey it is after, ramming every ant on the way once.
 * - Prisma Guardián: crystallizes a pair of shards every few seconds, up to a cap.
 * - Coronel en Tanque Pesado: an aura that lends armor to the Human troops near him.
 */
export class WaveBossSystem implements System {
  readonly name = 'WaveBossSystem';
  readonly priority = 6.4; // after the unit AIs, before CombatSystem (7)

  private world: World;
  private hooks: WaveBossHooks;

  constructor(world: World, hooks: WaveBossHooks = {}) {
    this.world = world;
    this.hooks = hooks;
  }

  update(dt: number): void {
    const auraHolders = new Set<EntityId>();
    for (const id of this.world.query(BOSS_COMPONENT, COMPONENT.POSITION)) {
      const boss = this.world.getComponent<BossComponent>(id, BOSS_COMPONENT)!;
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
      if (health && health.current <= 0) continue;
      if (boss.kind === 'colossus') this.charge(id, boss, dt);
      else if (boss.kind === 'prism') this.spawnShards(id, boss, dt);
      else if (boss.kind === 'colonel') this.aura(id, auraHolders);
    }
    // Troops that left every aura (or whose colonel fell) lose the armor
    for (const id of this.world.query(AURA_ARMOR_COMPONENT)) {
      if (!auraHolders.has(id)) this.world.removeComponent(id, AURA_ARMOR_COMPONENT);
    }
  }

  private layerOf(id: EntityId): LayerValue {
    return this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
  }

  /** Acorazado Colosal: idle → windup (it digs in, slowed, a red telegraph) → charging (fast, rams) → idle */
  private charge(id: EntityId, boss: BossComponent, dt: number): void {
    const cfg = BOSS_TUNING.colossus;
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const layer = this.layerOf(id);
    if (boss.phase === 'idle') {
      boss.abilityTimer -= dt;
      if (boss.abilityTimer > 0) return;
      const targetId = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)?.targetEntityId ?? null;
      const target = targetId !== null ? this.world.getComponent<PositionComponent>(targetId, COMPONENT.POSITION) : undefined;
      const dist = target ? Math.hypot(target.x - pos.x, target.y - pos.y) : Infinity;
      if (!target || targetId === null || this.layerOf(targetId) !== layer || dist < cfg.chargeMin || dist > cfg.chargeMax) {
        boss.abilityTimer = 0.5; // nothing worth charging: look again soon
        return;
      }
      boss.phase = 'windup';
      boss.phaseTimer = cfg.windup;
      setSpeedFactor(this.world, id, 'charge', cfg.windupSpeed);
      pushWaveFx(this.world, { kind: 'telegraph', x: pos.x, y: pos.y, layer, radius: 1.6, life: cfg.windup });
      return;
    }
    boss.phaseTimer -= dt;
    if (boss.phase === 'windup') {
      if (boss.phaseTimer > 0) return;
      boss.phase = 'charging';
      boss.phaseTimer = cfg.chargeTime;
      boss.rammed = [];
      setSpeedFactor(this.world, id, 'charge', cfg.chargeSpeed);
    }
    if (boss.phase === 'charging') {
      pushWaveFx(this.world, { kind: 'charge', x: pos.x, y: pos.y, layer, radius: 0.9, life: 0.35 });
      this.ram(id, boss, pos, layer);
      if (boss.phaseTimer <= 0) {
        boss.phase = 'idle';
        boss.abilityTimer = cfg.cooldown;
        setSpeedFactor(this.world, id, 'charge', 1);
      }
    }
  }

  private ram(id: EntityId, boss: BossComponent, pos: PositionComponent, layer: LayerValue): void {
    const cfg = BOSS_TUNING.colossus;
    const side = ownerOf(this.world, id) ?? FactionId.WILDLIFE;
    for (const store of RAM_STORES) {
      for (const other of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
        if (boss.rammed.includes(other) || !isHostileTo(this.world, side, other) || this.layerOf(other) !== layer) continue;
        const at = this.world.getComponent<PositionComponent>(other, COMPONENT.POSITION)!;
        if (Math.hypot(at.x - pos.x, at.y - pos.y) > cfg.chargeHitRadius) continue;
        boss.rammed.push(other);
        dealDamage(this.world, other, cfg.chargeDamage);
      }
    }
  }

  /** Prisma Guardián: a pair of small shards every few seconds, marching where it marches */
  private spawnShards(id: EntityId, boss: BossComponent, dt: number): void {
    const cfg = BOSS_TUNING.prism;
    boss.abilityTimer -= dt;
    if (boss.abilityTimer > 0) return;
    boss.abilityTimer = cfg.spawnInterval;
    boss.shards = boss.shards.filter((s) => this.world.hasEntity(s));
    const room = Math.min(cfg.shardsPerSpawn, cfg.maxShards - boss.shards.length);
    if (room <= 0) return;
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const prism = this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT);
    const faction = ownerOf(this.world, id) ?? FactionId.RIVAL;
    for (let i = 0; i < room; i++) {
      const angle = ((boss.shards.length + i) / cfg.maxShards) * Math.PI * 2;
      const shard = createCrystalUnit(this.world, 'drone', pos.x + Math.cos(angle) * 0.9, pos.y + Math.sin(angle) * 0.9, prism?.hiveId ?? null, faction);
      this.shrink(shard, cfg.shardScale, cfg.shardSize);
      const unit = this.world.getComponent<CrystalUnitComponent>(shard, COMPONENT.CRYSTAL_UNIT)!;
      if (prism) {
        unit.state = prism.state;
        unit.goal = prism.goal ? { ...prism.goal } : null;
      }
      boss.shards.push(shard);
      pushWaveFx(this.world, { kind: 'shard', x: pos.x, y: pos.y, tx: pos.x + Math.cos(angle) * 0.9, ty: pos.y + Math.sin(angle) * 0.9, layer: this.layerOf(id), life: 0.5 });
      this.hooks.onSpawn?.(shard);
    }
  }

  private shrink(id: EntityId, scale: number, size: number): void {
    const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
    if (health) {
      health.max = Math.max(1, Math.round(health.max * scale));
      health.current = health.max;
      health.damage = Math.max(1, Math.round(health.damage * (scale + 0.1)));
    }
    const combat = this.world.getComponent<CombatComponent>(id, COMPONENT.COMBAT);
    if (combat) combat.attackDamage = Math.max(1, Math.round(combat.attackDamage * (scale + 0.1)));
    const shield = this.world.getComponent<ShieldComponent>(id, COMPONENT.SHIELD);
    if (shield) {
      shield.max = Math.round(shield.max * scale);
      shield.current = shield.max;
    }
    const render = this.world.getComponent<RenderComponent>(id, COMPONENT.RENDER);
    if (render) render.radius = size;
  }

  /** Coronel: every allied Human troop in reach wears his extra armor */
  private aura(id: EntityId, holders: Set<EntityId>): void {
    const cfg = BOSS_TUNING.colonel;
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const side = ownerOf(this.world, id);
    for (const other of this.world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION)) {
      if (other === id || ownerOf(this.world, other) !== side) continue;
      const at = this.world.getComponent<PositionComponent>(other, COMPONENT.POSITION)!;
      if (Math.hypot(at.x - pos.x, at.y - pos.y) > cfg.auraRadius) continue;
      holders.add(other);
      const aura = this.world.getComponent<ArmorComponent>(other, AURA_ARMOR_COMPONENT);
      if (aura) aura.armor = cfg.auraArmor;
      else this.world.addComponent<ArmorComponent>(other, AURA_ARMOR_COMPONENT, { armor: cfg.auraArmor });
    }
  }
}
