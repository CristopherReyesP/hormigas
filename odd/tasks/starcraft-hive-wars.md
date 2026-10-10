# StarCraft-style hive wars

## Objective
Make the game play and look as close as possible to StarCraft while it still reads as ants: a mutant ant swarm (the player) against a rival alien ant colony, with direct unit control and a StarCraft-style HUD, on top of the roguelite run.

## Problem
Today the colony is steered only through priorities, every enemy is a beetle or cricket, and there is no rival colony. The codebase has no faction concept: combat targets beetles and crickets rather than allegiance (`src/game/systems/helpers/combatHelpers.ts:12-22`, `src/game/systems/CombatSystem.ts:54-109`), and every surface ant reveals the shared fog (`src/game/systems/FogOfWarSystem.ts:28-47`).

## Why
The user wants the StarCraft fantasy, "even if we have to change sprites", as long as the creatures still read as ants: mutant, even alien. Sprites are procedural canvas drawings (`src/engine/renderer/SpriteAtlas.ts:96-143`, palette in `src/engine/renderer/pixelart/palette.ts:14-41`), so a re-skin is code, not art assets.

## Concept
- Premise: a meteorite falls into the garden. Its spores mutate the player's colony, and a crystalline alien intelligence grows out of the crater.
- The Swarm (player, Zerg-like): fleshy mutant ants, magenta with glowing green veins. The queen lays larvae that mutate into castes (soldier → Slasher, scout → Winged, defender → Armored).
- The Crystal Hive (rival, Protoss-like): NOT insects. They are alien crystalline beings in cyan and gold, fewer but stronger, with a regenerating shell (shields). The user decided on 2026-10-09: "que parezca menos insecto, porque los insectos son el enjambre". The Crystal Queen leads the night-7 assault.
- Beetles and crickets stay as neutral wildlife.
- Mapping: minerals → leaves, vespene → fungus (the fungus farm is the extractor), supply → brood chambers, creep → mycelium carpet that heals and speeds up, evolution chamber → the dawn mutation pick.

## Decisions
- The 7-night survival victory stays (user, 2026-10-09).
- Destroying the Crystal Hive also wins the run (user, 2026-10-09): two paths, defensive survival or a StarCraft-style offensive.
- Free pass for everything in this repo; it is a fun project, not work (user, 2026-10-09). Design and implementation decisions and work-unit commits proceed without step-by-step approval.
- Receipt-driven review is off for this clone (`gentle-ai review mode disable --scope clone`, user, 2026-10-09); delivery follows ordinary checks (`npm test`, `npm run lint`, `npm run build`).
- Creative license and "excite me when I see the game" (user, 2026-10-09): visual impact comes first. P2 (StarCraft look) runs right after P1, before the RTS mechanics.
- Moments to stage in P1–P2: a meteorite impact (flash and screen shake) that opens each run; a dramatic evolution-chamber dialog at dawn with pulsing organic cards; mutations that leave visible marks on the ants (acid-green mandibles, glowing veins, wing stubs); a red-tinted night with an alarm pulse and cyan-glowing alien waves; a full-screen victory banner.
- Each faction builds its base differently (user, 2026-10-09):
  - The Swarm lives in a cave, the underground layer, and adds living structures on its mycelium at the surface (P7).
  - The other factions don't dig. The Crystal Hive and, later, the Humans build upward: buildings with floors. Each floor has an interior view, like the Swarm's NIDO view. The user picked "pisos hacia arriba" over upgrade tiers and surface terraces.
  - Implication: the layer model (surface/underground, the SUPERFICIE/NIDO tabs, an UndergroundGrid) generalizes into per-building interior floors. Design this in P4 before P5.
