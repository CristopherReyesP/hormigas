// How the run was lost. The GameManager feeds a CoreDamageLedger every tick
// with the core's health (the Swarm queen, the Human command center or the
// Crystal Hive): what took it away (hunger or which enemies) is kept over a
// sliding window, and when the core falls the ledger names the cause. The end
// screen and its tip read deathCauseText().

import type { World } from '../../engine/ecs/World';
import type { EntityId } from '../../shared/types';
import {
  COMPONENT,
  Layer,
  type CombatComponent,
  type CrystalUnitComponent,
  type HealthComponent,
  type LayerComponent,
  type LayerValue,
  type PositionComponent,
} from '../components/components';
import { FactionId, isHostileTo } from '../factions/factions';
import { CRYSTAL_UNIT_NAME } from '../rival/crystalNames';
import { HUMAN_COMPONENT, type HumanUnitComponent } from '../rival/humanComponents';
import { HUMAN_UNIT_NAME } from '../rival/humanInfo';
import { LEAPER_NAME } from '../../shared/wildlifeNames';
import { BOSS_COMPONENT, type BossComponent } from './miniBoss';
import type { RaceId } from './RunSetup';

/** What the run's life was: the Swarm's queen, the Humans' command center, the Crystal Hive */
export type CoreKind = 'queen' | 'command_center' | 'hive';

export interface AttackerTally {
  /** Player-facing name, in neutral Spanish */
  name: string;
  /** Distinct units of that kind that hurt the core in its last moments */
  count: number;
}

export type DeathCause =
  | { kind: 'starvation'; core: 'queen' }
  | { kind: 'invaders'; core: CoreKind; attackers: AttackerTally[] }
  | { kind: 'unknown'; core: CoreKind };

/** Damage older than this (seconds) weighs e times less: the cause is what happened lately */
export const DEATH_CAUSE_DECAY_SECONDS = 30;
/** Attackers that last hurt the core this long ago (seconds) or less are named */
export const DEATH_CAUSE_ATTACKER_WINDOW = 30;
/** Hostile units this close (tiles) to the core while it loses health are biting it */
const BITE_RADIUS: Record<CoreKind, number> = { queen: 2.5, command_center: 4, hive: 4 };

/** The player-facing name of a unit that hurt the core */
export function attackerName(world: World, id: EntityId): string {
  const boss = world.getComponent<BossComponent>(id, BOSS_COMPONENT);
  if (boss) return boss.name;
  const crystal = world.getComponent<CrystalUnitComponent>(id, COMPONENT.CRYSTAL_UNIT);
  if (crystal) return CRYSTAL_UNIT_NAME[crystal.kind] ?? 'Unidad de cristal';
  const human = world.getComponent<HumanUnitComponent>(id, HUMAN_COMPONENT.UNIT);
  if (human) return HUMAN_UNIT_NAME[human.type] ?? 'Humano';
  if (world.getComponent(id, COMPONENT.BEETLE)) return 'Acorazado';
  if (world.getComponent(id, COMPONENT.CRICKET)) return LEAPER_NAME.one;
  if (world.getComponent(id, COMPONENT.ANT)) return 'Hormiga';
  return 'Enemigo';
}

/**
 * Keeps, for one core, the recent health it lost to hunger and to attacks,
 * and who attacked. Call begin() before the simulation tick and end() after.
 */
export class CoreDamageLedger {
  private time = 0;
  private starved = 0;
  private attacked = 0;
  private attackers = new Map<EntityId, { name: string; at: number }>();
  private coreId: EntityId | null = null;
  private before: number | null = null;
  private starvingBefore = false;
  private lastPos: { x: number; y: number; layer: LayerValue } | null = null;

  readonly core: CoreKind;

  constructor(core: CoreKind) {
    this.core = core;
  }

  /** The core's health before the tick (`starving`: the queen's hunger is at 0) */
  begin(world: World, coreId: EntityId | null, starving = false): void {
    this.coreId = coreId;
    this.starvingBefore = starving;
    if (coreId === null || !world.hasEntity(coreId)) {
      this.before = null;
      return;
    }
    this.before = world.getComponent<HealthComponent>(coreId, COMPONENT.HEALTH)?.current ?? null;
    const pos = world.getComponent<PositionComponent>(coreId, COMPONENT.POSITION);
    if (pos) this.lastPos = { x: pos.x, y: pos.y, layer: world.getComponent<LayerComponent>(coreId, COMPONENT.LAYER)?.layer ?? Layer.Surface };
  }

