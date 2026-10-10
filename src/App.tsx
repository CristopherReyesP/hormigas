import { useState, useCallback, useEffect, useRef } from 'react';
import { GameCanvas } from './ui/GameCanvas';
import { TopStrip } from './ui/console/TopStrip';
import { Console } from './ui/console/Console';
import { ObjectivePanel } from './ui/ObjectivePanel';
import { GameOverScreen } from './ui/GameOverScreen';
import { MilestoneBanner } from './ui/MilestoneBanner';
import { EvolutionChamber } from './ui/EvolutionChamber';
import { RacePicker } from './ui/RacePicker';
import { HudLayer } from './ui/HudLayer';
import { WaveAlert } from './ui/WaveAlert';
import { NestAlert } from './ui/NestAlert';
import { HumanIntroBanner } from './ui/races/human/HumanIntroBanner';
import { NextWaveCard } from './ui/NextWaveCard';
import type { GameManager, GameStats } from './game/GameManager';
import type { MutationId } from './game/run/MutationDefinitions';
import { ColonyPriority } from './game/components/components';
import { loadRunSetup, saveRunSetup, type RunSetup } from './game/run/RunSetup';
import { TUTORIAL_SETUP } from './game/tutorial/createTutorialGame';
import { TutorialOverlay } from './ui/tutorial/TutorialOverlay';
import { TutorialOffer } from './ui/tutorial/TutorialOffer';
import { HelpCard } from './ui/tutorial/HelpCard';
import { firstVisit } from './ui/tutorial/firstVisit';
import { coachStorage, markCoachSeen } from './ui/console/coachMarks';
import { deviceOf } from './ui/tutorial/steps';
import { useTouchUi } from './ui/layout/touch';

const DEFAULT_STATS: GameStats = {
  antCount: 0,
  workerCount: 0,
  soldierCount: 0,
  scoutCount: 0,
  nurseCount: 0,
  defenderCount: 0,
  foodStored: 0,
  mushroomStored: 0,
  meatStored: 0,
  pantryStored: 0,
  entranceFoodStored: 0,
  pantryCapacity: 0,
  mineralsStored: 0,
  beetleCount: 0,
  beetleDenCount: 0,
  cricketCount: 0,
  cricketDenCount: 0,
  availableSoldiers: 0,
  tickCount: 0,
  paused: false,
  speed: 1,
  zoom: 1,
  colonyPriority: ColonyPriority.Gather,
  activeLayer: 'surface',
  breeding: {
    isBreeding: false,
    progress: 0,
    role: null,
  },
  selectedEntity: null,
  notifications: [],
  objective: null,
  invasion: { waveNumber: 0, nextWaveIn: 180, active: false, invadersAlive: 0, armed: false, waveSize: 0, remaining: 0, banner: null, threats: [] },
  gameOver: null,
  milestone: null,
  activeEvents: [],
  dayPhase: 'day',
  dayNumber: 1,
  phaseRemaining: 0,
  mutationOffer: null,
  mutationSelection: null,
  lastMutationPick: null,
  introPlaying: true, // every run opens on the meteor intro, so the HUD starts hidden
};

/** While paused the simulation stops pushing stats; poll so pause, selection and layer still show. */
const PAUSED_POLL_MS = 250;

