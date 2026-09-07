import { UndergroundTerrainType, ChamberType } from './types';
import type { WalkableGrid } from './WalkableGrid';
import { UNDERGROUND_WIDTH, UNDERGROUND_HEIGHT, QUEEN_CHAMBER_SIZE, STARTING_FOOD_CHAMBER_SIZE, INCUBATION_CHAMBER_SIZE, PANTRY_TILE_CAPACITY, ROCK_POCKET_COUNT, ENTRANCE_ROW } from '../../shared/constants';

export type PantryFoodType = 'leaf' | 'mushroom' | 'meat';

/** A physical food pile sitting on a pantry tile. One type per tile. */
export interface PantryFood {
  type: PantryFoodType;
  amount: number;
}

export interface UndergroundTile {
  terrain: UndergroundTerrainType;
  walkable: boolean;
  designated: boolean;
  chamberType: ChamberType | null;
  /** Food pile — only ever non-null on FoodStorage tiles (any type) and FungusFarm tiles (mushrooms the farm grows) */
  food: PantryFood | null;
}

const FOOD_EPSILON = 1e-6;
const PANTRY_TYPES: PantryFoodType[] = ['leaf', 'mushroom', 'meat'];

export class UndergroundGrid implements WalkableGrid {
  readonly width = UNDERGROUND_WIDTH;
  readonly height = UNDERGROUND_HEIGHT;
  private tiles: UndergroundTile[];

  constructor() {
    this.tiles = new Array(this.width * this.height);
    this.generate();
  }

  private generate(): void {
    for (let i = 0; i < this.tiles.length; i++) {
      this.tiles[i] = {
        terrain: UndergroundTerrainType.Earth,
        walkable: false,
        designated: false,
        chamberType: null,
        food: null,
      };
    }

    for (let x = 0; x < this.width; x++) {
      this.setTerrain(x, 0, UndergroundTerrainType.Reinforced);
      this.setTerrain(x, this.height - 1, UndergroundTerrainType.Reinforced);
    }
    for (let y = 0; y < this.height; y++) {
      this.setTerrain(0, y, UndergroundTerrainType.Reinforced);
      this.setTerrain(this.width - 1, y, UndergroundTerrainType.Reinforced);
    }

    const cx = Math.floor(this.width / 2);
    const cy = Math.floor(this.height / 2);

    const qHalf = Math.floor(QUEEN_CHAMBER_SIZE / 2);
    for (let dy = -qHalf; dy <= qHalf; dy++) {
      for (let dx = -qHalf; dx <= qHalf; dx++) {
        this.setChamber(cx + dx, cy + dy, UndergroundTerrainType.Chamber, ChamberType.Queen);
      }
    }

    const fHalf = Math.floor(STARTING_FOOD_CHAMBER_SIZE / 2);
    const foodCx = cx - QUEEN_CHAMBER_SIZE - 1;
    for (let dy = -fHalf; dy <= fHalf; dy++) {
      for (let dx = -fHalf; dx <= fHalf; dx++) {
        this.setChamber(foodCx + dx, cy + dy, UndergroundTerrainType.Chamber, ChamberType.FoodStorage);
      }
    }

    // Incubation chamber to the RIGHT of queen chamber
    const iHalf = Math.floor(INCUBATION_CHAMBER_SIZE / 2);
    const incubCx = cx + QUEEN_CHAMBER_SIZE + 1;
    for (let dy = -iHalf; dy <= iHalf; dy++) {
      for (let dx = -iHalf; dx <= iHalf; dx++) {
        this.setChamber(incubCx + dx, cy + dy, UndergroundTerrainType.Chamber, ChamberType.Incubation);
      }
    }

    // Starting corridors are 2 TILES WIDE: every ant in the colony crosses the
    // entrance shaft, and with the crowding cap a 1-wide two-way artery jams.
    // Narrow chokepoints are for the PLAYER to dig on purpose, not the default.
    for (let y = 1; y < cy - qHalf; y++) {
      for (const x of [cx, cx + 1]) {
        this.setTerrain(x, y, UndergroundTerrainType.Tunnel);
        this.getTile(x, y)!.walkable = true;
      }
    }

    for (let x = foodCx + fHalf + 1; x < cx - qHalf; x++) {
      for (const y of [cy, cy + 1]) {
        this.setTerrain(x, y, UndergroundTerrainType.Tunnel);
        this.getTile(x, y)!.walkable = true;
      }
    }

    // Tunnel from queen chamber to incubation chamber
    for (let x = cx + qHalf + 1; x < incubCx - iHalf; x++) {
      for (const y of [cy, cy + 1]) {
        this.setTerrain(x, y, UndergroundTerrainType.Tunnel);
        this.getTile(x, y)!.walkable = true;
      }
    }

    this.generateRockPockets(cx, cy);
  }

