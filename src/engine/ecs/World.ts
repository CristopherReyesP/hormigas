import type { ComponentMap, System } from './types';
import type { EntityId } from '../../shared/types';

export class World {
  private nextEntityId: EntityId = 0;
  private entities: Set<EntityId> = new Set();
  private componentStores: Map<string, ComponentMap<unknown>> = new Map();
  private systems: System[] = [];
  private systemsSorted = false;

  deathEffects: Array<{
    x: number;
    y: number;
    timer: number;
    maxTime: number;
    color: string;
    radius: number;
  }> = [];

  /** Short-lived combat hit feedback (slash + flash at victim position).
   *  Same lifecycle as deathEffects: pushed by CombatSystem, ticked/rendered by RenderSystem. */
  hitEffects: Array<{
    x: number;
    y: number;
    timer: number;
    maxTime: number;
    /** Attack direction (attacker → victim), radians. Used to orient the slash. */
    angle: number;
  }> = [];

  /** Global player-facing alerts: pushed by any system, drained/pruned by GameManager,
   *  rendered by the React NotificationStack. */
  notifications: Array<{
    id: number;
    severity: 'info' | 'success' | 'warning' | 'danger';
    message: string;
    createdAt: number; // wall-clock ms (display lifecycle only)
  }> = [];

  /** Lifetime colony metrics — incremented by systems, read by ObjectiveSystem */
  metrics = {
    antsHatched: 0,
    densDestroyed: 0,
    tilesExcavated: 0,
    wavesRepelled: 0,
  };

  /** Permanent queen upgrades — multipliers read by factories at ant creation */
  upgrades = {
    workerCarryMult: 1,
    soldierDamageMult: 1,
    digSpeedMult: 1,
    porterBonus: 0,
    healRateMult: 1,
  };

  private nextNotificationId = 0;
  private notificationCooldowns: Map<string, number> = new Map();

  /** Push a notification. Optional `key` + `cooldownMs` dedupe repeats (e.g. one
   *  starvation alert per few seconds, not one per dead ant per frame). */
  pushNotification(
    severity: 'info' | 'success' | 'warning' | 'danger',
    message: string,
    key?: string,
    cooldownMs = 0
  ): void {
    const now = Date.now();
    if (key && cooldownMs > 0) {
      const last = this.notificationCooldowns.get(key);
      if (last !== undefined && now - last < cooldownMs) return;
      this.notificationCooldowns.set(key, now);
    }
    this.notifications.push({ id: this.nextNotificationId++, severity, message, createdAt: now });
    if (this.notifications.length > 20) this.notifications.shift();
  }

  createEntity(): EntityId {
    const id = this.nextEntityId++;
    this.entities.add(id);
    return id;
  }

  destroyEntity(id: EntityId): void {
    this.entities.delete(id);
    for (const store of this.componentStores.values()) {
      store.delete(id);
    }
  }

  addComponent<T>(entity: EntityId, componentName: string, data: T): void {
    let store = this.componentStores.get(componentName) as ComponentMap<T> | undefined;
    if (!store) {
      store = new Map();
      this.componentStores.set(componentName, store as ComponentMap<unknown>);
    }
    store.set(entity, data);
  }

  removeComponent(entity: EntityId, componentName: string): void {
    const store = this.componentStores.get(componentName);
    if (store) store.delete(entity);
  }

  getComponent<T>(entity: EntityId, componentName: string): T | undefined {
    const store = this.componentStores.get(componentName) as ComponentMap<T> | undefined;
    return store?.get(entity);
  }

  getStore<T>(componentName: string): ComponentMap<T> {
    let store = this.componentStores.get(componentName) as ComponentMap<T> | undefined;
    if (!store) {
      store = new Map();
      this.componentStores.set(componentName, store as ComponentMap<unknown>);
    }
    return store;
  }

  // Query entities that have ALL specified components
  query(...componentNames: string[]): EntityId[] {
    const result: EntityId[] = [];
    const stores = componentNames.map(name => this.componentStores.get(name));

    if (stores.some(s => !s)) return result;

    // Iterate over the smallest store for efficiency
    const smallestStore = stores.reduce((smallest, current) =>
      (current!.size < smallest!.size ? current : smallest)
    )!;

    for (const entityId of smallestStore.keys()) {
      if (stores.every(s => s!.has(entityId))) {
        result.push(entityId);
      }
    }
    return result;
  }

  addSystem(system: System): void {
    this.systems.push(system);
    this.systemsSorted = false;
  }

  update(dt: number): void {
    if (!this.systemsSorted) {
      this.systems.sort((a, b) => a.priority - b.priority);
      this.systemsSorted = true;
    }
    for (const system of this.systems) {
      system.update(dt);
    }
  }

  getEntityCount(): number {
    return this.entities.size;
  }

  hasEntity(id: EntityId): boolean {
    return this.entities.has(id);
  }
}
