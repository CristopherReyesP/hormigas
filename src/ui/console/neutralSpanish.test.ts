import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob(['/src/**/*.{ts,tsx}', '!/src/**/*.test.{ts,tsx}'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

// Voseo verb forms that have slipped into game copy before; neutral Spanish uses tú
const VOSEO = /(?<!\p{L})(podés|tenés|querés|sabés|ponés|esperá|marcá|elegí|pulsá|criá|encargá|tocá|mirá|hacé|andá|vení)(?!\p{L})/iu;

describe('in-game copy is neutral Spanish', () => {
  it('uses no voseo anywhere in the source', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50);
    const hits = Object.entries(SOURCES).flatMap(([path, text]) =>
      text.split('\n').filter(line => VOSEO.test(line)).map(line => `${path}: ${line.trim()}`));
    expect(hits).toEqual([]);
  });
});
