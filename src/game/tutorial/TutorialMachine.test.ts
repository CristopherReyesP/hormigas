import { describe, expect, it } from 'vitest';
import { TutorialMachine, type TutorialEvent } from './TutorialMachine';
import { emptySnapshot, type TutorialSnapshot } from './goals';
import { TUTORIAL_PLAN, type StepPlan } from './plan';

const snap = (over: Partial<TutorialSnapshot> = {}): TutorialSnapshot => ({ ...emptySnapshot(), ...over });

const PLAN: readonly StepPlan[] = [
  { id: 'camera', goals: ['pan', 'zoom'] },
  { id: 'select', goals: ['select-one'] },
  { id: 'wrap', goals: ['ack'] },
];

const types = (events: TutorialEvent[]) => events.map((e) => e.type);

describe('tutorial step machine', () => {
  it('starts on the first goal of the first step', () => {
    const m = new TutorialMachine(PLAN);
    expect(m.state).toMatchObject({ stepIndex: 0, goalIndex: 0, phase: 'active', stars: 0 });
  });

  it('does not advance on the snapshot that sets a goal baseline', () => {
    const m = new TutorialMachine(PLAN);
    expect(m.update(snap({ view: { x: 40, y: 40, w: 20, h: 12 } }))).toEqual([]);
    expect(m.state.goalIndex).toBe(0);
  });

  it('advances only when the player really pans, then zooms', () => {
    const m = new TutorialMachine(PLAN);
    m.update(snap({ view: { x: 40, y: 40, w: 20, h: 12 } }));
    // Nothing happened: still on pan
    expect(m.update(snap({ view: { x: 40.5, y: 40, w: 20, h: 12 } }))).toEqual([]);
    // A selection is not a pan
    expect(m.update(snap({ view: { x: 40, y: 40, w: 20, h: 12 }, selectedAnts: 3 }))).toEqual([]);
    expect(types(m.update(snap({ view: { x: 45, y: 40, w: 20, h: 12 } })))).toEqual(['goal-done']);
    expect(m.state.goalIndex).toBe(1);
    // Zoom baseline is the view after the pan
    expect(m.update(snap({ view: { x: 45, y: 40, w: 20, h: 12 } }))).toEqual([]);
    const events = m.update(snap({ view: { x: 46, y: 41, w: 14, h: 8 } }));
    expect(types(events)).toEqual(['goal-done', 'step-done']);
    expect(m.state.phase).toBe('celebrate');
    expect(m.state.stars).toBe(1);
  });

  it('waits in the celebration until next(), then starts the next step', () => {
    const m = new TutorialMachine(PLAN);
    m.update(snap());
    m.update(snap({ view: { x: 10, y: 0, w: 20, h: 12 } }));
    m.update(snap({ view: { x: 10, y: 0, w: 20, h: 12 } }));
    m.update(snap({ view: { x: 10, y: 0, w: 30, h: 18 } }));
    // Further updates while celebrating change nothing
    expect(m.update(snap({ selectedAnts: 1 }))).toEqual([]);
    expect(m.next()).toEqual([{ type: 'step-start', step: 'select', index: 1 }]);
    expect(m.state).toMatchObject({ stepIndex: 1, goalIndex: 0, phase: 'active' });
  });

  it('advances a selection goal on the selection event', () => {
    const m = new TutorialMachine(PLAN.slice(1));
    expect(m.update(snap())).toEqual([]);
    expect(types(m.update(snap({ selectedAnts: 1 })))).toEqual(['goal-done', 'step-done']);
  });

  it('finishes after the last step and never moves again', () => {
    const m = new TutorialMachine(PLAN.slice(2));
    m.update(snap());
    expect(m.update(snap())).toEqual([]);
    m.ack();
    expect(types(m.update(snap()))).toEqual(['goal-done', 'step-done']);
    expect(m.next()).toEqual([{ type: 'finished' }]);
    expect(m.state.phase).toBe('done');
    expect(m.next()).toEqual([]);
    expect(m.update(snap())).toEqual([]);
  });

  it('skips a step without a star', () => {
    const m = new TutorialMachine(PLAN);
    m.update(snap());
    expect(m.skipStep()).toEqual([{ type: 'step-start', step: 'select', index: 1 }]);
    expect(m.state).toMatchObject({ stepIndex: 1, goalIndex: 0, stars: 0, phase: 'active' });
    expect(m.state.skipped).toEqual(['camera']);
  });

  it('skipping the last step finishes the tutorial', () => {
    const m = new TutorialMachine(PLAN.slice(2));
    expect(m.skipStep()).toEqual([{ type: 'finished' }]);
    expect(m.state.phase).toBe('done');
  });

  it('skipping during a celebration keeps the earned star', () => {
    const m = new TutorialMachine(PLAN.slice(1));
    m.update(snap());
    m.update(snap({ selectedAnts: 2 }));
    expect(m.state.phase).toBe('celebrate');
    m.skipStep();
    expect(m.state.stars).toBe(1);
    expect(m.state.skipped).toEqual([]);
  });

  it('exit stops the tutorial for good', () => {
    const m = new TutorialMachine(PLAN);
    m.update(snap());
    expect(m.exit()).toEqual([{ type: 'exited' }]);
    expect(m.state.phase).toBe('exited');
    expect(m.update(snap({ view: { x: 99, y: 99, w: 5, h: 5 } }))).toEqual([]);
    expect(m.skipStep()).toEqual([]);
    expect(m.next()).toEqual([]);
    expect(m.exit()).toEqual([]);
  });

  it('several goals done at once all advance in one update', () => {
    const m = new TutorialMachine([{ id: 'attack', goals: ['select-soldiers', 'arm-attack', 'attack-den'] }]);
    m.update(snap({ denAlive: true }));
    const events = m.update(snap({ selectedSoldiers: 3, selectedAnts: 3, attackOrdersOnDen: 3, denAlive: true }));
    expect(types(events)).toEqual(['goal-done', 'goal-done', 'goal-done', 'step-done']);
  });

  it('the real plan has ten steps that each wait for something', () => {
    expect(TUTORIAL_PLAN).toHaveLength(10);
    for (const step of TUTORIAL_PLAN) expect(step.goals.length).toBeGreaterThan(0);
    expect(TUTORIAL_PLAN.map((s) => s.id)).toEqual([
      'camera', 'select', 'move', 'gather', 'nest', 'breed', 'minerals', 'attack', 'night', 'wrap',
    ]);
  });
});

