# Roguelite run loop

## Objective
Turn a session into a roguelite run: the colony wins by surviving 7 nights, and at each dawn the player picks 1 of 3 mutations that persist for the rest of the run.

## Problem
The game can be lost but never won: `GameManager.checkGameOver()` (`src/game/GameManager.ts:587-610`) only ends the game when the queen dies, and completing the 8 objectives only shows a notification (`src/game/systems/ObjectiveSystem.ts:117-148`). There is no per-run progression choice.

## Why
A fixed-length run (~25 min, 7 × 210 s day/night cycles) gives the game a goal, a pace, and replay value. Invasion waves already launch at nightfall, so nights are the combat beat and dawns are the decision beat.

## Scope
- In: victory at the dawn after night 7, a victory screen, a persistent mutation layer, and a pick-1-of-3 dawn dialog with about 8 mutations.
- Out (later features): meta-progression between runs (localStorage unlocks), playable species, a final-night enemy queen boss.
- Out (follow-up finding): the first invasion wave is armed at 180 s, after the first dusk at 150 s, so night 1 has no wave (`src/shared/constants.ts:115-119`, `src/game/systems/UndergroundInvasionSystem.ts:139-159`).

## Constraints
- `EventSystem.recalculateModifiers()` resets `GlobalModifiers` to 1.0 every tick (`src/game/events/EventSystem.ts:121-149`). Mutations must live in their own run-scoped layer and compose multiplicatively with event modifiers and purchased upgrades, never by writing into the reset object.
- Pausing stops the periodic UI snapshots (`src/game/GameManager.ts:574-582`), so the dawn dialog and the victory screen need an immediate snapshot publish.
- Restart already remounts a fresh `GameManager` (`src/App.tsx:62-65`, `src/ui/GameCanvas.tsx:36-50`). Run state must live in the manager, not in module globals.
- No new runtime dependencies.

## Decisions
- Victory condition: survive 7 nights, chosen by the user (2026-10-09) over completing the 8 objectives or killing an enemy queen.
- The final dawn (start of day 8) triggers victory instead of a mutation pick, so there are 6 picks per run (dawns of days 2–7).

## TDD
- Mode: on (default test-first policy). Runner: `npm test` (`vitest run`).
- Pure run logic (outcome rules, mutation offers, modifier composition) gets RED tests first; React dialogs get structural checks (`npm run build`, `npm run lint`).

## Tasks
- [x] T1 — Victory at the dawn after night 7: run outcome state in `GameManager`, a victory screen that reuses the game-over overlay styling, defeat unchanged. Route: delegated (Codex via `cx`; 2+ non-trivial files).
- [ ] T2 — Mutation layer: about 8 mutation definitions and run-scoped multipliers read at the stat sites (carry, soldier damage, dig speed, porter capacity, healing, movement, hunger, food respawn), composed with event modifiers and upgrades. Route: delegated (Codex via `cx`).
- [ ] T3 — Dawn pick flow: on dawns of days 2–7, pause, offer 3 distinct mutations, apply the choice, resume; no offer on the final dawn. Route: delegated (Codex via `cx`).

## Acceptance criteria
- The run ends in victory exactly at the start of day 8 when the queen is alive, and never earlier.
- Queen death still ends the run in defeat.
- Each dawn of days 2–7 offers 3 distinct mutations; the chosen one persists for the rest of the run and survives event modifier recalculation.
- Restart starts a fresh run with no mutations.
- `npm test`, `npm run lint`, `npm run build` pass.

## Delivery
- Forecast: ~750 authored changed lines across 3 tasks (above the ~400 budget). Strategy: `ask-on-risk`; chain strategy `stacked-to-main`, chosen by the user (2026-10-09).
- Slices (one PR each, merged to `main` in order):
  1. T1 on `feat/roguelite-run-loop` (from `main` ad7dc56) → PR to `main`.
  2. T2 on `feat/roguelite-mutations` (from slice 1) → PR based on slice 1.
  3. T3 on `feat/roguelite-dawn-pick` (from slice 2) → PR based on slice 2.
- Push and PR remain the user's decision.

## Progress
- Exploration (Codex, read-only) mapped lifecycle, day/night, modifiers, UI bridge, and tests; the parent spot-checked `EventSystem.recalculateModifiers()`.
- Engram mirror (`odd/roguelite-run-loop/tasks`): pending — the Engram write hook refused the save (host session registration not confirmed).

- T1 implemented by Codex (`src/game/run/RunOutcome.ts`, `GameManager.checkGameOver`, `GameOverScreen` victory variant, `RUN_NIGHTS_TO_WIN`). RED: `npm test` failed on the missing `RunOutcome` module. GREEN verified by the parent: `npm test` 23/23, `npm run lint` pass, `npm run build` pass. Browser play not exercised.
- The user confirmed (2026-10-09) the 7-night victory stays; the StarCraft-style mix (rival alien colony as the final-night boss, direct control, mutant/alien art direction) is added as a separate feature, not a replacement.
- T1 commit: `feat(run): win the run by surviving seven nights` (this commit). Verified by the parent: test 23/23, lint, build.

## Next step
T2 — mutation layer (may be re-themed as an evolution chamber once the StarCraft art direction is defined).
