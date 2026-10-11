// Replaced at build time by Vite (vite.config.ts): the build's date and commit
declare const __GAME_VERSION__: string | undefined;

/** The game's version: "v2026-10-11 17:20 · bdf72d7" (or "dev" where Vite did not build it) */
export const GAME_VERSION: string = typeof __GAME_VERSION__ === 'string' ? __GAME_VERSION__ : 'dev';
