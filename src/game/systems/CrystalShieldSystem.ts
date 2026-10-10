import type { System } from '../../engine/ecs/types';
import type { World } from '../../engine/ecs/World';
import { COMPONENT, type CrystalUnitComponent, type PositionComponent } from '../components/components';
import { ownerOf } from '../factions/factions';
import { CRYSTAL_QUEEN_POWERS } from '../rival/crystalRival';
import { regenerateShield, type ShieldComponent } from '../rival/crystalShield';

interface AuraSource {
  id: number;
  x: number;
  y: number;
  owner: number | null;
}

/**
 * Refills every Crystal shield once its bearer has been out of combat for a
 * while (CombatSystem drains them). A living Crystal Queen's aura makes the
 * shields of her allies nearby refill faster, even mid-fight.
 */
export class CrystalShieldSystem implements System {
  readonly name = 'CrystalShieldSystem';
  readonly priority = 7.5; // right after Combat (7)

  private world: World;
  private auras: AuraSource[] = [];

  constructor(world: World) {
    this.world = world;
  }

  update(dt: number): void {
    const shielded = this.world.query(COMPONENT.SHIELD);
    if (shielded.length === 0) return;
    this.collectAuras();
    for (const id of shielded) {
      const shield = this.world.getComponent<ShieldComponent>(id, COMPONENT.SHIELD)!;
      const inAura = this.auras.length > 0 && this.inAura(id);
      regenerateShield(shield, dt, inAura ? { rateMult: CRYSTAL_QUEEN_POWERS.auraRegenMult, ignoreDelay: true } : {});
    }
  }

  private collectAuras(): void {
    this.auras.length = 0;
    for (const id of this.world.query(COMPONENT.CRYSTAL_UNIT, COMPONENT.POSITION)) {
      if (this.world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT)!.kind !== 'queen') continue;
      const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
      this.auras.push({ id, x: pos.x, y: pos.y, owner: ownerOf(this.world, id) });
    }
  }

  /** Close to a queen of its own side; a queen's aura never feeds her own shield */
  private inAura(id: number): boolean {
    const pos = this.world.getComponent<PositionComponent>(id, COMPONENT.POSITION);
    if (!pos) return false;
    const owner = ownerOf(this.world, id);
    return this.auras.some((a) => a.id !== id && a.owner === owner && Math.hypot(a.x - pos.x, a.y - pos.y) <= CRYSTAL_QUEEN_POWERS.auraRadius);
  }
}
