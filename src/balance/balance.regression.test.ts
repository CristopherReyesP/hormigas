// A fast slice of the balance report (balanceReport.test.ts): the real game,
// played headless by the scripted bots. It guards the arc of an endless run:
// a colony that does nothing still lasts a few nights, and one played sensibly
// lives well past the first milestone.

import { describe, expect, it, vi } from 'vitest';
import { runBalanceSim } from './balanceSim';

vi.mock('../engine/input/InputManager', async () => (await import('../test/gameManagerMocks')).mockInputManager());
vi.mock('../game/systems/RenderSystem', async () => (await import('../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());
vi.stubGlobal('localStorage', undefined);

describe('balance: the arc of an endless Swarm run against the wildlife', () => {
  it('a colony left alone is not wiped out on the first nights', { timeout: 120_000 }, () => {
    const result = runBalanceSim({ player: 'swarm', rival: 'wildlife', bot: 'idle', seed: 1, maxNights: 3, dt: 1 / 10 });
    // Still alive after night 2, at least: no unavoidable early spike
    expect(result.deathNight ?? 3).toBeGreaterThanOrEqual(3);
  });

  it('a colony played sensibly survives night 8 on half the seeds', { timeout: 300_000 }, () => {
    // A coarser step (0.1 s) keeps it near a minute; stop as soon as two seeds made it.
    // Hard on purpose: since the enemies stopped stalling on their own routes, half the runs fall by night 8
    let survived = 0;
    for (const seed of [1, 2, 3, 4]) {
      const result = runBalanceSim({ player: 'swarm', rival: 'wildlife', bot: 'reasonable', seed, maxNights: 8, dt: 1 / 10 });
      if (result.deathNight === null) survived++;
      if (survived >= 2) break;
    }
    expect(survived).toBeGreaterThanOrEqual(2);
  });
});
