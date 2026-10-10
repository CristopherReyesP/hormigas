import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameManager, GameStats } from '../../game/GameManager';
import { NotificationStack } from '../NotificationStack';
import { buildCommands, buildModeHint, commandTargetHint, isDefenseMode, type BuildMode, type CardPage, type CommandDef, type NoticeTone } from './commands';
import { CommandCard } from './CommandCard';
import { InfoPanel } from './InfoPanel';
import { MinimapPanel } from './MinimapPanel';
import { useColonyDetails } from './useColonyDetails';
import { useTouchUi } from '../layout/touch';
import { humanHint } from '../races/human/humanCommands';

interface ConsoleProps {
  stats: GameStats;
  gameManager: GameManager | null;
  /** Pull a fresh stats snapshot (the sim stops pushing while paused) */
  refreshStats: () => void;
}

const NOTICE_MS = 3000;

/** Nest tools only work underground; the defense tools on both layers */
function applyBuildMode(gm: GameManager | null, mode: BuildMode | null, layer: 'surface' | 'underground'): void {
  if (!gm) return;
  gm.setDefenseBuild(isDefenseMode(mode) ? mode : null);
  if (layer !== 'underground' || isDefenseMode(mode)) mode = null;
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
  const [groupAdd, setGroupAdd] = useState(false);
  const touch = useTouchUi();

  // Leaving the nest (any route) drops nest-only tools and pages
  const [seenLayer, setSeenLayer] = useState(stats.activeLayer);
  if (seenLayer !== stats.activeLayer) {
    setSeenLayer(stats.activeLayer);
    setPage('root');
    setBuildMode(null);
  }

  // Build modes live in the GameManager; keep them in step with the card
  useEffect(() => {
    applyBuildMode(gameManager, buildMode, stats.activeLayer);
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

  const hasSelection = Boolean(stats.selectedEntity || stats.selectedGroup);
  // The groups page belongs to a selection of own ants: it closes when they are gone
  const hasAnts = stats.activeLayer === 'surface' && Boolean(stats.selectedGroup || stats.selectedEntity?.type === 'ant');
  if (page === 'groups' && !hasAnts) setPage('root');
  // A Human builder's Construir menu closes when no builder is selected any more
  if (page === 'build' && !stats.human?.selectedBuilders) setPage('root');
  const placing = Boolean(stats.human?.placing);
  const onEscape = useCallback(() => {
    if (placing) gameManager?.getHumanPlayer()?.cancelPlacement();
    else if (stats.commandTarget) gameManager?.cancelCommandTarget();
    else if (buildMode) setBuildMode(null);
    else if (page !== 'root') setPage('root');
    else if (hasSelection) gameManager?.clearSelection();
  }, [placing, stats.commandTarget, buildMode, page, hasSelection, gameManager]);

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
            touch,
            groupAdd,
            setGroupAdd,
          })
        : [],
    [gameManager, stats, details, page, buildMode, attackCount, toggleBuildMode, switchLayer, refresh, notify, touch, groupAdd],
  );

  const areaHint = touch && stats.areaSelect ? 'SELECCIONAR ÁREA: arrastra el dedo para encerrar a tus hormigas' : null;
  const hint = notice?.text ?? humanHint(stats, touch) ?? commandTargetHint(stats.commandTarget, touch) ?? (buildMode ? buildModeHint(buildMode, touch) : areaHint);
  const overlayOpen = Boolean(stats.mutationOffer || stats.gameOver);

  return (
    <>
      <NotificationStack notifications={stats.notifications} hint={hint} hintTone={notice?.tone} />
      <footer className="hive-console">
        <div className="console-deck" aria-hidden="true">
          <div className="console-vein" />
        </div>
        <MinimapPanel
          gameManager={gameManager}
          activeLayer={stats.activeLayer}
          onSwitchLayer={switchLayer}
          invaders={{ underground: stats.nestAlert?.nestInvaders ?? 0, surface: stats.nestAlert?.surfaceInvaders ?? 0 }}
        />
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
          touch={touch}
        />
      </footer>
    </>
  );
}
