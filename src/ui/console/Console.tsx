import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameManager, GameStats } from '../../game/GameManager';
import { NotificationStack } from '../NotificationStack';
import { buildCommands, BUILD_MODE_HINT, type BuildMode, type CardPage, type CommandDef, type NoticeTone } from './commands';
import { CommandCard } from './CommandCard';
import { InfoPanel } from './InfoPanel';
import { MinimapPanel } from './MinimapPanel';
import { useColonyDetails } from './useColonyDetails';

interface ConsoleProps {
  stats: GameStats;
  gameManager: GameManager | null;
  /** Pull a fresh stats snapshot (the sim stops pushing while paused) */
  refreshStats: () => void;
}

const NOTICE_MS = 3000;

function applyBuildMode(gm: GameManager | null, mode: BuildMode | null): void {
  if (!gm) return;
  gm.setDigMode(mode === 'dig');
  gm.setIncubationMode(mode === 'incubation');
  gm.setFarmMode(mode === 'farm');
  gm.setStorageMode(mode === 'storage');
  gm.setThroneMode(mode === 'throne');
  gm.setDefenseMode(mode === 'defense');
}

/** StarCraft-style bottom console: minimap · info panel · command card, plus the message feed. */
export function Console({ stats, gameManager, refreshStats }: ConsoleProps) {
  const [details, refreshDetails] = useColonyDetails(gameManager);
  const [page, setPage] = useState<CardPage>('root');
  const [buildMode, setBuildMode] = useState<BuildMode | null>(null);
  const [attackCount, setAttackCount] = useState(10);
  const [notice, setNotice] = useState<{ text: string; tone: NoticeTone } | null>(null);

  // Leaving the nest (any route) drops nest-only tools and pages
  const [seenLayer, setSeenLayer] = useState(stats.activeLayer);
  if (seenLayer !== stats.activeLayer) {
    setSeenLayer(stats.activeLayer);
    setPage('root');
    setBuildMode(null);
  }

  // Build modes live in the GameManager; keep them in step with the card
  useEffect(() => {
    applyBuildMode(gameManager, stats.activeLayer === 'underground' ? buildMode : null);
  }, [gameManager, buildMode, stats.activeLayer]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refresh = useCallback(() => {
    refreshStats();
    refreshDetails();
  }, [refreshStats, refreshDetails]);

  const switchLayer = useCallback(
    (layer: 'surface' | 'underground') => {
      if (!gameManager || gameManager.getActiveLayer() === layer) return;
      if (layer === 'underground') gameManager.enterUnderground();
      else gameManager.exitUnderground();
      refresh();
    },
    [gameManager, refresh],
  );

  const notify = useCallback((text: string, tone: NoticeTone = 'hint') => setNotice({ text, tone }), []);

  const explainBlocked = useCallback((command: CommandDef) => {
    if (command.disabledReason) setNotice({ text: command.disabledReason, tone: 'danger' });
  }, []);

  const toggleBuildMode = useCallback((mode: BuildMode) => {
    setBuildMode((current) => (current === mode ? null : mode));
  }, []);

  const onEscape = useCallback(() => {
    if (buildMode) setBuildMode(null);
    else if (page !== 'root') setPage('root');
    else if (stats.selectedEntity) gameManager?.clearSelection();
  }, [buildMode, page, stats.selectedEntity, gameManager]);

  const commands = useMemo(
    () =>
      gameManager
        ? buildCommands({
            gm: gameManager,
            stats,
            details,
            page,
            buildMode,
            attackCount,
            setPage,
            toggleBuildMode,
            switchLayer,
            refresh,
            notify,
          })
        : [],
    [gameManager, stats, details, page, buildMode, attackCount, toggleBuildMode, switchLayer, refresh, notify],
  );

  const hint = notice?.text ?? (buildMode ? BUILD_MODE_HINT[buildMode] : null);
  const overlayOpen = Boolean(stats.mutationOffer || stats.gameOver);

  return (
    <>
      <NotificationStack notifications={stats.notifications} hint={hint} hintTone={notice?.tone} />
      <footer className="hive-console">
        <div className="console-deck" aria-hidden="true">
          <div className="console-vein" />
        </div>
        <MinimapPanel gameManager={gameManager} activeLayer={stats.activeLayer} onSwitchLayer={switchLayer} />
        <InfoPanel
          stats={stats}
          details={details}
          gameManager={gameManager}
          attackCount={attackCount}
          onAttackCountChange={setAttackCount}
        />
        <CommandCard
          commands={commands}
          hotkeysEnabled={!overlayOpen && commands.length > 0}
          onEscape={onEscape}
          onBlocked={explainBlocked}
        />
      </footer>
    </>
  );
}
