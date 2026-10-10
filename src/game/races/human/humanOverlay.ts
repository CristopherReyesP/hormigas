// What a Human player sees over their base, drawn in world px after the
// Human sprites: selection rings, a team mark under their own troops, the
// ore a builder carries, rally lines, and the build ghost (the building's
// art, green on a valid spot, red on a bad one).

import type { World } from '../../../engine/ecs/World';
import { TILE_SIZE } from '../../../shared/constants';
import { PAL } from '../../../engine/renderer/pixelart/palette';
import { UNIT_ART_PX } from '../../../engine/renderer/crystalUnits';
import { COMPONENT, type PositionComponent, type SelectableComponent } from '../../components/components';
import { HUMAN_BUILDING_STATS, HUMAN_UNIT_STATS } from '../../rival/humanBase';
import { HUMAN_COMPONENT, type HumanBuildingComponent, type HumanUnitComponent } from '../../rival/humanComponents';
import { drawHumanBuilding } from '../../rival/humanArt';
import { HUMAN_PLAYER_COMPONENT, type HumanProducerComponent, type HumanWorkerComponent } from './humanPlayerComponents';
import { footprintRadius } from './humanPlayerRules';
import { isPlayerOwned } from './humanPlayerQueries';
import type { HumanPlayerRun } from './HumanPlayerRun';

type Ctx = CanvasRenderingContext2D;

const OWN = '#7dff6a';
const FOE = '#ff5a4a';
const ORE = '#5fe6ff';

function center(v: number): number {
  return v * TILE_SIZE + TILE_SIZE / 2;
}

function ring(ctx: Ctx, x: number, y: number, rx: number, color: string, width = 2): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawHumanPlayerOverlay(ctx: Ctx, world: World, human: HumanPlayerRun, interpolation: number, time: number): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  for (const id of world.query(HUMAN_COMPONENT.UNIT, COMPONENT.POSITION)) {
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const unit = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT)!;
    const x = center(pos.prevX + (pos.x - pos.prevX) * interpolation);
    const y = center(pos.prevY + (pos.y - pos.prevY) * interpolation) + TILE_SIZE * 0.3;
    const mine = isPlayerOwned(world, id);
    const r = TILE_SIZE * HUMAN_UNIT_STATS[unit.type].size * 1.2;
    const selected = world.getComponent<SelectableComponent>(id, COMPONENT.SELECTABLE)?.selected;
    if (selected) ring(ctx, x, y, r + 3, mine ? OWN : FOE, 3);
    else if (mine) {
      ctx.globalAlpha = 0.45;
      ring(ctx, x, y, r, OWN, 2);
      ctx.globalAlpha = 1;
    }
    const worker = world.getComponent<HumanWorkerComponent>(id, HUMAN_PLAYER_COMPONENT.WORKER);
    if (worker && worker.carrying > 0) {
      // A chunk of ore on the builder's back
      ctx.fillStyle = ORE;
      ctx.fillRect(Math.round(x + r * 0.4), Math.round(y - TILE_SIZE * 1.1), 6, 6);
      ctx.fillStyle = PAL.white;
      ctx.fillRect(Math.round(x + r * 0.4) + 1, Math.round(y - TILE_SIZE * 1.1) + 1, 2, 2);
    }
  }

  for (const id of world.query(HUMAN_COMPONENT.BUILDING, COMPONENT.POSITION)) {
    if (!world.getComponent<SelectableComponent>(id, COMPONENT.SELECTABLE)?.selected) continue;
    const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
    const kind = world.getComponent<HumanBuildingComponent>(id, HUMAN_COMPONENT.BUILDING)!.kind;
    const half = HUMAN_BUILDING_STATS[kind].halfWidth * TILE_SIZE;
    const mine = isPlayerOwned(world, id);
    ring(ctx, center(pos.x), center(pos.y) + half * 0.5, half + 6, mine ? OWN : FOE, 3);
    const producer = world.getComponent<HumanProducerComponent>(id, HUMAN_PLAYER_COMPONENT.PRODUCER);
    if (mine && producer?.rally) drawRally(ctx, center(pos.x), center(pos.y), center(producer.rally.x), center(producer.rally.y), time);
  }

  const ghost = human.ghostInfo();
  if (ghost) {
    const r = footprintRadius(ghost.kind);
    const color = ghost.valid ? OWN : FOE;
    const left = center(ghost.x - r) - TILE_SIZE / 2;
    const top = center(ghost.y - r) - TILE_SIZE / 2;
    const size = (r * 2 + 1) * TILE_SIZE;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = color;
    ctx.fillRect(left, top, size, size);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(left, top, size, size);
    ctx.setLineDash([]);
    ctx.globalAlpha = ghost.valid ? 0.6 : 0.35;
    const ground = center(ghost.y) + HUMAN_BUILDING_STATS[ghost.kind].halfWidth * TILE_SIZE * 0.5;
    drawHumanBuilding(ctx, ghost.kind, center(ghost.x), ground, UNIT_ART_PX, { progress: 1, time });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawRally(ctx: Ctx, fromX: number, fromY: number, x: number, y: number, time: number): void {
  ctx.strokeStyle = OWN;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.setLineDash([4, 6]);
  ctx.lineDashOffset = -Math.floor(time * 20);
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  // A small flag on a pole
  ctx.fillStyle = PAL.human.outline;
  ctx.fillRect(Math.round(x) - 1, Math.round(y) - 22, 3, 24);
  ctx.fillStyle = OWN;
  ctx.fillRect(Math.round(x) + 2, Math.round(y) - 22, 12, 8);
}