export default function App() {
  const [stats, setStats] = useState<GameStats>(DEFAULT_STATS);
  // null while the race picker is up; set by COMENZAR. The GameManager builds its rival from it.
  const [runSetup, setRunSetup] = useState<RunSetup | null>(null);
  const gameManagerRef = useRef<GameManager | null>(null);
  const [gameManager, setGameManager] = useState<GameManager | null>(null);
  // Tutorial: the run is the guided one while true; the overlay shows until it is finished or left
  const [tutorial, setTutorial] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  /** Bumped per run so a replayed tutorial gets a fresh GameCanvas */
  const [runId, setRunId] = useState(0);
  const [offerTutorial, setOfferTutorial] = useState(() => firstVisit.shouldOffer());
  const [helpOpen, setHelpOpen] = useState(false);
  const touch = useTouchUi();

  const handleStart = useCallback((setup: RunSetup) => {
    saveRunSetup(setup);
    setStats(DEFAULT_STATS);
    setTutorial(false);
    setTutorialOpen(false);
    setRunId((n) => n + 1);
    setRunSetup(setup); // mounts GameCanvas → fresh GameManager, whose meteor intro opens the run
  }, []);

  /** The guided tutorial: a fresh calm run with Hormi (from the picker, the first-visit offer or the help card) */
  const handleTutorial = useCallback(() => {
    firstVisit.remember('done');
    // The tutorial teaches what the touch coach marks point at: they need not show after it either
    markCoachSeen(coachStorage());
    setOfferTutorial(false);
    setHelpOpen(false);
    gameManagerRef.current = null;
    setGameManager(null);
    setStats(DEFAULT_STATS);
    setTutorial(true);
    setTutorialOpen(true);
    setRunId((n) => n + 1);
    setRunSetup(TUTORIAL_SETUP);
  }, []);

  const declineTutorial = useCallback(() => {
    firstVisit.remember('skipped');
    setOfferTutorial(false);
  }, []);

  const closeTutorial = useCallback(() => setTutorialOpen(false), []);

  // The help card pauses the run while it is open
  const [resumeAfterHelp, setResumeAfterHelp] = useState(false);
  const openHelp = useCallback(() => {
    const gm = gameManagerRef.current;
    const pause = Boolean(gm && !gm.isPaused());
    if (pause) gm?.setPaused(true);
    setResumeAfterHelp(pause);
    setHelpOpen(true);
  }, []);
  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    if (resumeAfterHelp) gameManagerRef.current?.setPaused(false);
    setResumeAfterHelp(false);
  }, [resumeAfterHelp]);

  const handleRestart = useCallback(() => {
    // Back to the picker: unmounting GameCanvas stops the old GameManager
    gameManagerRef.current = null;
    setGameManager(null);
    setStats(DEFAULT_STATS);
    setTutorial(false);
    setTutorialOpen(false);
    setHelpOpen(false);
    setRunSetup(null);
  }, []);

  // "Seguir jugando" after a victory: the endless run goes on without the rival base
  const handleContinue = useCallback(() => {
    const gm = gameManagerRef.current;
    if (gm?.continueAfterVictory()) setStats(gm.getStats());
  }, []);

  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setStats(newStats);
  }, []);

  const handleGameManager = useCallback((gm: GameManager) => {
    gameManagerRef.current = gm;
    setGameManager(gm);
  }, []);

  const refreshStats = useCallback(() => {
    const gm = gameManagerRef.current;
    if (gm) setStats(gm.getStats());
  }, []);

  useEffect(() => {
    if (!gameManager) return;
    const interval = window.setInterval(() => {
      if (gameManager.isPaused()) setStats(gameManager.getStats());
    }, PAUSED_POLL_MS);
    return () => window.clearInterval(interval);
  }, [gameManager]);

  const handleGoToNest = useCallback(() => {
    gameManagerRef.current?.goToNestFight();
    refreshStats();
  }, [refreshStats]);

  const handleSelectMutation = useCallback((id: MutationId | null) => {
    gameManagerRef.current?.selectMutation(id);
  }, []);

  const handleConfirmMutation = useCallback(() => {
    gameManagerRef.current?.confirmMutation();
  }, []);

  if (!runSetup) {
    // Shown on first load and after every restart, before any simulation runs
    return (
      <>
        <RacePicker initialSetup={loadRunSetup()} onStart={handleStart} onTutorial={handleTutorial} />
        {offerTutorial && <TutorialOffer onAccept={handleTutorial} onDecline={declineTutorial} />}
      </>
    );
  }

  return (
    <div className="hive-screen">
      {/* The world fills the window; every HUD element floats above it */}
      <GameCanvas
        key={runId}
        setup={runSetup}
        tutorial={tutorial}
        onStatsUpdate={handleStatsUpdate}
        onGameManager={handleGameManager}
        introPlaying={stats.introPlaying}
      />
      {/* Hidden during the opening cinematic, then it fades in */}
      <HudLayer introPlaying={stats.introPlaying}>
        <TopStrip stats={stats} gameManager={gameManager} onHelp={openHelp} />
        {/* Defaults carry no objective: wait for the first real snapshot */}
        {stats.tickCount > 0 && !stats.human && <ObjectivePanel objective={stats.objective} />}
        {/* Scouting: the coming wave's mix, elites, boss and breach, all day */}
        {stats.tickCount > 0 && <NextWaveCard invasion={stats.invasion} />}
        <Console stats={stats} gameManager={gameManager} refreshStats={refreshStats} tutorialRunning={tutorialOpen} />
      </HudLayer>
      {/* Night-wave alerts: outside the scaled HUD, over the whole screen; none during the intro */}
      {!stats.introPlaying && (
        <WaveAlert invasion={stats.invasion} activeLayer={stats.activeLayer} view={gameManager?.getActiveView() ?? null} />
      )}
      {/* Invaders inside the nest: the banner with "Ir al nido", and the all-clear */}
      {!stats.introPlaying && stats.nestAlert && (
        <NestAlert state={stats.nestAlert} activeLayer={stats.activeLayer} onGoToNest={handleGoToNest} />
      )}
      {/* A Human expedition's landing line (the Swarm opens with the meteor cinematic instead) */}
      {stats.human?.intro && !stats.gameOver && <HumanIntroBanner title={stats.human.intro} />}
      {!stats.introPlaying && !stats.gameOver && <MilestoneBanner milestone={stats.milestone} />}
      {tutorialOpen && gameManager && !stats.introPlaying && !stats.gameOver && (
        <TutorialOverlay gameManager={gameManager} onExit={closeTutorial} onFinish={closeTutorial} />
      )}
      {helpOpen && <HelpCard device={deviceOf(touch)} onClose={closeHelp} onReplayTutorial={handleTutorial} />}
      {stats.gameOver && <GameOverScreen stats={stats.gameOver} onRestart={handleRestart} onContinue={handleContinue} />}

      {/* Dawn mutation pick: full-screen, above the HUD */}
      <EvolutionChamber
        offer={stats.mutationOffer}
        selected={stats.mutationSelection}
        lastPick={stats.lastMutationPick}
        onSelect={handleSelectMutation}
        onConfirm={handleConfirmMutation}
      />
    </div>
  );
}
