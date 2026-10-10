import { describe, expect, it } from 'vitest';
import type { SelectedEntityInfo, SelectedGroupInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { selectionCountLabel, touchHint, type TouchHintInput } from './touchHint';

const NONE: TouchHintInput = {
  activeLayer: 'surface',
  selectedEntity: null,
  selectedGroup: null,
  commandTarget: null,
  areaSelect: false,
  buildMode: null,
  touch: true,
};

function group(byRole: SelectedGroupInfo['byRole']): SelectedGroupInfo {
  const count = Object.values(byRole).reduce((a, b) => a + (b ?? 0), 0);
  return { count, byRole, ordered: 0, units: [] };
}

function entity(type: SelectedEntityInfo['type'], role?: AntRole): SelectedEntityInfo {
  return { entityId: 1, type, position: { x: 0, y: 0 }, role };
}

describe('the hint line says what a tap does now', () => {
  it('nothing selected: pick an ant or use the bar', () => {
    expect(touchHint(NONE)).toEqual({
      mode: 'pick',
      text: 'Toca una hormiga o usa la barra de abajo para elegir tropas',
      selection: null,
    });
  });

  it('soldiers selected: the ground moves them, an enemy is attacked', () => {
    const hint = touchHint({ ...NONE, selectedGroup: group({ [AntRole.Soldier]: 5 }) });
    expect(hint.mode).toBe('order');
    expect(hint.text).toBe('Toca el suelo para mover · toca un enemigo para atacar');
    expect(hint.selection).toBe('5 soldados elegidos');
  });

  it('one ant selected counts as a selection too', () => {
    const hint = touchHint({ ...NONE, selectedEntity: entity('ant', AntRole.Worker) });
    expect(hint.text).toBe('Toca el suelo para mover · toca un cristal para minar · toca comida para recolectar');
    expect(hint.selection).toBe('1 obrera elegida');
  });

  it('scouts alone do not fight: the hint says so', () => {
    const hint = touchHint({ ...NONE, selectedGroup: group({ [AntRole.Scout]: 3 }) });
    expect(hint.text).toBe('Toca el suelo para mover · las exploradoras no pelean');
    expect(hint.selection).toBe('3 exploradoras elegidas');
  });

  it('Seleccionar área: drag a rectangle', () => {
    expect(touchHint({ ...NONE, areaSelect: true })).toMatchObject({ mode: 'area', text: 'Arrastra un rectángulo para elegir hormigas' });
    // The area mode wins over the selection's orders: the next drag is a box
    expect(touchHint({ ...NONE, areaSelect: true, selectedGroup: group({ [AntRole.Soldier]: 2 }) })).toMatchObject({
      mode: 'area',
      selection: '2 soldados elegidos',
    });
  });

  it('Mover or Atacar armed: the next tap is the target', () => {
    const soldiers = group({ [AntRole.Soldier]: 4 });
    expect(touchHint({ ...NONE, selectedGroup: soldiers, commandTarget: 'move' })).toMatchObject({
      mode: 'target',
      text: 'Toca el destino para mover',
    });
    expect(touchHint({ ...NONE, selectedGroup: soldiers, commandTarget: 'attack' })).toMatchObject({
      mode: 'target',
      text: 'Toca un enemigo para atacarlo, o el suelo para avanzar peleando',
    });
  });

  it('an enemy or a den selected: pick troops first, then tap it', () => {
    for (const type of ['beetle_den', 'beetle', 'crystal_hive', 'human_building'] as const) {
      expect(touchHint({ ...NONE, selectedEntity: entity(type) }).text).toBe('Elige tropas en la barra y luego toca al enemigo para atacarlo');
    }
    expect(touchHint({ ...NONE, selectedEntity: entity('beetle_den') }).selection).toBe('Guarida de acorazados');
  });

  it('the nest selected: a second tap goes down', () => {
    expect(touchHint({ ...NONE, selectedEntity: entity('nest') }).text).toBe('Toca el nido otra vez para bajar al hormiguero');
  });

  it('a build tool below: the tool says what to paint', () => {
    const hint = touchHint({ ...NONE, activeLayer: 'underground', buildMode: 'dig' });
    expect(hint.mode).toBe('build');
    expect(hint.text).toMatch(/^EXCAVAR: toca o arrastra el dedo/);
  });

  it('a defense tool on the surface: first tap previews, second builds', () => {
    const hint = touchHint({ ...NONE, buildMode: 'spine', selectedGroup: group({ [AntRole.Soldier]: 2 }) });
    expect(hint.mode).toBe('build');
    expect(hint.text).toBe('ESPINA: toca una casilla para verla y tócala otra vez para construir');
  });

  it('below with no tool: choose one', () => {
    expect(touchHint({ ...NONE, activeLayer: 'underground' }).text).toBe('Elige una herramienta abajo y toca la tierra · arrastra para mover la vista');
    expect(touchHint({ ...NONE, activeLayer: 'underground', selectedGroup: group({ [AntRole.Nurse]: 2 }) }).text).toBe(
      'Bajo tierra las hormigas trabajan solas · sube para darles órdenes',
    );
  });

  it('speaks of clicks when the compact layout runs with a mouse', () => {
    expect(touchHint({ ...NONE, touch: false }).text).toBe('Haz clic en una hormiga o usa la barra de abajo para elegir tropas');
    expect(touchHint({ ...NONE, touch: false, selectedGroup: group({ [AntRole.Soldier]: 2 }) }).text).toBe(
      'Clic derecho en el suelo para mover · en un enemigo para atacar',
    );
  });
});

describe('selection count label', () => {
  it('names the caste when there is only one, with the right gender and number', () => {
    expect(selectionCountLabel({ [AntRole.Soldier]: 1 })).toBe('1 soldado elegido');
    expect(selectionCountLabel({ [AntRole.Soldier]: 5 })).toBe('5 soldados elegidos');
    expect(selectionCountLabel({ [AntRole.Worker]: 8 })).toBe('8 obreras elegidas');
    expect(selectionCountLabel({ [AntRole.Scout]: 1 })).toBe('1 exploradora elegida');
  });

  it('mixed castes are hormigas', () => {
    expect(selectionCountLabel({ [AntRole.Soldier]: 3, [AntRole.Worker]: 5 })).toBe('8 hormigas elegidas');
  });
});

describe('the hint line in a Humans run', () => {
  const humanGroup = (byType: Record<string, number>) => ({
    group: { count: Object.values(byType).reduce((a, b) => a + b, 0), byType, ordered: 0, units: [] },
  });

  it('counts Human units and orders them like troops', () => {
    const hint = touchHint({ ...NONE, human: humanGroup({ soldier: 3 }) });
    expect(hint).toMatchObject({ mode: 'order', text: 'Toca el suelo para mover · toca un enemigo para atacar', selection: '3 soldados elegidos' });
    expect(touchHint({ ...NONE, human: humanGroup({ tank: 1, marksman: 2 }) }).selection).toBe('3 unidades elegidas');
  });

  it('nothing selected: pick a unit', () => {
    expect(touchHint({ ...NONE, human: { group: null } }).text).toBe('Toca el Cuartel o el Centro de mando para entrenar soldados · usa la barra para elegir tropas');
  });

  it('builders mine', () => {
    expect(touchHint({ ...NONE, human: humanGroup({ builder: 2 }) }).text).toBe('Toca el suelo para mover · toca un mineral para extraerlo');
  });

  it('one own Human unit counts as a selection', () => {
    const sel = { ...entity('human_unit'), human: { kind: 'marksman', own: true } } as unknown as SelectedEntityInfo;
    expect(touchHint({ ...NONE, selectedEntity: sel }).selection).toBe('1 tirador elegido');
  });

  it('a building being placed: its own hint wins', () => {
    expect(touchHint({ ...NONE, human: humanGroup({ builder: 1 }), toolHint: 'CUARTEL: toca dónde va' })).toMatchObject({
      mode: 'build',
      text: 'CUARTEL: toca dónde va',
    });
  });
});

describe('hints for the resource orders', () => {
  it('explains taps on resources with workers selected, and the armed Recolectar and Minar', () => {
    const workers = { ...NONE, selectedEntity: entity('ant', AntRole.Worker) };
    expect(touchHint({ ...workers, commandTarget: 'mine' })).toMatchObject({ mode: 'target', text: 'Toca un cristal: lo minan sin parar hasta otra orden' });
    expect(touchHint({ ...workers, commandTarget: 'gather' }).text).toBe('Toca una hoja, un hongo o carne: la llevan a la despensa hasta agotarla');
    expect(touchHint({ ...NONE, selectedEntity: entity('mineral') }).text).toBe('Elige obreras en la barra y toca el cristal para minarlo');
  });
});
