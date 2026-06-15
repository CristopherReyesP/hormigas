import { useState, useEffect } from 'react';
import type { GameManager, UpgradeInfo, UpgradeId } from '../game/GameManager';
import { Section } from './Section';

interface UndergroundControlsProps {
  onExitUnderground: () => void;
  gameManager: GameManager | null;
}

/** Underground-only controls for the LEFT sidebar: return to surface,
 *  garrison size and queen upgrades. The right panel keeps queen/pantry/breeding. */
export function UndergroundControls({ onExitUnderground, gameManager }: UndergroundControlsProps) {
  const [garrison, setGarrison] = useState({ target: 0, current: 0 });
  const [upgrades, setUpgrades] = useState<UpgradeInfo[]>([]);
  const [mushrooms, setMushrooms] = useState(0);

  useEffect(() => {
    if (!gameManager) return;

    const updateStats = () => {
      setGarrison(gameManager.getGarrisonInfo());
      setUpgrades(gameManager.getUpgrades());
      setMushrooms(gameManager.getColonyFood().mushrooms);
    };

    updateStats();
    const interval = setInterval(updateStats, 500);
    return () => clearInterval(interval);
  }, [gameManager]);

  const handleGarrisonChange = (delta: number) => {
    if (!gameManager) return;
    gameManager.setGarrisonSize(garrison.target + delta);
    setGarrison(gameManager.getGarrisonInfo());
  };

  const handleUpgrade = (id: UpgradeId) => {
    if (gameManager?.purchaseUpgrade(id)) {
      setUpgrades(gameManager.getUpgrades());
      setMushrooms(gameManager.getColonyFood().mushrooms);
    }
  };

  return (
    <div style={{ color: 'var(--ui-text)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
      <button
        onClick={onExitUnderground}
        className="pixel-btn pixel-btn--green"
        style={{
          width: '100%',
          padding: '10px',
          marginBottom: '8px',
          fontSize: '12px',
        }}
      >
        🌞 Volver a la Superficie
      </button>

      {/* 🛡️ Defense */}
      <Section title="🛡️ Guarnición" badge={`${garrison.current}/${garrison.target}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => handleGarrisonChange(-1)}
            disabled={garrison.target <= 0}
            className="pixel-btn pixel-btn--danger"
            style={{ width: '28px', padding: '4px' }}
          >
            −
          </button>
          <span style={{ fontSize: '12px' }}>
            {garrison.current}/{garrison.target} soldados abajo
          </span>
          <button
            onClick={() => handleGarrisonChange(1)}
            disabled={garrison.target >= 8}
            className="pixel-btn pixel-btn--green"
            style={{ width: '28px', padding: '4px' }}
          >
            +
          </button>
        </div>
        <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: 'var(--ui-text-dim)' }}>
          Custodian a la reina entre oleadas
        </p>
      </Section>

      {/* 👑 Upgrades — paid in mushrooms (the farm is the tech economy) */}
      <Section title="⬆️ Mejoras de la Reina" badge={`${upgrades.reduce((s, u) => s + u.level, 0)}/${upgrades.reduce((s, u) => s + u.maxLevel, 0)}`}>
        <p style={{ margin: '0 0 6px 0', fontSize: '9px', color: 'var(--ui-text-dim)' }}>
          Se pagan con hongos 🍄 de la granja — tenés {mushrooms}
        </p>
        {upgrades.map((u) => {
          const maxed = u.nextCost === null;
          const affordable = !maxed && mushrooms >= (u.nextCost ?? 0);
          return (
            <div key={u.id} style={{ marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '2px' }}>
                <span>{u.name}</span>
                <span style={{ color: 'var(--accent-amber)' }}>
                  {'■'.repeat(u.level)}{'□'.repeat(u.maxLevel - u.level)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', color: 'var(--ui-text-dim)' }}>{u.description}</span>
                <button
                  onClick={() => handleUpgrade(u.id)}
                  disabled={maxed || !affordable}
                  className="pixel-btn"
                  style={{
                    padding: '3px 8px',
                    color: maxed ? undefined : affordable ? 'var(--accent-amber)' : undefined,
                    fontSize: '10px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {maxed ? 'MAX' : `${u.nextCost}🍄`}
                </button>
              </div>
            </div>
          );
        })}
      </Section>
    </div>
  );
}
