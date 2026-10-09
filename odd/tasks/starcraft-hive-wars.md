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
- Free pass for everything in this repo; it is a fun project, not work (user, 2026-10-09). Design and implementation decisions and work-unit commits proceed without step-by-step approval.
- Receipt-driven review is off for this clone (`gentle-ai review mode disable --scope clone`, user, 2026-10-09); delivery follows ordinary checks (`npm test`, `npm run lint`, `npm run build`).
- Creative license and "excite me when I see the game" (user, 2026-10-09): visual impact comes first. P2 (StarCraft look) runs right after P1, before the RTS mechanics.
- Moments to stage in P1–P2: a meteorite impact (flash and screen shake) that opens each run; a dramatic evolution-chamber dialog at dawn with pulsing organic cards; mutations that leave visible marks on the ants (acid-green mandibles, glowing veins, wing stubs); a red-tinted night with an alarm pulse and cyan-glowing alien waves; a full-screen victory banner.
- The rival AI runs a scripted build order (as StarCraft's AI does), not a learned or fully simulated economy, unless playtesting shows it is too predictable.

## Art direction (from the design audit, 2026-10-09)
Current incoherences to fix in P2: four art-pixel scales on screen (ants 3, beetles 4, crickets 6, tiles 2; `SpriteAtlas.ts:28-34`, `RenderSystem.ts:348`), non-integer nest scale, free rotation and continuous zoom; brown ants on brown soil with a tiny role band (`SpriteAtlas.ts:262-263`); beetles share ant body colors (`:436`); crickets are grass green (`:577`); the red mushroom out-shouts units and collides with UI danger red; baked top-left highlight rotates with the sprite; navy night (`PostProcessor.ts:43-44`); raw rgba in `RenderSystem.ts:711-741`; enemies drawn on explored instead of visible tiles (`RenderSystem.ts:1346,1358`); glass panel next to pixel panels (`index.css:218-241`), Courier body font, OS emoji icons, mixed English/Spanish UI, raw CSS colors (`index.css:87-126`).

Rules:
- One art pixel = 2 screen px at zoom 1. Bigger units get bigger grids, never bigger scale (ant 24×24, beetle 28×28, cricket 48×48). Rotation snaps to 16 directions; zoom steps of 0.5.
- Every unit keeps the ant body plan (gaster, waist, thorax, head, 6 legs, 2 antennae). Factions differ by color, silhouette and glow at once. Swarm: curved, bulbous gaster, scythe mandibles, 1 px spine bumps, glowing vein. Crystal Hive: faceted, diamond/hex gaster, straight gold pincers, crystal-tipped antennae, cyan glow, hex ring while shielded. Wildlife: beetle dome, cricket Z-legs, no glow. Roles inside a faction differ by shape. Selection ellipses: green own, red enemy, yellow neutral.

Palette tokens (dark → light):

| Token | Hex |
|---|---|
| swarm.flesh | `#2a0f1f #4a1736 #7a2453 #b03a72 #e06a9a` |
| swarm.vein (glow) | `#5a8a1c #c6ff3d` |
| swarm.outline | `#1a0a12` |
| crystal.shell | `#0e2a3a #1b5a73 #2fa3b8 #7fe8f0 #e8ffff` |
| crystal.gold | `#8a6a1c #d9a935 #ffe27a` |
| crystal.shield / outline | `#5ff3ff` / `#0a1620` |
| neutral.beetle | `#2b2a1e #4a4630 #6e6844`, eyes `#ffb02e` |
| neutral.cricket | `#5c5a2e #8a8444 #b8b062` |
| crater | `#2a2320 #3b3346`, cracks in crystal cyan |
| mycelium | `#3a2a3e #5e3f63 #8a5c8f` |
| UI chrome | bg `#0e080b`, panel `#160c12`, panel-light `#241420`, border `#5a3048`, border-light `#8a4a6a`, text `#e8d8dc`, dim `#9a8088`, accent `#c6ff3d`, warn `#f0b541`, danger `#ff3b3b` |
| night | edge `#2a0d1e` @0.28, deep `#1a0612` @0.5, alarm `#ff2d2d` |

Surface soil and grass keep their ramps, about 15% less saturated.

VFX: acid (chartreuse arc droplets, 4 px cross on hit, 3-step dithered puddle); crystal shield (1 px cyan hex arc flash, 1×2 shards on break, 8-step refill); spores (1 px magenta motes rising on mycelium, swirling into the queen at the dawn pick); meteorite (trail `#fff4d0→#ff7a2e→#b0301e`, 2-frame white flash, 6-frame shake, crater decal with pulsing cyan cracks); deaths (Swarm green goo, Crystal shards, wildlife carcass → meat).

Bottom console (~180 px, full width): left square minimap with surface/underground tab; center 64×64 animated head portrait (atlas head at 4×) plus a health-colored selection grid; right 3×5 command card with QWERT/ASDFG/ZXCVB hotkeys; top strip with leaves, fungus, brood x/y and the day/night clock. Sharp carapace-plate panels with stepped shadows, no blur; 16 px pixel icons from the atlas instead of emoji; one pixel body font; Spanish-only in-game copy.

Mechanics notes for later phases: arm waves by night number with a 1-unit scout wave on night 1 and a rising curve (2, 3, 4, 5, 6, 8 plus the boss); make the HUD count down to the real attack; reward destroying the Hive early (its build order scales each night, crystal shards unlock capstone mutations, a "won on night N" rank); both paths meet the night-7 Crystal Queen; under RTS control, workers stay autonomous (priorities become job distribution), military units obey `PlayerOrder` and the AI acts only when idle, drafting skips ordered units, "Defender" becomes the idle stance and "Retirada" a command-card ability; night invaders become Crystal drones in P5.

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

- Design audit (Claude subagent, read-only, 2026-10-09): art direction and mechanics notes recorded above; its P1 items became T2b, T3 details and T4 in `odd/tasks/roguelite-run-loop.md`.
- Engram mirror (`odd/starcraft-hive-wars/tasks`): synced 2026-10-09.

## Next step
P1 — `odd/tasks/roguelite-run-loop.md` T2b, T3, T4; then P2.