  /**
   * Procedural rock pockets: small UNDIGGABLE blobs scattered through the earth.
   * They force players to design around them — tunnels bend, chambers relocate.
   * Kept away from the starting chambers and the entrance shaft column.
   */
  private generateRockPockets(cx: number, cy: number): void {
    let placed = 0;
    for (let attempt = 0; attempt < ROCK_POCKET_COUNT * 12 && placed < ROCK_POCKET_COUNT; attempt++) {
      const x = 3 + Math.floor(Math.random() * (this.width - 6));
      const y = 3 + Math.floor(Math.random() * (this.height - 6));
      // Keep the starting layout and the entrance column buildable
      if (Math.hypot(x - cx, y - cy) < 14) continue;
      if (Math.abs(x - cx) < 4 && y < cy) continue;

      // Random-walk blob of 4-9 rock tiles (only converts untouched earth)
      const blobSize = 4 + Math.floor(Math.random() * 6);
      let bx = x;
      let by = y;
      let converted = 0;
      for (let i = 0; i < blobSize * 3 && converted < blobSize; i++) {
        const tile = this.getTile(bx, by);
        if (tile && tile.terrain === UndergroundTerrainType.Earth && !tile.walkable) {
          tile.terrain = UndergroundTerrainType.Reinforced;
          converted++;
        }
        bx += Math.floor(Math.random() * 3) - 1;
        by += Math.floor(Math.random() * 3) - 1;
        bx = Math.max(2, Math.min(this.width - 3, bx));
        by = Math.max(2, Math.min(this.height - 3, by));
      }
      if (converted > 0) placed++;
    }
  }

  private setTerrain(x: number, y: number, terrain: UndergroundTerrainType): void {
    const tile = this.getTile(x, y);
    if (tile) {
      tile.terrain = terrain;
      tile.walkable = terrain === UndergroundTerrainType.Tunnel || terrain === UndergroundTerrainType.Chamber;
    }
  }

  private setChamber(x: number, y: number, terrain: UndergroundTerrainType, chamber: ChamberType): void {
    const tile = this.getTile(x, y);
    if (tile) {
      tile.terrain = terrain;
      tile.walkable = true;
      tile.chamberType = chamber;
      this.layoutVersion++;
    }
  }

  // ── Layout versioning ──────────────────────────────────────────────
  // Bumped by every mutation that changes the walkable/chamber layout, so
  // consumers (light map, minimap) can compare one integer instead of
  // rescanning all UNDERGROUND_WIDTH * UNDERGROUND_HEIGHT tiles per frame
  // just to ask "did anything change?".
  //
  // `designated` deliberately does NOT bump it: dig markers are drawn live
  // each frame and never feed the cached light BFS.
  private layoutVersion = 0;

  getLayoutVersion(): number {
    return this.layoutVersion;
  }

  /** Force consumers to rebuild — for mutations made outside this class */
  markLayoutChanged(): void {
    this.layoutVersion++;
  }

