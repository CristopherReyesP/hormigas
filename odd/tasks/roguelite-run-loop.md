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
- [x] T2 — Mutation layer: about 8 mutation definitions and run-scoped multipliers read at the stat sites (carry, soldier damage, dig speed, porter capacity, healing, movement, hunger, food respawn), composed with event modifiers and upgrades. Route: delegated (Codex via `cx`).
- [x] T2b — Mutation redesign from the design audit: 5 of the 8 T2 mutations duplicate queen shop upgrades (`src/game/GameManager.ts:805-811`), none has a cost, and the single-effect type cannot express trade-offs. Change the data shape to `effects[]` plus `tags`, `mark` and `maxStacks` (3), replace the set with the 10 below, and add offer rules. Route: delegated (Claude subagent; Codex is out of usage quota).
  - `acid_mandibles` (Assault, mark: chartreuse jaws): soldier damage ×1.4; cost: soldier speed ×0.9. Acid damage over time and shield piercing are deferred to P5.
  - `hyper_metabolism` (Tempo, mark: pulsing vein): movement ×1.2; cost: hunger decay ×1.25.
  - `cargo_sacs` (Economy, mark: swollen pale gaster): worker carry ×1.5; cost: speed ×0.9 while carrying.
  - `bone_spurs` (Defense, mark: leg spurs): dig speed ×1.3 and damage ×1.5 underground.
  - `regenerative_tissue` (Sustain, mark: pink stitches): every colony ant heals 1 HP/s anywhere; cost: max hunger ×0.85.
  - `carrion_gut` (Combat-economy, mark: dark gaster rings): hunger decay ×0.7 and +50% meat from kills.
  - `spore_bloom` (Economy, mark: thorax pustules): food respawn ×1.3; cost: +1 invader per wave. Spore ground is deferred to P6.
  - `titan_brood` (Defense, mark: thick head plate): soldier max HP ×1.5; cost: soldier speed ×0.75 and +10 soldier cost.
  - `wing_stubs` (Info, mark: wing stubs): scout vision ×1.5. Revealing the breach is deferred.
  - `hive_mind` (capstone, mark: glowing antenna tips): flanking bonus ×2 (`src/shared/constants.ts:109`); unlocked after 2 picks tagged Tempo or Assault.
  - Offer rules: 3 distinct ids, never past `maxStacks`, the capstone only when unlocked, at least one Assault or Defense mutation per offer when available, extra weight for tags already owned, deterministic with a seeded rng.
- [x] T3 — Dawn pick flow, staged as the evolution chamber (see `odd/tasks/starcraft-hive-wars.md`): on dawns of days 2–7, pause, offer 3 distinct mutations as cards (upside in green, cost in red, tag chips, a mini ant preview with its mark, stack count), pixel panel and not glass; the dialog captures keys 1–3, which are game-speed hotkeys today; apply the choice and resume; no offer on the final dawn. The victory screen lists the mutation build and its button reads "NUEVA PARTIDA" instead of "REINTENTAR" (`src/ui/GameOverScreen.tsx:86-97`).
- [ ] T4 — Wave pacing: arm waves by night number, send a 1-unit scout wave on night 1, use a rising curve (2, 3, 4, 5, 6, 8) instead of 1, 1, 2, 2, 3, 3, and make the HUD count down to the real attack instead of the arming time (`src/ui/HUD.tsx:81-84`, `src/game/systems/UndergroundInvasionSystem.ts:106,139-159`). Moved into scope by the design audit under the user's creative license. Route: delegated (Claude subagent while Codex is out of quota).

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
  2. T2 and T2b on `feat/roguelite-mutations` (from slice 1) → PR based on slice 1.
  3. T3 and T4 on `feat/roguelite-dawn-pick` (from slice 2) → PR based on slice 2.
- Push and PR remain the user's decision.

## Progress
- Exploration (Codex, read-only) mapped lifecycle, day/night, modifiers, UI bridge, and tests; the parent spot-checked `EventSystem.recalculateModifiers()`.
- Engram mirror (`odd/roguelite-run-loop/tasks`): synced 2026-10-09. Earlier saves failed because the Engram PreToolUse hook rejects writes after a Bash `cd` moves the session cwd; `cd ~` fixed it.

