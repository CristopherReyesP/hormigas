import type { SoundId } from '../sounds';
import { UI_RECIPES, type Recipe } from './uiRecipes';

export type { Recipe };

/** Every sound the engine can build, by id. */
export const RECIPES: Partial<Record<SoundId, Recipe>> = {
  ...UI_RECIPES,
};
