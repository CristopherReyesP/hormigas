import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { GlobalModifiers } from '../events/GlobalModifiers';
import { COMPONENT, type HungerComponent, type PositionComponent, type AntComponent, type QueenEntityComponent, type HealthComponent, type CarryingComponent } from '../components/components';
import { QUEEN_STARVATION_DAMAGE, HUNGER_EAT_RATE, HUNGER_PER_FOOD } from '../../shared/constants';

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
      queen.hunger = Math.max(0, queen.hunger - queen.hungerDecay * this.modifiers.hungerDecayMultiplier * dt);

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
      hunger.current -= hunger.decayRate * this.modifiers.hungerDecayMultiplier * dt;

      // SURVIVAL LOGIC: a hungry ant carrying food EATS FROM ITS OWN MOUTH
      // before ever starving — no ant dies while holding a meal. This also
      // covers haulers waiting out a full pantry with the load in their jaws.
      if (hunger.current < hunger.max * 0.3) {
        const carrying = this.world.getComponent<CarryingComponent>(id, COMPONENT.CARRYING);
        if (carrying && carrying.amount > 0) {
          const bite = Math.min(
            carrying.amount,
            HUNGER_EAT_RATE * dt,
            (hunger.max - hunger.current) / HUNGER_PER_FOOD
          );
          carrying.amount -= bite;
          hunger.current = Math.min(hunger.max, hunger.current + bite * HUNGER_PER_FOOD);
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
        this.world.destroyEntity(id);
      }
    }
  }
}
