import { useState, useCallback, useEffect, useRef } from 'react';
import { GameCanvas } from './ui/GameCanvas';
import { TopStrip } from './ui/console/TopStrip';
import { Console } from './ui/console/Console';
import { ObjectivePanel } from './ui/ObjectivePanel';
import { GameOverScreen } from './ui/GameOverScreen';
import { EvolutionChamber } from './ui/EvolutionChamber';
import { RacePicker } from './ui/RacePicker';
import { HudLayer } from './ui/HudLayer';
import { WaveAlert } from './ui/WaveAlert';
import { CrystalIntroTitle } from './ui/races/crystal/CrystalIntroTitle';
import { NestAlert } from './ui/NestAlert';
import { HumanIntroBanner } from './ui/races/human/HumanIntroBanner';
import { NextWaveCard } from './ui/NextWaveCard';
import type { GameManager, GameStats } from './game/GameManager';
import type { MutationId } from './game/run/MutationDefinitions';
import { ColonyPriority } from './game/components/components';
import { loadRunSetup, saveRunSetup, type RunSetup } from './game/run/RunSetup';

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
  activeEvents: [],
  dayPhase: 'day',
  dayNumber: 1,
  phaseRemaining: 0,
  mutationOffer: null,
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

  const handleStart = useCallback((setup: RunSetup) => {
    saveRunSetup(setup);
    setStats(DEFAULT_STATS);
    setRunSetup(setup); // mounts GameCanvas → fresh GameManager, whose meteor intro opens the run
  }, []);

  const handleRestart = useCallback(() => {
    // Back to the picker: unmounting GameCanvas stops the old GameManager
    gameManagerRef.current = null;
    setGameManager(null);
    setStats(DEFAULT_STATS);
    setRunSetup(null);
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

  const handleChooseMutation = useCallback((id: MutationId) => {
    gameManagerRef.current?.chooseMutation(id);
  }, []);

  if (!runSetup) {
    // Shown on first load and after every restart, before any simulation runs
    return <RacePicker initialSetup={loadRunSetup()} onStart={handleStart} />;
  }

  return (
    <div className="hive-screen">
      {/* The world fills the window; every HUD element floats above it */}
      <GameCanvas setup={runSetup} onStatsUpdate={handleStatsUpdate} onGameManager={handleGameManager} introPlaying={stats.introPlaying} />
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
      {/* The Crystal Hive skips the Swarm's meteor intro: a short title instead */}
      {runSetup.playerRace === 'crystal' && !stats.gameOver && <CrystalIntroTitle />}
      {/* Invaders inside the nest: the banner with "Ir al nido", and the all-clear */}
      {!stats.introPlaying && stats.nestAlert && (
        <NestAlert state={stats.nestAlert} activeLayer={stats.activeLayer} onGoToNest={handleGoToNest} />
      )}
      {/* A Human expedition's landing line (the Swarm opens with the meteor cinematic instead) */}
      {stats.human?.intro && !stats.gameOver && <HumanIntroBanner title={stats.human.intro} />}
      {stats.gameOver && <GameOverScreen stats={stats.gameOver} onRestart={handleRestart} />}

      {/* Dawn mutation pick: full-screen, above the HUD */}
      <EvolutionChamber
        offer={stats.mutationOffer}
        lastPick={stats.lastMutationPick}
        onChoose={handleChooseMutation}
      />
    </div>
  );
}
