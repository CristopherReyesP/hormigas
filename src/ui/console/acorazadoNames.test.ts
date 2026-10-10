import { describe, expect, it } from 'vitest';
import { BEETLE_STATE_LABEL, FOOD_LABEL } from './format';
import { RIVAL_OPTIONS } from '../racePicker/races';

const SOURCES = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

describe('beetles are named Acorazados in the game', () => {
  it('leaves no player-facing "escarabajo" anywhere in the source', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    const hits = Object.entries(SOURCES).filter(([, text]) => /escarabaj/i.test(text)).map(([path]) => path);
    expect(hits).toEqual([]);
  });

  it('names the carcass and the wildlife rival after the acorazado', () => {
    expect(FOOD_LABEL.beetle_meat).toBe('Carne de acorazado');
    expect(RIVAL_OPTIONS.find(r => r.id === 'wildlife')?.note).toBe('Acorazados y grillos');
    expect(Object.keys(BEETLE_STATE_LABEL).length).toBeGreaterThan(0);
  });
});
