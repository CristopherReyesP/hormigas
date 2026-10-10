import { describe, expect, it } from 'vitest';
import { showLiveAlerts } from './liveAlerts';

describe('showLiveAlerts', () => {
  it('shows alerts while playing', () => {
    expect(showLiveAlerts({ introPlaying: false, gameOver: null })).toBe(true);
  });

  it('hides them during the intro', () => {
    expect(showLiveAlerts({ introPlaying: true, gameOver: null })).toBe(false);
  });

  it('hides them once the run is over, so the end screen and its stats stay readable', () => {
    expect(showLiveAlerts({ introPlaying: false, gameOver: { outcome: 'defeat' } })).toBe(false);
  });
});
