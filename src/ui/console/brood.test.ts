import { describe, expect, it } from 'vitest';
import type { BroodSnapshot } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { breedButtonState, deriveBroodPipeline, type BroodKeys } from './brood';

const KEYS: BroodKeys = { breed: ['A', 'S', 'D', 'F', 'G'], incubation: 'W', storage: 'U' };

const COSTS: Record<AntRole, number> = {
  [AntRole.Worker]: 20,
  [AntRole.Soldier]: 35,
  [AntRole.Scout]: 25,
  [AntRole.Nurse]: 15,
  [AntRole.Defender]: 30,
  [AntRole.Bomber]: 25,
};

function snapshot(overrides: Partial<BroodSnapshot> = {}): BroodSnapshot {
  return {
    pantry: { stored: 60, capacity: 450, tiles: 9 },
    surfaceStock: 0,
    hasQueen: true,
    queenCanLay: true,
    queue: [],
    maxQueuedPerRole: 5,
    eggs: [],
    incubation: { tiles: 6, freeSlots: 24 },
    nurses: 3,
    costs: COSTS,
    ...overrides,
  };
}

function incubatingEgg(role: AntRole, remaining: number, progress = 0.5) {
  return { role, progress, fedProgress: 1, remaining, incubating: true };
}

describe('brood pipeline', () => {
  it('lays out the four stages in order: pantry, the queen laying, incubation, hatch', () => {
    const pipeline = deriveBroodPipeline(snapshot(), KEYS);
    expect(pipeline.stages.map((s) => s.id)).toEqual(['pantry', 'laying', 'incubating', 'hatch']);
    expect(pipeline.stages.map((s) => s.label)).toEqual(['DESPENSA', 'REINA', 'INCUBANDO', 'NACE']);
  });

  it('shows an idle, healthy colony with counts and tells the player which keys order an egg', () => {
    const pipeline = deriveBroodPipeline(snapshot(), KEYS);
    expect(pipeline.stages.map((s) => [s.value, s.tone])).toEqual([
      ['60', 'ok'],
      ['0', 'idle'],
      ['0', 'idle'],
      ['-', 'idle'],
    ]);
    expect(pipeline.issues).toEqual([]);
    expect(pipeline.status).toEqual({ tone: 'dim', text: 'Encarga un huevo con A S D F G', more: 0 });
  });

  it('blocks the pantry when it is empty but food waits at the entrance', () => {
    const pipeline = deriveBroodPipeline(snapshot({ pantry: { stored: 0, capacity: 450, tiles: 9 }, surfaceStock: 34 }), KEYS);
    expect(pipeline.stages[0]).toMatchObject({ value: '0', tone: 'blocked' });
    expect(pipeline.issues[0]).toEqual({
      stage: 'pantry',
      tone: 'blocked',
      text: 'Despensa vacía: las obreras deben bajar comida (34 en la entrada)',
    });
    expect(pipeline.status).toMatchObject({ tone: 'blocked', text: pipeline.issues[0].text });
  });

  it('asks for foraging when there is no food anywhere', () => {
    const pipeline = deriveBroodPipeline(snapshot({ pantry: { stored: 0.4, capacity: 450, tiles: 9 }, surfaceStock: 0 }), KEYS);
    expect(pipeline.issues[0].text).toBe('Despensa vacía: recolecta comida en la superficie');
  });

  it('says how much food is missing for the cheapest egg', () => {
    const pipeline = deriveBroodPipeline(snapshot({ pantry: { stored: 12.7, capacity: 450, tiles: 9 } }), KEYS);
    expect(pipeline.stages[0]).toMatchObject({ value: '12', tone: 'blocked' });
    expect(pipeline.issues[0].text).toBe('Faltan 3 de comida en la despensa para un huevo');
  });

  it('adds the entrance pile to the missing amount when food is still on its way down', () => {
    const pipeline = deriveBroodPipeline(snapshot({ pantry: { stored: 12.7, capacity: 450, tiles: 9 }, surfaceStock: 30 }), KEYS);
    expect(pipeline.issues[0].text).toBe('Faltan 3 de comida en la despensa para un huevo (30 en la entrada)');
  });

  it('points at the Storage tool when there is no pantry at all', () => {
    const pipeline = deriveBroodPipeline(snapshot({ pantry: { stored: 0, capacity: 0, tiles: 0 }, surfaceStock: 20 }), KEYS);
    expect(pipeline.issues[0].text).toBe('Sin despensa: marca casillas con Almacén (U) en el nido');
  });

  it('blocks the queen stage while she is too hungry to lay', () => {
    const queue = [{ role: AntRole.Soldier, progress: 0 }];
    const pipeline = deriveBroodPipeline(snapshot({ queue, queenCanLay: false }), KEYS);
    expect(pipeline.stages[1]).toMatchObject({ value: '1', tone: 'blocked' });
    expect(pipeline.issues[0]).toEqual({
      stage: 'laying',
      tone: 'blocked',
      text: 'La reina tiene hambre: no pone hasta que las nodrizas la alimenten',
    });
  });

  it('marks the queen busy while eggs are queued', () => {
    const queue = [{ role: AntRole.Worker, progress: 0.4 }, { role: AntRole.Scout, progress: 0 }];
    const pipeline = deriveBroodPipeline(snapshot({ queue }), KEYS);
    expect(pipeline.stages[1]).toMatchObject({ value: '2', tone: 'busy' });
    expect(pipeline.status).toEqual({ tone: 'good', text: 'La reina está poniendo 2 huevos', more: 0 });
  });

  it('points at the Incubation tool when there is no incubation area', () => {
    const pipeline = deriveBroodPipeline(snapshot({ incubation: { tiles: 0, freeSlots: 0 } }), KEYS);
    expect(pipeline.stages[2].tone).toBe('blocked');
    expect(pipeline.issues[0].text).toBe('Sin área de incubación: márcala con Incubación (W) en el nido');
  });

  it('blocks incubation without nurses, since only nurses carry and feed eggs', () => {
    const pipeline = deriveBroodPipeline(snapshot({ nurses: 0 }), KEYS);
    expect(pipeline.stages[2].tone).toBe('blocked');
    expect(pipeline.issues[0].text).toBe('Sin nodrizas: nadie lleva ni alimenta los huevos');
  });

  it('asks for more incubation tiles when laid eggs have nowhere to go', () => {
    const waiting = { role: AntRole.Worker, progress: 0, fedProgress: 0, remaining: 20, incubating: false };
    const pipeline = deriveBroodPipeline(snapshot({ eggs: [waiting], incubation: { tiles: 1, freeSlots: 0 } }), KEYS);
    expect(pipeline.issues[0].text).toBe('Incubación llena: marca más casillas con Incubación (W)');
  });

  it('warns while laid eggs wait for a nurse to carry them', () => {
    const waiting = { role: AntRole.Worker, progress: 0, fedProgress: 0, remaining: 20, incubating: false };
    const one = deriveBroodPipeline(snapshot({ eggs: [waiting] }), KEYS);
    expect(one.stages[2]).toMatchObject({ value: '1', tone: 'warn' });
    expect(one.issues[0]).toEqual({ stage: 'incubating', tone: 'warn', text: '1 huevo espera que una nodriza lo lleve a incubar' });
    const two = deriveBroodPipeline(snapshot({ eggs: [waiting, waiting] }), KEYS);
    expect(two.issues[0].text).toBe('2 huevos esperan que una nodriza los lleve a incubar');
  });

  it('blocks the hatch while a grown larva is still hungry', () => {
    const hungry = { role: AntRole.Soldier, progress: 1, fedProgress: 0.3, remaining: 0, incubating: true };
    const pipeline = deriveBroodPipeline(snapshot({ eggs: [hungry] }), KEYS);
    expect(pipeline.stages[3].tone).toBe('blocked');
    expect(pipeline.issues[0].text).toBe('Larvas con hambre: las nodrizas necesitan comida en la despensa');
  });

  it('counts down to the next hatch and lists eggs soonest first, with the queue last', () => {
    const pipeline = deriveBroodPipeline(
      snapshot({
        queue: [{ role: AntRole.Nurse, progress: 0.5 }],
        eggs: [incubatingEgg(AntRole.Soldier, 25, 0.2), incubatingEgg(AntRole.Worker, 12, 0.4)],
      }),
      KEYS,
    );
    expect(pipeline.count).toBe(3);
    expect(pipeline.stages[2]).toMatchObject({ value: '2', tone: 'busy' });
    expect(pipeline.stages[3]).toMatchObject({ value: '0:12', tone: 'busy' });
    expect(pipeline.status).toEqual({ tone: 'good', text: 'Próxima eclosión en 0:12', more: 0 });
    expect(pipeline.eggs.map((e) => [e.role, e.state, e.tag])).toEqual([
      [AntRole.Worker, 'incubating', '0:12'],
      [AntRole.Soldier, 'incubating', '0:25'],
      [AntRole.Nurse, 'queued', 'COLA'],
    ]);
    expect(pipeline.eggs[0]).toMatchObject({ progress: 0.4, title: 'Obrera: nace en 0:12' });
  });

  it('rounds the time left up, so a growing egg never reads 0:00', () => {
    const pipeline = deriveBroodPipeline(snapshot({ eggs: [incubatingEgg(AntRole.Worker, 0.3)] }), KEYS);
    expect(pipeline.eggs[0].tag).toBe('0:01');
  });

  it('shows at most three eggs and counts the rest', () => {
    const eggs = [5, 6, 7, 8, 9].map((t) => incubatingEgg(AntRole.Worker, t));
    const pipeline = deriveBroodPipeline(snapshot({ eggs }), KEYS);
    expect(pipeline.eggs).toHaveLength(3);
    expect(pipeline.hiddenEggs).toBe(2);
  });

  it('orders several problems along the pipeline and headlines the first one', () => {
    const pipeline = deriveBroodPipeline(snapshot({ pantry: { stored: 0, capacity: 450, tiles: 9 }, surfaceStock: 5, nurses: 0 }), KEYS);
    expect(pipeline.issues.map((i) => i.stage)).toEqual(['pantry', 'incubating']);
    expect(pipeline.status).toMatchObject({ tone: 'blocked', text: pipeline.issues[0].text, more: 1 });
  });

  it('explains every stage in its tooltip, including the problem', () => {
    const pipeline = deriveBroodPipeline(snapshot({ nurses: 0 }), KEYS);
    expect(pipeline.stages[0].hint).toContain('Comida guardada bajo tierra');
    expect(pipeline.stages[2].hint).toContain('Sin nodrizas');
  });
});

