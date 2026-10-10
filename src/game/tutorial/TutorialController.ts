import type { GameManager } from '../GameManager';
import { TutorialMachine, type TutorialEvent, type TutorialState } from './TutorialMachine';
import { TutorialScenario, type FocusKind } from './TutorialScenario';
import { TUTORIAL_PLAN, type StepPlan } from './plan';
import type { GoalId, TutorialSnapshot } from './goals';
import { AntRole } from '../components/components';

/** The parts of the GameManager the tutorial reads (all public, so a test can drive a real run) */
export type TutorialGame = Pick<
  GameManager,
  'getStats' | 'getTutorialStage' | 'getActiveView' | 'getUndergroundDigOrders' | 'getStorageTileCount' | 'getBroodSnapshot'
>;

/**
 * Runs the tutorial on a live run: stages the scenario, reads a snapshot of
 * the run on every poll() and feeds it to the step machine. The UI polls a
 * few times a second, shows the celebration, then calls next().
 */
export class TutorialController {
  private readonly game: TutorialGame;
  private readonly machine: TutorialMachine;
  private readonly scenario: TutorialScenario;
  private readonly listeners = new Set<() => void>();
  private readonly eventListeners = new Set<(event: TutorialEvent) => void>();
  /** Bumped on every change, for React's useSyncExternalStore */
  private changes = 0;
  /** Food that came home (only increases of the entrance pile plus the pantry count) */
  private delivered = 0;
  private lastFood: number | null = null;
  private started = false;
  private released = false;

  constructor(game: TutorialGame, plan: readonly StepPlan[] = TUTORIAL_PLAN) {
    this.game = game;
    this.machine = new TutorialMachine(plan);
    this.scenario = new TutorialScenario(game.getTutorialStage());
  }

  /**
   * Stage the map and begin on the first step. Calling it again after
   * dispose() (a remount) only holds the day clock again.
   */
  start(): void {
    const phase = this.machine.state.phase;
    if (phase === 'done' || phase === 'exited') return;
    this.released = false;
    if (this.started) {
      this.scenario.hold();
      return;
    }
    this.started = true;
    this.scenario.setup();
    this.enterStep();
    this.emit();
  }

  get state(): TutorialState {
    return this.machine.state;
  }

  get step(): StepPlan | null {
    return this.machine.step;
  }

  get goal(): GoalId | null {
    return this.machine.goal;
  }

  /** Read the run and judge the current goal */
  poll(): TutorialEvent[] {
    if (!this.started) return [];
    return this.handle(this.machine.update(this.snapshot()));
  }

  next(): TutorialEvent[] {
    return this.handle(this.machine.next());
  }

  skipStep(): TutorialEvent[] {
    return this.handle(this.machine.skipStep());
  }

  exit(): TutorialEvent[] {
    return this.handle(this.machine.exit());
  }

  /** The wrap-up's "¡Listo!" button */
  ack(): void {
    this.machine.ack();
  }

  focus(kind: FocusKind): { x: number; y: number } | null {
    return this.scenario.focus(kind);
  }

  /** Called on any change of state (step, goal, phase) */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A counter that changes with the state */
  version = (): number => this.changes;

  /** Every machine event, as it happens (the UI celebrates step-done) */
  onEvent(listener: (event: TutorialEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** The UI unmounts mid-tutorial (restart, back to the menu): give the clock back */
  dispose(): void {
    this.release();
  }

  snapshot(): TutorialSnapshot {
    const stats = this.game.getStats();
    const view = this.game.getActiveView();
    const brood = this.game.getBroodSnapshot();
    const world = this.game.getTutorialStage().world;

    const food = stats.pantryStored + (stats.entranceFoodStored ?? 0);
    if (this.lastFood !== null && food > this.lastFood) this.delivered += food - this.lastFood;
    this.lastFood = food;

    const group = stats.selectedGroup;
    const single = stats.selectedEntity?.type === 'ant' ? stats.selectedEntity : null;
    const selectedAnts = group ? group.count : single ? 1 : 0;
    const selectedSoldiers = group ? group.byRole[AntRole.Soldier] ?? 0 : single?.role === AntRole.Soldier ? 1 : 0;
    const facts = this.scenario.read();

    return {
      layer: stats.activeLayer,
      view: { x: view.x, y: view.y, w: view.w, h: view.h },
      selectedAnts,
      selectedSoldiers,
      commandTarget: stats.commandTarget ?? null,
      moveOrders: facts.moveOrders,
      attackOrdersOnDen: facts.attackOrdersOnDen,
      foodDelivered: this.delivered,
      digWork: this.game.getUndergroundDigOrders().length + world.metrics.tilesExcavated,
      chamberTiles: this.game.getStorageTileCount() + brood.incubation.tiles,
      eggs: brood.queue.length + brood.eggs.length,
      incubatingEggs: brood.eggs.filter((e) => e.incubating).length,
      hatched: world.metrics.antsHatched,
      minerals: stats.mineralsStored ?? 0,
      denAlive: facts.denAlive,
      denHealth: facts.denHealth,
      practiceSpawned: facts.practiceSpawned,
      practiceAlive: facts.practiceAlive,
      acked: false,
    };
  }

  private handle(events: TutorialEvent[]): TutorialEvent[] {
    for (const event of events) {
      if (event.type === 'step-start') this.enterStep();
      if (event.type === 'finished' || event.type === 'exited') this.release();
    }
    for (const event of events) for (const listener of this.eventListeners) listener(event);
    if (events.length > 0) this.emit();
    return events;
  }

  /** What the new step needs on the map */
  private enterStep(): void {
    const enter = this.machine.step?.enter;
    if (enter === 'gift-soldiers') this.scenario.giftSoldiers();
    if (enter === 'practice-wave') this.scenario.sendPracticeWave();
  }

  private release(): void {
    if (this.released || !this.started) return;
    this.released = true;
    this.scenario.release();
  }

  private emit(): void {
    this.changes++;
    for (const listener of this.listeners) listener();
  }
}
