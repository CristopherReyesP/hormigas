import { useState, useCallback, useEffect, useRef } from 'react';
import { GameCanvas } from './ui/GameCanvas';
import { TopStrip } from './ui/console/TopStrip';
import { Console } from './ui/console/Console';
import { ObjectivePanel } from './ui/ObjectivePanel';
import { GameOverScreen } from './ui/GameOverScreen';
import { EvolutionChamber } from './ui/EvolutionChamber';
import type { GameManager, GameStats } from './game/GameManager';
import type { MutationId } from './game/run/MutationDefinitions';
import { ColonyPriority } from './game/components/components';

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
  pantryCapacity: 0,
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
  invasion: { waveNumber: 0, nextWaveIn: 180, active: false, invadersAlive: 0, armed: false },
  gameOver: null,
  activeEvents: [],
  dayPhase: 'day',
  dayNumber: 1,
  phaseRemaining: 0,
  mutationOffer: null,
  lastMutationPick: null,
};

/** While paused the simulation stops pushing stats; poll so pause, selection and layer still show. */
const PAUSED_POLL_MS = 250;

export default function App() {
  const [stats, setStats] = useState<GameStats>(DEFAULT_STATS);
  const [gameKey, setGameKey] = useState(0);
  const gameManagerRef = useRef<GameManager | null>(null);
  const [gameManager, setGameManager] = useState<GameManager | null>(null);

  const handleRestart = useCallback(() => {
    setStats(DEFAULT_STATS);
    setGameKey((k) => k + 1); // remount GameCanvas → fresh GameManager
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

  const handleChooseMutation = useCallback((id: MutationId) => {
    gameManagerRef.current?.chooseMutation(id);
  }, []);

  return (
    <div className="hive-screen">
      {/* The world fills the window; every HUD element floats above it */}
      <GameCanvas key={gameKey} onStatsUpdate={handleStatsUpdate} onGameManager={handleGameManager} />
      <TopStrip stats={stats} />
      {/* Defaults carry no objective: wait for the first real snapshot */}
      {stats.tickCount > 0 && <ObjectivePanel objective={stats.objective} />}
      <Console key={gameKey} stats={stats} gameManager={gameManager} refreshStats={refreshStats} />
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
