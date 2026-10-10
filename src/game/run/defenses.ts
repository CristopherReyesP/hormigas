// Buildable nest defenses (P7.3): the Espina (spine turret), the Trampa de
// resina (resin trap) and the Muro de quitina (chitin wall). Pure rules here:
// their stats and costs, and where one may be placed. DefenseSystem builds
// them in the world and runs them.

import { floodFromNest, type TilePos } from './craterSite';

export type DefenseKind = 'spine' | 'trap' | 'wall';
export type DefenseLayer = 'surface' | 'underground';

export interface DefenseStats {
  /** Spanish name */
  name: string;
  /** Minerals from the bank (World.minerals) */
  cost: number;
  health: number;
  armor: number;
  /** Espina: reach in tiles; Trampa: the radius that catches enemies */
  range: number;
  /** Espina: per shot; Trampa: per pulse */
  damage: number;
  /** Espina: seconds between shots */
  cooldown: number;
  /** Trampa: speed multiplier on enemies in the resin */
  slow: number;
  /** Trampa: seconds between pulses (each one bites and spends a charge) */
  tick: number;
  /** Trampa: pulses before the resin runs dry */
  charges: number;
  /** Trampa: seconds to refill once dry */
  recharge: number;
  /** One line for the command card */
  description: string;
}

export const DEFENSE_STATS: Readonly<Record<DefenseKind, DefenseStats>> = {
  spine: {
    name: 'Espina', cost: 75, health: 220, armor: 1, range: 5.5, damage: 14, cooldown: 1.2,
    slow: 1, tick: 0, charges: 0, recharge: 0,
    description: 'Torreta de quitina: dispara púas al enemigo más cercano a su alcance.',
  },
  trap: {
    name: 'Trampa de resina', cost: 40, health: 120, armor: 0, range: 1.1, damage: 4, cooldown: 0,
    slow: 0.45, tick: 1, charges: 12, recharge: 25,
    description: 'Charco de resina: frena a los enemigos que lo pisan y los daña poco a poco. Se agota y se recarga.',
  },
  wall: {
    name: 'Muro de quitina', cost: 30, health: 450, armor: 2, range: 0, damage: 0, cooldown: 0,
    slow: 1, tick: 0, charges: 0, recharge: 0,
    description: 'Bloquea el paso. Los enemigos lo rodean o lo atacan. Nunca puede sellar el nido.',
  },
};

/** Where defenses may go */
export const DEFENSE_AREA = {
  /** Surface: tiles within this distance of the nest */
  surfaceRadius: 9,
  /** Surface: the nest mound itself (this close to its centre) stays clear */
  nestClear: 2,
  /** Underground: tiles within this distance of an entrance (the breach) */
  breachRadius: 7,
} as const;

/** A built defense. Stored under STRUCTURE_COMPONENT, with HEALTH, POSITION, LAYER and OWNER. */
export const STRUCTURE_COMPONENT = 'structure';

export interface StructureComponent {
  kind: DefenseKind;
  layer: DefenseLayer;
  /** Its tile */
  x: number;
  y: number;
  /** Espina: seconds to reload; Trampa: seconds to the next pulse */
  timer: number;
  /** Espina: what it shot last (for the HUD and the art) */
  targetId: number | null;
  /** Trampa: resin pulses left */
  charges: number;
  /** Trampa: seconds of refill left while dry */
  rechargeTimer: number;
}

export type PlacementRefusal = 'minerals' | 'area' | 'blocked' | 'occupied' | 'seal';

export type PlacementResult = { ok: true } | { ok: false; reason: PlacementRefusal; message: string };

export interface PlacementQuery {
  kind: DefenseKind;
  x: number;
  y: number;
  /** Minerals in the bank */
  minerals: number;
  width: number;
  height: number;
  isWalkable(x: number, y: number): boolean;
  /** Another defense (or the nest) already stands there */
  isOccupied(x: number, y: number): boolean;
  /** The nest (surface) or the queen's tile (underground): what must never be sealed off */
  home: TilePos;
  /** The build area is within `areaRadius` of any of these: the nest, or the entrances */
  anchors: readonly TilePos[];
  areaRadius: number;
  /** Tiles this close to `home` are not buildable (the nest mound) */
  keepClear?: number;
  /** Extra floor rule for walls (underground: tunnels only, never the entrance row) */
  canWall?(x: number, y: number): boolean;
}

const MESSAGES: Record<PlacementRefusal, string> = {
  minerals: 'Faltan minerales.',
  area: 'Fuera del área de defensa del nido.',
  blocked: 'No se puede construir en esa casilla.',
  occupied: 'Esa casilla ya está ocupada.',
  seal: 'Ese muro sellaría el nido o dejaría terreno aislado.',
};

const refuse = (reason: PlacementRefusal): PlacementResult => ({ ok: false, reason, message: MESSAGES[reason] });

/**
 * Whether a wall on (x, y) would cut anything off: every walkable neighbour
 * of the tile that the nest reaches today must still be reachable around it.
 * That keeps the nest open to the outside (and to every entrance) and never
 * walls off a pocket of ground. Same 4-way flood fill as the crater site.
 */
export function wouldCutOff(q: Pick<PlacementQuery, 'x' | 'y' | 'width' | 'height' | 'isWalkable' | 'home'>): boolean {
  const { x, y, width, height, home } = q;
  const inBounds = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < width && ty < height;
  const before = floodFromNest({ width, height, nest: home, isWalkable: q.isWalkable });
  if (!before[y * width + x]) return false; // not part of the nest's ground: nothing to cut
  const after = floodFromNest({ width, height, nest: home, isWalkable: (tx, ty) => !(tx === x && ty === y) && q.isWalkable(tx, ty) });
  const sides: Array<[number, number]> = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
  return sides.some(([nx, ny]) => inBounds(nx, ny) && before[ny * width + nx] === 1 && after[ny * width + nx] !== 1);
}

/** Whether defense `q.kind` may go on (x, y): area, floor, a free tile, the cost, and no seal for walls */
export function checkPlacement(q: PlacementQuery): PlacementResult {
  const { kind, x, y } = q;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= q.width || y >= q.height) return refuse('area');
  const near = q.anchors.some((a) => Math.hypot(a.x - x, a.y - y) <= q.areaRadius);
  if (!near) return refuse('area');
  if (q.keepClear !== undefined && Math.hypot(q.home.x - x, q.home.y - y) < q.keepClear) return refuse('area');
  if (x === q.home.x && y === q.home.y) return refuse('area');
  if (!q.isWalkable(x, y)) return q.isOccupied(x, y) ? refuse('occupied') : refuse('blocked');
  if (q.isOccupied(x, y)) return refuse('occupied');
  if (kind === 'wall' && q.canWall && !q.canWall(x, y)) return refuse('blocked');
  if (q.minerals < DEFENSE_STATS[kind].cost) return refuse('minerals');
  if (kind === 'wall' && wouldCutOff(q)) return refuse('seal');
  return { ok: true };
}
