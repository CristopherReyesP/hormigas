// Headless test: day/night transitions, notifications, and modifier composition
// with EventSystem (which resets modifiers each tick before DayNight multiplies).
import { World } from '../src/engine/ecs/World';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { EventSystem } from '../src/game/events/EventSystem';
import { DayNightSystem } from '../src/game/systems/DayNightSystem';
import { DAY_DURATION, NIGHT_DURATION, NIGHT_ENEMY_SPAWN_MULTIPLIER, NIGHT_FOOD_SPAWN_MULTIPLIER } from '../src/shared/constants';

const world = new World();
const grid = new TileGrid();
const modifiers = createDefaultModifiers();

const events = new EventSystem(world, grid, modifiers);
const dayNight = new DayNightSystem(world, modifiers);
world.addSystem(events);
world.addSystem(dayNight);

const dt = 1 / 60;
const totalSeconds = DAY_DURATION + NIGHT_DURATION + 30; // full day + night + into day 2
let checkedNight = false;
let checkedDay = false;

for (let f = 0; f < totalSeconds * 60; f++) {
  world.update(dt);
  const t = f / 60;

  // Mid-night: modifiers must reflect night pressure (composed AFTER event reset)
  if (!checkedNight && dayNight.getPhase() === 'night' && t > DAY_DURATION + 20) {
    checkedNight = true;
    console.log(
      `t=${t.toFixed(0)}s NIGHT — enemySpawn=${modifiers.enemySpawnMultiplier.toFixed(2)} (expect ≥${NIGHT_ENEMY_SPAWN_MULTIPLIER})` +
      ` foodSpawn=${modifiers.foodSpawnMultiplier.toFixed(2)} (expect ≤${NIGHT_FOOD_SPAWN_MULTIPLIER})`
    );
  }
  // Back to day: modifiers must be clean again (unless a random event is active)
  if (!checkedDay && checkedNight && dayNight.getPhase() === 'day') {
    checkedDay = true;
    console.log(
      `t=${t.toFixed(0)}s DAY ${dayNight.getDayNumber()} — enemySpawn=${modifiers.enemySpawnMultiplier.toFixed(2)} foodSpawn=${modifiers.foodSpawnMultiplier.toFixed(2)}`
    );
  }
}

console.log('---');
console.log('phase at end:', dayNight.getPhase(), '| day:', dayNight.getDayNumber(), '| remaining:', dayNight.getPhaseRemaining().toFixed(0) + 's');
console.log('notifications:');
for (const n of world.notifications) console.log(' -', n.message);