- Each faction also eats and breeds differently (user approved the parent's proposal, 2026-10-09):

  | Faction | Eats | Spends | Breeding | Growth limit |
  |---|---|---|---|---|
  | Swarm | biomass: leaves, farm fungus, meat (including enemy carcasses) | food for ants, minerals for living structures | the queen lays one egg at a time, nurses feed it in incubation chambers, and the larva mutates into its caste; the dawn mutation pick sits on top | the queen is the bottleneck (like Zerg larvae): protect her and keep nurses |
  | Crystal Hive | nothing organic: minerals and meteor energy | minerals for everything | no eggs: units crystallize from mineral energy, and each spire floor produces one unit type | slow and expensive but strong; destroying a floor removes that production; growth needs the mineral fields, so it competes with the player for them (contested expansions) |
  | Humans | rations from their crops, plus scrap/metal | rations to train, metal to build | units are trained on building floors (barracks floor → soldiers, workshop floor → machines) | parallel production: more buildings mean more output |

  Implication for P4: each faction has its own resource table instead of today's single pantry, its own production model, and its own food rules in HungerSystem.
- Power levels and costs also differ by faction (user, 2026-10-09: "los niveles de fuerza, costos, etc."). The parent proposed this framework; the numbers are starting points, to be tuned in playtests:

  | | Swarm | Crystal Hive | Humans |
  |---|---|---|---|
  | Unit cost | cheap (1×) | expensive (3×) | medium (2×) |
  | Strength per unit | low | high | medium |
  | Army size | many | few | moderate |
  | Speed | fast | slow | medium |
  | Durability | heals by eating, regenerates on mycelium | a regenerating crystal shield on top of HP | armor; builders repair machines |
  | Attack | melee swarms, acid at range | heavy energy hits, splash | ranged firearms, bunkers |
  | Production | fast eggs through one queen | slow | medium, in parallel |
  | Weakness | splash and turrets | losing the mineral fields | needs buildings and supply lines |
  | Tier 1 / 2 / 3 | Rasgadora / Escupidora / Coloso | Crystal drone / Sentinel / Crystal Queen (boss) | Soldier / Marksman or Engineer / Tank or Mech |

  | Tactics (player and AI) | rush and flank, overwhelm with numbers, ambush from tunnels, retreat underground | turtle behind shields, then a slow, unstoppable push with few strong units, plus recall/teleport | positional play: bunkers and walls, ranged kiting, siege pushes |

  Balance rule: equal power per cost across factions. A Swarm group that costs X should roughly match a Crystal unit that costs X. When the second faction lands, check this with a headless duel script, the same way scripts/check-ai-tactics.ts runs.
- The rival AI runs a scripted build order (as StarCraft's AI does), not a learned or fully simulated economy, unless playtesting shows it is too predictable.

## Art direction (from the design audit, 2026-10-09)
Current incoherences to fix in P2: four art-pixel scales on screen (ants 3, beetles 4, crickets 6, tiles 2; `SpriteAtlas.ts:28-34`, `RenderSystem.ts:348`), non-integer nest scale, free rotation and continuous zoom; brown ants on brown soil with a tiny role band (`SpriteAtlas.ts:262-263`); beetles share ant body colors (`:436`); crickets are grass green (`:577`); the red mushroom out-shouts units and collides with UI danger red; baked top-left highlight rotates with the sprite; navy night (`PostProcessor.ts:43-44`); raw rgba in `RenderSystem.ts:711-741`; enemies drawn on explored instead of visible tiles (`RenderSystem.ts:1346,1358`); glass panel next to pixel panels (`index.css:218-241`), Courier body font, OS emoji icons, mixed English/Spanish UI, raw CSS colors (`index.css:87-126`).

Rules:
- One art pixel = 2 screen px at zoom 1. Bigger units get bigger grids, never bigger scale (ant 24×24, beetle 28×28, cricket 48×48). Rotation snaps to 16 directions; zoom steps of 0.5.
- Only the Swarm keeps the ant body plan (gaster, waist, thorax, head, 6 legs, 2 antennae). Factions differ by color, silhouette and glow at once.
  - Swarm: curved, bulbous gaster, scythe mandibles, 1 px spine bumps, glowing vein.
  - Crystal Hive: no legs, antennae, mandibles or segmented body. Units are hovering geometric crystal forms (prisms, octahedra, obelisks) around a glowing cyan energy core, with orbiting shards and gold filigree. They glide and bob above a soft ground shadow and leave a faint light trail. A hex ring shows while shielded. Tiers:
    - Drone: a small floating prism with one orbiting shard.
    - Sentinel: a tall hovering obelisk with a shield ring.
    - Crystal Queen: a large floating crystal crown ringed by orbiting crystals. Wildlife: beetle dome, cricket Z-legs, no glow. Roles inside a faction differ by shape. Selection ellipses: green own, red enemy, yellow neutral.

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
- [ ] P2 — StarCraft look: faction palettes, mutant and alien sprites in the atlas, bottom console (minimap, selection portrait, command card). Cost: medium. Branch `feat/hive-look` (from `feat/roguelite-dawn-pick` 69e7e03).
  - [x] P2.1 Swarm skin and wildlife recolor: player ants and queen in the Swarm palette (magenta flesh, chartreuse glowing vein, dark outline, scythe mandibles, spine bumps, roles distinct by silhouette); beetles olive with amber eyes, crickets straw; the red mushroom toned down so units pop. Route: delegated (Claude subagent).
  - [x] P2.2 Night and fog: red-violet night with a dusk alarm pulse; enemies drawn only on currently visible tiles. Route: delegated (same writer as P2.1).
    - Done by a Claude subagent: `SWARM_CASTES` body plans per role (soldier huge head and jaws, scout thin and long-legged, nurse pale round gaster, defender armored with a horn), role color bands removed from bodies, queen as a veined egg sac with a magenta/green halo and crest, olive beetles with amber eyes, straw crickets, rust mushrooms, a glowing green entrance ring on the nest; red-violet night (0.28/0.5) with a 1.6 s dithered red dusk alarm on both layers (game time, holds on pause); enemies drawn only where fog is fully clear (`fogVisibility.ts`, threshold shared with `FogRenderer`). RED: missing fog module and 10/11 PostProcessor tests failing before GREEN. Sprites checked by eye from rendered PNGs (parent reviewed them too). Verified by the parent: `npm test` 125/125, `npx tsc -b --noEmit`, `npm run lint`, `npm run build`.
    - Decision (parent, creative license): "visible" means fully clear fog (~70% of an ant's reveal radius), as in StarCraft. Open: veins dim at night; a post-tint glow pass fits P2.3/P2.4.
  - [ ] P2.3 Meteorite opening: impact flash, screen shake and a crater decal with pulsing cyan cracks at run start; plus the Swarm vein glow drawn after the night tint. Route: delegated (Claude subagent in an isolated worktree on `feat/hive-intro`, merged into `feat/hive-look`).
  - [ ] P2.5+ StarCraft screen (raised in priority after the user said the change still looked minimal, 2026-10-09). A headless screenshot showed the game canvas as an 800×600 box centered in a mostly empty dark window, with the old brown side panels. Scope: a full-viewport canvas, a top resource strip and the bottom console (minimap, info panel, 3×5 command card with hotkeys) in the chrome tokens, pixel icons instead of emoji, one pixel font, Spanish only, and a readable default zoom. Route: delegated (Claude subagent in the main worktree).
  - [x] P2.3 done on `feat/hive-intro` as b451bf3 (fireball and trail, flash, shake, shockwave, crater with cyan cracks, spores, "EL ENJAMBRE DESPIERTA" in a canvas pixel font, night glow for veins, entrance and crater). The parent checked tests (170/170), tsc, lint, build and the frames. Not yet merged into `feat/hive-look`.
  - [x] P2.7 Alien terrain (user, 2026-10-09: the map "needs something less Earth-like, more alien"): violet regolith, bioluminescent blue-green moss, alien flora with pale glowing pods, veined outcrops, crystal shards near the crater, teal-lime frond food, violet chitin underground. Visual only; terrain stays low-saturation so units pop. Route: delegated (Claude subagent in the `feat/hive-intro` worktree).
  - [x] P2.5+ StarCraft screen done (0b0ed7b) and merged with P2.3 (954d922). Follow-ups:
    - The intro skip waits for the title (a8c9f03).
    - The diet toggle moved to the food stocks in the top strip (d31164d).
    - The canvas is still the 800×600 render scaled to cover the window, because RenderSystem, PostProcessor and FoliageOverlay hard-code `CANVAS_WIDTH/HEIGHT`.
  - [x] P2.8 Cinematic intro v2 (user, 2026-10-09: "más cinematográfico, que siga hasta donde se estrella y ver una animación donde se ve que se despliega el enemigo"):
    - Letterbox bars.
    - The camera follows the meteor from the colony across the map to the impact (eased pan), with a brief slow-motion at impact, flash, shake and shockwave.
    - Then the enemy deploys from the crater: crystal spires grow, a cyan pulse rings out, and the first Crystal drones unfold and crawl out. This is a visual-only foreshadowing of P5 that reuses the crystal palette and silhouette rules.
    - The camera glides back to the colony and "EL ENJAMBRE DESPIERTA" appears.
    - Skippable after the impact, with the crater kept.
    - The intro needs a camera-control hook in GameManager/Camera; today the intro is screen-space with no camera move.
    - Done as 27fe59d. Route: delegated (Claude subagent, main worktree).
      - `Camera.direct()/release()`: a scripted shot ignores player pan, wheel zoom and reset; the minimap click is ignored while directed.
      - `IntroDirector` (driven from `GameManager.render` with the same dt as `MeteorIntro`) chases a world-space meteor with shadow and ground glow, slow motion before the impact, a one-step zoom punch-in on the crater, then glides home.
      - Deployment: spire clusters (permanent), a cyan pulse, four drones that unfold and crawl toward the colony (visual only, `crystalDeployArt.ts`).
      - Skip from the impact jumps to the end state.
      - RED: 22 timeline, 3 camera and the IntroDirector suite failed before GREEN.
      - Checks: `npm test` 258/258, tsc, lint, build. Frames checked by eye in headless Edge.
    - Decision (writer, creative license): the fireball lights the ground it crosses and the crater (`revealCircle`), so that strip stays explored: a scorched trail on the minimap that points at the crater, where the Hive rises in P5.
    - Open: the camera and art run two `IntroClock`s fed the same dt, because `RenderSystem` (outside this writer's surface) keeps its `MeteorIntro` private. A `RenderSystem.getIntroClock()` would let them share one clock. The HUD stays up during the cinematic, so the letterbox bars sit inside the visible band; hiding the HUD needs `App.tsx`/`index.css`.
  - [x] P2.9 Breeding UI clarity (user, 2026-10-09: "mejorar la interfaz de crianza que se entienda más"). Evidence from a headless screenshot:
    - The breed row (A–G) is five dimmed icons with no label, no visible cost and no reason why they are disabled.
    - The top strip shows 34 leaves while the pantry reads 0/450.
    - Egg status shows only when the nest is selected.
    - The breeding objective uses voseo ("Criá…, encargá…").
    Scope: a visible brood pipeline (pantry → queen lays → incubation → hatch) with per-stage counts and blocked reasons, cost and state on each breed button, egg progress, and the two food numbers labeled so they read differently. Route: delegated (Claude subagent, main worktree).
    - Done as 46ae112 (readout and buttons) and 0e3999f (objective copy).
    - The two numbers: the strip's food totals add the surface stock at the nest entrance (`nest.foodStored`, it spoils) to the underground pantry. Only the pantry pays for eggs (`queueBreed` → `deductFromStorage`).
    - Pipeline rules mapped from the code:
      - The egg is paid when it is ordered. The queue holds at most 5 per caste.
      - The queen lays one egg every 3 s and pauses below 100 hunger.
      - Only nurses carry an egg to a free incubation slot (4 per tile), and it only grows there.
      - A grown larva hatches once a nurse has fed it 10 food from the pantry. With no nurses, nothing ever hatches; eggs do not just grow slower.
    - UI:
      - A CRÍA column on both default views (DESPENSA → REINA → INCUBANDO → NACE) with counts, egg chips (caste icon, bar, time left) and the first blocker with its fix and key.
      - Breed buttons print their price with a new pantry icon, red when the pantry cannot pay. A full queue shows 5/5.
      - A disabled button explains itself when pressed. A queued egg confirms with "Huevo de soldado encargado (-35 comida)".
      - The strip has a DESPENSA x/y chip. RESERVAS splits "En la entrada" from "Despensa".
      - Under 1500 px the column the strip repeats (ENJAMBRE, or the nest DESPENSA) gives way so the stage labels fit.
    - The first objective now reads "pulsa A (Criar obrera) cuando la despensa tenga 20 de comida". Every objective is in neutral Spanish.
    - RED:
      - brood suites failed on the missing module.
      - 20 tests failed in commands, CommandCard, TopStrip, InfoPanel and ObjectiveSystem.
    - GREEN:
      - `npm test` 307/307 for the readout commit and 309/309 with the objective commit.
      - `npx tsc -b --noEmit`, `npm run lint` and `npm run build` pass.
      - Headless Edge frames at 1600×900 and 1280×720 were checked by eye.
    - Follow-up (user: "el botón para poner territorio de defensa no lo veo"):
      - Área de defensa (C) and Trono (V) moved from the Colonia page to the nest root card.
      - A single Velocidad button now cycles ×1→×2→×3 and shows the speed on its face. It replaces the three speed buttons.
      - The surface card keeps the same time row and leaves C and V empty.
      - The Colonia page holds garrison, diet and upgrades and has its own icon.
      - Card badges sit on a dark backdrop so "0/3" no longer runs into the hotkey.
      - RED: 8 card layout and speed tests. GREEN: 314/314 tests, tsc, lint, build.
    - Open:
      - `DefenderAISystem` still tells the player "Marcá 🛡️ Defensa" in voseo. It should name Área de defensa (C).
  - [x] P2.10 Crystal Hive less insect, more alien (user, 2026-10-09). The intro drones in `src/game/render/crystalDeployArt.ts` "unfold and crawl", which reads as an insect. Redraw them as hovering crystal drones that rise out of the crater, unfold their orbiting shards and glide toward the colony, following the new Crystal Hive art rules. Route: delegated after P2.9.
    - Route: delegated (Claude subagent, main worktree). Commit: `feat(look): redraw the intro's Crystal drones as hovering crystal beings`.
    - Look: each drone is a narrow floating octahedron (9×16 art px, 1 art px = 2 world px) with a flush gold girdle, gold tip filigree and a cyan energy core. It has no legs, antennae or mandibles, and it never rotates, so the light stays top-left. Two shards (one gold-banded) orbit it on a tilted ring and pass behind it as a darker far sprite.
    - Motion: it pushes up out of the crater floor tip first and lifts straight up. Then its core wakes (dormant → waking → lit, then a lit ↔ bright throb) and its docked shards swing out into orbit. Last, it glides toward the colony with a stepped bob above a soft shadow, leaving a faint cyan trail.
    - Timing: drones start at 4.05 s, 0.12 s apart (emerge 0.2, rise 0.3, unfold 0.35, glide 1.5), so they glide before the camera leaves. Phases, skip and end state are unchanged. The spires already read as crystals and were left as they are.
    - RED: 10 new tests failed, 4 in the new `crystalDeployArt.test.ts` and 6 in `introTimeline.test.ts`. The old frames failed the one-solid-shape check because their legs left detached pixel runs. GREEN: `npm test` 323/323, tsc, lint, build. Headless Edge frames of the rise, unfold and glide were checked by eye.
    - Open: the Drone tier rule says "one orbiting shard"; the intro drones carry two, which the task allowed.
  - [ ] P2.4 Mutation marks drawn on ant sprites for applied mutations.
  - [ ] P2.5 Bottom console and UI restyle (`--ui-*` → `--chrome-*`, pixel icons, one font, Spanish only).
  - [ ] P2.6 One art-pixel scale for every unit, 16-direction rotation snapping, zoom steps of 0.5.
- [x] Bug — ants pile up at the nest entrance (user report, 2026-10-09). User hypothesis: entrance healing. User design decision: remove healing at the entrance; ants heal by eating. Diagnosed and fixed by a Claude subagent in an isolated worktree, then applied here.
  - Repro: `npx tsx scripts/repro-entrance-jam.ts [days] [seed] [workers] [soldiers] [scouts]` (full-system headless run, stuck-ant histogram by role:state@layer). The existing scripts never showed the jam.
  - The hypothesis was ruled out: Healing or heading-to-heal ants were 0.0% of stuck ant-seconds in 7 runs.
  - Root causes, both present since the initial commit:
    - About 95% of the jam: soldiers and scouts arriving with food were put in Hauling, but PorterSystem only drives workers, so they froze at the shaft or on the nest tile.
    - The rest: late returners re-pathed every tick, and A* starts at the ant's own tile, so they never moved.
  - Fix in `AntAISystem`:
    - Non-workers drop food on the nest stockpile and go back to work.
    - An empty-handed arrival goes below only when the ant is hungry and food exists down there.
    - Late returners keep their route instead of re-pathing.
  - Heal by eating: `HungerSystem.eat()` (hunger first, the rest of the meal becomes HP at `HEAL_HP_PER_FOOD`). The hurt-ant trip home, the soldier retreat, the famine-cycle logic, `forageGrace` and the dead constants were removed.
  - RED: 11 tests failed before the fix.
  - Verification by the parent on `feat/hive-look`: `npm test` 138/138, tsc, lint, build. The repro went from 7345 to 73 stuck ant-seconds (5 days, seed 1). In the agent's runs the large colony went from 18975 to 203.
  - Open:
    - Combat deaths rose in the large colony (5 → 28) because hurt soldiers no longer retreat. This needs a balance review.
    - Nurses and defenders do not heal by eating yet (`NurseAISystem`, `DefenderAISystem`).
- [x] Bug: workers took 20–45 s per tile to answer an Excavar order, and an 8-tile order took 107–156 s (user report, 2026-10-09: "tardan mucho en ponerse a excavar"). Fixed in 43a9bbd. Route: delegated (Claude subagent in an isolated worktree), fast-forwarded into `feat/hive-look`.
  - Repro: `npx tsx scripts/repro-dig-latency.ts` (per-tile wait, travel, dig and total times, plus the assignee's distance).
  - Root causes:
    - PorterSystem (priority 4) puts every worker that goes Idle underground on an exit transit before ExcavationSystem (priority 6) runs. ExcavationSystem skipped ants in transit, so each job waited for a surface recruit to walk about 32 tiles.
    - The connectivity set is stale for up to 0.5 s, so a finished digger saw no work and left.
    - Busy haulers below counted as dig workforce, which blocked recruiting.
  - Fix:
    - `TransitSystem.isExiting/cancelExit` let idle workers on their way out be reclaimed.
    - Each job goes to the closest candidate that has a route.
    - Connectivity is rebuilt right after a tile opens.
    - Only Idle, Searching or digging workers count as workforce. Busy porters are never interrupted.
  - RED: 4 ExcavationSystem tests. Result: the 8-tile order takes 18–36 s. Checks: 231/231 tests, tsc, lint, build; the parent re-ran the excavation test.
  - Open: when only haulers are below, the first tile still waits about 15–19 s for a surface worker to walk down. Handing the job to a closer worker partway through that walk would cut it.
- [ ] P3 — RTS control (user, 2026-10-09: "los controles como StarCraft, poder seleccionar diferentes hormigas y enviarlas a atacar"). Workers stay autonomous; warriors obey `PlayerOrder` and run the AI only when they have no order. Cost: medium. Map by a Claude Explore subagent (read-only, 2026-10-09):
  - Input: `InputManager.ts` handles left click only (135-144); right and middle drag pan (104-119), so a tap/drag threshold must tell an order from a pan; key handlers carry no modifiers (79-86). Digits 1–3 set game speed at `GameManager.ts:392-394` → `handleSlotKey` 738-745; the dawn pick must keep digits 1–3. Other window key listeners: `CommandCard.tsx:29-47`, `MinimapPanel.tsx:54`.
  - Selection holds one id today (`SelectionSystem.ts:25-58`, `SelectedEntityInfo` at `GameManager.ts:118-149`). Selection art is blinking corner brackets (`RenderSystem.ts:311-324`); the art direction wants ellipses.
  - The AI hook goes in `AntAISystem.update` after the layer skip (131) and before the stall nets (154-183) and the loaded-ant funnel (201-207). Proto-order: `commandTargetId` + GoingToDen (864-949), `dispatchAttackWave` (`GameManager.ts:1806-1851`). Ordered units must be skipped by porter recruiting (`PorterSystem.ts:128-132`) and the invasion draft (`UndergroundInvasionSystem.ts:80-118`).
  - Risk: A* (`pathfinding/AStar.ts`) scans its open list linearly and caps at 2000 steps; 30 ordered units means 30 runs in one tick. Use a binary heap and one shared path with formation offsets.
  - [ ] P3a Selection and move: drag box (own ants only), right-click move, a `PlayerOrder` component with an AI early-out, a group info panel. Tests: box selects own ants only; a move order beats the AI and the stall nets until arrival; porters and the draft skip ordered units.
  - [ ] P3b Attack-move and attack target, reusing `selectSoldierTarget` (`AntAISystem.ts:1049-1074`); fold `dispatchAttackWave` into orders. Tests: attack-move engages an enemy in range, then resumes; an attack target persists.
  - [ ] P3c Control groups: Ctrl+digit binds, digit recalls; game speed moves to other keys. Tests: bind and recall, dead ids pruned, digits still pick at the dawn offer.
- [ ] P4 — Factions: ownership component in targeting, damage, vision and economy; faction-filtered fog; remove first-nest assumptions (`src/game/systems/AntAISystem.ts:123-125`). Cost: expensive; foundation for P5.
- [ ] P5 — Crystal Hive: rival base on the far side of the map, scripted build order, night waves sourced from it, Crystal Queen boss on night 7, victory on hive destruction. Its base grows upward as crystal spires with interior floors (see Decisions). Cost: expensive.
- [ ] P9 — Humans (user, 2026-10-09; Terran-like, a third faction added later). Their base is buildings with floors (barracks, bunkers, turrets), raised by a builder anywhere, with no creep. It reuses the P4 interior floors and P5's floor view. Cost: expensive; not planned in detail yet.
- [ ] P10 — Choose a race at the start (user, 2026-10-09: "elegir al inicio una raza… y contra qué raza"). The pre-run picker works like a StarCraft skirmish: the player picks their own race and the rival race (1v1). Mirror matches are allowed. A free-for-all with all three races can come later. The AI rival runs its race's scripted build order and tactics.
  - Implication: every race must be fully playable (controls, economy, production UI, base and floor views), and every race needs an AI.
  - Delivery order (parent):
    1. The Swarm is playable now.
    2. The Crystal Hive arrives as the AI rival (P5).
    3. The Crystal Hive becomes playable.
    4. The Humans arrive as AI (P9), then become playable.
  - The picker shows races that are not playable yet as "Próximamente". Each race gets its own intro; today's meteor intro ("EL ENJAMBRE DESPIERTA") is the Swarm's. Cost: expensive.
- [ ] P6 — Supply cap. The mycelium creep moved to P7.2. Cost: medium.
- [ ] P7 — Surface base building (user, 2026-10-09: "en StarCraft se agregan como sitios en la superficie porque no hay cueva… expansión de territorio… encontrar minerales para construir armas, defensas"). Food pays for ants; minerals pay for structures. Cost: medium-expensive. Same Explore map:
  - Terrain tiles are `{terrain, walkable, pheromones}` (`simulation/world/types.ts:3-19`). The TileGrid seed comes from Math.random (`TileGrid.ts:12`), so new placement must use a seeded rng like `pickCraterSite` (`run/craterSite.ts:50-82`). The visual crystal shards around the crater (`alienDecor.ts:115-145`) mark the natural first mineral field.
  - About 25 call sites read `query(COMPONENT.NEST)[0]`, so an expansion must not carry the NEST component.
  - `PorterSystem.asPantryType` (489-491) turns unknown loads into leaf, `HungerSystem` (90-105) eats any load, and the return timeout drops the load (`AntAISystem.ts:643-650`). Minerals need guards in all three.
  - The build-mode path is `commands.ts` → `Console.tsx:19-27,47` (it forces null on the surface) → the `GameManager.ts:406-449` click router (the surface only selects) → `designate*`.
  - Combat is instant melee with no projectiles (`CombatSystem.ts:40-168`). `handleDeath` treats anything that isn't wildlife as an ant (185-205). Nothing attacks buildings today. Only ants reveal fog (`FogOfWarSystem.ts:30-51`).
  - `TerrainRenderer.invalidate` repaints the whole map, so creep needs its own overlay, like `FoliageOverlay`.
  - [ ] P7.1 Minerals and mining: seeded mineral fields (pure `run/mineralFields.ts`), a MINERAL component (not FOOD_SOURCE), a Mining branch in AntAI, a minerals bank and `mineralsStored` in GameStats and the top strip. Tests: fields are deterministic per seed, reachable and away from the nest; a worker mines and delivers without touching the pantry; ore is never eaten or hauled.
  - [ ] P7.2 Territory (mycelium creep) and surface placement: `CreepGrid` (sources, radius, growth), a `CreepOverlay`, surface build modes in the click router, and a minerals cost in `CommandDef`. Tests: radius and growth; `canPlace` rejects tiles that are off-creep, unwalkable or occupied.
  - [ ] P7.3 Spine turret (Espina) and chitin wall (Muro de quitina): a STRUCTURE component with Health, a `TurretSystem`, a structure branch in `handleDeath`, structures revealing fog, and walls toggling `walkable`. Enemies must be able to target structures. Tests: the turret picks the nearest surface enemy in range; a wall blocks A*; a placement that seals the nest is rejected (reuse the `craterSite` flood fill).
  - [ ] P7.4 Expansion hive (Colmena de expansión): a HIVE drop-off (not NEST) that is a creep source and a fog revealer. Tests: miners deliver to the nearer drop-off; nest-only systems ignore it; killing it removes its creep.
- [ ] P8 — Warrior roster, Zerg-style (user, 2026-10-09: "diferentes tipos de guerreras, prácticamente StarCraft"). Castes cost food and minerals. Cost: medium.
  - Every `Record<AntRole>` table needs an entry for a new caste: `SpriteAtlas.ts:62-101,215`, `factories.ts:97-110`, `RenderSystem.ts:318,1225`, `format.ts:17,26`, `InfoPanel.tsx:64-81`, `BREED_ORDER`, `ROLE_BASE_WEIGHTS` (`constants.ts:240`), `getIncubationTime`. Soldier-only checks live at `AntAISystem.ts:387,699,1455,1491` and `GameManager.ts:1746,1822`; the attack range is hardcoded (`combatHelpers.ts:50-65`, `AntAISystem.ts:706,777`).
  - [ ] R1 Caste data model: a `CASTES` table (range, cooldown, speed, military flag), a shared `isWarrior`, and per-caste range. Tests: every role has a complete entry; spawn stats per caste.
  - [ ] R2 Rasgadora (fast, cheap melee, zergling) and Escupidora (ranged acid, hydralisk), with range-aware engage and disengage and a visual-only projectile list in `World`. Tests: hits at range without closing in; cooldown; no damage across layers.
  - [ ] R3 Coloso (heavy, slow, armored, optional cleave, ultralisk): armor in HealthComponent with a floor of 1 damage, a bigger sprite grid. Flyers are deferred (walkability bypasses in MovementSystem and A*).

## Acceptance criteria
- A new player recognizes both StarCraft (factions, HUD, control) and ants (silhouette, colony behavior) at a glance.
- The run is won by surviving 7 nights or by destroying the Crystal Hive; it is lost when the player's queen dies.
- `npm test`, `npm run lint`, `npm run build` pass after every phase.

## Delivery
- Each phase is its own chain of PRs (strategy `stacked-to-main`, as chosen for the roguelite). Push and PR remain the user's decision.

## Progress
- Feasibility mapped by Codex (read-only, 2026-10-09): rendering, input, unit control, structures and HUD are medium cost; factions and the rival map setup are expensive.

- Design audit (Claude subagent, read-only, 2026-10-09): art direction and mechanics notes recorded above; its P1 items became T2b, T3 details and T4 in `odd/tasks/roguelite-run-loop.md`.
- Engram mirror (`odd/starcraft-hive-wars/tasks`): synced 2026-10-09 after 32d7c89 (P2.8, the hive mound, the objectives toggle and the dig fix). The parent re-ran `npm test`: 264/264.

## Next step: "continuemos con la mejora gráfica"
When the user says this in a new session, run this plan in order. Each item is one work-unit commit on `feat/hive-look`, delegated to one writer with a headless-Edge screenshot check.
1. Done: P2.7 alien terrain (ae9fa6b, merged in 67bf9c3; 227 tests, tsc, lint and build pass; the worktree and the `feat/hive-intro` branch were removed). Small follow-ups that fit item 2 or 3:
   - Done (19c6123): `TERRAIN_COLORS` now take base/fleck shades from the tile ramps and the minimap paints from them. Only sand really changed: it was straw, now ash. The unused `TERRAIN_PALETTES` table is gone. RED: 3 minimap tests.
   - Done (19c6123): the nest is a Swarm hive mound with banded chitin plates over magenta flesh, a glowing orifice, chartreuse veins and flesh tendrils. It is drawn unsmoothed at a whole number of world px per art px.
   - Done (3a36ebc, user request): the objectives panel starts folded into an OBJETIVOS toggle, so it no longer covers the intro. RED: 3 markup tests. Checks: `npm test` 264/264, tsc, lint, build.
   - The terrain build takes ~55 ms and runs twice at startup.
2. Done: P2.8 cinematic intro v2 (27fe59d), the hive mound and minimap colors (19c6123), and the objectives toggle (3a36ebc).
3. Next, gameplay first (user, 2026-10-09). The parent's order:
   1. Finish P2.9 breeding UI and the Velocidad / Área de defensa / Trono command card change, then P2.10 (small and visible).
   2. P3a → P3b → P3c (control comes first, so everything after it plays like StarCraft).
   3. P7.1 → P7.4 (surface base).
   4. P8 R1 → R3 (warriors that cost minerals).
   Each step is one work-unit commit, delegated to one writer in the main worktree (the user watches HMR).
   The graphics items below follow, unless the user reorders.
4. Real window-size rendering: make `CANVAS_WIDTH/HEIGHT` dynamic and rebuild the PostProcessor and FoliageOverlay caches on resize, so the world is not an upscaled 800×600.
4. P2.4 mutation marks on sprites, and P2.6 single pixel scale with 16-direction rotation snapping.
5. Combat and death VFX from the art direction: acid droplets, Swarm goo, crystal shards, wildlife carcass.
Then T4 wave pacing (`odd/tasks/roguelite-run-loop.md`) and the balance follow-ups:
- the soldier retreat is gone, so combat deaths rose;
- nurses and defenders don't heal by eating;
- voseo strings remain in GameManager and DefenderAISystem notifications (ObjectiveSystem was fixed in 0e3999f), and should become neutral Spanish;
- holding a digit key repeats into game speed.
