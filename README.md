# Hormigas

Browser-based ant colony simulation and survival game written in TypeScript, with a custom entity-component-system (ECS) engine rendered on HTML Canvas and a React UI.

**Play it:** https://cristopherreyesp.github.io/hormigas/

## Overview

The player manages an ant colony on two layers:

- **Surface:** ants forage for food along pheromone trails, fight beetles that come from dens, and explore a map covered by fog of war, under a day/night cycle and random events (rain, drought, disease, enemy raids, leaf fall and others).
- **Underground:** the player digs tunnels and designates chambers (incubation, fungus farm, food storage, throne, defense). The queen lays eggs, nurses raise the brood, porters move food, and defenders guard the nest against invasion waves that strike at night.

Ants have roles (worker, soldier, scout, nurse, defender), need food, and can starve. The player queues which roles to breed, sets colony priorities, sizes the nest garrison, launches attack waves or sounds a retreat, and buys queen upgrades. The game ends when the queen dies, from starvation or invaders.

The game runs entirely in the browser: there is no backend and no save system, and the UI text is in Spanish.

## Architecture

```
src/
├── engine/        Game-agnostic engine
│   ├── ecs/       World: entities, Map-based component stores, systems ordered by priority
│   ├── loop/      Fixed-timestep game loop (requestAnimationFrame)
│   ├── renderer/  Canvas 2D renderer: terrain, fog, post-processing, sprite atlas, pixel-art painter
│   ├── camera/    Pan and zoom
│   └── input/     Keyboard and mouse input
├── simulation/    Tile grids (surface, underground, visibility, walkability) and A* pathfinding
├── game/          Components, entity factories, systems, random events, GameManager
├── ui/            React components: HUD, colony and underground panels, build toolbar, minimap, game over screen
└── shared/        Constants and shared types
scripts/           Standalone simulation checks, a 450-ant benchmark and sprite previews
```

**How a frame runs**

1. `GameCanvas` (React) creates a `GameManager` bound to the canvas. `GameManager` builds the ECS `World`, registers the systems and starts the `GameLoop`.
2. The loop accumulates real frame time (scaled by the 1x/2x/3x speed setting) and runs `World.update` in fixed 1/60 s steps, so the simulation does not depend on the display's frame rate. Frame time is capped at 250 ms to avoid a catch-up spiral after a stall.
3. Rendering happens once per animation frame, interpolating positions between simulation steps.
4. Every 10 ticks `GameManager` sends a stats snapshot to React through a callback; UI actions (pause, speed, build modes, breeding, upgrades) call `GameManager` methods.

## Tech Stack

- TypeScript ~6.0
- React ^19.2 (UI only; the game world is drawn on a Canvas 2D context)
- Vite ^8.0
- Vitest ^5.0
- ESLint ^10 with typescript-eslint
- GitHub Actions + GitHub Pages for deployment

## Key Technical Decisions

- **Custom ECS instead of a game framework.** Entities are numeric IDs, components live in one `Map` per component type, and `World.query` iterates the smallest store to find entities with all requested components. Game behavior is split into systems (ant AI per role, movement, pheromones, combat, hunger, excavation, fog of war and others) that run in priority order.
- **Fixed timestep with interpolation.** Simulation logic always receives the same `dt`, which keeps behavior consistent across machines and speed settings.
- **Layered source folders.** `engine/` holds the ECS, loop, rendering, camera and input; `simulation/` holds the grids and pathfinding; `game/` holds the rules. React components render panels and send commands to `GameManager`; the simulation itself runs in the game loop, outside React state.
- **Procedural pixel art.** Sprites and tiles are drawn in code on offscreen canvases by `PixelPainter` and `SpriteAtlas`, following one palette and fixed shading rules; the game loads no sprite image files.
- **Throttled work in hot paths.** For example, the pheromone grid is updated every 3 ticks instead of every tick.

## Running Locally

Requirements: Node.js and npm (the deploy workflow uses Node 22).

```bash
npm install
npm run dev       # Vite dev server
npm run build     # type-check (tsc -b) and production build to dist/
npm run preview   # serve the production build
npm run lint      # ESLint
```

No environment variables are used. Vite's `base` is set to `/hormigas/` so assets resolve under the GitHub Pages project path.

## Testing

```bash
npm test          # vitest run
```

The Vitest suite currently has one file, `src/game/systems/MovementSystem.test.ts`, with 4 regression tests for how `MovementSystem` tracks tile occupancy underground.

The `scripts/` folder also contains standalone TypeScript scripts that exercise single systems outside the browser (for example feeding, digging reachability, deadlocks, and a 450-ant performance benchmark). They are not wired into `npm` scripts or CI.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main` (or manually): it installs dependencies with `npm ci`, runs `npm run build`, and publishes `dist/` to GitHub Pages.

## Project Status

Personal project, started in June 2026 and updated through September 2026.
