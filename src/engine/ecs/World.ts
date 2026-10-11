import { FactionRegistry } from '../../game/factions/factions';
import { RunModifiers } from '../../game/run/RunModifiers';
import { MineralBank } from '../../game/economy/MineralBank';
import { emptyRunTally, emptyUpgradeLevels, type RunTally, type UpgradeLevels } from '../../game/upgrades/upgradeLevels';
import type { ComponentMap, System } from './types';
import type { EntityId } from '../../shared/types';

export class World {
  private nextEntityId: EntityId = 0;
  private entities: Set<EntityId> = new Set();
  private componentStores: Map<string, ComponentMap<unknown>> = new Map();
  private systems: System[] = [];
  private systemsSorted = false;
  /**
   * Membership version per component store: bumped whenever an entity joins
   * or leaves it (not when a component's data changes). query() results are
   * cached against these, so the many systems asking for the same component
   * set in one tick share one scan until a matching store changes.
   */
  private storeVersions: WeakMap<ComponentMap<unknown>, number> = new WeakMap();
  private queryCache: Map<string, { stores: ComponentMap<unknown>[]; versions: number[]; result: readonly EntityId[] }> = new Map();

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

  /** Swarm upgrade levels (Mejoras): plain data a save can serialize. Effects derive from them (src/game/upgrades). */
  upgradeLevels: UpgradeLevels = emptyUpgradeLevels();

  /** Run tallies for the Estadísticas tab (enemies defeated, ants lost, resources gathered) */
  runTally: RunTally = emptyRunTally();

  /** Colony multipliers the systems read; kept in step with upgradeLevels by syncWorldUpgrades */
  upgrades = {
    digSpeedMult: 1,
    porterBonus: 0,
    healRateMult: 1,
  };

  /** The colony's minerals bank: miners deposit ore here, structures will spend it (P7) */
  readonly minerals = new MineralBank();

  readonly runModifiers: RunModifiers;
  /** The match's factions; instance state, so every run and test world starts fresh */
  readonly factions: FactionRegistry;

  constructor(runModifiers = new RunModifiers(), factions = new FactionRegistry()) {
    this.runModifiers = runModifiers;
    this.factions = factions;
  }

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
      if (store.delete(id)) this.bumpStore(store);
    }
  }

  private bumpStore(store: ComponentMap<unknown>): void {
    this.storeVersions.set(store, (this.storeVersions.get(store) ?? 0) + 1);
  }

  /** Forget every cached query (after component stores were rewritten in place, e.g. loading a save) */
  invalidateQueries(): void {
    this.queryCache.clear();
  }

  addComponent<T>(entity: EntityId, componentName: string, data: T): void {
    let store = this.componentStores.get(componentName) as ComponentMap<T> | undefined;
    if (!store) {
      store = new Map();
      this.componentStores.set(componentName, store as ComponentMap<unknown>);
    }
    if (!store.has(entity)) this.bumpStore(store as ComponentMap<unknown>);
    store.set(entity, data);
  }

  removeComponent(entity: EntityId, componentName: string): void {
    const store = this.componentStores.get(componentName);
    if (store && store.delete(entity)) this.bumpStore(store);
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

  // Query entities that have ALL specified components.
  // Hot path (dozens of calls per tick over every entity): answered from the
  // cache while none of the stores involved gained or lost an entity. The
  // result is shared and frozen: callers copy it before sorting or editing.
  query(...componentNames: string[]): readonly EntityId[] {
    const count = componentNames.length;
    if (count === 0) return [];
    const key = count === 1 ? componentNames[0] : componentNames.join('|');
    const cached = this.queryCache.get(key);
    if (cached && this.cacheValid(cached, componentNames)) return cached.result;

    const result = this.scan(componentNames);
    const stores: ComponentMap<unknown>[] = [];
    const versions: number[] = [];
    for (let i = 0; i < count; i++) {
      const store = this.componentStores.get(componentNames[i]);
      // A store that does not exist yet: nothing to cache against
      if (!store) return result;
      stores.push(store);
      versions.push(this.storeVersions.get(store) ?? 0);
    }
    const frozen = Object.freeze(result);
    this.queryCache.set(key, { stores, versions, result: frozen });
    return frozen;
  }

  private cacheValid(entry: { stores: ComponentMap<unknown>[]; versions: number[] }, componentNames: string[]): boolean {
    for (let i = 0; i < componentNames.length; i++) {
      const store = this.componentStores.get(componentNames[i]);
      if (store !== entry.stores[i] || (this.storeVersions.get(store) ?? 0) !== entry.versions[i]) return false;
    }
    return true;
  }

  private scan(componentNames: string[]): EntityId[] {
    const result: EntityId[] = [];
    const count = componentNames.length;

    // Iterate over the smallest store for efficiency
    let smallest: ComponentMap<unknown> | undefined;
    for (let i = 0; i < count; i++) {
      const store = this.componentStores.get(componentNames[i]);
      if (!store) return result;
      if (!smallest || store.size < smallest.size) smallest = store;
    }
    if (count === 1) {
      for (const entityId of smallest!.keys()) result.push(entityId);
      return result;
    }

    const others: ComponentMap<unknown>[] = [];
    for (let i = 0; i < count; i++) {
      const store = this.componentStores.get(componentNames[i])!;
      if (store !== smallest) others.push(store);
    }
    const otherCount = others.length;
    for (const entityId of smallest!.keys()) {
      let all = true;
      for (let i = 0; i < otherCount; i++) {
        if (!others[i].has(entityId)) {
          all = false;
          break;
        }
      }
      if (all) result.push(entityId);
    }
    return result;
  }

  addSystem(system: System): void {
    this.systems.push(system);
    this.systemsSorted = false;
  }

  /** Drop the system called `name` (a race that does without it); false when there is none. */
  removeSystem(name: string): boolean {
    const before = this.systems.length;
    this.systems = this.systems.filter((system) => system.name !== name);
    return this.systems.length !== before;
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