describe('breed button state', () => {
  it('is enabled with food in the pantry and room in the queue', () => {
    expect(breedButtonState(AntRole.Worker, snapshot())).toEqual({
      cost: 20,
      queued: 0,
      full: false,
      affordable: true,
      disabled: false,
    });
  });

  it('counts eggs of this caste already queued', () => {
    const queue = [{ role: AntRole.Worker, progress: 0 }, { role: AntRole.Soldier, progress: 0 }, { role: AntRole.Worker, progress: 0 }];
    expect(breedButtonState(AntRole.Worker, snapshot({ queue })).queued).toBe(2);
  });

  it('is disabled with the missing amount when the pantry cannot pay', () => {
    const state = breedButtonState(AntRole.Soldier, snapshot({ pantry: { stored: 12.9, capacity: 450, tiles: 9 } }));
    expect(state).toMatchObject({
      affordable: false,
      disabled: true,
      reason: 'Falta comida en la despensa: hay 12 de 35. Recolecta comida en la superficie.',
    });
  });

  it('says the food the top bar counts is still at the entrance, on its way down', () => {
    const state = breedButtonState(AntRole.Worker, snapshot({ pantry: { stored: 0, capacity: 450, tiles: 9 }, surfaceStock: 49 }));
    expect(state.reason).toBe('Falta comida en la despensa: hay 0 de 20. Hay 49 en la entrada: las obreras la bajan a la despensa.');
  });

  it('points at the storage designation when there is no pantry at all', () => {
    const state = breedButtonState(AntRole.Worker, snapshot({ pantry: { stored: 0, capacity: 0, tiles: 0 }, surfaceStock: 49 }));
    expect(state.reason).toBe('Falta comida en la despensa: hay 0 de 20. Marca casillas de Almacén en el nido.');
  });

  it('treats a fractional pantry the way the game charges it', () => {
    expect(breedButtonState(AntRole.Worker, snapshot({ pantry: { stored: 19.6, capacity: 450, tiles: 9 } })).disabled).toBe(true);
    expect(breedButtonState(AntRole.Worker, snapshot({ pantry: { stored: 20, capacity: 450, tiles: 9 } })).disabled).toBe(false);
  });

  it('is disabled once five eggs of the caste wait in the queue', () => {
    const queue = Array.from({ length: 5 }, () => ({ role: AntRole.Soldier, progress: 0 }));
    expect(breedButtonState(AntRole.Soldier, snapshot({ queue }))).toMatchObject({
      queued: 5,
      full: true,
      disabled: true,
      reason: 'Cola llena: ya hay 5 huevos de soldado en espera.',
    });
  });

  it('is disabled without a queen', () => {
    expect(breedButtonState(AntRole.Worker, snapshot({ hasQueen: false }))).toMatchObject({
      disabled: true,
      reason: 'No hay reina que ponga huevos.',
    });
  });
});

describe('a colony with no workers', () => {
  const empty = { pantry: { stored: 0, capacity: 450, tiles: 9 }, surfaceStock: 120, workers: 0 };

  it('heads the brood status with the missing workers', () => {
    const pipeline = deriveBroodPipeline(snapshot(empty), KEYS);
    expect(pipeline.status.text).toBe('¡Sin obreras! Cría obreras para recolectar y llevar comida');
  });

  it('lets a worker egg be paid with the entrance food, and says so on the button', () => {
    const worker = breedButtonState(AntRole.Worker, snapshot(empty));
    expect(worker.disabled).toBe(false);
    expect(worker.note).toBe('Sin obreras: este huevo se paga con comida de la entrada (120 allí).');
    // Only the worker: the other castes still need the pantry
    expect(breedButtonState(AntRole.Soldier, snapshot(empty)).disabled).toBe(true);
    // With workers alive the entrance pays nothing
    expect(breedButtonState(AntRole.Worker, snapshot({ ...empty, workers: 3 })).disabled).toBe(true);
  });
});
