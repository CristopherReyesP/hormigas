import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  Layer,
  type AntComponent,
  type LayerComponent,
  type LayerValue,
  type SelectableComponent,
  type PositionComponent,
} from '../components/components';
import { findStructureAt } from './helpers/playerOrders';

/** A rectangle in entity-position space (tile units, fractional). */
export interface SelectionBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ClickOptions {
  /** Only entities on this layer can be picked (default: any layer) */
  layer?: LayerValue;
  /** Shift-click: toggle an own ant in or out of the group */
  additive?: boolean;
}

/** Click reach: the nearest selectable within this many tiles is picked. */
const CLICK_RANGE = 2;
/** A selectable this close to the click is right under the cursor: it beats a base drawn behind it. */
const DIRECT_HIT_RANGE = 0.75;
/** Box slack (tiles) so an ant whose body straddles the edge still counts. */
const BOX_SLACK = 0.3;

/**
 * StarCraft-style selection. One click picks one entity (an ant, food, the
 * nest, wildlife); a box or a shift-click builds a group, but only of the
 * player's own ants on the layer being viewed. The selected flag on
 * SelectableComponent mirrors the list for the renderer.
 */
export class SelectionSystem implements System {
  readonly name = 'SelectionSystem';
  readonly priority = 100; // run late
  private world: World;
  private selected: EntityId[] = [];
  /** Layer the group was picked on; ants that leave it drop out */
  private selectionLayer: LayerValue | null = null;

  constructor(world: World) {
    this.world = world;
  }

  /** Drop dead entities, and ants that went to another layer (down the shaft). */
  update(_dt: number): void {
    if (this.selected.length === 0) return;
    const kept = this.selected.filter((id) => {
      if (!this.world.hasEntity(id)) return false;
      if (!this.isAnt(id) || this.selectionLayer === null) return true;
      return this.layerOf(id) === this.selectionLayer;
    });
    if (kept.length !== this.selected.length) this.setSelection(kept, this.selectionLayer);
  }

  selectAt(tileX: number, tileY: number, options: ClickOptions = {}): void {
    const nearest = this.nearestAt(tileX, tileY, options.layer);

    if (options.additive) {
      // Shift-click on ground changes nothing; on an own ant it toggles it in the group
      if (nearest === null || !this.isAnt(nearest)) {
        if (nearest !== null) this.setSelection([nearest], this.layerOf(nearest));
        return;
      }
      const group = this.selected.filter((id) => this.isAnt(id));
      const at = group.indexOf(nearest);
      if (at >= 0) group.splice(at, 1);
      else group.push(nearest);
      this.setSelection(group, this.layerOf(nearest));
      return;
    }

    this.setSelection(nearest === null ? [] : [nearest], nearest === null ? null : this.layerOf(nearest));
  }

  /**
   * Box select: every own ant on `layer` inside `box`. An empty box keeps the
   * current selection (as in StarCraft II); `additive` (shift) adds to the group.
   * Returns how many ants the box caught.
   */
  selectInBox(box: SelectionBox, layer: LayerValue, additive = false): number {
    const caught = this.antsInBox(box, layer);
    if (caught.length === 0) return 0;
    if (additive && this.selectionLayer === layer) {
      const group = this.selected.filter((id) => this.isAnt(id));
      for (const id of caught) if (!group.includes(id)) group.push(id);
      this.setSelection(group, layer);
    } else {
      this.setSelection(caught, layer);
    }
    return caught.length;
  }

  /** Ctrl-click: the clicked own ant and every ant of its caste inside `view`. */
  selectSameCaste(tileX: number, tileY: number, view: SelectionBox, layer: LayerValue): void {
    const clicked = this.nearestAt(tileX, tileY, layer);
    if (clicked === null || !this.isAnt(clicked)) {
      this.selectAt(tileX, tileY, { layer });
      return;
    }
    const role = this.world.getComponent<AntComponent>(clicked, COMPONENT.ANT)!.role;
    const group = this.antsInBox(view, layer).filter(
      (id) => this.world.getComponent<AntComponent>(id, COMPONENT.ANT)!.role === role,
    );
    if (!group.includes(clicked)) group.unshift(clicked);
    this.setSelection(group, layer);
  }

