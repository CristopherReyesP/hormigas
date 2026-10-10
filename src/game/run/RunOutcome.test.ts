import { describe, expect, it } from 'vitest';
import { resolveRunOutcome } from './RunOutcome';

describe('run outcome (endless run)', () => {
  it('never ends the run just for surviving nights', () => {
    // The old run was won at the dawn of day 8; now nothing happens there, or ever after
    expect(resolveRunOutcome(null, true)).toBeNull();
    expect(resolveRunOutcome(null, true, false)).toBeNull();
  });

  it('destroying the rival core is still a victory', () => {
    expect(resolveRunOutcome(null, true, true)).toBe('victory');
  });

  it('the queen dying loses the run, even on the tick the core falls', () => {
    expect(resolveRunOutcome(null, false)).toBe('defeat');
    expect(resolveRunOutcome(null, false, true)).toBe('defeat');
  });

  it('never changes an outcome once decided', () => {
    expect(resolveRunOutcome('defeat', true, true)).toBe('defeat');
    expect(resolveRunOutcome('victory', false)).toBe('victory');
  });
});