  // ── Entrances ──────────────────────────────────────────────────────
  // An entrance is a contiguous run of walkable tiles on ENTRANCE_ROW, the
  // topmost diggable row. So the player opens one simply by digging a column
  // up to the surface — no build mode, no cost UI. A run is collapsed to ONE
  // entrance so the 2-wide starting shaft counts once, not twice.
  //
  // More entrances = shorter walks to the shaft and less crowding on a single
  // artery, but UndergroundInvasionSystem breaches through a random one, so
  // every entrance is also a front to defend.

  private entranceCache: Array<{ x: number; y: number }> | null = null;
  private entranceCacheVersion = -1;

  getEntrances(): Array<{ x: number; y: number }> {
    if (this.entranceCache !== null && this.entranceCacheVersion === this.layoutVersion) {
      return this.entranceCache;
    }

    const list: Array<{ x: number; y: number }> = [];
    let runStart = -1;
    for (let x = 0; x <= this.width; x++) {
      const open = x < this.width && this.isWalkable(x, ENTRANCE_ROW);
      if (open && runStart === -1) {
        runStart = x;
      } else if (!open && runStart !== -1) {
        list.push({ x: Math.floor((runStart + x - 1) / 2), y: ENTRANCE_ROW });
        runStart = -1;
      }
    }

    this.entranceCache = list;
    this.entranceCacheVersion = this.layoutVersion;
    return list;
  }

  /** Closest entrance to a point, or null when the nest is fully sealed */
  findNearestEntrance(fromX: number, fromY: number): { x: number; y: number } | null {
    const entrances = this.getEntrances();
    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;
    for (const e of entrances) {
      const d = Math.hypot(e.x + 0.5 - fromX, e.y + 0.5 - fromY);
      if (d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return best;
  }

  getTile(x: number, y: number): UndergroundTile | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return null;
    return this.tiles[y * this.width + x];
  }

  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile !== null && tile.walkable;
  }

