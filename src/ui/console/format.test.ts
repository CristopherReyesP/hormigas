import { describe, expect, it } from 'vitest';
import { formatClock, stripEmoji } from './format';

describe('stripEmoji', () => {
  it('removes OS emoji from game messages and keeps the Spanish text', () => {
    expect(stripEmoji('📯 ¡Retirada! 4 hormigas vuelven al nido')).toBe('¡Retirada! 4 hormigas vuelven al nido');
    expect(stripEmoji('⚔️ Soldados feroces')).toBe('Soldados feroces');
    expect(stripEmoji('🛡️ Guarnición')).toBe('Guarnición');
  });

  it('leaves plain text, digits and punctuation alone', () => {
    expect(stripEmoji('Oleada 2 en 1:30 (3/5) ▲ ▼')).toBe('Oleada 2 en 1:30 (3/5) ▲ ▼');
  });
});

describe('formatClock', () => {
  it('formats seconds as m:ss', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(59.9)).toBe('0:59');
    expect(formatClock(-3)).toBe('0:00');
  });
});
