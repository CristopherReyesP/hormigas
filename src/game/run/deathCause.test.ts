import { describe, expect, it } from 'vitest';
import { attackerList, coreKindOf, deathCauseText } from './deathCause';

describe('deathCauseText', () => {
  it('starvation: the queen died of hunger, with the pantry tip', () => {
    const text = deathCauseText({ kind: 'starvation', core: 'queen' });
    expect(text.line).toBe('La reina murió de hambre');
    expect(text.tip).toMatch(/Mantén comida en la despensa para la reina/);
  });

  it('invaders: the queen fell, naming who killed her', () => {
    const text = deathCauseText({ kind: 'invaders', core: 'queen', attackers: [{ name: 'Acorazado', count: 3 }] });
    expect(text.line).toBe('La reina cayó ante los invasores (Acorazado ×3)');
    expect(text.tip).toMatch(/Construye Espinas en la entrada/);
  });

  it('the Acorazado Colosal gets its own tip', () => {
    const text = deathCauseText({
      kind: 'invaders',
      core: 'queen',
      attackers: [{ name: 'Acorazado', count: 4 }, { name: 'Acorazado Colosal', count: 1 }],
    });
    expect(text.line).toBe('La reina cayó ante los invasores (Acorazado ×4, Acorazado Colosal)');
    expect(text.tip).toMatch(/Colosal/);
  });

  it('the Humans and the Crystal Hive lose their cores', () => {
    expect(deathCauseText({ kind: 'invaders', core: 'command_center', attackers: [{ name: 'Dron de cristal', count: 2 }] }).line)
      .toBe('El Centro de mando fue destruido (Dron de cristal ×2)');
    expect(deathCauseText({ kind: 'unknown', core: 'command_center' }).line).toBe('El Centro de mando fue destruido');
    expect(deathCauseText({ kind: 'invaders', core: 'hive', attackers: [] }).line).toBe('La Colmena fue destruida');
    expect(deathCauseText({ kind: 'unknown', core: 'hive' }).tip).toMatch(/centinelas/);
  });

  it('lists the three most numerous kinds', () => {
    expect(attackerList([
      { name: 'A', count: 5 }, { name: 'B', count: 2 }, { name: 'C', count: 1 }, { name: 'D', count: 1 },
    ])).toBe('A ×5, B ×2, C');
  });

  it('maps races to their cores', () => {
    expect(coreKindOf('swarm')).toBe('queen');
    expect(coreKindOf('human')).toBe('command_center');
    expect(coreKindOf('crystal')).toBe('hive');
  });
});