  getNeighbors(x: number, y: number): Array<{ x: number; y: number }> {
    const neighbors: Array<{ x: number; y: number }> = [];
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        neighbors.push({ x: nx, y: ny });
      }
    }
    return neighbors;
  }

  designate(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile || tile.terrain !== UndergroundTerrainType.Earth || tile.designated) return false;
    tile.designated = true;
    return true;
  }

  findPath(fromX: number, fromY: number, toX: number, toY: number): Array<{ x: number; y: number }> | null {
    const sx = Math.floor(fromX);
    const sy = Math.floor(fromY);
    const ex = Math.floor(toX);
    const ey = Math.floor(toY);

    if (!this.isWalkable(ex, ey)) return null;
    if (sx === ex && sy === ey) return [{ x: ex + 0.5, y: ey + 0.5 }];

    const visited = new Set<string>();
    const parent = new Map<string, string>();
    const queue: Array<[number, number]> = [];

    const startKey = `${sx},${sy}`;
    visited.add(startKey);
    queue.push([sx, sy]);

    let found = false;

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;

      if (cx === ex && cy === ey) {
        found = true;
        break;
      }

      for (const n of this.getNeighbors(cx, cy)) {
        const key = `${n.x},${n.y}`;
        if (visited.has(key)) continue;
        if (!this.isWalkable(n.x, n.y)) continue;
        // No diagonal corner-cutting: both orthogonal neighbors must be open
        const ddx = n.x - cx;
        const ddy = n.y - cy;
        if (ddx !== 0 && ddy !== 0 && (!this.isWalkable(cx + ddx, cy) || !this.isWalkable(cx, cy + ddy))) {
          continue;
        }
        visited.add(key);
        parent.set(key, `${cx},${cy}`);
        queue.push([n.x, n.y]);
      }
    }

    if (!found) return null;

    // Reconstruct and simplify path (keep only direction changes)
    const fullPath: Array<[number, number]> = [];
    let current = `${ex},${ey}`;
    while (current !== startKey) {
      const [px, py] = current.split(',').map(Number);
      fullPath.unshift([px, py]);
      current = parent.get(current)!;
    }

    // Simplify: remove collinear intermediate points
    const simplified: Array<{ x: number; y: number }> = [{ x: fullPath[0][0] + 0.5, y: fullPath[0][1] + 0.5 }];
    for (let i = 1; i < fullPath.length - 1; i++) {
      const dx1 = fullPath[i][0] - fullPath[i - 1][0];
      const dy1 = fullPath[i][1] - fullPath[i - 1][1];
      const dx2 = fullPath[i + 1][0] - fullPath[i][0];
      const dy2 = fullPath[i + 1][1] - fullPath[i][1];
      if (dx1 !== dx2 || dy1 !== dy2) {
        simplified.push({ x: fullPath[i][0] + 0.5, y: fullPath[i][1] + 0.5 });
      }
    }
    if (fullPath.length > 1) {
      const last = fullPath[fullPath.length - 1];
      simplified.push({ x: last[0] + 0.5, y: last[1] + 0.5 });
    }

    return simplified;
  }

  excavate(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    if (!tile || !tile.designated) return false;
    tile.terrain = UndergroundTerrainType.Tunnel;
    tile.walkable = true;
    tile.designated = false;
    this.layoutVersion++;
    return true;
  }

  // ── Spatial pantry ─────────────────────────────────────────────────
  // Food lives as physical piles on FoodStorage chamber tiles. Each tile
  // holds at most one food TYPE; the first deposit claims the type and an
  // emptied pile resets the claim.

  private pantryTileCapacityBonus = 0;

  // ── Consumption policy ─────────────────────────────────────────────
  // Which food type the colony eats FIRST (breeding, nurses, healing).
  // Player-set: eating mushrooms/meat first PROTECTS the leaf supply the
  // fungus farm needs — with the old hardcoded leaf-first order the farm
  // was permanently starved by its own colony.
  private consumptionPriority: PantryFoodType = 'leaf';

  setConsumptionPriority(type: PantryFoodType): void {
    this.consumptionPriority = type;
  }

  getConsumptionPriority(): PantryFoodType {
    return this.consumptionPriority;
  }

  /** Eat order derived from the policy: priority type first, then the default chain */
  getConsumptionOrder(): PantryFoodType[] {
    return [this.consumptionPriority, ...PANTRY_TYPES.filter((t) => t !== this.consumptionPriority)];
  }

  // ── Chamber regions ────────────────────────────────────────────────
  // Contiguous same-type chamber areas — drives the zone rendering (one fill +
  // one outline + one icon per AREA, not per tile) and defender post assignment.

  private chamberRegions: Array<{ type: ChamberType; tiles: Array<{ x: number; y: number }>; cx: number; cy: number }> | null = null;

  getChamberRegions(): Array<{ type: ChamberType; tiles: Array<{ x: number; y: number }>; cx: number; cy: number }> {
    if (this.chamberRegions) return this.chamberRegions;

    const ZONED: ChamberType[] = [
      ChamberType.Queen,
      ChamberType.FoodStorage,
      ChamberType.Incubation,
      ChamberType.FungusFarm,
      ChamberType.Defense,
    ];
    const seen = new Set<number>();
    const regions: Array<{ type: ChamberType; tiles: Array<{ x: number; y: number }>; cx: number; cy: number }> = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const key = y * this.width + x;
        if (seen.has(key)) continue;
        const tile = this.getTile(x, y);
        if (!tile || !tile.walkable || !tile.chamberType || !ZONED.includes(tile.chamberType)) continue;

        // Flood fill this region (4-dir)
        const type = tile.chamberType;
        const tiles: Array<{ x: number; y: number }> = [];
        const stack = [{ x, y }];
        seen.add(key);
        while (stack.length > 0) {
          const t = stack.pop()!;
          tiles.push(t);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = t.x + dx;
            const ny = t.y + dy;
            const nkey = ny * this.width + nx;
            if (seen.has(nkey)) continue;
            const n = this.getTile(nx, ny);
            if (n && n.walkable && n.chamberType === type) {
              seen.add(nkey);
              stack.push({ x: nx, y: ny });
            }
          }
        }
        const cxSum = tiles.reduce((s, t) => s + t.x + 0.5, 0);
        const cySum = tiles.reduce((s, t) => s + t.y + 0.5, 0);
        regions.push({ type, tiles, cx: cxSum / tiles.length, cy: cySum / tiles.length });
      }
    }

    this.chamberRegions = regions;
    return regions;
  }

  /** Hook for the 'storage' queen upgrade: flat extra capacity per pantry tile */
  setPantryTileCapacityBonus(bonus: number): void {
    this.pantryTileCapacityBonus = Math.max(0, bonus);
  }

  /** Max food a single pantry tile can hold (base + upgrade bonus) */
  getPantryTileCapacity(): number {
    return PANTRY_TILE_CAPACITY + this.pantryTileCapacityBonus;
  }

  private isPantryTile(tile: UndergroundTile | null): tile is UndergroundTile {
    return tile !== null && tile.walkable && tile.chamberType === ChamberType.FoodStorage;
  }

  private isFarmTile(tile: UndergroundTile | null): tile is UndergroundTile {
    return tile !== null && tile.walkable && tile.chamberType === ChamberType.FungusFarm;
  }

  /** Any tile that can hold a food pile: pantry (intake) or farm (grown mushrooms) */
  private isFoodTile(tile: UndergroundTile | null): tile is UndergroundTile {
    return this.isPantryTile(tile) || this.isFarmTile(tile);
  }

  // Coordinate cache: pantry/farm designations change rarely (player clicks),
  // but these lists are read MANY times per frame (porters, nurses, farm,
  // render, stats). Walkability never reverts, so cached coords stay valid
  // until a designation toggles — GameManager invalidates on each toggle.
  private chamberCoords: { pantry: Array<{ x: number; y: number }>; farm: Array<{ x: number; y: number }> } | null = null;

  /** Call after any chamberType mutation (designations) */
  invalidateChamberCache(): void {
    this.chamberCoords = null;
    this.chamberRegions = null;
    // GameManager mutates tile.chamberType directly for player designations and
    // always funnels through here, so this is the layout-change hook for them.
    this.layoutVersion++;
  }

  private getChamberCoords(): { pantry: Array<{ x: number; y: number }>; farm: Array<{ x: number; y: number }> } {
    if (!this.chamberCoords) {
      const pantry: Array<{ x: number; y: number }> = [];
      const farm: Array<{ x: number; y: number }> = [];
      for (let y = 0; y < this.height; y++) {
        for (let x = 0; x < this.width; x++) {
          const tile = this.getTile(x, y);
          if (this.isPantryTile(tile)) pantry.push({ x, y });
          else if (this.isFarmTile(tile)) farm.push({ x, y });
        }
      }
      this.chamberCoords = { pantry, farm };
    }
    return this.chamberCoords;
  }

  private withFood(coords: Array<{ x: number; y: number }>): Array<{ x: number; y: number; food: PantryFood | null }> {
    return coords.map(({ x, y }) => ({ x, y, food: this.getTile(x, y)!.food }));
  }

  /** All FoodStorage chamber tiles with their current piles (live references) */
  getPantryTiles(): Array<{ x: number; y: number; food: PantryFood | null }> {
    return this.withFood(this.getChamberCoords().pantry);
  }

  /** All FungusFarm tiles with their mushroom piles (live references) */
  getFarmTiles(): Array<{ x: number; y: number; food: PantryFood | null }> {
    return this.withFood(this.getChamberCoords().farm);
  }

  /** Pantry + farm tiles — everywhere stored food can sit */
  private getFoodTiles(): Array<{ x: number; y: number; food: PantryFood | null }> {
    const { pantry, farm } = this.getChamberCoords();
    return this.withFood(pantry).concat(this.withFood(farm));
  }

  /** Total pantry capacity derived from designated tiles */
  getPantryCapacity(): number {
    return this.getPantryTiles().length * this.getPantryTileCapacity();
  }

  /** Mushroom capacity the farm itself provides (same per-tile cap as the pantry) */
  getFarmCapacity(): number {
    return this.getFarmTiles().length * this.getPantryTileCapacity();
  }

  /** Mushrooms currently sitting on farm tiles */
  getFarmStored(): number {
    let total = 0;
    for (const t of this.getFarmTiles()) {
      if (t.food && t.food.amount > FOOD_EPSILON) total += t.food.amount;
    }
    return total;
  }

  /** Totals by type across all food piles (pantry + farm) */
  getPantryStored(): { leaf: number; mushroom: number; meat: number; total: number } {
    const stored = { leaf: 0, mushroom: 0, meat: 0, total: 0 };
    for (const t of this.getFoodTiles()) {
      if (t.food && t.food.amount > FOOD_EPSILON) {
        stored[t.food.type] += t.food.amount;
        stored.total += t.food.amount;
      }
    }
    return stored;
  }

  /**
   * Nearest tile that can accept `type`: prefers a same-type pile with space,
   * falls back to the nearest empty pantry tile. `from` defaults to the
   * underground entrance shaft.
   */
  findDepositTile(type: PantryFoodType, fromX?: number, fromY?: number): { x: number; y: number } | null {
    const fx = fromX ?? Math.floor(this.width / 2) + 0.5;
    const fy = fromY ?? 2.5;
    const cap = this.getPantryTileCapacity();

    let bestSame: { x: number; y: number } | null = null;
    let bestSameDist = Infinity;
    let bestEmpty: { x: number; y: number } | null = null;
    let bestEmptyDist = Infinity;

    for (const t of this.getPantryTiles()) {
      const dx = t.x + 0.5 - fx;
      const dy = t.y + 0.5 - fy;
      const dist = dx * dx + dy * dy;
      const isEmpty = !t.food || t.food.amount <= FOOD_EPSILON;

      if (!isEmpty && t.food!.type === type && t.food!.amount < cap - FOOD_EPSILON) {
        if (dist < bestSameDist) {
          bestSame = { x: t.x, y: t.y };
          bestSameDist = dist;
        }
      } else if (isEmpty && dist < bestEmptyDist) {
        bestEmpty = { x: t.x, y: t.y };
        bestEmptyDist = dist;
      }
    }

    return bestSame ?? bestEmpty;
  }

  /** Nearest farm tile with room for grown mushrooms (farm piles are mushroom-only) */
  findFarmDepositTile(fromX?: number, fromY?: number): { x: number; y: number } | null {
    const fx = fromX ?? Math.floor(this.width / 2) + 0.5;
    const fy = fromY ?? 2.5;
    const cap = this.getPantryTileCapacity();

    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (const t of this.getFarmTiles()) {
      if (t.food && t.food.amount >= cap - FOOD_EPSILON) continue;
      const dx = t.x + 0.5 - fx;
      const dy = t.y + 0.5 - fy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        best = { x: t.x, y: t.y };
        bestDist = dist;
      }
    }

    return best;
  }

  /** Nearest pile of the policy's priority type, falling back to any non-empty pile */
  findPreferredFetchTile(fromX?: number, fromY?: number): { x: number; y: number } | null {
    return (
      this.findFetchTile(this.consumptionPriority, fromX, fromY) ??
      this.findFetchTile(undefined, fromX, fromY)
    );
  }

  /** Nearest non-empty pile, pantry or farm (optionally restricted to one type) */
  findFetchTile(type?: PantryFoodType, fromX?: number, fromY?: number): { x: number; y: number } | null {
    const fx = fromX ?? Math.floor(this.width / 2) + 0.5;
    const fy = fromY ?? 2.5;

    let best: { x: number; y: number } | null = null;
    let bestDist = Infinity;

    for (const t of this.getFoodTiles()) {
      if (!t.food || t.food.amount <= FOOD_EPSILON) continue;
      if (type && t.food.type !== type) continue;
      const dx = t.x + 0.5 - fx;
      const dy = t.y + 0.5 - fy;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        best = { x: t.x, y: t.y };
        bestDist = dist;
      }
    }

    return best;
  }

  /** Add food to a pantry tile (any type) or a farm tile (mushrooms only).
   *  Returns the amount actually accepted (0 on type mismatch / full / invalid tile). */
  depositFood(x: number, y: number, type: PantryFoodType, amount: number): number {
    const tile = this.getTile(x, y);
    const accepts = this.isPantryTile(tile) || (type === 'mushroom' && this.isFarmTile(tile));
    if (!accepts || tile === null || amount <= 0) return 0;
    if (tile.food && tile.food.amount > FOOD_EPSILON && tile.food.type !== type) return 0;

    if (!tile.food || tile.food.amount <= FOOD_EPSILON) {
      tile.food = { type, amount: 0 }; // first deposit claims the tile's type
    }

    const space = this.getPantryTileCapacity() - tile.food.amount;
    const accepted = Math.min(space, amount);
    if (accepted <= 0) return 0;
    tile.food.amount += accepted;
    return accepted;
  }

  /** Remove up to `amount` from a pantry/farm pile. Emptied piles reset to null (type claim released). */
  takeFood(x: number, y: number, amount: number): { type: PantryFoodType | null; taken: number } {
    const tile = this.getTile(x, y);
    if (!this.isFoodTile(tile) || !tile.food || tile.food.amount <= FOOD_EPSILON || amount <= 0) {
      return { type: null, taken: 0 };
    }
    const type = tile.food.type;
    const taken = Math.min(amount, tile.food.amount);
    tile.food.amount -= taken;
    if (tile.food.amount <= FOOD_EPSILON) tile.food = null;
    return { type, taken };
  }

  /** Drain up to `amount` of one type (pantry + farm piles), fullest first. Returns the amount drained. */
  drainFoodOfType(type: PantryFoodType, amount: number): number {
    if (amount <= 0) return 0;
    const piles = this.getFoodTiles().filter(
      (t) => t.food !== null && t.food.type === type && t.food.amount > FOOD_EPSILON
    );
    piles.sort((a, b) => b.food!.amount - a.food!.amount);

    let drained = 0;
    for (const p of piles) {
      if (drained >= amount - FOOD_EPSILON) break;
      drained += this.takeFood(p.x, p.y, amount - drained).taken;
    }
    return drained;
  }

  /**
   * Spend food from the piles following the colony's consumption policy
   * (or `preferType` first when given), always draining the fullest piles of
   * each type first. Returns the per-type breakdown so callers can mirror
   * the deduction onto the aggregate ledger.
   */
  drainFood(amount: number, preferType?: PantryFoodType): { leaf: number; mushroom: number; meat: number; total: number } {
    const result = { leaf: 0, mushroom: 0, meat: 0, total: 0 };
    if (amount <= 0) return result;

    const order: PantryFoodType[] = preferType
      ? [preferType, ...PANTRY_TYPES.filter((t) => t !== preferType)]
      : this.getConsumptionOrder();

    let remaining = amount;
    for (const type of order) {
      if (remaining <= FOOD_EPSILON) break;
      const drained = this.drainFoodOfType(type, remaining);
      result[type] += drained;
      result.total += drained;
      remaining -= drained;
    }
    return result;
  }

  /** True if at least one pantry tile can accept a deposit (of any of `types`, or anything when omitted) */
  hasDepositSpace(types?: PantryFoodType[]): boolean {
    const cap = this.getPantryTileCapacity();
    for (const t of this.getPantryTiles()) {
      if (!t.food || t.food.amount <= FOOD_EPSILON) return true; // empty tile accepts any type
      if (t.food.amount < cap - FOOD_EPSILON && (!types || types.includes(t.food.type))) return true;
    }
    return false;
  }
}
