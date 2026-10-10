import { describe, expect, it } from 'vitest';
import { FOOD_LABEL } from '../ui/console/format';
import { LEAPER_NAME, LEAPER_NOTICE } from './wildlifeNames';

// Every game and UI source file (tests excluded), as raw text
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('Saltador: the player-facing name of the alien leaper (internally a cricket)', () => {
  it('uses neutral Spanish singular, plural, den and meat names', () => {
    expect(LEAPER_NAME).toEqual({
      one: 'Saltador',
      many: 'Saltadores',
      den: 'Guarida de saltadores',
      meat: 'Carne de saltador',
    });
    expect(FOOD_LABEL.cricket_meat).toBe(LEAPER_NAME.meat);
  });

  it('names the leaper in the steal and den notifications', () => {
    expect(LEAPER_NOTICE.stealing).toMatch(/saltador/i);
    expect(LEAPER_NOTICE.denDestroyed).toMatch(/saltadores/i);
  });

  it('leaves no "grillo" in any player-facing string', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    const offenders = Object.entries(SOURCES)
      .filter(([, text]) => /grillo/i.test(text))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });
});
