// Headless check for surface lighting.
//
// The night light pools are placed in SCREEN space from world coordinates, so a
// sign or scale error in Camera.worldToScreen would put every pool in the wrong
// place — and it would look "sort of fine" while being wrong. Pin it as a true
// inverse of screenToWorld instead of eyeballing it.
import { Camera } from '../src/engine/camera/Camera';
import { PostProcessor } from '../src/engine/renderer/PostProcessor';
import { UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT } from '../src/shared/constants';

const results: Array<[string, boolean, string]> = [];
const check = (n: string, ok: boolean, d: string) => results.push([n, ok, d]);

// 1) worldToScreen must invert screenToWorld at every zoom step
{
  const cam = new Camera(UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT);
  let worst = 0;
  for (const zoom of [0.5, 0.75, 1, 1.5, 2, 3, 4]) {
    cam.zoom = zoom;
    cam.x = 137.5; cam.y = 91.25;
    for (const [wx, wy] of [[0, 0], [512, 384], [1999.5, 1234.25], [-40, 60]]) {
      const s = cam.worldToScreen(wx, wy);
      const back = cam.screenToWorld(s.x, s.y);
      worst = Math.max(worst, Math.abs(back.x - wx), Math.abs(back.y - wy));
    }
  }
  check('worldToScreen invierte screenToWorld', worst < 1e-9, `error maximo ${worst.toExponential(1)}`);
}

// 2) The day must actually pass through distinct steps, not sit on one wash
{
  const pp = new PostProcessor();
  const seen: string[] = [];
  for (let i = 0; i <= 100; i++) {
    pp.setDayPhase('day', i / 100);
    const st = pp.getSkyState();
    const key = `${st.color}@${st.alpha}`;
    if (seen[seen.length - 1] !== key) seen.push(key);
  }
  check('el dia recorre 5 estados', seen.length === 5, `${seen.length} estados distintos`);
  check('ninguno se repite', new Set(seen).size === seen.length, `unicos ${new Set(seen).size}`);

  // Noon must be the LIGHTEST wash — if midday were the heaviest tint the ramp
  // would be inverted and the whole cycle would read backwards.
  const alphas: number[] = [];
  for (const p of [0.05, 0.2, 0.5, 0.75, 0.95]) {
    pp.setDayPhase('day', p);
    alphas.push(pp.getSkyState().alpha);
  }
  const noon = alphas[2];
  check('el mediodia es el mas claro', noon === Math.min(...alphas), `alphas dia: [${alphas.join(', ')}]`);
  check('el atardecer es el mas cargado', alphas[4] === Math.max(...alphas), `atardecer ${alphas[4]}`);
}

// 3) Night: edge steps at both ends, deep night in the middle, all darker than day
{
  const pp = new PostProcessor();
  pp.setDayPhase('night', 0.05); const edgeA = pp.getSkyState();
  pp.setDayPhase('night', 0.5);  const deep  = pp.getSkyState();
  pp.setDayPhase('night', 0.95); const edgeB = pp.getSkyState();
  pp.setDayPhase('day', 0.5);    const noon  = pp.getSkyState();

  check('bordes de noche iguales', edgeA.color === edgeB.color && edgeA.alpha === edgeB.alpha, `${edgeA.color}@${edgeA.alpha}`);
  check('noche cerrada mas oscura', deep.alpha > edgeA.alpha, `${edgeA.alpha} -> ${deep.alpha}`);
  check('la noche marca night=true', deep.night && !noon.night, `noche=${deep.night} dia=${noon.night}`);
  check('la noche pesa mas que el dia', deep.alpha > noon.alpha * 5, `noche ${deep.alpha} vs mediodia ${noon.alpha}`);
}

let failed = 0;
for (const [n, ok, d] of results) {
  console.log(`${ok ? 'OK  ' : 'FALLA'} ${n.padEnd(34)} ${d}`);
  if (!ok) failed++;
}
console.log(failed === 0 ? '\nTodo OK.' : `\n${failed} fallas.`);
process.exit(failed === 0 ? 0 : 1);
