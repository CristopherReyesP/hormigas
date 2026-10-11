import { useEffect, useState } from 'react';
import type { GameManager } from '../../game/GameManager';
import type { ColonyStatsReport } from '../../game/upgrades/colonyStats';
import type { UpgradeInfo } from '../../game/upgrades/upgradeView';
import type { UpgradeFunds } from '../../game/upgrades/purchase';
import { UpgradesPanel } from './UpgradesPanel';
import type { UpgradeTab } from './upgradeUi';

interface UpgradesOverlayProps {
  gm: GameManager;
  upgrades: readonly UpgradeInfo[];
  funds: UpgradeFunds;
  tab: UpgradeTab;
  touch: boolean;
  onClose: () => void;
  /** Re-read stats and details right after a purchase */
  refresh: () => void;
}

const REPORT_POLL_MS = 500;

/** The Mejoras panel wired to the GameManager: buys, and keeps the Estadísticas numbers fresh while open. */
export function UpgradesOverlay({ gm, upgrades, funds, tab, touch, onClose, refresh }: UpgradesOverlayProps) {
  const [report, setReport] = useState<ColonyStatsReport | null>(() => gm.getColonyStatsReport());
  useEffect(() => {
    const timer = window.setInterval(() => setReport(gm.getColonyStatsReport()), REPORT_POLL_MS);
    return () => window.clearInterval(timer);
  }, [gm]);

  return (
    <UpgradesPanel
      upgrades={upgrades}
      report={report}
      funds={funds}
      initialTab={tab}
      mutations={gm.getAppliedMutations()}
      touch={touch}
      onClose={onClose}
      onBuy={(id) => {
        const ok = gm.purchaseUpgrade(id);
        refresh();
        setReport(gm.getColonyStatsReport());
        return ok;
      }}
    />
  );
}
