// Headless check: invasion waves must ALWAYS launch on the day->night flip,
// never mid-night and never during daylight.
import { World } from '../src/engine/ecs/World';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { DayNightSystem } from '../src/game/systems/DayNightSystem';
import { UndergroundInvasionSystem } from '../src/game/systems/UndergroundInvasionSystem';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { DAY_DURATION, NIGHT_DURATION } from '../src/shared/constants';

const world = new World();
const ug = new UndergroundGrid();
const surface = new TileGrid();
const modifiers = createDefaultModifiers();
const dayNight = new DayNightSystem(world, modifiers);
const transit = new TransitSystem(world, surface, ug);
const invasion = new UndergroundInvasionSystem(world, ug, transit, dayNight);

const dt = 1 / 60;
let t = 0;
let lastWave = 0;
const launches: Array<{ t: number; wave: number; phase: string; sinceFlip: number }> = [];
let lastFlipAt = 0;
let prevPhase = dayNight.getPhase();

// 25 simulated minutes
for (let i = 0; i < 60 * 60 * 25; i++) {
  dayNight.update(dt);
  const phase = dayNight.getPhase();
  if (phase !== prevPhase) { lastFlipAt = t; prevPhase = phase; }

  invasion.update(dt);
  const info = invasion.getInfo();
  if (info.waveNumber > lastWave) {
    lastWave = info.waveNumber;
    launches.push({ t, wave: info.waveNumber, phase, sinceFlip: t - lastFlipAt });
  }
  // Invaders never die here (no combat systems) — clear them so the wave
  // registers as repelled and the cycle continues.
  for (const id of world.query('beetle')) world.destroyEntity(id);
  t += dt;
}

console.log(`ciclo dia/noche = ${DAY_DURATION}+${NIGHT_DURATION} = ${DAY_DURATION + NIGHT_DURATION}s`);
console.log('oleada | t(s)  | fase al lanzar | seg desde el cambio de fase');
for (const l of launches) {
  console.log(
    `  ${String(l.wave).padStart(2)}   | ${l.t.toFixed(0).padStart(5)} | ${l.phase.padEnd(14)} | ${l.sinceFlip.toFixed(2)}`
  );
}

const bad = launches.filter((l) => l.phase !== 'night' || l.sinceFlip > 0.5);
console.log(
  bad.length === 0
    ? `\nOK: las ${launches.length} oleadas se lanzaron en el anochecer exacto.`
    : `\nFALLA: ${bad.length} oleadas fuera del anochecer.`
);
process.exit(bad.length === 0 ? 0 : 1);
