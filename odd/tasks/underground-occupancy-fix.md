# Underground occupancy fix

## Objective
Underground tile occupancy must reflect where ants actually are after movement resolves.

## Problem
`src/game/systems/MovementSystem.ts:117-120` updates the per-tile occupancy map before the walkability and wall-slide checks (`:123-157`). When an ant is blocked or only slides on one axis, occupancy records a tile the ant never entered, so later ants in the same tick see stale capacity. `blockedTime` entries are never cleared when an entity is removed.

## Why
Crowding rules (max ants per tile, squeeze after waiting) depend on accurate counts; stale counts cause phantom congestion or overcrowding.

## Scope
- In: occupancy accounting in `MovementSystem`, `blockedTime` cleanup on entity removal, a vitest harness with regression tests.
- Out: pathfinding and fog-of-war performance (separate candidates), gameplay tuning.

## Constraints
- Keep crowding safety valves (entrance exemption, squeeze) unchanged in behavior.
- No new runtime dependencies; `vitest` as devDependency only.

## TDD
- Mode: on — source: user choice (2026-09-23, "test that fails with the bug, then passes").
- Runner: `npx vitest run` (added in T1 as `npm test`).

## Tasks
- [x] T1 — Add vitest + `test` script; write failing regression tests (RED). Route: direct inline for one test file; narrow fixture mapping delegated after the 4-file exploration trigger. The package changes were already present at task start.
- [x] T2 — Fix occupancy to update from the final resolved position; clear `blockedTime` on entity removal (GREEN, then refactor). Route: delegated (Codex via `cx`).

## Acceptance criteria
- A blocked or wall-sliding ant does not change occupancy of a tile it did not enter.
- Removed entities leave no `blockedTime` entry.
- `npm test`, `npm run build`, `npm run lint` pass.

## Delivery
- Forecast ~200 authored changed lines, single PR, strategy `ask-on-risk`. RDD: disabled globally (unmanaged).
- Push and PR remain the user's decision.

## Progress
- Branch `fix/underground-occupancy` created from `main` (70211e3).
- T1 RED: `npx vitest run` reports 4 expected failures (blocked source, blocked target, axis slide, removed entity wait state). `npm run lint -- src/game/systems/MovementSystem.test.ts` and `npx tsc -p tsconfig.app.json --noEmit` pass.
- T1 commit: `7fb879d` (Codex sandbox cannot write `.git`; Claude commits after verifying).
- T2 RED reproduced: `npx vitest run` failed all 4 underground occupancy tests before the fix.
- T2 GREEN: `npx vitest run` passed 4/4; `npm run lint`, `npx tsc -b --noEmit`, and `npm run build` passed.
- T2 accounting now uses each underground ant's final resolved position, including snap, slide, escape, and nudge; crowding still checks the proposed tile before movement. Stale `blockedTime` IDs are pruned once per update using `World.hasEntity()`; this avoids a removal hook.
- T2 commit: `fix(movement): update underground occupancy from resolved position` (this commit). Verified by Claude: test 4/4, lint, build.
- Engram mirror synced by Claude (topic `odd/underground-occupancy-fix/tasks`).

## Next step
Done. Push and PR are the user's decision.