describe('tutorial goals', () => {
  const run = (goals: StepPlan['goals'], start: Partial<TutorialSnapshot>, after: Partial<TutorialSnapshot>) => {
    const m = new TutorialMachine([{ id: 'camera', goals }]);
    m.update(snap(start));
    return types(m.update(snap({ ...start, ...after })));
  };

  it('gather counts food brought home since the step began', () => {
    expect(run(['gather'], { foodDelivered: 30 }, { foodDelivered: 32 })).toEqual([]);
    expect(run(['gather'], { foodDelivered: 30 }, { foodDelivered: 36 })).toContain('step-done');
  });

  it('nest steps: open the nest, mark a dig, mark a chamber', () => {
    expect(run(['open-nest'], {}, { layer: 'underground' })).toContain('step-done');
    expect(run(['dig'], { digWork: 2 }, { digWork: 2 })).toEqual([]);
    expect(run(['dig'], { digWork: 2 }, { digWork: 3 })).toContain('step-done');
    expect(run(['chamber'], { chamberTiles: 8 }, { chamberTiles: 9 })).toContain('step-done');
  });

  it('breeding: an egg ordered, then an egg carried to incubation', () => {
    expect(run(['breed'], { eggs: 0 }, { eggs: 1 })).toContain('step-done');
    expect(run(['incubate'], {}, { incubatingEggs: 1 })).toContain('step-done');
    expect(run(['incubate'], { hatched: 0 }, { hatched: 1 })).toContain('step-done');
  });

  it('minerals: the bank grows', () => {
    expect(run(['minerals'], { minerals: 0 }, { minerals: 5 })).toContain('step-done');
  });

  it('attack: soldiers selected, Atacar armed, the den attacked and destroyed', () => {
    expect(run(['select-soldiers'], {}, { selectedAnts: 4 })).toEqual([]);
    expect(run(['select-soldiers'], {}, { selectedAnts: 4, selectedSoldiers: 2 })).toContain('step-done');
    expect(run(['arm-attack'], {}, { commandTarget: 'attack' })).toContain('step-done');
    expect(run(['arm-attack'], {}, { commandTarget: 'move' })).toEqual([]);
    expect(run(['attack-den'], { denAlive: true }, { attackOrdersOnDen: 2 })).toContain('step-done');
    expect(run(['den-destroyed'], { denAlive: true }, { denAlive: true })).toEqual([]);
    expect(run(['den-destroyed'], { denAlive: true }, { denAlive: false })).toContain('step-done');
  });

  it('the practice wave counts only once it has spawned', () => {
    expect(run(['repel-wave'], {}, { practiceSpawned: false, practiceAlive: 0 })).toEqual([]);
    expect(run(['repel-wave'], { practiceSpawned: true, practiceAlive: 2 }, { practiceAlive: 1 })).toEqual([]);
    expect(run(['repel-wave'], { practiceSpawned: true, practiceAlive: 2 }, { practiceAlive: 0 })).toContain('step-done');
  });
});
