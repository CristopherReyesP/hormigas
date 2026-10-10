import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameStats } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { TouchCommandBar } from './TouchCommandBar';

const QUICK: NonNullable<GameStats['quickSelect']> = [
  { kind: 'soldier', count: 5, selected: true },
  { kind: 'worker', count: 8, selected: false },
  { kind: 'scout', count: 0, selected: false },
  { kind: 'all', count: 13, selected: false },
];

const noop = () => {};

function render(stats: Partial<GameStats>, hint = { mode: 'pick' as const, text: 'Toca una hormiga', selection: null as string | null }) {
  return renderToStaticMarkup(
    <TouchCommandBar
      stats={{ quickSelect: QUICK, controlGroups: [], ...stats } as GameStats}
      hint={hint}
      infoOpen={false}
      onToggleInfo={noop}
      onQuickSelect={noop}
      onRecallGroup={noop}
      onClearSelection={noop}
    />,
  );
}

describe('quick-select bar', () => {
  it('shows a labeled chip with its count for every caste and Todas', () => {
    const html = render({});
    expect(html).toContain('aria-label="Soldados: 5"');
    expect(html).toContain('aria-label="Obreras: 8"');
    expect(html).toContain('aria-label="Exploradoras: 0"');
    expect(html).toContain('aria-label="Todas: 13"');
    expect(html).toMatch(/quick-chip-count">5<.*quick-chip-label">Soldados</);
    expect(html).toMatch(/quick-chip-label">Todas</);
  });

  it('tags each chip with its kind, so the tutorial can point at «Soldados»', () => {
    const html = render({});
    expect(html).toMatch(/data-quick-chip="soldier"[^>]*aria-label="Soldados: 5"|aria-label="Soldados: 5"[^>]*data-quick-chip="soldier"/);
    expect(html).toContain('data-quick-chip="all"');
  });

  it('lights the chip that is the selection, and greys out an empty caste', () => {
    const html = render({});
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/quick-chip quick-chip--selected[^>]*aria-label="Soldados: 5"/);
    expect(html).toMatch(/disabled=""[^>]*aria-label="Exploradoras: 0"|aria-label="Exploradoras: 0"[^>]*disabled=""/);
  });

  it('adds the bound control groups after the castes', () => {
    const html = render({ controlGroups: [{ slot: 2, count: 4, role: AntRole.Soldier, selected: false }] });
    expect(html).toContain('aria-label="Grupo 2: 4 soldados"');
    expect(html.indexOf('Todas: 13')).toBeLessThan(html.indexOf('Grupo 2'));
  });

  it('carries the coach-mark anchors', () => {
    const html = render({});
    expect(html).toContain('data-coach="quick-bar"');
    expect(html).toContain('data-coach="hint-line"');
  });
});

describe('hint line', () => {
  it('always says what a tap does now', () => {
    expect(render({})).toMatch(/quick-hint-text">Toca una hormiga</);
  });

  it('shows the selection count with a button to drop it', () => {
    const html = render({}, { mode: 'pick', text: 'Toca el suelo para mover', selection: '5 soldados elegidos' });
    expect(html).toContain('5 soldados elegidos');
    expect(html).toContain('aria-label="Quitar selección: 5 soldados elegidos"');
    expect(html).toContain('✕');
  });

  it('has no drop button with nothing selected', () => {
    expect(render({})).not.toContain('Quitar selección');
  });
});
