import type { EntityId } from '../../shared/types';
import {
  AntRole,
  COMPONENT,
  FoodType,
  Layer,
  OrderKind,
  type AntComponent,
  type BeetleDenComponent,
  type CombatComponent,
  type HealthComponent,
  type LayerComponent,
  type PlayerOrderComponent,
  type PositionComponent,
} from '../components/components';
import { createAnt, createBeetle, createBeetleDen, createFood, createMineral } from '../entities/factories';
import type { TutorialStage } from './stage';

/** Health of the den the tutorial's soldiers knock down (a real den has 800) */
export const TUTORIAL_DEN_HEALTH = 90;
/** Soldiers Hormi lends for the attack lesson */
export const GIFT_SOLDIERS = 4;
/** The practice wave: two young beetles, weak and slow to bite */
export const PRACTICE_BEETLES = 2;
const PRACTICE_HEALTH = 36;
const PRACTICE_DAMAGE = 2;

/** Where each lesson's thing sits, in tiles from the nest (on the starting corridors, always walkable) */
const DEN_OFFSET = { x: 13, y: 0 };
const MINERAL_OFFSETS = [{ x: -8, y: -1 }, { x: -9, y: 0 }, { x: -8, y: 1 }];
const FOOD_OFFSETS = [{ x: -1, y: -7 }, { x: 0, y: -8 }, { x: 1, y: -7 }];
const FOOD_AMOUNT = 80;
const PRACTICE_OFFSET = { x: 0, y: 9 };

/** `worker`: one surface worker near the nest, kept while it stays up there (the ant to pick) */
export type FocusKind = 'nest' | 'worker' | 'den' | 'minerals' | 'food' | 'practice' | 'soldiers';

/**
 * Stages the tutorial's calm map on a real run: the far beetle dens go, a
 * weak den, a small mineral field and some leaves are placed close to the
 * nest, and later Hormi lends soldiers and sends a two-beetle practice wave.
 * It also reads the world facts the goals need (orders, the den, the wave).
 */
export class TutorialScenario {
  private readonly stage: TutorialStage;
  private denId: EntityId | null = null;
  private mineralIds: EntityId[] = [];
  private foodIds: EntityId[] = [];
  private practiceIds: EntityId[] = [];
  private soldierIds: EntityId[] = [];
  private gifted = false;
  private workerId: EntityId | null = null;
  private waveSent = false;

  constructor(stage: TutorialStage) {
    this.stage = stage;
  }

  /** Clear the wild dens and place the lessons' den, minerals and food. Holds the day clock. */
  setup(): void {
    const { world, nest } = this.stage;
    this.stage.holdCalm(true);
    // A calm map: no real dens and none of their beetles
    for (const id of world.query(COMPONENT.BEETLE_DEN)) world.destroyEntity(id);
    for (const id of world.query(COMPONENT.BEETLE)) world.destroyEntity(id);

    const den = this.walkable(nest.x + DEN_OFFSET.x, nest.y + DEN_OFFSET.y);
    this.denId = createBeetleDen(world, den.x, den.y);
    const denState = world.getComponent<BeetleDenComponent>(this.denId, COMPONENT.BEETLE_DEN)!;
    denState.health = denState.maxHealth = TUTORIAL_DEN_HEALTH;
    denState.maxBeetles = 0; // it never hatches a beetle
    const denHealth = world.getComponent<HealthComponent>(this.denId, COMPONENT.HEALTH)!;
    denHealth.current = denHealth.max = TUTORIAL_DEN_HEALTH;
    this.stage.reveal(den.x, den.y, 3);

    this.mineralIds = MINERAL_OFFSETS.map((o) => {
      const at = this.walkable(nest.x + o.x, nest.y + o.y);
      return createMineral(world, at.x, at.y);
    });
    this.stage.reveal(nest.x - 9, nest.y, 3);

    this.foodIds = FOOD_OFFSETS.map((o) => {
      const at = this.walkable(nest.x + o.x, nest.y + o.y);
      return createFood(world, at.x, at.y, FOOD_AMOUNT, FoodType.Leaf);
    });
  }

  /**
   * Keep the map calm while the tutorial runs: wildlife that wanders in from
   * the map edge (or a cricket den that pops up) leaves before it can scare
   * anyone. The practice wave's beetles stay.
   */
  keepCalm(): void {
    const { world } = this.stage;
    const practice = new Set(this.practiceIds);
    for (const id of world.query(COMPONENT.BEETLE)) if (!practice.has(id)) world.destroyEntity(id);
    for (const id of world.query(COMPONENT.CRICKET)) world.destroyEntity(id);
    for (const id of world.query(COMPONENT.CRICKET_DEN)) world.destroyEntity(id);
  }

  /** Stop the day clock (again) */
  hold(): void {
    this.stage.holdCalm(true);
  }

  /** The tutorial is over (finished or left): the clock runs again */
  release(): void {
    this.stage.holdCalm(false);
  }

