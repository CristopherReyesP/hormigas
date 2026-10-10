// What an elite or a boss leaves behind when it dies. CombatSystem calls
// onWaveUnitDeath for every death, before the body is destroyed.

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import { COMPONENT, Layer, type LayerComponent, type PositionComponent } from '../components/components';
import { FactionId, ownerOf } from '../factions/factions';
import { ELITE_TUNING, eliteOf } from './eliteAffixes';
import { bossOf } from './miniBoss';
import { pushWaveFx, waveRuntimeFor } from './waveRuntime';

/** An Explosivo elite arms its blast; a mini-boss queues its reward */
export function onWaveUnitDeath(world: World, id: EntityId): void {
  const elite = eliteOf(world, id);
  const boss = bossOf(world, id);
  if (!elite && !boss) return;
  const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
  if (!pos) return;
  const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
  const rt = waveRuntimeFor(world);
  if (elite?.affix === 'explosive') {
    rt.explosions.push({
      x: pos.x,
      y: pos.y,
      layer,
      timer: ELITE_TUNING.explosionDelay,
      delay: ELITE_TUNING.explosionDelay,
      radius: ELITE_TUNING.explosionRadius,
      damage: ELITE_TUNING.explosionDamage,
      faction: ownerOf(world, id) ?? FactionId.WILDLIFE,
    });
    pushWaveFx(world, { kind: 'telegraph', x: pos.x, y: pos.y, layer, radius: ELITE_TUNING.explosionRadius, life: ELITE_TUNING.explosionDelay });
  }
  if (boss && boss.kind !== 'crystal_queen') {
    rt.bossKills.push({ id, name: boss.name, x: pos.x, y: pos.y, layer });
  }
}
