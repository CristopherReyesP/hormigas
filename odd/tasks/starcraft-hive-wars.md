# StarCraft-style hive wars

## Objective
Make the game play and look as close as possible to StarCraft while it still reads as ants: a mutant ant swarm (the player) against a rival alien ant colony, with direct unit control and a StarCraft-style HUD, on top of the roguelite run.

## Problem
Today the colony is steered only through priorities, every enemy is a beetle or cricket, and there is no rival colony. The codebase has no faction concept: combat targets beetles and crickets rather than allegiance (`src/game/systems/helpers/combatHelpers.ts:12-22`, `src/game/systems/CombatSystem.ts:54-109`), and every surface ant reveals the shared fog (`src/game/systems/FogOfWarSystem.ts:28-47`).

## Why
The user wants the StarCraft fantasy, "even if we have to change sprites", as long as the creatures still read as ants: mutant, even alien. Sprites are procedural canvas drawings (`src/engine/renderer/SpriteAtlas.ts:96-143`, palette in `src/engine/renderer/pixelart/palette.ts:14-41`), so a re-skin is code, not art assets.

## Concept
- Premise: a meteorite falls into the garden; its spores mutate the player's colony, and a second, alien colony crawls out of the crater.
- The Swarm (player, Zerg-like): fleshy mutant ants, magenta with glowing green veins. The queen lays larvae that mutate into castes (soldier → Slasher, scout → Winged, defender → Armored).
- The Crystal Hive (rival, Protoss-like): crystalline alien ants in cyan and gold, fewer but stronger, with a regenerating shell (shields). The Crystal Queen leads the night-7 assault.
- Beetles and crickets stay as neutral wildlife.
- Mapping: minerals → leaves, vespene → fungus (the fungus farm is the extractor), supply → brood chambers, creep → mycelium carpet that heals and speeds up, evolution chamber → the dawn mutation pick.

## Decisions
- The 7-night survival victory stays (user, 2026-10-09).
- Destroying the Crystal Hive also wins the run (user, 2026-10-09): two paths, defensive survival or a StarCraft-style offensive.
- Creative license and "excite me when I see the game" (user, 2026-10-09): visual impact comes first. P2 (StarCraft look) runs right after P1, before the RTS mechanics.
- Moments to stage in P1–P2: a meteorite impact (flash and screen shake) that opens each run; a dramatic evolution-chamber dialog at dawn with pulsing organic cards; mutations that leave visible marks on the ants (acid-green mandibles, glowing veins, wing stubs); a red-tinted night with an alarm pulse and cyan-glowing alien waves; a full-screen victory banner.
- The rival AI runs a scripted build order (as StarCraft's AI does), not a learned or fully simulated economy, unless playtesting shows it is too predictable.

## Tasks (phases; each phase is broken into tasks when it starts)
- [ ] P1 — Evolution chamber: finish the roguelite (T2, T3 in `odd/tasks/roguelite-run-loop.md`) with mutant-themed mutations. Cost: medium.
- [ ] P2 — StarCraft look: faction palettes, mutant and alien sprites in the atlas, bottom console (minimap, selection portrait, command card). Cost: medium.
- [ ] P3 — RTS control: drag selection, right-click move/attack, control groups (Ctrl+1–9; digits 1–3 currently set game speed at `src/game/GameManager.ts:346-349`), a `PlayerOrder` component the AI yields to. Cost: medium.
- [ ] P4 — Factions: ownership component in targeting, damage, vision and economy; faction-filtered fog; remove first-nest assumptions (`src/game/systems/AntAISystem.ts:123-125`). Cost: expensive; foundation for P5.
- [ ] P5 — Crystal Hive: rival nest on the far side of the map, scripted build order, night waves sourced from it, Crystal Queen boss on night 7, victory on hive destruction. Cost: expensive.
- [ ] P6 — Supply cap and mycelium (creep). Cost: medium.

## Acceptance criteria
- A new player recognizes both StarCraft (factions, HUD, control) and ants (silhouette, colony behavior) at a glance.
- The run is won by surviving 7 nights or by destroying the Crystal Hive; it is lost when the player's queen dies.
- `npm test`, `npm run lint`, `npm run build` pass after every phase.

## Delivery
- Each phase is its own chain of PRs (strategy `stacked-to-main`, as chosen for the roguelite). Push and PR remain the user's decision.

## Progress
- Feasibility mapped by Codex (read-only, 2026-10-09): rendering, input, unit control, structures and HUD are medium cost; factions and the rival map setup are expensive.

- Engram mirror (`odd/starcraft-hive-wars/tasks`): pending — the Engram write hook refuses saves in this session (host session registration not confirmed).

## Next step
P1 — continue `odd/tasks/roguelite-run-loop.md` T2.
