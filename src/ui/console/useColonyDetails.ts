import { useCallback, useEffect, useState } from 'react';
import type { GameManager, UpgradeInfo } from '../../game/GameManager';

export interface EggInfo {
  role: string;
  progress: number;
  /** Only incubating eggs report feeding (queued eggs do not) */
  fedProgress?: number;
}

/** Colony state the console needs beyond the pushed GameStats; polled twice a second. */
export interface ColonyDetails {
  food: { total: number; leaves: number; mushrooms: number; meat: number };
  queen: { health: number; maxHealth: number; hunger: number; maxHunger: number; isLaying: boolean } | null;
  eggQueue: EggInfo[];
  activeEggs: EggInfo[];
  farm: { tiles: number; rate: number; status: string; stored: number; capacity: number };
  eatFirst: 'leaf' | 'mushroom' | 'meat';
  garrison: { target: number; current: number };
  upgrades: UpgradeInfo[];
  storageTiles: number;
}

const EMPTY: ColonyDetails = {
  food: { total: 0, leaves: 0, mushrooms: 0, meat: 0 },
  queen: null,
  eggQueue: [],
  activeEggs: [],
  farm: { tiles: 0, rate: 0, status: 'sin-tiles', stored: 0, capacity: 0 },
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
    eggQueue: gm.getEggQueue(),
    activeEggs: gm.getActiveEggs(),
    farm: gm.getFarmStatus(),
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