  /** The own ant drawn right under (tileX, tileY) on `layer`, or null: a tap on it picks it instead of ordering. */
  antAt(tileX: number, tileY: number, layer: LayerValue): EntityId | null {
    let best: EntityId | null = null;
    let bestDist = DIRECT_HIT_RANGE;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.SELECTABLE, COMPONENT.POSITION)) {
      if (this.layerOf(id) !== layer) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const dist = Math.hypot(pos.x - tileX, pos.y - tileY);
      if (dist <= bestDist) {
        bestDist = dist;
        best = id;
      }
    }
    return best;
  }

  /**
   * The own ant on `layer` nearest to (tileX, tileY) within `radius` tiles, or
   * null: a finger tap's pick (touchPickRadiusTiles). Food, wildlife and
   * bases never win over an ant here. Ants in `skip` are passed over.
   */
  nearestOwnAnt(tileX: number, tileY: number, layer: LayerValue, radius: number, skip?: ReadonlySet<EntityId>): EntityId | null {
    let best: EntityId | null = null;
    let bestDist = radius;
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.SELECTABLE, COMPONENT.POSITION)) {
      if (skip?.has(id) || this.layerOf(id) !== layer) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const dist = Math.hypot(pos.x - tileX, pos.y - tileY);
      if (dist <= bestDist) {
        bestDist = dist;
        best = id;
      }
    }
    return best;
  }

  /** Whatever selectable is drawn right under (tileX, tileY) on `layer` (food, the nest, an ant), or null. */
  directHitAt(tileX: number, tileY: number, layer: LayerValue): EntityId | null {
    const nearest = this.nearestPoint(tileX, tileY, layer);
    return nearest !== null && nearest.dist <= DIRECT_HIT_RANGE ? nearest.id : null;
  }

  /** Select exactly these own ants on `layer` (a control group recall); anything else is left out. */
  selectAnts(ids: readonly EntityId[], layer: LayerValue): number {
    const group = ids.filter((id, i) => ids.indexOf(id) === i && this.isAnt(id) && this.layerOf(id) === layer);
    this.setSelection(group, layer);
    return group.length;
  }

  /** Narrow the selection to one entity (a click on its card in the group panel). */
  selectOnly(id: EntityId): void {
    if (!this.world.hasEntity(id)) return;
    this.setSelection([id], this.layerOf(id));
  }

  getSelectedIds(): readonly EntityId[] {
    return this.selected;
  }

  /** The selected entity when exactly one is selected; null for none or a group. */
  getSelectedEntityId(): EntityId | null {
    return this.selected.length === 1 ? this.selected[0] : null;
  }

  /** Selected own ants (a single selected ant counts). */
  getSelectedAnts(): EntityId[] {
    return this.selected.filter((id) => this.isAnt(id));
  }

  clearSelection(): void {
    this.setSelection([], null);
  }

  private antsInBox(box: SelectionBox, layer: LayerValue): EntityId[] {
    const caught: EntityId[] = [];
    for (const id of this.world.query(COMPONENT.ANT, COMPONENT.SELECTABLE, COMPONENT.POSITION)) {
      if (this.layerOf(id) !== layer) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      if (
        pos.x >= box.minX - BOX_SLACK && pos.x <= box.maxX + BOX_SLACK &&
        pos.y >= box.minY - BOX_SLACK && pos.y <= box.maxY + BOX_SLACK
      ) caught.push(id);
    }
    return caught;
  }

  /**
   * What a click at (tileX, tileY) picks: something right under the cursor,
   * else a base whose big sprite covers the spot (a den, the hive), else the
   * nearest selectable within CLICK_RANGE.
   */
  private nearestAt(tileX: number, tileY: number, layer?: LayerValue): EntityId | null {
    const nearest = this.nearestPoint(tileX, tileY, layer);
    if (nearest !== null && nearest.dist <= DIRECT_HIT_RANGE) return nearest.id;
    if (layer === undefined || layer === Layer.Surface) {
      const base = findStructureAt(this.world, { x: tileX, y: tileY });
      if (base !== null && this.world.getComponent(base, COMPONENT.SELECTABLE)) return base;
    }
    return nearest?.id ?? null;
  }

  private nearestPoint(tileX: number, tileY: number, layer?: LayerValue): { id: EntityId; dist: number } | null {
    let nearest: EntityId | null = null;
    let nearestDist = CLICK_RANGE;
    for (const id of this.world.query(COMPONENT.SELECTABLE, COMPONENT.POSITION)) {
      if (layer !== undefined && this.layerOf(id) !== layer) continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      const dist = Math.hypot(pos.x - tileX, pos.y - tileY);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = id;
      }
    }
    return nearest === null ? null : { id: nearest, dist: nearestDist };
  }

  private setSelection(ids: EntityId[], layer: LayerValue | null): void {
    for (const id of this.selected) this.flag(id, false);
    this.selected = ids;
    this.selectionLayer = ids.length > 0 ? layer : null;
    for (const id of ids) this.flag(id, true);
  }

  private flag(id: EntityId, on: boolean): void {
    const selectable = this.world.getComponent<SelectableComponent>(id, COMPONENT.SELECTABLE);
    if (selectable) selectable.selected = on;
  }

  private isAnt(id: EntityId): boolean {
    return this.world.getComponent<AntComponent>(id, COMPONENT.ANT) !== undefined;
  }

  private layerOf(id: EntityId): LayerValue | null {
    return this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? null;
  }
}
