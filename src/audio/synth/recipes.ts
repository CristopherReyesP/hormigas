import type { SoundId } from '../sounds';
import { ALERT_RECIPES } from './alertRecipes';
import { COMBAT_RECIPES } from './combatRecipes';
import { INTRO_RECIPES } from './introRecipes';
import { SWARM_RECIPES } from './swarmRecipes';
import { UI_RECIPES, type Recipe } from './uiRecipes';

export type { Recipe };

/** Every sound the engine can build, by id. The type keeps the table complete. */
export const RECIPES: Record<SoundId, Recipe> = {
  ...UI_RECIPES,
  ...SWARM_RECIPES,
  ...COMBAT_RECIPES,
  ...ALERT_RECIPES,
  ...INTRO_RECIPES,
};
