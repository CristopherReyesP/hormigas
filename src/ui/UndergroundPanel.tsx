import { useState, useEffect } from 'react';
import type { GameManager } from '../game/GameManager';
import { AntRole } from '../game/components/components';
import { Section } from './Section';
import { useFlashOnChange } from './useFlashOnChange';

interface UndergroundPanelProps {
  gameManager: GameManager | null;
}

interface QueenStats {
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  isLaying: boolean;
}

interface EggInfo {
  role: string;
  progress: number;
  fedProgress?: number; // only incubating eggs report feeding (queue eggs don't)
}

export function UndergroundPanel({ gameManager }: UndergroundPanelProps) {
  const [queenStats, setQueenStats] = useState<QueenStats | null>(null);
  const [eggQueue, setEggQueue] = useState<EggInfo[]>([]);
  const [activeEggs, setActiveEggs] = useState<EggInfo[]>([]);
  const [food, setFood] = useState({ total: 0, leaves: 0, mushrooms: 0, meat: 0 });
  const [farm, setFarm] = useState({ tiles: 0, rate: 0, status: 'sin-tiles', stored: 0, capacity: 0 });
  const [eatFirst, setEatFirst] = useState<'leaf' | 'mushroom' | 'meat'>('leaf');

  const foodFlash = useFlashOnChange(food.total);

  useEffect(() => {
    if (!gameManager) return;

    const updateStats = () => {
      setQueenStats(gameManager.getQueenStats());
      setEggQueue(gameManager.getEggQueue());
      setActiveEggs(gameManager.getActiveEggs());
      setFood(gameManager.getColonyFood());
      setFarm(gameManager.getFarmStatus());
      setEatFirst(gameManager.getConsumptionPriority());
    };

    updateStats();
    const interval = setInterval(updateStats, 500);
    return () => clearInterval(interval);
  }, [gameManager]);

  const handleBreed = (role: AntRole) => {
    gameManager?.queueBreed(role);
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case AntRole.Worker: return '#c08a4a';
      case AntRole.Soldier: return 'var(--accent-red)';
      case AntRole.Scout: return 'var(--accent-blue)';
      case AntRole.Nurse: return 'var(--accent-green)';
      default: return 'var(--ui-text-dim)';
    }
  };

  const renderProgressBar = (progress: number, color: string) => (
    <div className="pixel-bar">
      <div
        className="pixel-bar-fill"
        style={{
          width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );

  const renderEggList = (eggs: EggInfo[], emptyText: string) =>
    eggs.length > 0 ? (
      eggs.map((egg, i) => {
        const hungry = egg.fedProgress !== undefined && egg.fedProgress < 1;
        const waitingForFood = hungry && egg.progress >= 1; // incubada al 100% pero sin comer
        return (
          <div key={i} style={{ marginBottom: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
              <span style={{ color: getRoleColor(egg.role) }}>{egg.role}{hungry ? ' 🍽️' : ''}</span>
              <span style={waitingForFood ? { color: 'var(--accent-amber)' } : undefined}>
                {waitingForFood ? 'con hambre' : `${(egg.progress * 100).toFixed(0)}%`}
              </span>
            </div>
            {renderProgressBar(egg.progress, getRoleColor(egg.role))}
          </div>
        );
      })
    ) : (
      <p style={{ margin: '0', fontSize: '10px', color: 'var(--ui-text-dim)' }}>{emptyText}</p>
    );

  const breedButton = (role: AntRole, label: string, cost: number, color: string) => (
    <button
      onClick={() => handleBreed(role)}
      disabled={food.total < cost}
      className="pixel-btn"
      style={{
        padding: '8px 4px',
        color: food.total >= cost ? color : undefined,
        fontSize: '11px',
      }}
    >
      {label} ({cost}🍖)
    </button>
  );

  return (
    <div style={{ color: 'var(--ui-text)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
      <h3 className="pixel-heading" style={{ margin: '0 0 10px 0' }}>🕳️ Hormiguero</h3>

      {/* 👑 Queen — always relevant, open by default */}
      <Section title="👑 Reina" defaultOpen badge={queenStats?.isLaying ? 'poniendo' : undefined}>
        {queenStats ? (
          <>
            <div style={{ marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                <span>❤️ Vida</span>
                <span>{queenStats.health.toFixed(0)}/{queenStats.maxHealth}</span>
              </div>
              {renderProgressBar(queenStats.health / queenStats.maxHealth, 'var(--accent-red)')}
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                <span>🍽️ Hambre</span>
                <span>{queenStats.hunger.toFixed(0)}/{queenStats.maxHunger}</span>
              </div>
              {renderProgressBar(queenStats.hunger / queenStats.maxHunger, 'var(--accent-green)')}
            </div>
          </>
        ) : (
          <p style={{ margin: 0, color: 'var(--ui-text-dim)', fontSize: '10px' }}>Sin reina</p>
        )}
        {queenStats && (
          <p style={{ margin: '6px 0 0 0', fontSize: '9px', color: 'var(--ui-text-dim)' }}>
            👑 Mover a la reina: clickeá el área de trono destino (sin modo de construcción activo).
            Podés tener varios tronos y elegir a cuál va.
          </p>
        )}
      </Section>

      {/* 🍖 Pantry */}
      <Section title="🍖 Despensa" defaultOpen badge={`${food.total}`}>
        <div className={foodFlash} style={{ marginBottom: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span>🍃 Hojas</span>
            <span>{food.leaves}</span>
          </div>
          {renderProgressBar(food.total > 0 ? food.leaves / 200 : 0, 'var(--accent-green)')}
        </div>
        <div style={{ marginBottom: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span>🍄 Hongos</span>
            <span>{food.mushrooms}</span>
          </div>
          {renderProgressBar(food.total > 0 ? food.mushrooms / 200 : 0, 'var(--accent-amber)')}
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
            <span>🥩 Carne</span>
            <span>{food.meat}</span>
          </div>
          {renderProgressBar(food.total > 0 ? food.meat / 200 : 0, 'var(--accent-red)')}
        </div>

        {/* Consumption policy: what the colony eats FIRST (breeding, nurses, healing).
            Eating mushrooms/meat first protects the leaf supply the farm converts. */}
        <div style={{ marginTop: '8px' }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: 'var(--ui-text-dim)' }}>
            Comer primero:
          </p>
          <div style={{ display: 'flex', gap: '4px' }}>
            {([
              { type: 'leaf' as const, label: '🍃 Hojas' },
              { type: 'mushroom' as const, label: '🍄 Hongos' },
              { type: 'meat' as const, label: '🥩 Carne' },
            ]).map((opt) => (
              <button
                key={opt.type}
                onClick={() => {
                  gameManager?.setConsumptionPriority(opt.type);
                  setEatFirst(opt.type);
                }}
                className={`pixel-btn${eatFirst === opt.type ? ' pixel-btn--active' : ''}`}
                style={{ flex: 1, padding: '4px 2px', fontSize: '9px', whiteSpace: 'nowrap' }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {eatFirst === 'leaf' && farm.tiles > 0 && (
            <p style={{ margin: '4px 0 0 0', fontSize: '9px', color: 'var(--accent-amber)' }}>
              ⚠️ Comiendo hojas primero la granja se queda sin materia prima
            </p>
          )}
          <p style={{ margin: '4px 0 0 0', fontSize: '9px', color: 'var(--ui-text-dim)' }}>
            Si no queda del tipo elegido, la colonia come lo que haya
          </p>
        </div>
      </Section>

      {/* 🍄 Fungus farm: what it's doing and why, so the mechanic is legible */}
      <Section title="🍄 Granja" defaultOpen badge={farm.tiles > 0 ? `${farm.tiles} 🟫` : '—'}>
        {farm.tiles === 0 ? (
          <p style={{ margin: 0, color: 'var(--ui-text-dim)', fontSize: '10px' }}>
            Sin tiles de granja. Usá el botón 🍄 Granja de la barra de construcción y
            clickeá tiles excavados: la granja convierte hojas de la despensa en hongos
            (el doble de nutritivos).
          </p>
        ) : (
          <>
            <div style={{ marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', marginBottom: '2px' }}>
                <span>🍄 Cosecha</span>
                <span>{farm.stored}/{farm.capacity}</span>
              </div>
              {renderProgressBar(farm.capacity > 0 ? farm.stored / farm.capacity : 0, 'var(--accent-amber)')}
            </div>
            {farm.status === 'produciendo' && (
              <p style={{ margin: 0, color: 'var(--accent-green)', fontSize: '10px' }}>
                ⚙️ Produciendo +{farm.rate.toFixed(1)} 🍄/s — convirtiendo hojas de la despensa
              </p>
            )}
            {farm.status === 'sin-hojas' && (
              <p style={{ margin: 0, color: 'var(--accent-amber)', fontSize: '10px' }}>
                ⏸️ Sin hojas en la despensa — esperando que las obreras traigan más
              </p>
            )}
            {farm.status === 'llena' && (
              <p style={{ margin: 0, color: 'var(--accent-amber)', fontSize: '10px' }}>
                ⏸️ Granja llena — designá más tiles o esperá a que la colonia coma hongos
              </p>
            )}
          </>
        )}
      </Section>

      {/* 🥚 Breeding: buttons + queue + incubating in ONE place */}
      <Section title="🥚 Cría" defaultOpen badge={`${eggQueue.length + activeEggs.length} 🥚`}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '8px' }}>
          {breedButton(AntRole.Worker, 'Obrera', 20, '#c08a4a')}
          {breedButton(AntRole.Soldier, 'Soldado', 35, 'var(--accent-red)')}
          {breedButton(AntRole.Scout, 'Explorad.', 25, 'var(--accent-blue)')}
          {breedButton(AntRole.Nurse, 'Nodriza', 15, 'var(--accent-green)')}
          {breedButton(AntRole.Defender, 'Defensora', 30, '#8a5fc8')}
        </div>
        {eggQueue.length > 0 && (
          <>
            <p style={{ margin: '0 0 4px 0', fontSize: '10px', color: 'var(--accent-amber)' }}>En cola ({eggQueue.length})</p>
            {renderEggList(eggQueue, '')}
          </>
        )}
        <p style={{ margin: '6px 0 4px 0', fontSize: '10px', color: 'var(--accent-amber)' }}>Incubando ({activeEggs.length})</p>
        {renderEggList(activeEggs, 'Sin huevos incubando')}
      </Section>

    </div>
  );
}