- T1 implemented by Codex (`src/game/run/RunOutcome.ts`, `GameManager.checkGameOver`, `GameOverScreen` victory variant, `RUN_NIGHTS_TO_WIN`). RED: `npm test` failed on the missing `RunOutcome` module. GREEN verified by the parent: `npm test` 23/23, `npm run lint` pass, `npm run build` pass. Browser play not exercised.
- The user confirmed (2026-10-09) the 7-night victory stays; the StarCraft-style mix (rival alien colony as the final-night boss, direct control, mutant/alien art direction) is added as a separate feature, not a replacement.
- T1 commit: `feat(run): win the run by surviving seven nights` (this commit). Verified by the parent: test 23/23, lint, build.

- T1 committed as `38ada85`. RDD assess (base `ad7dc56`, committed-only): risk medium, `review_due` false, reason `under_budget` — pending in the slice until a later commit reaches the budget.

- T2 implemented by Codex on `feat/roguelite-mutations`; the Codex run ended early on a usage limit, before its final report, so no RED evidence was reported. The parent verified the tree: all 8 mutations wired at their read sites, `applyMutation`/`getAppliedMutations`/`offerMutations` present, `npm test` 41/41, `npx tsc -b --noEmit`, `npm run lint`, `npm run build` pass.
- T2 committed as `9903f38`; the hive wars plan as `fd53479`. RDD assess (base `ad7dc56`): risk medium, `review_due` true (`slice_budget_reached`, ~600 lines). The user granted the review (lineage `review-464632d4bfdecea8`, one reliability lens).
- Design audit (Claude subagent, read-only, 2026-10-09) adopted under the user's creative license: T2b, the T3 card details and T4 added; art direction recorded in `odd/tasks/starcraft-hive-wars.md`.

- T1+T2 review approved and acknowledged (lineage `review-464632d4bfdecea8`); the reviewed boundary advances to `fd53479`. Non-blocking findings folded into T2b: porter load can exceed max capacity (`PorterSystem.ts:243`, WARNING), fractional soldier damage (`factories.ts:88`), unvalidated offer rng contract, strict day equality in `RunOutcome.ts:16`.
- T2b delegated to a Claude subagent writer (Codex out of quota).

- T2b implemented by a Claude subagent: `effects[]`/tags/mark/maxStacks shape, the 10 mutations, `MutationOffers.ts` with the offer rules and `createSeededRng`, `antStats.ts` as the single spawn/retrofit stat formula, `RegenerationSystem`, `getBreedCost(role)`, porter load capped at `carrying.maxCapacity`, `dayNumber >=` victory. RED: 40 then 12 assertion failures (stubs first). GREEN verified by the parent: `npm test` 87/87, `npx tsc -b --noEmit`, `npm run lint`, `npm run build` pass. ~590 added / 226 removed under src, about half tests.
- T2b choices: `carrion_gut` tags `Combat`+`Economy` (not counted as Assault/Defense); `hive_mind` tag `Capstone`; the queen has no ANT component, so regeneration and max hunger do not affect her; `wing_stubs` changes fog reveal only. A RunOutcome test row (`night→day 9` expecting no victory) was replaced to match the `>=` rule.
- Carried into T3: `src/ui/UndergroundPanel.tsx:248` hard-codes the soldier cost (35); it must read `getBreedCost(role)` so `titan_brood` shows.
- T2b commit: `feat(run): redesign mutations with trade-offs, tags and offer rules` (this commit).

- T3 implemented by a Claude subagent (resumed once after a transient API network error): `DawnPick.ts` (`shouldOfferMutation`, `buildMutationOffer`, `summarizeMutationBuild`), the dawn offer flow in `GameManager` (per-run seeded rng, pause, immediate publish, keys 1–3 pick, `chooseMutation`), `EvolutionChamber.tsx` (carapace plates, heartbeat border, staggered cards, upside/cost/tags/pips, atlas ant preview with a placeholder mark, reduced-motion support), victory banner "LA COLMENA PREVALECE" with the build and "NUEVA PARTIDA", breed costs from `getBreedCost`. RED: 15 failures (mostly assertions) before GREEN. Verified by the parent: `npm test` 109/109, `npx tsc -b --noEmit`, `npm run lint`, `npm run build` pass. Not yet played in the browser by the parent.
- The art-direction UI tokens live as `--chrome-*` on `:root`, because the existing `--ui-*` tokens style the whole legacy UI; P2 can point `--ui-*` at them.
- The parent moved the dev-only preview key from `M` (it clashed with the underground minimap toggle) to `E`. Known minor issue: holding a digit picks a card and its key repeats then change game speed.
- T3 commit: `feat(run): offer mutations at dawn in the evolution chamber` (this commit).

## Next step
T4 — wave pacing, then P2.
