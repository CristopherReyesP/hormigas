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
import { loadRunSetup, sanitizeRunSetup, saveRunSetup, type RunSetup } from './game/run/RunSetup';
import type { SaveFile } from './game/save/format';
import { getSaveStorage } from './game/save/storage';
import { GameMenu } from './ui/save/GameMenu';
import { SaveToasts } from './ui/save/SaveToasts';
import { StartSaves } from './ui/save/StartSaves';
import { restoreFactory, useAutosave } from './ui/save/useRunSaves';

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
  // Builds a run loaded from a save (undefined for a new run); `runKey` remounts the canvas for each run
  const [createGame, setCreateGame] = useState<((canvas: HTMLCanvasElement) => GameManager) | undefined>(undefined);
  const [runKey, setRunKey] = useState(0);
  const saveStorage = getSaveStorage();
  const autosaveNow = useAutosave(gameManager, saveStorage);

  const handleStart = useCallback((setup: RunSetup) => {
    saveRunSetup(setup);
    setStats(DEFAULT_STATS);
    setCreateGame(undefined);
    setRunKey((k) => k + 1);
    setRunSetup(setup); // mounts GameCanvas → fresh GameManager, whose meteor intro opens the run
  }, []);

  const handleRestart = useCallback(() => {
    // Back to the picker: unmounting GameCanvas stops the old GameManager
    gameManagerRef.current = null;
    setGameManager(null);
    setStats(DEFAULT_STATS);
    setCreateGame(undefined);
    setRunSetup(null);
  }, []);

  const handleLoadSave = useCallback((save: SaveFile) => {
    // Remounts GameCanvas, which builds the saved run instead of a new one (no intro)
    gameManagerRef.current = null;
    setGameManager(null);
    setStats({ ...DEFAULT_STATS, introPlaying: false });
    setCreateGame(() => restoreFactory(save, handleRestart));
    setRunKey((k) => k + 1);
    setRunSetup(sanitizeRunSetup(save.state.setup));
  }, [handleRestart]);

  const handleExitToMenu = useCallback(() => {
    autosaveNow();
    handleRestart();
  }, [autosaveNow, handleRestart]);

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
    // A loaded run shows its colony at once, not after the first stats tick
    if (!gm.getStats().introPlaying) setStats(gm.getStats());
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
        <RacePicker
          initialSetup={loadRunSetup()}
          onStart={handleStart}
          savedRun={<StartSaves storage={saveStorage} onLoad={handleLoadSave} />}
        />
        <SaveToasts />
      </>
    );
  }

  return (
    <div className="hive-screen">
      {/* The world fills the window; every HUD element floats above it */}
      <GameCanvas
        key={runKey}
        setup={runSetup}
        createGame={createGame}
        onStatsUpdate={handleStatsUpdate}
        onGameManager={handleGameManager}
        introPlaying={stats.introPlaying}
      />
      {/* Hidden during the opening cinematic, then it fades in */}
      <HudLayer introPlaying={stats.introPlaying}>
        <TopStrip stats={stats} gameManager={gameManager} />
        {/* Defaults carry no objective: wait for the first real snapshot */}
        {stats.tickCount > 0 && !stats.human && <ObjectivePanel objective={stats.objective} />}
        {/* Scouting: the coming wave's mix, elites, boss and breach, all day */}
        {stats.tickCount > 0 && <NextWaveCard invasion={stats.invasion} />}
        <Console stats={stats} gameManager={gameManager} refreshStats={refreshStats} />
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
      {/* Pause menu: save, load, back to the start screen */}
      {!stats.introPlaying && !stats.gameOver && gameManager && (
        <GameMenu game={gameManager} storage={saveStorage} onLoad={handleLoadSave} onExit={handleExitToMenu} />
      )}
      <SaveToasts />
      {!stats.introPlaying && !stats.gameOver && <MilestoneBanner milestone={stats.milestone} />}
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