  /**
   * After the tick: split what the core lost into hunger (`starveRate` HP/s
   * while starving, before or after the tick) and attacks, and note the
   * hostile units at it.
   */
  end(world: World, dt: number, starving = false, starveRate = 0): void {
    const decay = Math.exp(-dt / DEATH_CAUSE_DECAY_SECONDS);
    this.time += dt;
    this.starved *= decay;
    this.attacked *= decay;
    if (this.before === null || this.coreId === null) return;
    const alive = world.hasEntity(this.coreId);
    const now = alive ? world.getComponent<HealthComponent>(this.coreId, COMPONENT.HEALTH)?.current ?? 0 : 0;
    const lost = Math.max(0, this.before - Math.max(0, now));
    if (lost <= 0) return;
    const fromHunger = this.starvingBefore || starving ? Math.min(lost, starveRate * dt) : 0;
    this.starved += fromHunger;
    const fromAttacks = lost - fromHunger;
    if (fromAttacks <= 1e-6) return;
    this.attacked += fromAttacks;
    this.noteAttackers(world);
  }

  private noteAttackers(world: World): void {
    const at = this.lastPos;
    const radius = BITE_RADIUS[this.core];
    for (const id of world.query(COMPONENT.COMBAT, COMPONENT.POSITION)) {
      if (!isHostileTo(world, FactionId.PLAYER, id)) continue;
      const combat = world.getComponent<CombatComponent>(id, COMPONENT.COMBAT)!;
      let biting = combat.targetEntityId === this.coreId;
      if (!biting && at) {
        const layer = world.getComponent<LayerComponent>(id, COMPONENT.LAYER)?.layer ?? Layer.Surface;
        const pos = world.getComponent<PositionComponent>(id, COMPONENT.POSITION)!;
        biting = layer === at.layer && Math.hypot(pos.x - at.x, pos.y - at.y) <= radius;
      }
      if (biting) this.attackers.set(id, { name: attackerName(world, id), at: this.time });
    }
  }

  /** Why the core fell, from what took its health lately */
  cause(): DeathCause {
    if (this.core === 'queen' && this.starved > 0 && this.starved >= this.attacked) return { kind: 'starvation', core: 'queen' };
    const tally = new Map<string, number>();
    for (const { name, at } of this.attackers.values()) {
      if (this.time - at > DEATH_CAUSE_ATTACKER_WINDOW) continue;
      tally.set(name, (tally.get(name) ?? 0) + 1);
    }
    if (this.attacked <= 0 && tally.size === 0) return { kind: 'unknown', core: this.core };
    const attackers = [...tally].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { kind: 'invaders', core: this.core, attackers };
  }
}

/** The core a race lives by */
export function coreKindOf(race: RaceId): CoreKind {
  return race === 'human' ? 'command_center' : race === 'crystal' ? 'hive' : 'queen';
}

/** "Acorazado ×3, Dron de cristal ×2" (the three most numerous kinds) */
export function attackerList(attackers: readonly AttackerTally[]): string {
  return attackers.slice(0, 3).map((a) => (a.count > 1 ? `${a.name} ×${a.count}` : a.name)).join(', ');
}

const FALLEN: Record<CoreKind, { invaders: string; plain: string }> = {
  queen: { invaders: 'La reina cayó ante los invasores', plain: 'La reina murió' },
  command_center: { invaders: 'El Centro de mando fue destruido', plain: 'El Centro de mando fue destruido' },
  hive: { invaders: 'La Colmena fue destruida', plain: 'La Colmena fue destruida' },
};

const DEFENSE_TIP: Record<CoreKind, string> = {
  queen: 'Construye Espinas en la entrada y deja soldados o defensores de guardia en el nido.',
  command_center: 'Rodea el Centro de mando con búnkeres y entrena soldados antes de cada noche.',
  hive: 'Levanta agujas de centinelas cerca de la Colmena y produce unidades antes de cada noche.',
};

/** The end screen's line on how the run was lost, and one tip for the next run */
export function deathCauseText(cause: DeathCause): { line: string; tip: string } {
  if (cause.kind === 'starvation') {
    return {
      line: 'La reina murió de hambre',
      tip: 'Mantén comida en la despensa para la reina: las nodrizas la alimentan desde ahí.',
    };
  }
  const fallen = FALLEN[cause.core];
  if (cause.kind === 'unknown') return { line: fallen.plain, tip: DEFENSE_TIP[cause.core] };
  const list = attackerList(cause.attackers);
  const line = list ? `${fallen.invaders} (${list})` : fallen.invaders;
  const colossus = cause.attackers.some((a) => a.name === 'Acorazado Colosal');
  const tip = colossus && cause.core === 'queen'
    ? 'El Acorazado Colosal asedia la entrada antes de entrar: atácalo con soldados mientras golpea el montículo.'
    : DEFENSE_TIP[cause.core];
  return { line, tip };
}
