import type { CommandTarget } from '../GameManager';
/**
 * Tutorial goals: what the player must actually do, judged from two
 * snapshots of the run (when the goal began, and now). Pure, so the step
 * machine can be tested without a game.
 */

export type GoalId =
  | 'pan'
  | 'zoom'
  | 'select-one'
  | 'select-group'
  | 'move'
  | 'gather'
  | 'open-nest'
  | 'dig'
  | 'chamber'
  | 'breed'
  | 'incubate'
  | 'minerals'
  | 'select-soldiers'
  | 'arm-attack'
  | 'attack-den'
  | 'den-destroyed'
  | 'repel-wave'
  | 'ack';

/** The run as the tutorial sees it, read a few times a second */
export interface TutorialSnapshot {
  layer: 'surface' | 'underground';
  /** Camera view of the layer on screen, in tiles */
  view: { x: number; y: number; w: number; h: number };
  /** Own ants selected (one or a group) */
  selectedAnts: number;
  selectedSoldiers: number;
  /** Mover or Atacar pressed and waiting for its target */
  commandTarget: CommandTarget | null;
  /** Own ants walking under a move or attack-move order */
  moveOrders: number;
  /** Own ants ordered to attack the tutorial den */
  attackOrdersOnDen: number;
  /** Food brought home so far (entrance pile and pantry), counting only what came in */
  foodDelivered: number;
  /** Dig orders waiting plus tiles dug so far */
  digWork: number;
  /** Pantry and incubation tiles */
  chamberTiles: number;
  /** Eggs ordered and not hatched yet (queued or laid) */
  eggs: number;
  /** Laid eggs lying on an incubation tile */
  incubatingEggs: number;
  hatched: number;
  minerals: number;
  denAlive: boolean;
  denHealth: number;
  practiceSpawned: boolean;
  practiceAlive: number;
  /** The player pressed the step's button (only the last step has one) */
  acked: boolean;
}

export function emptySnapshot(): TutorialSnapshot {
  return {
    layer: 'surface',
    view: { x: 0, y: 0, w: 20, h: 12 },
    selectedAnts: 0,
    selectedSoldiers: 0,
    commandTarget: null,
    moveOrders: 0,
    attackOrdersOnDen: 0,
    foodDelivered: 0,
    digWork: 0,
    chamberTiles: 0,
    eggs: 0,
    incubatingEggs: 0,
    hatched: 0,
    minerals: 0,
    denAlive: false,
    denHealth: 0,
    practiceSpawned: false,
    practiceAlive: 0,
    acked: false,
  };
}

/** Tiles the view center must travel to count as a pan */
export const PAN_TILES = 2;
/** Relative change of the view width that counts as a zoom */
export const ZOOM_CHANGE = 0.1;
/** Food that must come home during the gather step */
export const GATHER_FOOD = 5;

type GoalCheck = (now: TutorialSnapshot, start: TutorialSnapshot) => boolean;

const center = (v: TutorialSnapshot['view']) => ({ x: v.x + v.w / 2, y: v.y + v.h / 2 });

export const GOAL_CHECKS: Record<GoalId, GoalCheck> = {
  pan: (now, start) => {
    const a = center(start.view);
    const b = center(now.view);
    return Math.hypot(b.x - a.x, b.y - a.y) >= PAN_TILES;
  },
  zoom: (now, start) => Math.abs(now.view.w / start.view.w - 1) >= ZOOM_CHANGE,
  'select-one': (now) => now.selectedAnts >= 1,
  'select-group': (now) => now.selectedAnts >= 2,
  move: (now) => now.moveOrders > 0,
  gather: (now, start) => now.foodDelivered - start.foodDelivered >= GATHER_FOOD,
  'open-nest': (now) => now.layer === 'underground',
  dig: (now, start) => now.digWork > start.digWork,
  chamber: (now, start) => now.chamberTiles > start.chamberTiles,
  breed: (now, start) => now.eggs > start.eggs,
  incubate: (now, start) => now.incubatingEggs > 0 || now.hatched > start.hatched,
  minerals: (now, start) => now.minerals > start.minerals,
  'select-soldiers': (now) => now.selectedSoldiers >= 1,
  // Right-click (or a tap) on the den is an attack too: no need to make them press the button again
  'arm-attack': (now) => now.commandTarget === 'attack' || now.attackOrdersOnDen > 0,
  'attack-den': (now, start) => now.attackOrdersOnDen > 0 || (start.denAlive && (!now.denAlive || now.denHealth < start.denHealth)),
  'den-destroyed': (now) => !now.denAlive,
  'repel-wave': (now) => now.practiceSpawned && now.practiceAlive === 0,
  ack: (now) => now.acked,
};
