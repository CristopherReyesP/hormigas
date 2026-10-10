// Shared stand-ins for the browser-only adapters a real GameManager builds, so
// integration tests can run the actual manager and simulation under node.
//
// Every instance answers any method it was not given with a recording no-op
// (`vi.fn()`), so a new construction-time call in GameManager never throws in
// tests that do not care about it. Use from a hoisted vi.mock factory:
//
//   vi.mock('../../engine/input/InputManager', async () =>
//     (await import('../../test/gameManagerMocks')).mockInputManager());

import { vi, type Mock } from 'vitest';

/** Methods a test wants to observe or drive; `this` is the mock instance. */
type MockMethods = Record<string, (...args: never[]) => unknown>;

export type TolerantInstance = Record<string, (...args: unknown[]) => unknown>;
export type TolerantClass = new (...args: unknown[]) => TolerantInstance;

/** A class whose instances run `methods` and stub everything else with a per-instance vi.fn(). */
export function tolerantClass(methods: MockMethods = {}): TolerantClass {
  class Tolerant {
    constructor() {
      const stubs = new Map<string, Mock>();
      return new Proxy(this, {
        get(target, prop, receiver) {
          if (typeof prop === 'symbol' || prop in target) return Reflect.get(target, prop, receiver);
          // A stubbed `then` would make the instance look like a promise to await
          if (prop === 'then') return undefined;
          let stub = stubs.get(prop);
          if (!stub) {
            stub = vi.fn();
            stubs.set(prop, stub);
          }
          return stub;
        },
      });
    }
  }
  Object.assign(Tolerant.prototype, methods);
  return Tolerant as unknown as TolerantClass;
}

/** Module shape for `vi.mock('.../engine/input/InputManager', ...)` */
export function mockInputManager(methods: MockMethods = {}): { InputManager: TolerantClass } {
  return { InputManager: tolerantClass(methods) };
}

/** Module shape for `vi.mock('.../systems/RenderSystem', ...)` */
export function mockRenderSystem(methods: MockMethods = {}): { RenderSystem: TolerantClass } {
  return { RenderSystem: tolerantClass(methods) };
}

/** A canvas the manager can attach listeners to; the renderer gets an empty 2D context. */
export function fakeCanvas(): HTMLCanvasElement {
  return Object.assign(new EventTarget(), { getContext: () => ({}) }) as unknown as HTMLCanvasElement;
}
