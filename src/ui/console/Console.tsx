import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameManager, GameStats } from '../../game/GameManager';
import type { QuickSelectKind } from '../../game/systems/helpers/quickSelect';
import { NotificationStack } from '../NotificationStack';
import { buildCommands, buildModeHint, commandTargetHint, isDefenseMode, type BuildMode, type CardPage, type CommandDef, type NoticeTone } from './commands';
import { CommandCard } from './CommandCard';
import { InfoPanel } from './InfoPanel';
import { MinimapPanel } from './MinimapPanel';
import { useColonyDetails } from './useColonyDetails';
import { useTouchUi } from '../layout/touch';
import { useHudLayout } from '../layout/useHudLayout';
import { TouchCommandBar } from './TouchCommandBar';
import { touchHint } from './touchHint';
import { TouchFeedback, type CasteBurst, type OrderToast } from './TouchFeedback';
import { CoachMarks } from './CoachMarks';
import { HAPTIC_PATTERN, feedbackText, hapticFor, vibrate } from './feedbackText';
import { humanHint } from '../races/human/humanCommands';

interface ConsoleProps {
  stats: GameStats;
  gameManager: GameManager | null;
  /** Pull a fresh stats snapshot (the sim stops pushing while paused) */
  refreshStats: () => void;
}

const NOTICE_MS = 3000;
/** How long an order toast and a long-press burst stay (their CSS animations match) */
const TOAST_MS = 1600;
const BURST_MS = 1100;

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
  const [infoOpen, setInfoOpen] = useState(false);
  const [toast, setToast] = useState<OrderToast | null>(null);
  const [burst, setBurst] = useState<CasteBurst | null>(null);
  const feedbackId = useRef(0);
  const touch = useTouchUi();
  const compact = useHudLayout() !== 'desktop';

  // Phone order feedback: a toast, a buzz, and a burst where a long press took a caste.
  // The desktop console stays as it was.
  useEffect(() => {
    if (!gameManager || !touch) return;
    return gameManager.onCommandFeedback((event) => {
      vibrate(typeof navigator !== 'undefined' ? navigator : undefined, hapticFor(event));
      const id = ++feedbackId.current;
      const text = feedbackText(event);
      if (event.type === 'caste-select') {
        setBurst({ id, x: event.x / event.pixelRatio, y: event.y / event.pixelRatio, text });
      } else {
        setToast({ id, text, tone: event.order === 'attack' || event.order === 'attack-move' ? 'attack' : 'move' });
      }
    });
  }, [gameManager, touch]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!burst) return;
    const timer = window.setTimeout(() => setBurst(null), BURST_MS);
    return () => window.clearTimeout(timer);
  }, [burst]);

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

  const quickSelect = useCallback(
    (kind: QuickSelectKind) => {
      if (!gameManager) return;
      if (gameManager.quickSelect(kind).selected > 0 && touch) {
        vibrate(typeof navigator !== 'undefined' ? navigator : undefined, HAPTIC_PATTERN.select);
      }
      // Picking troops leaves the Defensas page and drops its build tool: the next tap is an order
      setPage('root');
      setBuildMode((mode) => (isDefenseMode(mode) ? null : mode));
      refresh();
    },
    [gameManager, touch, refresh],
  );

  const areaHint = touch && stats.areaSelect ? 'SELECCIONAR ÁREA: arrastra el dedo para encerrar a tus hormigas' : null;
  // A Human player placing a building: its hint first
  const placingHint = humanHint(stats, touch);
  // The compact HUD's hint line already says what the mode does: the feed only carries notices there
  const modeHint = compact ? null : placingHint ?? commandTargetHint(stats.commandTarget, touch) ?? (buildMode ? buildModeHint(buildMode, touch) : areaHint);
  const hint = notice?.text ?? modeHint;
  const lineHint = touchHint({ ...stats, buildMode, touch, toolHint: placingHint });
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
          open={compact ? infoOpen : undefined}
          onOpenChange={compact ? setInfoOpen : undefined}
        />
        <TouchCommandBar
          stats={stats}
          hint={lineHint}
          infoOpen={infoOpen}
          onToggleInfo={() => setInfoOpen((o) => !o)}
          onQuickSelect={quickSelect}
          onRecallGroup={(slot) => {
            gameManager?.recallControlGroup(slot);
            refresh();
          }}
          onClearSelection={() => {
            gameManager?.clearSelection();
            refresh();
          }}
        />
        <CommandCard
          commands={commands}
          hotkeysEnabled={!overlayOpen && commands.length > 0}
          onEscape={onEscape}
          onBlocked={explainBlocked}
          touch={touch}
        />
      </footer>
      {touch && <TouchFeedback toast={toast} burst={burst} />}
      {touch && compact && <CoachMarks active={!stats.introPlaying && !overlayOpen} race={stats.human ? 'human' : 'swarm'} />}
    </>
  );
}
