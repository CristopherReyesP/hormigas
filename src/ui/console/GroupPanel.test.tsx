import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameStats, SelectedGroupInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { InfoPanel } from './InfoPanel';
import type { ColonyDetails } from './useColonyDetails';

function group(units: SelectedGroupInfo['units'], count = units.length): SelectedGroupInfo {
  const byRole: SelectedGroupInfo['byRole'] = {};
  for (const u of units) byRole[u.role] = (byRole[u.role] ?? 0) + 1;
  return { count, byRole, ordered: units.filter((u) => u.ordered).length, units };
}

function render(selectedGroup: SelectedGroupInfo, activeLayer = 'surface'): string {
  const stats = { activeLayer, selectedEntity: null, selectedGroup } as unknown as GameStats;
  return renderToStaticMarkup(
    <InfoPanel stats={stats} details={{} as ColonyDetails} gameManager={null} attackCount={10} onAttackCountChange={() => {}} />,
  );
}

describe('group panel (several ants selected)', () => {
  const units: SelectedGroupInfo['units'] = [
    { id: 1, role: AntRole.Soldier, health: 1, ordered: true },
    { id: 2, role: AntRole.Soldier, health: 0.4, ordered: false },
    { id: 3, role: AntRole.Worker, health: 0.1, ordered: false },
  ];

  it('counts the group per caste with caste icons', () => {
    const html = render(group(units));
    expect(html).toContain('GRUPO · 3');
    expect(html).toMatch(/Soldados<\/span><span class="info-row-value"[^>]*>2</);
    expect(html).toMatch(/Obreras<\/span><span class="info-row-value"[^>]*>1</);
    expect(html).not.toContain('Exploradoras');
    expect(html).toContain('1 en marcha');
  });

  it('draws one wireframe cell per ant, colored by its health', () => {
    const html = render(group(units));
    expect(html.match(/class="group-cell[ "]/g)).toHaveLength(3);
    expect(html).toContain('group-cell--ok');
    expect(html).toContain('group-cell--hurt');
    expect(html).toContain('group-cell--critical');
    expect(html).toContain('group-cell--ordered');
    expect(html).toContain('aria-label="Soldado, vida 40%"');
  });

  it('tells the player orders wait for the surface when the group is below', () => {
    const idle = units.map((u) => ({ ...u, ordered: false }));
    expect(render(group(idle))).toContain('Clic derecho: mover o atacar');
    const below = render(group(idle), 'underground');
    expect(below).toContain('solo funcionan en la superficie');
    expect(below).not.toContain('S: detener');
  });

  it('says how many more there are than cells', () => {
    const html = render(group(units, 30));
    expect(html).toContain('+27');
  });
});
