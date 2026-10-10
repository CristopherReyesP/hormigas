import { describe, expect, it } from 'vitest';
import type { World } from '../../engine/ecs/World';
import type { UndergroundGrid } from '../../simulation/world/UndergroundGrid';
import { BREED_COST_WORKER } from '../../shared/constants';
import { OBJECTIVES, ObjectiveSystem } from './ObjectiveSystem';

function freshSystem(): ObjectiveSystem {
  const world = { metrics: { antsHatched: 0 }, query: () => [], pushNotification: () => {} };
  const grid = { getPantryStored: () => ({ leaf: 0, mushroom: 0, meat: 0, total: 0 }) };
  return new ObjectiveSystem(world as unknown as World, grid as unknown as UndergroundGrid);
}

/** Voseo imperatives such as "Criá" or "Hacé" open a sentence; "encargá" also showed up mid-sentence. */
const VOSEO_OPENING = /^\p{Lu}\p{Ll}*[áéí]\s/u;
const VOSEO_WORDS = ['Criá', 'encargá', 'Hacé', 'Acumulá', 'Excavá', 'Formá', 'Destruí'];

describe('objective copy', () => {
  it('opens with the exact key and the pantry amount the first egg needs', () => {
    expect(freshSystem().getState()?.description).toBe(
      `Cría tu primera hormiga: pulsa A (Criar obrera) cuando la despensa tenga ${BREED_COST_WORKER} de comida`,
    );
  });

  it('uses neutral Spanish in every objective', () => {
    for (const objective of OBJECTIVES) {
      expect(objective.description).not.toMatch(VOSEO_OPENING);
      for (const word of VOSEO_WORDS) expect(objective.description).not.toContain(word);
    }
  });
});
