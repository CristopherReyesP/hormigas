import { describe, expect, it } from 'vitest';
import { mutationCapacity, mutationLines, mutationTotals, ownedMutations } from './mutationSummary';

describe('mutation summary', () => {
  it('compounds a multiplier per stack instead of adding the percentages', () => {
    expect(mutationLines('acid_mandibles', 1).map((l) => l.text)).toEqual(['Daño de los soldados +40%', 'Velocidad de los soldados −10%']);
    // 1.4² = 1.96, 0.9² = 0.81
    expect(mutationLines('acid_mandibles', 2).map((l) => l.text)).toEqual(['Daño de los soldados +96%', 'Velocidad de los soldados −19%']);
    // 1.4³ = 2.744: past double it reads as a factor
    expect(mutationLines('acid_mandibles', 3)[0].text).toBe('Daño de los soldados ×2.7');
  });

  it('sums additive stats and tells upsides from costs', () => {
    const lines = mutationLines('regenerative_tissue', 3);
    expect(lines[0]).toMatchObject({ text: 'Regeneración +3 PV/s', good: true });
    expect(lines[1]).toMatchObject({ text: 'Hambre máxima −39%', good: false });
    expect(mutationLines('spore_bloom', 2)[1]).toMatchObject({ text: 'Invasores por oleada +2', good: false });
    // Less hunger is good
    expect(mutationLines('carrion_gut', 1)[0]).toMatchObject({ text: 'Consumo de hambre −30%', good: true });
  });

  it('lists the owned mutations in first-pick order with their stacks', () => {
    const owned = ownedMutations(['cargo_sacs', 'acid_mandibles', 'cargo_sacs']);
    expect(owned.map((m) => [m.id, m.stacks, m.maxStacks])).toEqual([['cargo_sacs', 2, 3], ['acid_mandibles', 1, 3]]);
    expect(owned[0].lines[0].text).toBe('Carga de las obreras ×2.3');
  });

  it('combines mutations that touch the same stat, and drops what cancels out', () => {
    // Hipermetabolismo ×1.25 hunger, Tripa carroñera ×0.7: ×0.875 overall
    const totals = mutationTotals(['hyper_metabolism', 'carrion_gut']);
    expect(totals.find((l) => l.stat === 'hungerDecayMult')).toMatchObject({ text: 'Consumo de hambre −13%', good: true });
    expect(totals.find((l) => l.stat === 'movementSpeedMult')?.text).toBe('Velocidad de movimiento +20%');
    expect(mutationTotals([])).toEqual([]);
  });

  it('knows the size of a full build', () => {
    expect(mutationCapacity()).toEqual({ kinds: 16, stacks: 48 });
  });
});
