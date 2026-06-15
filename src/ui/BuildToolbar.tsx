import { useState, useEffect } from 'react';
import type { GameManager } from '../game/GameManager';

type BuildMode = 'dig' | 'incubation' | 'farm' | 'storage' | 'throne' | 'defense';

interface BuildToolbarProps {
  gameManager: GameManager | null;
}

const MODE_HINTS: Record<BuildMode, { text: string; color: string }> = {
  dig: { text: 'Clickeá tiles de tierra para marcar excavación', color: 'var(--accent-red)' },
  incubation: { text: 'Clickeá tiles caminables para marcar área de incubación', color: 'var(--accent-amber)' },
  farm: { text: 'Clickeá tiles caminables: la granja convierte hojas en hongos', color: 'var(--accent-blue)' },
  storage: { text: 'Clickeá tiles caminables para ampliar el almacén de comida', color: 'var(--accent-green)' },
  throne: { text: 'Marcá tiles de trono — después salí del modo y CLICKEÁ un trono para mandar a la reina ahí', color: 'var(--accent-amber)' },
  defense: { text: 'Clickeá tiles caminables: las defensoras montan guardia ahí y atacan intrusos cercanos', color: 'var(--accent-red)' },
};

/** Floating construction toolbar over the canvas — bottom-center, underground only */
export function BuildToolbar({ gameManager }: BuildToolbarProps) {
  const [mode, setMode] = useState<BuildMode | null>(null);
  const [farmTiles, setFarmTiles] = useState(0);
  const [storageTiles, setStorageTiles] = useState(0);

  useEffect(() => {
    if (!gameManager) return;

    const updateCounts = () => {
      setFarmTiles(gameManager.getFarmTileCount());
      setStorageTiles(gameManager.getStorageTileCount());
    };

    updateCounts();
    const interval = setInterval(updateCounts, 500);
    return () => clearInterval(interval);
  }, [gameManager]);

  // Defensive cleanup: turn every mode off when the toolbar unmounts
  // (e.g. returning to surface — GameManager does NOT reset modes on exit)
  useEffect(() => {
    return () => {
      gameManager?.setDigMode(false);
      gameManager?.setIncubationMode(false);
      gameManager?.setFarmMode(false);
      gameManager?.setStorageMode(false);
      gameManager?.setThroneMode(false);
      gameManager?.setDefenseMode(false);
    };
  }, [gameManager]);

  const toggleMode = (next: BuildMode) => {
    const newMode = mode === next ? null : next;
    setMode(newMode);
    gameManager?.setDigMode(newMode === 'dig');
    gameManager?.setIncubationMode(newMode === 'incubation');
    gameManager?.setFarmMode(newMode === 'farm');
    gameManager?.setStorageMode(newMode === 'storage');
    gameManager?.setThroneMode(newMode === 'throne');
    gameManager?.setDefenseMode(newMode === 'defense');
  };

  const modeButton = (m: BuildMode, label: string, count?: number) => {
    const active = mode === m;
    const activeClass = m === 'dig' ? ' pixel-btn--danger' : ' pixel-btn--active';
    return (
      <button
        onClick={() => toggleMode(m)}
        className={`pixel-btn${active ? activeClass : ''}`}
        style={{ padding: '8px 10px', fontSize: '11px', whiteSpace: 'nowrap' }}
      >
        {label}{count !== undefined && count > 0 ? ` (${count})` : ''}
      </button>
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        zIndex: 10,
        pointerEvents: 'none', // wrapper lets canvas clicks through
      }}
    >
      {mode && (
        <p
          style={{
            margin: 0,
            padding: '2px 8px',
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            color: MODE_HINTS[mode].color,
            background: 'var(--ui-panel)',
            border: '1px solid var(--ui-border)',
          }}
        >
          {MODE_HINTS[mode].text}
        </p>
      )}
      <div
        className="pixel-panel"
        style={{
          display: 'flex',
          gap: 6,
          padding: '6px',
          pointerEvents: 'auto', // bar itself is clickable
        }}
      >
        {modeButton('dig', '⛏️ Excavar')}
        {modeButton('incubation', '🥚 Incubación')}
        {modeButton('farm', '🍄 Granja', farmTiles)}
        {modeButton('storage', '🍖 Almacén', storageTiles)}
        {modeButton('throne', '👑 Trono')}
        {modeButton('defense', '🛡️ Defensa')}
      </div>
    </div>
  );
}
