import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  Layer,
  type HealthComponent,
  type LayerComponent,
  type LayerValue,
  type PositionComponent,
} from '../components/components';
import { isHostileTo, ownerOf } from '../factions/factions';
import { ELITE_COMPONENT, ELITE_TUNING, enrage, type EliteComponent } from '../run/eliteAffixes';
import { dealDamage, pushWaveFx, waveRuntimeFor } from '../run/waveRuntime';
import { emitAudio } from '../../audio/events';
import { HUMAN_COMPONENT } from '../rival/humanComponents';

/** What an Explosivo's blast can hurt: the colony (ants and the queen) */
// A Human player's units and buildings too (only enemies of the blast's side are hit)
const BLAST_STORES = [COMPONENT.ANT, COMPONENT.QUEEN_ENTITY, HUMAN_COMPONENT.UNIT, HUMAN_COMPONENT.BUILDING] as const;

/**
 * Runs the elite affixes that act over time: Sanador's healing pulse,
 * Furioso's rage under 30% health, and the Explosivo blasts armed by a death
 * (waveDeaths.ts), which go off after their telegraph.
 */
export class EliteSystem implements System {
  readonly name = 'EliteSystem';
  readonly priority = 6.5; // after the unit AIs, before CombatSystem (7) buries the dead

  private world: World;

  constructor(world: World) {
    this.world = world;
  }

  update(dt: number): void {
    for (const id of this.world.query(ELITE_COMPONENT, COMPONENT.HEALTH)) {
      const elite = this.world.getComponent<EliteComponent>(id, ELITE_COMPONENT)!;
      const health = this.world.getComponent<HealthComponent>(id, COMPONENT.HEALTH)!;
      if (health.current <= 0) continue;
      if (elite.affix === 'healer') this.heal(id, elite, dt);
      else if (elite.affix === 'furious' && !elite.enraged && health.current < health.max * ELITE_TUNING.furiousThreshold) {
        enrage(this.world, id, elite);
        const at = this.where(id);
        if (at) pushWaveFx(this.world, { kind: 'enrage', x: at.x, y: at.y, layer: at.layer, radius: 1.2, life: 0.8 });
      }
    }
    this.detonate(dt);
  }

  private where(id: EntityId): { x: number; y: number; layer: LayerValue } | null {
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
    if (!pos) return null;
    return { x: pos.x, y: pos.y, layer: this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface };
  }

  /** Sanador: every few seconds, hurt allies of its own side nearby regain a share of their health */
  private heal(id: EntityId, elite: EliteComponent, dt: number): void {
    elite.timer += dt;
    if (elite.timer < ELITE_TUNING.healerInterval) return;
    elite.timer -= ELITE_TUNING.healerInterval;
    const at = this.where(id);
    if (!at) return;
    const side = ownerOf(this.world, id);
    pushWaveFx(this.world, { kind: 'heal', x: at.x, y: at.y, layer: at.layer, radius: ELITE_TUNING.healerRadius, life: 0.9 });
    for (const other of this.world.query(COMPONENT.HEALTH, COMPONENT.POSITION)) {
      if (other === id || ownerOf(this.world, other) !== side) continue;
      if ((this.world.getComponent<LayerComponent>(other, COMPONENT.LAYER)?.layer ?? Layer.Surface) !== at.layer) continue;
      const pos = this.world.getComponent<PositionComponent>(other, COMPONENT.POSITION)!;
      if (Math.hypot(pos.x - at.x, pos.y - at.y) > ELITE_TUNING.healerRadius) continue;
      const health = this.world.getComponent<HealthComponent>(other, COMPONENT.HEALTH)!;
      if (health.current <= 0 || health.current >= health.max) continue;
      health.current = Math.min(health.max, health.current + Math.round(health.max * ELITE_TUNING.healerShare));
    }
  }

  /** Explosivo: tick each armed blast down; at zero it hurts every enemy of the dead elite's side in range */
  private detonate(dt: number): void {
    const rt = waveRuntimeFor(this.world);
    if (rt.explosions.length === 0) return;
    for (let i = rt.explosions.length - 1; i >= 0; i--) {
      const blast = rt.explosions[i];
      blast.timer -= dt;
      if (blast.timer > 0) continue;
      rt.explosions.splice(i, 1);
      pushWaveFx(this.world, { kind: 'blast', x: blast.x, y: blast.y, layer: blast.layer, radius: blast.radius, life: 0.6 });
      emitAudio({ type: 'waveFx', kind: 'explode', at: { x: blast.x, y: blast.y, layer: blast.layer } });
      for (const store of BLAST_STORES) {
        for (const id of this.world.query(store, COMPONENT.POSITION, COMPONENT.HEALTH)) {
          if (!isHostileTo(this.world, blast.faction, id)) continue;
          if ((this.world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface) !== blast.layer) continue;
          const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
          if (Math.hypot(pos.x - blast.x, pos.y - blast.y) > blast.radius) continue;
          dealDamage(this.world, id, blast.damage);
        }
      }
    }
  }
}
