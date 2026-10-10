import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameManager, GameStats } from '../../game/GameManager';
import { ColonyPriority } from '../../game/components/components';
import { digStatus } from '../../game/dig/digStatus';
import { DigMeter } from './DigMeter';
import { buildCommands, digHint, type CommandContext } from './commands';
import type { ColonyDetails } from './useColonyDetails';
import { NotificationStack } from '../NotificationStack';

const status = (pending: number, diggers = 4) => digStatus({ pending, cap: 20, diggers, secondsPerTile: 3 });

describe('dig meter', () => {
  it('prints the counter, a bar and the estimate', () => {
    const html = renderToStaticMarkup(<DigMeter status={status(12)} />);
    expect(html).toContain('Excavación: 12/20');
    expect(html).toContain('≈ 9 s · 4 cavando');
    expect(html).toContain('dig-meter--ok');
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="12"[^>]*aria-valuemax="20"/);
    expect(html).toContain('width:60%');
  });

  it('turns amber near the limit and red at it', () => {
    expect(renderToStaticMarkup(<DigMeter status={status(16)} />)).toContain('dig-meter--near');
    const full = renderToStaticMarkup(<DigMeter status={status(20)} />);
    expect(full).toContain('dig-meter--full');
    expect(full).toContain('Límite alcanzado');
  });

  it('sits inside the hint line of the message feed', () => {
    const html = renderToStaticMarkup(
      <NotificationStack notifications={[]} hint="EXCAVAR: haz clic" hintExtra={<DigMeter status={status(3)} />} />,
    );
    expect(html).toMatch(/notif-line--hint[^>]*>EXCAVAR: haz clic<div class="dig-meter/);
  });
});

describe('limit message in the feed', () => {
  it('the toast is not repeated while the hint already says it', () => {
    const message = 'Límite de excavación alcanzado (20). Espera a que terminen o cancela marcas.';
    const toast = { id: 1, severity: 'warning' as const, message: `⛏️ ${message}`, createdAt: 0 };
    const withHint = renderToStaticMarkup(<NotificationStack notifications={[toast]} hint={message} hintTone="danger" />);
    expect(withHint.split(message)).toHaveLength(2);
    const alone = renderToStaticMarkup(<NotificationStack notifications={[toast]} hint={null} />);
    expect(alone).toContain(message);
  });
});

describe('dig hint tone', () => {
  it('stays a hint under the limit and becomes a refusal at it', () => {
    expect(digHint(status(5))).toBeNull();
    expect(digHint(status(20))).toEqual({
      text: 'Límite de excavación alcanzado (20). Espera a que terminen o cancela marcas.',
      tone: 'danger',
    });
  });
});

describe('Excavar button badge', () => {
  function nestCard(dig: GameStats['dig'], buildMode: CommandContext['buildMode'] = null) {
    const stats = {
      paused: false,
      speed: 1,
      colonyPriority: ColonyPriority.Gather,
      activeLayer: 'underground',
      availableSoldiers: 0,
      selectedEntity: null,
      dig,
    } as unknown as GameStats;
    const details = {
      farm: { tiles: 0 },
      storageTiles: 0,
      brood: { maxQueuedPerRole: 5, queue: [], costs: {}, pantry: { stored: 0 }, surfaceStock: 0, hasQueen: true, queenCanLay: true, eggs: [], incubation: { tiles: 0, freeSlots: 0 }, nurses: 0 },
    } as unknown as ColonyDetails;
    const ctx: CommandContext = {
      gm: {} as GameManager,
      stats,
      details,
      page: 'root',
      buildMode,
      attackCount: 10,
      setPage: vi.fn(),
      toggleBuildMode: vi.fn(),
      switchLayer: vi.fn(),
      refresh: vi.fn(),
      notify: vi.fn(),
    };
    return buildCommands(ctx).find((c) => c?.id === 'dig')!;
  }

  it('shows pending over cap while there are marks', () => {
    expect(nestCard(status(12))).toMatchObject({ badge: '12/20', badgeTone: undefined });
  });

  it('warns near the limit and goes red at it', () => {
    expect(nestCard(status(16))).toMatchObject({ badge: '16/20', badgeTone: 'warn' });
    expect(nestCard(status(20))).toMatchObject({ badge: '20/20', badgeTone: 'danger' });
  });

  it('shows 0/20 while the tool is on, and nothing while idle with no marks', () => {
    expect(nestCard(status(0), 'dig').badge).toBe('0/20');
    expect(nestCard(status(0)).badge).toBeUndefined();
  });
});
