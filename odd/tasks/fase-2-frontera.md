# Fase 2: La Frontera Salvaje

## Objective
Give the run a second act: once the colony rules Phase 1's map, a thorn wall falls, the map grows, and a meteor shower brings more and stronger rivals.

## Decisions (user, 2026-10-11)
- Trigger: BOTH the rival core destroyed AND the colony's dominion over the zone (`DOMINION_TARGET` 75%). A run against Fauna salvaje has no core: only the dominion counts.
- Enemies: the Legionary ants (an army-ant colony with a Queen) AND spiders and mantises as dangerous wildlife.
- "The opening was one rival meteor; the second is a shower because there are more rivals, and they look different": every impact brings a new base of a rival race. The picked rival brings 2, every other race 1, and the Legionary nest comes down with them. Each meteor falls in its rival's colors (cyan Crystal, steel and fire Human, crimson Legion).
- "The mycelium does not spread much": the creep now reaches `CREEP_MAX_RADIUS` 24 (was 13), from 5 tiles, one more every 3 ants (was 4 and 4).

## Design
- Map: `WORLD_WIDTH`×`WORLD_HEIGHT` is 168×126. Phase 1 plays in the middle 120×90 (`PHASE1_ZONE_*`). `TileGrid.sealFrontier` blocks everything outside and turns the zone's outer 2 tiles into the thorn wall. `grid.bounds` is the area the run plays on: every spawn, the wave edges and the camera use it. `openFrontier` reopens it all.
- Rendering: terrain and foliage caches are `ChunkedCanvas` (1024 px chunks) because one canvas the size of the map passes iOS's 16.7 M px limit.
- Dominion (`src/game/phase/frontierProgress.ts`): 60% explored walkable ground of the zone, 40% wildlife dens destroyed, measured every second.
- Phase 2 (`GameManager.openPhase2`): the wall falls, the camera and minimap take the whole map, and the meteor shower (`src/game/render/meteorShower.ts`, visual only) strikes the impact sites. The rival bases rise there: Crystal Hives and Human bases, whose systems are added if the run did not start with them (`ensurePhase2Rivals`, also on load). `FrontierSystem` places the Legionary nest and Queen, the spider lairs, the mantises and the rich food.
- Waves: one raid source shared by every rival still standing, splitting the raiders round-robin, with +50% raiders per standing base. Against Fauna salvaje the waves use the new `legion` wave rival.
- Creatures (`frontierCreatures.ts`) are beetle entities with their own stats, sprites (`frontierSprites.ts`) and a marker component. Legion raiders are steered by `FrontierSystem`, not the beetle AI.
- Win: every meteor base and the Legionary nest and Queen destroyed gives `GameOverStats.frontierConquered`, a victory the run can continue past.
- Save: `SAVE_VERSION` 2 (the map grew; no migration). Raid wiring is rebuilt on load (`wirePhase2Raid`).
- Dev only: `F` opens Phase 2 at once.

## Follow-ups
- A Human player has no objective panel, so Phase 2 progress shows only in the banner and notifications.
- Numbers are starting points for playtests (`FRONTIER_CREATURE_STATS`, `PHASE2_*`, `DOMINION_TARGET`).