  /** Hormi lends a squad of soldiers by the nest (once) */
  giftSoldiers(): void {
    if (this.gifted) return;
    this.gifted = true;
    const { world, nest } = this.stage;
    for (let i = 0; i < GIFT_SOLDIERS; i++) {
      const at = this.walkable(nest.x + 3 + (i % 2), nest.y - 1 + Math.floor(i / 2) * 2);
      this.soldierIds.push(createAnt(world, at.x, at.y, AntRole.Soldier));
    }
  }

  /** The practice night's wave: two weak beetles south of the nest (once) */
  sendPracticeWave(): void {
    if (this.waveSent) return;
    this.waveSent = true;
    // The soldiers go to the night lesson even when the attack lesson was skipped
    this.giftSoldiers();
    const { world, nest } = this.stage;
    for (let i = 0; i < PRACTICE_BEETLES; i++) {
      const at = this.walkable(nest.x + PRACTICE_OFFSET.x + (i === 0 ? -1 : 1), nest.y + PRACTICE_OFFSET.y);
      const id = createBeetle(world, at.x, at.y, null);
      const health = world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
      health.current = health.max = PRACTICE_HEALTH;
      health.damage = PRACTICE_DAMAGE;
      world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!.attackDamage = PRACTICE_DAMAGE;
      this.practiceIds.push(id);
    }
    this.stage.reveal(nest.x, nest.y + PRACTICE_OFFSET.y, 4);
  }

  /** Where Hormi points for a lesson (entity tiles), or null when it is gone */
  focus(kind: FocusKind): { x: number; y: number } | null {
    const { nest } = this.stage;
    switch (kind) {
      case 'nest':
        return { ...nest };
      case 'den':
        return this.denId !== null ? this.centerOf([this.denId]) : null;
      case 'minerals':
        return this.centerOf(this.mineralIds) ?? { x: nest.x - 9, y: nest.y };
      case 'food':
        return this.centerOf(this.foodIds);
      case 'practice':
        return this.centerOf(this.practiceIds);
      case 'soldiers':
        return this.centerOf(this.soldierIds);
      case 'worker':
        return this.centerOf(this.pickWorker());
    }
  }

  /** The surface worker Hormi points at: the one closest to the nest, kept until it leaves the surface */
  private pickWorker(): EntityId[] {
    const { world, nest } = this.stage;
    if (this.workerId !== null && this.centerOf([this.workerId])) return [this.workerId];
    let best: { id: EntityId; d: number } | null = null;
    for (const id of world.query(COMPONENT.ANT, COMPONENT.POSITION)) {
      if (world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role !== AntRole.Worker) continue;
      if ((world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface) !== Layer.Surface) continue;
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const d = Math.hypot(pos.x - nest.x, pos.y - nest.y);
      if (!best || d < best.d) best = { id, d };
    }
    this.workerId = best?.id ?? null;
    return best ? [best.id] : [];
  }

  /** World facts for the goals */
  read(): { moveOrders: number; attackOrdersOnDen: number; denAlive: boolean; denHealth: number; practiceSpawned: boolean; practiceAlive: number } {
    const { world } = this.stage;
    let moveOrders = 0;
    let attackOrdersOnDen = 0;
    for (const id of world.query(COMPONENT.PLAYER_ORDER, COMPONENT.ANT)) {
      const order = world.getComponent<PlayerOrderComponent>(id, COMPONENT.PLAYER_ORDER)!;
      if (order.kind === OrderKind.Move || order.kind === OrderKind.AttackMove) moveOrders++;
      if (order.kind === OrderKind.Attack && order.targetId !== null && order.targetId === this.denId) attackOrdersOnDen++;
    }
    const denAlive = this.denId !== null && world.hasEntity(this.denId);
    const denHealth = denAlive ? world.getComponent<HealthComponent>(this.denId!, COMPONENT.HEALTH)?.current ?? 0 : 0;
    return {
      moveOrders,
      attackOrdersOnDen,
      denAlive,
      denHealth,
      practiceSpawned: this.waveSent,
      practiceAlive: this.practiceIds.filter((id) => world.hasEntity(id)).length,
    };
  }

  private centerOf(ids: readonly EntityId[]): { x: number; y: number } | null {
    const { world } = this.stage;
    let x = 0;
    let y = 0;
    let n = 0;
    for (const id of ids) {
      if (!world.hasEntity(id)) continue;
      const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER);
      if (layer && layer.layer !== Layer.Surface) continue; // only what is on the surface
      const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
      if (!pos) continue;
      x += pos.x;
      y += pos.y;
      n++;
    }
    return n > 0 ? { x: x / n, y: y / n } : null;
  }

  /** The tile itself when it is walkable, else the nearest walkable one */
  private walkable(x: number, y: number): { x: number; y: number } {
    const { grid } = this.stage;
    for (let r = 0; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (grid.isWalkable(x + dx, y + dy)) return { x: x + dx, y: y + dy };
        }
      }
    }
    return { x, y };
  }
}
