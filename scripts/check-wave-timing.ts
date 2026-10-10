// Headless check: invasion waves must ALWAYS launch on the day->night flip,
// never mid-night and never during daylight; each night sends its curve size;
// and the HUD countdown (nextWaveIn) must point at the real first spawn.
import { World } from '../src/engine/ecs/World';
import { UndergroundGrid } from '../src/simulation/world/UndergroundGrid';
import { TransitSystem } from '../src/game/systems/TransitSystem';
import { DayNightSystem } from '../src/game/systems/DayNightSystem';
import { UndergroundInvasionSystem, waveForNight } from '../src/game/systems/UndergroundInvasionSystem';
import { createDefaultModifiers } from '../src/game/events/GlobalModifiers';
import { DAY_DURATION, NIGHT_DURATION, RUN_NIGHTS_TO_WIN } from '../src/shared/constants';

const world = new World();
const ug = new UndergroundGrid();
const modifiers = createDefaultModifiers();
const dayNight = new DayNightSystem(world, modifiers);
const transit = new TransitSystem(world, ug);
const invasion = new UndergroundInvasionSystem(world, ug, transit, dayNight);

const dt = 1 / 60;
let t = 0;
let lastWave = 0;
const launches: Array<{
  t: number; wave: number; night: number; phase: string; sinceFlip: number; size: number; predictedAt: number;
}> = [];
let lastFlipAt = 0;
let prevPhase = dayNight.getPhase();
// Where the countdown said the next attack would land, sampled each tick before it strikes
let predictedAt = invasion.getInfo().nextWaveIn;

// One full run: RUN_NIGHTS_TO_WIN day/night cycles
const cycles = RUN_NIGHTS_TO_WIN * (DAY_DURATION + NIGHT_DURATION);
for (let i = 0; i < cycles / dt; i++) {
  const before = invasion.getInfo();
  if (!before.active) predictedAt = t + before.nextWaveIn;

  dayNight.update(dt);
  const phase = dayNight.getPhase();
  if (phase !== prevPhase) { lastFlipAt = t; prevPhase = phase; }

  invasion.update(dt);
  const info = invasion.getInfo();
  // Invaders never die here (no combat systems): count each one as it breaks in,
  // then clear it so the wave registers as repelled and the cycle continues.
  const spawned = world.query('beetle').length;
  if (info.waveNumber > lastWave) {
    lastWave = info.waveNumber;
    launches.push({
      t, wave: info.waveNumber, night: dayNight.getDayNumber(), phase, sinceFlip: t - lastFlipAt, size: 0, predictedAt,
    });
  }
  if (launches.length > 0) launches[launches.length - 1].size += spawned;
  for (const id of world.query('beetle')) world.destroyEntity(id);
  t += dt;
}

console.log(`ciclo dia/noche = ${DAY_DURATION}+${NIGHT_DURATION} = ${DAY_DURATION + NIGHT_DURATION}s`);
console.log('oleada | noche | t(s)  | fase al lanzar | seg desde el cambio | invasores (curva) | cuenta regresiva (s)');
for (const l of launches) {
  const expected = waveForNight(l.night).invaders;
  console.log(
    `  ${String(l.wave).padStart(2)}   |  ${String(l.night).padStart(2)}   | ${l.t.toFixed(0).padStart(5)} | ${l.phase.padEnd(14)} | ${l.sinceFlip.toFixed(2).padStart(19)} | ${String(l.size).padStart(9)} (${expected})     | ${l.predictedAt.toFixed(2)}`
  );
}

const offFlip = launches.filter((l) => l.phase !== 'night' || l.sinceFlip > 0.5);
const offCurve = launches.filter((l) => l.size !== waveForNight(l.night).invaders);
const offClock = launches.filter((l) => Math.abs(l.predictedAt - l.t) > dt * 1.5);
const missing = RUN_NIGHTS_TO_WIN - launches.length;
const ok = offFlip.length === 0 && offCurve.length === 0 && offClock.length === 0 && missing === 0;
console.log(
  ok
    ? `\nOK: ${launches.length} oleadas, una por noche, en el anochecer exacto, con el tamaño de la curva y la cuenta regresiva exacta.`
    : `\nFALLA: ${offFlip.length} fuera del anochecer, ${offCurve.length} fuera de la curva, ${offClock.length} con la cuenta regresiva mal, ${Math.max(0, missing)} noches sin oleada.`
);
process.exit(ok ? 0 : 1);
