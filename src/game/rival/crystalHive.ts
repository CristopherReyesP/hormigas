// The Crystal Hive rival, pure rules: unit stats, the production clock and the
// night-wave script. No World, no randomness, so the same inputs always give
// the same hive. CrystalHiveSystem and CrystalUnitAISystem apply these.

import type { EntityId } from '../../shared/types';

/** Crystal drone, the tier-1 Crystal unit (P4 table: 220 HP, 18 damage per 1.5 s, melee). Shields come later. */
export const CRYSTAL_DRONE_STATS = {
  health: 220,
  damage: 18,
  attackCooldown: 1.5,
  /** Melee, the same reach as a soldier's bite */
  attackRange: 1.2,
  /** Tiles per second: the Crystal Hive is slow */
  speed: 1.3,
  visionRange: 7,
  /** Chases end this far from where the drone saw its prey */
  leashRange: 12,
  size: 0.5,
} as const;

/** The hive structure at the crater. */
export const CRYSTAL_HIVE_STATS = {
  health: 1500,
  /** Seconds between two crystallized drones */
  productionInterval: 36, // difficulty pass: was 45
  /** Idle drones the hive keeps at home; production waits while it is full */
  garrisonCap: 5, // difficulty pass: was 4
  /** Garrison drones keep within this many tiles of the hive */
  guardRadius: 4,
  size: 1.6,
} as const;

/** Drones per night: a 1-drone scout on night 1, then a rising curve that peaks on the final night. */
export const CRYSTAL_WAVE_SIZES: readonly number[] = [1, 2, 3, 4, 5, 6, 8];

/** How many drones the hive sends on `night` (1-based); later nights keep the last size. */
export function crystalWaveSize(night: number): number {
  if (!Number.isFinite(night) || night < 1) return 0;
  const index = Math.min(Math.floor(night), CRYSTAL_WAVE_SIZES.length) - 1;
  return CRYSTAL_WAVE_SIZES[index];
}

export interface ProductionStep {
  /** Seconds left until the next drone */
  timer: number;
  /** A drone crystallizes this step */
  spawn: boolean;
}

/**
 * Advance the hive's production clock by `dt`. When it runs out and the
 * garrison has room, one drone crystallizes and the clock restarts; while the
 * garrison is full the clock waits at zero, so the next drone comes as soon as
 * one leaves.
 */
export function stepHiveProduction(
  timer: number,
  dt: number,
  garrison: number,
  cap: number,
  interval: number = CRYSTAL_HIVE_STATS.productionInterval,
): ProductionStep {
  const next = Math.max(0, timer - dt);
  if (next > 0) return { timer: next, spawn: false };
  if (garrison >= cap) return { timer: 0, spawn: false };
  return { timer: interval, spawn: true };
}

export interface WavePlan {
  /** Garrison drones that leave for the assault */
  sent: EntityId[];
  /** Drones crystallized on the spot to fill the wave */
  crystallize: number;
}

/**
 * The wave for `size` drones: the garrison goes first, in the order given,
 * and the hive crystallizes the rest, so a wave always has its full size.
 */
export function planCrystalWave(size: number, garrison: readonly EntityId[]): WavePlan {
  const wanted = Math.max(0, Math.floor(size));
  const sent = garrison.slice(0, wanted);
  return { sent, crystallize: wanted - sent.length };
}
