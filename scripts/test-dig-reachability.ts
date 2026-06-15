// Headless test: a dig job whose neighbor is walkable but DISCONNECTED from the
// colony (isolated pocket) must never trap workers — they dig the reachable job
// and ignore the trap until a tunnel reaches it.
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { MovementSystem } from '../src/game/systems/MovementSystem';
import { ExcavationSystem } from '../src/game/systems/ExcavationSystem';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { createAnt } from '../src/game/entities/factories';
import { COMPONENT, AntRole, AntState, Layer, type AntComponent, type LayerComponent, type PositionComponent } from '../src/game/components/components';
import { UndergroundTerrainType } from '../src/simulation/world/types';

const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const modifiers = createDefaultModifiers();

const cx = Math.floor(ug.width / 2);
const cy = Math.floor(ug.height / 2);

// ISOLATED pocket far from the colony (walkable, but no tunnel reaches it)
const ix = cx + 25;
const iy = cy + 18;
for (let dy = 0; dy < 2; dy++) {
  for (let dx = 0; dx < 2; dx++) {
    const t = ug.getTile(ix + dx, iy + dy)!;
    t.terrain = UndergroundTerrainType.Tunnel;
    t.walkable = true;
  }
}

const transit = new TransitSystem(world, ug);
const excavation = new ExcavationSystem(world, ug, transit);

// TRAP job: adjacent to the isolated pocket (old code assigned + wall-grinding)
const trapOk = excavation.designateTile(ix - 1, iy);
// GOOD job: earth tile just below the queen chamber edge (colony-connected)
const goodX = cx;
const goodY = cy + 3;
const goodOk = excavation.designateTile(goodX, goodY);
console.log(`jobs designated: trap=${trapOk} good=${goodOk}`);

// One worker idle in the queen chamber
const w = createAnt(world, cx + 0.5, cy + 0.5, AntRole.Worker);
world.getComponent<LayerComponent>(w, COMPONENT.LAYER)!.layer = Layer.Underground;
const ant = world.getComponent<AntComponent>(w, COMPONENT.ANT)!;
ant.state = AntState.Idle;

world.addSystem(excavation);
world.addSystem(new MovementSystem(world, surface, modifiers, ug));
world.addSystem(transit);

let wallGrindFrames = 0;
for (let f = 0; f < 60 * 60; f++) {
  world.update(1 / 60);
  // Wall-grinding signature: GoingToDigSite while heading toward the trap
  if (ant.state === AntState.GoingToDigSite) {
    const pos = world.getComponent<PositionComponent>(w, COMPONENT.POSITION)!;
    if (Math.hypot(pos.x - (ix - 0.5), pos.y - (iy + 0.5)) < 12 && pos.x > cx + 8) wallGrindFrames++;
  }
}

const goodDug = ug.getTile(goodX, goodY)!.walkable;
const trapDug = ug.getTile(ix - 1, iy)!.walkable;
const trapStillPending = excavation.getPendingJobCount() === 1;
console.log(`good job excavated: ${goodDug} (expect true)`);
console.log(`trap job untouched: ${!trapDug} and still pending: ${trapStillPending} (waits for a real tunnel)`);
console.log(`frames spent grinding toward the trap: ${wallGrindFrames} (expect 0)`);
console.log(`VERDICT: ${goodDug && !trapDug && wallGrindFrames === 0 ? 'NO MORE WALL-GRINDING ✅' : '❌'}`);
