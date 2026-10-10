import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameManager, GameStats } from '../../game/GameManager';
import { NotificationStack } from '../NotificationStack';
import { buildCommands, buildModeHint, commandTargetHint, isDefenseMode, type BuildMode, type CardPage, type CommandDef, type NoticeTone } from './commands';
import { CommandCard } from './CommandCard';
import { InfoPanel } from './InfoPanel';
import { MinimapPanel } from './MinimapPanel';
import { useColonyDetails } from './useColonyDetails';
import { useTouchUi } from '../layout/touch';
import { crystalBuildHint } from '../races/crystal/crystalCommands';

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
  const hasAnts = stats.activeLayer === 'surface'
    && Boolean(stats.selectedGroup || stats.selectedEntity?.type === 'ant' || (stats.selectedEntity?.type === 'crystal_unit' && stats.selectedEntity.owned));
  if (page === 'groups' && !hasAnts) setPage('root');
  const onEscape = useCallback(() => {
    if (stats.commandTarget) gameManager?.cancelCommandTarget();
    else if (stats.crystal?.buildMode) {
      gameManager?.getCrystal()?.setBuildMode(null);
      refreshStats();
    } else if (buildMode) setBuildMode(null);
    else if (page !== 'root') setPage('root');
    else if (hasSelection) gameManager?.clearSelection();
  }, [stats.commandTarget, stats.crystal?.buildMode, buildMode, page, hasSelection, gameManager, refreshStats]);

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

  const areaHint = touch && stats.areaSelect
    ? `SELECCIONAR ÁREA: arrastra el dedo para encerrar a tus ${stats.crystal ? 'unidades' : 'hormigas'}`
    : null;
  const crystalHint = stats.crystal?.buildMode ? crystalBuildHint(stats.crystal.buildMode, touch) : null;
  const hint = notice?.text ?? commandTargetHint(stats.commandTarget, touch) ?? crystalHint ?? (buildMode ? buildModeHint(buildMode, touch) : areaHint);
  const overlayOpen = Boolean(stats.mutationOffer || stats.gameOver);

  return (
    <>
      <NotificationStack notifications={stats.notifications} hint={hint} hintTone={notice?.tone} />
      <footer className="hive-console">
        <div className="console-deck" aria-hidden="true">
          <div className="console-vein" />
        </div>
        <MinimapPanel gameManager={gameManager} activeLayer={stats.activeLayer} onSwitchLayer={switchLayer} hideNest={Boolean(stats.crystal)} />
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
