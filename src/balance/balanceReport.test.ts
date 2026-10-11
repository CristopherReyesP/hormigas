// The full balance report: every race against every rival, both bots, several
// seeds, many nights. Minutes of simulation, so it only runs on demand:
//
//   BALANCE_REPORT=1 npx vitest run src/balance/balanceReport.test.ts --silent=false
//
// Every run prints one `BALANCE_JSON {...}` line with its full record.
//
// Optional filters: BALANCE_PLAYER, BALANCE_RIVAL, BALANCE_BOT, BALANCE_SEEDS
// (comma lists) and BALANCE_NIGHTS (the cap, default 30).

import { it, vi } from 'vitest';
import { medianDeathNight, runBalanceSim, type BotKind, type SimResult } from './balanceSim';
import type { RaceId, RivalId } from '../game/run/RunSetup';

vi.mock('../engine/input/InputManager', async () => (await import('../test/gameManagerMocks')).mockInputManager());
vi.mock('../game/systems/RenderSystem', async () => (await import('../test/gameManagerMocks')).mockRenderSystem());
vi.stubGlobal('window', new EventTarget());
vi.stubGlobal('localStorage', undefined);

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const list = (key: string, all: string[]) => (env[key] ? env[key]!.split(',') : all);

it.skipIf(!env.BALANCE_REPORT)('balance report', { timeout: 6 * 60 * 60 * 1000 }, () => {
  const players = list('BALANCE_PLAYER', ['swarm', 'human', 'crystal']) as RaceId[];
  const rivals = list('BALANCE_RIVAL', ['wildlife', 'crystal', 'human']) as RivalId[];
  const bots = list('BALANCE_BOT', ['idle', 'reasonable']) as BotKind[];
  const seeds = list('BALANCE_SEEDS', ['1', '2', '3']).map(Number);
  const maxNights = Number(env.BALANCE_NIGHTS ?? 30);
  for (const player of players) {
    for (const rival of rivals) {
      for (const bot of bots) {
        const group: SimResult[] = [];
        for (const seed of seeds) {
          const onNight = (n: { night: number; colony: number; waveSize: number; coreHealthAtDawn: number | null }) =>
            console.log(`  ${player} vs ${rival} ${bot} s${seed} night ${n.night}: colony ${n.colony}, wave ${n.waveSize}, core ${n.coreHealthAtDawn}`);
          const result = runBalanceSim({ player, rival, bot, seed, maxNights: bot === 'idle' ? Math.min(maxNights, 12) : maxNights, onNight });
          group.push(result);
          console.log(`BALANCE_JSON ${JSON.stringify(result)}`);
          console.log(`${player} vs ${rival} ${bot} seed ${seed}: death night ${result.deathNight ?? 'alive'} · ${result.causeLine ?? '-'} · ${Math.round(result.wallMs / 1000)}s`);
        }
        console.log(`== ${player} vs ${rival} ${bot}: median death night ${medianDeathNight(group)}`);
      }
    }
  }
});
