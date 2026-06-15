import type { EntityId } from '../../shared/types';

// Components are plain objects stored in typed maps
export type ComponentMap<T> = Map<EntityId, T>;

// A System is a function that processes entities each tick
export interface System {
  readonly name: string;
  readonly priority: number; // lower runs first
  update(dt: number): void;
}
