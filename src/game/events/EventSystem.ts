import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { TileGrid } from '../../simulation/world/TileGrid';
import type { GlobalModifiers } from './GlobalModifiers';
import { EVENT_REGISTRY, type ActiveEvent, type EventDefinition, type EventContext } from './EventDefinitions';
import { COMPONENT, type PositionComponent } from '../components/components';

export class EventSystem implements System {
  readonly name = 'EventSystem';
  readonly priority = 3;  // Before AntAI (5)

  private world: World;
  private grid: TileGrid;
  private modifiers: GlobalModifiers;
  private activeEvents: ActiveEvent[] = [];
  private cooldowns: Map<string, number> = new Map();
  private gameTime: number = 0;
  private checkInterval: number = 10; // check for new events every 10 seconds
  private checkTimer: number = 0;

  constructor(world: World, grid: TileGrid, modifiers: GlobalModifiers) {
    this.world = world;
    this.grid = grid;
    this.modifiers = modifiers;
  }

  get active(): ActiveEvent[] {
    return this.activeEvents;
  }

  update(dt: number): void {
    this.gameTime += dt;
    this.checkTimer += dt;

    // Update cooldowns
    for (const [type, remaining] of this.cooldowns) {
      const newVal = remaining - dt;
      if (newVal <= 0) this.cooldowns.delete(type);
      else this.cooldowns.set(type, newVal);
    }

    // Update active events
    for (let i = this.activeEvents.length - 1; i >= 0; i--) {
      this.activeEvents[i].remainingTime -= dt;
      if (this.activeEvents[i].remainingTime <= 0) {
        this.endEvent(this.activeEvents[i]);
        this.activeEvents.splice(i, 1);
      }
    }

    // Check for new events periodically
    if (this.checkTimer >= this.checkInterval) {
      this.checkTimer = 0;
      this.tryTriggerEvent();
    }

    // Recalculate modifiers from active events
    this.recalculateModifiers();
  }

  private tryTriggerEvent(): void {
    // Max 2 concurrent events
    if (this.activeEvents.length >= 2) return;

    const eligible = EVENT_REGISTRY.filter(def => {
      if (this.gameTime < def.minGameTime) return false;
      if (this.cooldowns.has(def.type)) return false;
      if (this.activeEvents.some(e => e.definition.type === def.type)) return false;
      return true;
    });

    for (const def of eligible) {
      if (Math.random() < def.probability) {
        this.startEvent(def);
        break; // Only one new event per check
      }
    }
  }

  private startEvent(def: EventDefinition): void {
    const event: ActiveEvent = {
      definition: def,
      remainingTime: def.duration,
      totalTime: def.duration,
    };
    this.activeEvents.push(event);
    this.cooldowns.set(def.type, def.cooldown);

    // Events were previously INVISIBLE — the player suffered modifiers blindly
    this.world.pushNotification(def.severity, def.announcement);

    if (def.onStart) {
      def.onStart(this.getContext());
    }
  }

  private endEvent(event: ActiveEvent): void {
    this.world.pushNotification('info', `${event.definition.icon} ${event.definition.name} terminó`);
    if (event.definition.onEnd) {
      event.definition.onEnd(this.getContext());
    }
  }

  private getContext(): EventContext {
    // Find nest position
    const nests = this.world.query(COMPONENT.NEST, COMPONENT.POSITION);
    let nestX = this.grid.width / 2;
    let nestY = this.grid.height / 2;

    if (nests.length > 0) {
      const nestPos = this.world.getComponent<PositionComponent>(nests[0], COMPONENT.POSITION);
      if (nestPos) {
        nestX = nestPos.x;
        nestY = nestPos.y;
      }
    }

    return { world: this.world, grid: this.grid, nestX, nestY };
  }

  private recalculateModifiers(): void {
    // Reset to defaults (DayNightSystem multiplies on top AFTER this system runs)
    this.modifiers.pheromoneDecayMultiplier = 1.0;
    this.modifiers.movementSpeedMultiplier = 1.0;
    this.modifiers.hungerDecayMultiplier = 1.0;
    this.modifiers.foodSpawnMultiplier = 1.0;
    this.modifiers.decisionNoiseMultiplier = 1.0;
    this.modifiers.enemySpawnMultiplier = 1.0;
    this.modifiers.enemyAggressionMultiplier = 1.0;

    // Apply all active event modifiers (multiplicative stacking)
    for (const event of this.activeEvents) {
      const mods = event.definition.modifiers;
      if (mods.pheromoneDecayMultiplier !== undefined) {
        this.modifiers.pheromoneDecayMultiplier *= mods.pheromoneDecayMultiplier;
      }
      if (mods.movementSpeedMultiplier !== undefined) {
        this.modifiers.movementSpeedMultiplier *= mods.movementSpeedMultiplier;
      }
      if (mods.hungerDecayMultiplier !== undefined) {
        this.modifiers.hungerDecayMultiplier *= mods.hungerDecayMultiplier;
      }
      if (mods.foodSpawnMultiplier !== undefined) {
        this.modifiers.foodSpawnMultiplier *= mods.foodSpawnMultiplier;
      }
      if (mods.decisionNoiseMultiplier !== undefined) {
        this.modifiers.decisionNoiseMultiplier *= mods.decisionNoiseMultiplier;
      }
    }
  }
}
