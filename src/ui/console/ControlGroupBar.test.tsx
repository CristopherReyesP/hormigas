import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ControlGroupInfo, GameStats } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { ControlGroupBar } from './ControlGroupBar';
import { InfoPanel } from './InfoPanel';
import type { ColonyDetails } from './useColonyDetails';

const GROUPS: ControlGroupInfo[] = [
  { slot: 1, count: 12, role: AntRole.Soldier, selected: true },
  { slot: 4, count: 3, role: AntRole.Worker, selected: false },
];

describe('control group chips', () => {
  it('shows one numbered chip per bound group with its count and caste', () => {
    const html = renderToStaticMarkup(<ControlGroupBar groups={GROUPS} onRecall={() => {}} />);
    expect(html.match(/class="ctrl-chip[ "]/g)).toHaveLength(2);
    expect(html).toMatch(/ctrl-chip-key">1<.*ctrl-chip-count">12</);
    expect(html).toMatch(/ctrl-chip-key">4<.*ctrl-chip-count">3</);
    expect(html).toContain('aria-label="Grupo 1: 12 soldados"');
    expect(html).toContain('aria-label="Grupo 4: 3 obreras"');
    expect(html).toContain('ctrl-chip--selected');
    expect(html.match(/ctrl-chip--selected/g)).toHaveLength(1);
  });

  it('says how to use the groups in the chip tooltip', () => {
    const html = renderToStaticMarkup(<ControlGroupBar groups={GROUPS.slice(0, 1)} onRecall={() => {}} />);
    expect(html).toContain('title="Grupo 1 · 12 soldados. Pulsa 1 para seleccionarlo y 1 dos veces para ir hacia él. Ctrl+1 lo reasigna."');
  });

  it('draws nothing while no group is bound', () => {
    expect(renderToStaticMarkup(<ControlGroupBar groups={[]} onRecall={() => {}} />)).toBe('');
  });

  it('sits on the info panel of the console', () => {
    const selectedGroup = { count: 2, byRole: { [AntRole.Soldier]: 2 }, ordered: 0, units: [] };
    const stats = { activeLayer: 'surface', selectedEntity: null, selectedGroup, controlGroups: GROUPS } as unknown as GameStats;
    const html = renderToStaticMarkup(
      <InfoPanel stats={stats} details={{} as ColonyDetails} gameManager={null} attackCount={10} onAttackCountChange={() => {}} />,
    );
    expect(html).toContain('class="ctrl-groups"');
  });
});
