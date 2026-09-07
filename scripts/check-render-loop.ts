// Headless check that the render loop actually drives animation.
//
// RenderSystem declared `implements System` with priority 100 but was NEVER
// added to the world, so its update() was dead: animationTime stayed at 0 for
// the entire life of the process (freezing every combat lunge, attack flash and
// blink), the ambient particles never spawned or moved, and the water shimmer
// never ran. The live path, renderInterpolated(), hardcoded 1/60 for effects.
//
// Now there is ONE render path fed a real, speed-scaled, pause-aware delta.
import { AmbientParticleSystem } from '../src/game/particles/AmbientParticleSystem';
import { TileGrid } from '../src/simulation/world/TileGrid';
import { World } from '../src/engine/ecs/World';

const results: Array<[string, boolean, string]> = [];
const check = (n: string, ok: boolean, d: string) => results.push([n, ok, d]);

// ── 1) Ambient particles must actually come alive when ticked ──
{
  const sys = new AmbientParticleSystem(new TileGrid(), new World());
  check('arranca vacio', sys.getParticleCount() === 0, `${sys.getParticleCount()}`);

  for (let f = 0; f < 60 * 5; f++) sys.update(1 / 60);
  const day = sys.getParticleCount();
  check('con dt real se puebla', day > 0, `${day} particulas tras 5s`);

  // dt = 0 is what a paused frame delivers: nothing may spawn or age.
  const before = sys.getParticleCount();
  for (let f = 0; f < 600; f++) sys.update(0);
  check('en pausa (dt=0) no cambia', sys.getParticleCount() === before, `${before} -> ${sys.getParticleCount()}`);
}

// ── 2) Night must swap the ambience over, not stack on top of it ──
{
  const night = new AmbientParticleSystem(new TileGrid(), new World());
  night.setNight(true);
  for (let f = 0; f < 60 * 5; f++) night.update(1 / 60);
  check('de noche tambien vive', night.getParticleCount() > 0, `${night.getParticleCount()} particulas`);
}

// ── 3) GameLoop must hand the renderer a pause- and speed-aware delta ──
{
  let now = 0;
  const realPerf = globalThis.performance;
  globalThis.performance = { now: () => now } as never;
  let pending: ((t: number) => void) | null = null;
  globalThis.requestAnimationFrame = ((cb: (t: number) => void) => { pending = cb; return 1; }) as never;
  globalThis.cancelAnimationFrame = (() => { pending = null; }) as never;

  const seen: number[] = [];
  const { GameLoop } = await import('../src/engine/loop/GameLoop');
  const loop = new GameLoop(() => {}, (_i: number, dt: number) => seen.push(dt));
  loop.start();

  const step = (ms: number) => { now += ms; const cb = pending; pending = null; cb?.(now); };

  step(16);                       // running, 1x
  const at1x = seen[seen.length - 1];
  loop.setSpeed(3); step(16);     // running, 3x
  const at3x = seen[seen.length - 1];
  loop.setPaused(true); step(16); // paused
  const paused = seen[seen.length - 1];
  loop.stop();

  globalThis.performance = realPerf;

  check('dt de render es tiempo real', Math.abs(at1x - 0.016) < 1e-6, `${at1x.toFixed(4)}s por frame de 16ms`);
  check('la velocidad x3 lo escala', Math.abs(at3x - at1x * 3) < 1e-6, `${at1x.toFixed(4)} -> ${at3x.toFixed(4)}`);
  check('en pausa el dt es 0', paused === 0, `${paused}`);
}

let failed = 0;
for (const [n, ok, d] of results) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${n.padEnd(32)} ${d}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? '\nTodo OK.' : `\n${failed} fallas.`);
process.exit(failed === 0 ? 0 : 1);
