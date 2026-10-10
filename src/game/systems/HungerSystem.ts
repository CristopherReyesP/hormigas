import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import { AntState, COMPONENT, isOreLoad, type HungerComponent, type PositionComponent, type AntComponent, type QueenEntityComponent, type HealthComponent, type CarryingComponent } from '../components/components';
import { QUEEN_STARVATION_DAMAGE, HUNGER_EAT_RATE, HUNGER_EAT_THRESHOLD, HUNGER_PER_FOOD, HEAL_HP_PER_FOOD, HURT_EAT_HEALTH_RATIO } from '../../shared/constants';
import { tallyDeath } from '../upgrades/applyUpgrades';

/**
 * The one way an ant eats, wherever the food comes from (its own load, a
 * pantry pile, loose food on the nest floor). Ants heal by EATING: the meal
 * fills hunger first and whatever it holds beyond that becomes HP at
 * HEAL_HP_PER_FOOD (scaled by the 'heal' upgrade). There is no other healing
 * besides the regenerative_tissue mutation.
 *
 * `take(want)` removes up to `want` units from the source and returns how many
 * it actually gave. Returns the units eaten.
 */
export function eat(
  world: World,
  hunger: HungerComponent | undefined,
  health: HealthComponent | undefined,
  dt: number,
  take: (want: number) => number
): number {
  const hpPerFood = HEAL_HP_PER_FOOD * world.upgrades.healRateMult;
  const hungerFood = hunger ? Math.max(0, hunger.max - hunger.current) / HUNGER_PER_FOOD : 0;
  const healFood = health && health.current > 0 ? Math.max(0, health.max - health.current) / hpPerFood : 0;
  const want = Math.min(HUNGER_EAT_RATE * dt, hungerFood + healFood);
  if (want <= 0) return 0;

  const eaten = take(want);
  if (eaten <= 0) return 0;
  const toHunger = Math.min(eaten, hungerFood);
  if (hunger) hunger.current = Math.min(hunger.max, hunger.current + toHunger * HUNGER_PER_FOOD);
  if (health && eaten > toHunger) health.current = Math.min(health.max, health.current + (eaten - toHunger) * hpPerFood);
  return eaten;
}

/** Wounded enough that an eating trip is worth it (eating is how ants heal) */
export function isHurt(health: HealthComponent | undefined): boolean {
  return health !== undefined && health.current > 0 && health.current < health.max * HURT_EAT_HEALTH_RATIO;
}

/** A meal still does something: hunger is not yet ~full, or HP is not full */
export function needsMeal(hunger: HungerComponent | undefined, health: HealthComponent | undefined): boolean {
  const needsFood = hunger !== undefined && hunger.current < hunger.max * 0.95;
  const needsHeal = health !== undefined && health.current > 0 && health.current < health.max;
  return needsFood || needsHeal;
}

const ROLE_NAMES: Record<string, string> = {
  worker: 'obrera',
  soldier: 'soldado',
  scout: 'exploradora',
  nurse: 'nodriza',
  defender: 'defensora',
};

export class HungerSystem implements System {
  readonly name = 'HungerSystem';
  readonly priority = 30;
  private world: World;
  private modifiers: GlobalModifiers;
  private queenHungerAlerted = false;

  constructor(world: World, modifiers: GlobalModifiers) {
    this.world = world;
    this.modifiers = modifiers;
  }

  update(dt: number): void {
    // Queen hunger decays too — she has her own component (no starvation death;
    // an unfed queen simply stops laying, see EggIncubationSystem)
    const queens = this.world.query(COMPONENT.QUEEN_ENTITY);
    for (const id of queens) {
      const queen = this.world.getComponent<QueenEntityComponent>(id, COMPONENT.QUEEN_ENTITY)!;
      queen.hunger = Math.max(0, queen.hunger - queen.hungerDecay * this.modifiers.hungerDecayMultiplier * this.world.runModifiers.hungerDecayMult * dt);

      // Global alert with hysteresis: warn once below 25%, re-arm after recovering past 40%
      if (!this.queenHungerAlerted && queen.hunger < queen.maxHunger * 0.25) {
        this.world.pushNotification('warning', '👑 ¡La reina tiene hambre! Las nodrizas necesitan comida en la despensa');
        this.queenHungerAlerted = true;
      } else if (this.queenHungerAlerted && queen.hunger > queen.maxHunger * 0.4) {
        this.queenHungerAlerted = false;
      }

      // SURVIVAL: a fully starved queen loses health — if she dies, the colony falls
      if (queen.hunger <= 0) {
        const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
        if (health && health.current > 0) {
          health.current = Math.max(0, health.current - QUEEN_STARVATION_DAMAGE * dt);
          this.world.pushNotification('danger', '💀 ¡LA REINA SE ESTÁ MURIENDO DE HAMBRE!', 'queen-dying', 8000);
        }
      }
    }

    const entities = this.world.query(COMPONENT.HUNGER);

    for (const id of entities) {
      const hunger = this.world.getComponent<HungerComponent>(id, COMPONENT.HUNGER)!;
      hunger.current -= hunger.decayRate * this.modifiers.hungerDecayMultiplier * this.world.runModifiers.hungerDecayMult * dt;

      // SURVIVAL LOGIC: a hungry ant carrying food EATS FROM ITS OWN MOUTH
      // before ever starving — no ant dies while holding a meal. A worker
      // waiting out a full pantry ("si tienen hambre, se comen la comida que
      // tienen cargando") eats as soon as it is hungry, like any ant would go
      // eat: it has nowhere else to go, and its load is its meal.
      const waiting = this.world.getComponent<AntComponent>(id, COMPONENT.ANT)?.state === AntState.WaitingForPantry;
      if (hunger.current < hunger.max * (waiting ? HUNGER_EAT_THRESHOLD : 0.3)) {
        const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
        // Ore is not food: a miner never eats its load
        if (carrying && carrying.amount > 0 && !isOreLoad(carrying.resourceType)) {
          const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH);
          eat(this.world, hunger, health, dt, (want) => {
            const bite = Math.min(want, carrying.amount);
            carrying.amount -= bite;
            return bite;
          });
          if (carrying.amount <= 1e-6) {
            carrying.amount = 0;
            carrying.resourceType = null;
          }
        }
      }

      if (hunger.current <= 0) {
        hunger.current = 0;
        // Push death effect before destroying
        const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
        const ant = this.world.getComponent<AntComponent>(id, COMPONENT.ANT);
        if (pos) {
          const colors: Record<string, string> = { worker: '#e8c170', soldier: '#d44', scout: '#4ad', nurse: '#a7e84d' };
          const color = ant ? colors[ant.role] || '#888' : '#888';
          this.world.deathEffects.push({
            x: pos.x, y: pos.y,
            timer: 0.8, maxTime: 0.8,
            color, radius: 0.3,
          });
        }
        if (ant) {
          const roleName = ROLE_NAMES[ant.role] ?? 'hormiga';
          this.world.pushNotification('danger', `💀 Una ${roleName} murió de hambre`, 'starvation', 4000);
        }
        // Kill the entity
        tallyDeath(this.world, id);
        this.world.destroyEntity(id);
      }
    }
  }
}
