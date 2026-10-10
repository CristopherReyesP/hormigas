import { useCallback, useEffect, useState } from 'react';
import type { BroodSnapshot, GameManager, UpgradeInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';

/** Colony state the console needs beyond the pushed GameStats; polled twice a second. */
export interface ColonyDetails {
  food: { total: number; leaves: number; mushrooms: number; meat: number };
  queen: { health: number; maxHealth: number; hunger: number; maxHunger: number; isLaying: boolean } | null;
  brood: BroodSnapshot;
  farm: { tiles: number; rate: number; status: string; stored: number; capacity: number };
  /** The farm tile the player tapped, with its growth line */
  farmTile: { x: number; y: number; progress: number; ready: boolean; label: string } | null;
  eatFirst: 'leaf' | 'mushroom' | 'meat';
  garrison: { target: number; current: number };
  upgrades: UpgradeInfo[];
  storageTiles: number;
}

const EMPTY: ColonyDetails = {
  food: { total: 0, leaves: 0, mushrooms: 0, meat: 0 },
  queen: null,
  brood: {
    pantry: { stored: 0, capacity: 0, tiles: 0 },
    surfaceStock: 0,
    hasQueen: false,
    queenCanLay: false,
    queue: [],
    maxQueuedPerRole: 0,
    eggs: [],
    incubation: { tiles: 0, freeSlots: 0 },
    nurses: 0,
    costs: {
      [AntRole.Worker]: 0,
      [AntRole.Soldier]: 0,
      [AntRole.Scout]: 0,
      [AntRole.Nurse]: 0,
      [AntRole.Defender]: 0,
    },
  },
  farm: { tiles: 0, rate: 0, status: 'sin-tiles', stored: 0, capacity: 0 },
  farmTile: null,
  eatFirst: 'leaf',
  garrison: { target: 0, current: 0 },
  upgrades: [],
  storageTiles: 0,
};

const POLL_MS = 500;

function read(gm: GameManager): ColonyDetails {
  return {
    food: gm.getColonyFood(),
    queen: gm.getQueenStats(),
    brood: gm.getBroodSnapshot(),
    farm: gm.getFarmStatus(),
    farmTile: gm.getFocusedFarmTile(),
    eatFirst: gm.getConsumptionPriority(),
    garrison: gm.getGarrisonInfo(),
    upgrades: gm.getUpgrades(),
    storageTiles: gm.getStorageTileCount(),
  };
}

/** Returns the latest details and a `refresh` to re-read right after a command. */
export function useColonyDetails(gm: GameManager | null): [ColonyDetails, () => void] {
  const [details, setDetails] = useState<ColonyDetails>(EMPTY);

  const refresh = useCallback(() => {
    if (gm) setDetails(read(gm));
  }, [gm]);

  useEffect(() => {
    if (!gm) return;
    const update = () => setDetails(read(gm));
    update();
    const interval = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(interval);
  }, [gm]);

  return [details, refresh];
}
