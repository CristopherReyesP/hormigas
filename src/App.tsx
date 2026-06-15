import { useState, useCallback, useRef } from 'react';
import { GameCanvas } from './ui/GameCanvas';
import { HUD } from './ui/HUD';
import { GameControls } from './ui/GameControls';
import { ColonyPanel } from './ui/ColonyPanel';
import { UndergroundPanel } from './ui/UndergroundPanel';
import { UndergroundControls } from './ui/UndergroundControls';
import { NotificationStack } from './ui/NotificationStack';
import { BuildToolbar } from './ui/BuildToolbar';
import { PopulationChip } from './ui/PopulationChip';
import { ObjectivePanel } from './ui/ObjectivePanel';
import { GameOverScreen } from './ui/GameOverScreen';
import type { GameManager, GameStats } from './game/GameManager';
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
  invasion: { waveNumber: 0, nextWaveIn: 180, active: false, invadersAlive: 0 },
  gameOver: null,
  activeEvents: [],
  dayPhase: 'day',
  dayNumber: 1,
  phaseRemaining: 0,
};

export default function App() {
  const [stats, setStats] = useState<GameStats>(DEFAULT_STATS);
  const [gameKey, setGameKey] = useState(0);
  const gameManagerRef = useRef<GameManager | null>(null);

  const handleRestart = useCallback(() => {
    setStats(DEFAULT_STATS);
    setGameKey((k) => k + 1); // remount GameCanvas → fresh GameManager
  }, []);

  const handleStatsUpdate = useCallback((newStats: GameStats) => {
    setStats(newStats);
  }, []);

  const handleGameManager = useCallback((gm: GameManager) => {
    gameManagerRef.current = gm;
  }, []);

  const handleTogglePause = useCallback(() => {
    gameManagerRef.current?.togglePause();
  }, []);

  const handleSetSpeed = useCallback((speed: number) => {
    gameManagerRef.current?.setSpeed(speed);
  }, []);

  const handleExitUnderground = useCallback(() => {
    gameManagerRef.current?.exitUnderground();
  }, []);

  return (
    <div style={{
      display: 'flex',
      height: '100%',
      background: 'var(--ui-bg)',
    }}>
      {/* Left Sidebar — HUD + Controls */}
      <div style={{
        width: '220px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '12px',
        overflowY: 'auto',
      }}>
        <HUD stats={stats} />
        <ObjectivePanel objective={stats.objective} />
        <GameControls
          paused={stats.paused}
          speed={stats.speed}
          onTogglePause={handleTogglePause}
          onSetSpeed={handleSetSpeed}
        />
        {stats.activeLayer === 'underground' && (
          <UndergroundControls
            onExitUnderground={handleExitUnderground}
            gameManager={gameManagerRef.current}
          />
        )}
      </div>

      {/* Center — Canvas fills all remaining space */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative' }}>
        <GameCanvas key={gameKey} onStatsUpdate={handleStatsUpdate} onGameManager={handleGameManager} />
        <NotificationStack notifications={stats.notifications} />
        {stats.activeLayer === 'underground' && (
          <>
            <PopulationChip
              antCount={stats.antCount}
              workerCount={stats.workerCount}
              soldierCount={stats.soldierCount}
              scoutCount={stats.scoutCount}
              nurseCount={stats.nurseCount}
              defenderCount={stats.defenderCount}
            />
            <BuildToolbar gameManager={gameManagerRef.current} />
          </>
        )}
        {stats.gameOver && <GameOverScreen stats={stats.gameOver} onRestart={handleRestart} />}
      </div>

      {/* Right Sidebar — Context-dependent panel */}
      <div style={{
        width: '260px',
        flexShrink: 0,
        padding: '12px',
        overflowY: 'auto',
      }}>
        {stats.activeLayer === 'underground' ? (
          <UndergroundPanel gameManager={gameManagerRef.current} />
        ) : (
          <ColonyPanel stats={stats} gameManager={gameManagerRef.current} />
        )}
      </div>
    </div>
  );
}
