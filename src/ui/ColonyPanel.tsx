import { useState } from 'react';
import type { GameManager, GameStats } from '../game/GameManager';
import { AntRole, ColonyPriority } from '../game/components/components';
import { useFlashOnChange } from './useFlashOnChange';

interface ColonyPanelProps {
  stats: GameStats;
  gameManager: GameManager | null;
}

/** Segmented pixel bar — width ratio [0,1], color from accent vars */
function PixelBar({ ratio, color, height = 6 }: { ratio: number; color: string; height?: number }) {
  return (
    <div className="pixel-bar" style={{ height }}>
      <div
        className="pixel-bar-fill"
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

function healthColor(ratio: number): string {
  return ratio > 0.5 ? 'var(--accent-green)' : ratio > 0.25 ? 'var(--accent-amber)' : 'var(--accent-red)';
}

export function ColonyPanel({ stats, gameManager }: ColonyPanelProps) {
  const handlePriorityChange = (priority: ColonyPriority) => {
    if (!gameManager) return;
    gameManager.setColonyPriority(priority);
  };

  const handleDeselect = () => {
    if (!gameManager) return;
    gameManager.clearSelection();
  };

  const [attackCount, setAttackCount] = useState(10);
  const [lastDispatch, setLastDispatch] = useState<string | null>(null);

  const workerFlash = useFlashOnChange(stats.workerCount);
  const soldierFlash = useFlashOnChange(stats.soldierCount);
  const scoutFlash = useFlashOnChange(stats.scoutCount);
  const foodFlash = useFlashOnChange(stats.foodStored);

  const handleDispatchAttack = () => {
    if (!gameManager || !stats.selectedEntity) return;
    const sent = gameManager.dispatchAttackWave(stats.selectedEntity.entityId, attackCount);
    setLastDispatch(`${sent} soldiers sent!`);
    setTimeout(() => setLastDispatch(null), 3000);
  };

  const roleIcons: Record<AntRole, string> = {
    [AntRole.Worker]: '🐜',
    [AntRole.Soldier]: '⚔️',
    [AntRole.Scout]: '🔭',
    [AntRole.Nurse]: '🩺',
    [AntRole.Defender]: '🛡️',
  };

  const stateLabels: Record<string, string> = {
    idle: 'Idle',
    searching: 'Searching',
    going_to_food: 'Going to Food',
    harvesting: 'Harvesting',
    returning_home: 'Returning Home',
    depositing: 'Depositing',
    fleeing: 'Fleeing!',
    chasing_enemy: 'Chasing Enemy',
    attacking_enemy: 'In Combat',
    patrolling_nest: 'Patrolling',
    going_to_den: 'Heading to Den',
    attacking_den: 'Destroying Den',
    healing: 'Healing 💚',
  };

  const beetleStateLabels: Record<string, string> = {
    roaming: 'Roaming',
    chasing_food: 'Hunting Food',
    eating: 'Eating',
    chasing_ant: 'Chasing Ant',
    attacking: 'Attacking',
  };

  const leafStored = Math.max(0, stats.foodStored - stats.mushroomStored - stats.meatStored);

  return (
    <div style={{
      height: '100%',
      background: 'var(--ui-panel)',
      borderLeft: '2px solid var(--ui-border)',
      padding: '12px',
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color: 'var(--ui-text)',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      overflowY: 'auto',
    }}>
      {/* Colony Overview */}
      <section>
        <h3 className="pixel-heading" style={{ margin: '0 0 12px 0' }}>
          Colony Overview
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>🐜 Workers:</span>
            <strong className={`pixel-number ${workerFlash}`}>{stats.workerCount}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>⚔️ Soldiers:</span>
            <strong className={`pixel-number ${soldierFlash}`}>{stats.soldierCount}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>🔭 Scouts:</span>
            <strong className={`pixel-number ${scoutFlash}`}>{stats.scoutCount}</strong>
          </div>
          <div style={{
            marginTop: '8px',
            padding: '8px',
            background: 'var(--ui-bg)',
            border: '1px solid var(--ui-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ fontSize: '11px', color: 'var(--ui-text-dim)' }}>Total Food:</span>
              <strong className={`pixel-number ${foodFlash}`} style={{ fontSize: '9px' }}>{stats.foodStored}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>🍃 Leaves:</span>
              <strong style={{ color: 'var(--accent-green)' }}>{leafStored}</strong>
            </div>
            <PixelBar ratio={leafStored / 200} color="var(--accent-green)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', marginBottom: '4px' }}>
              <span>🍄 Mushrooms:</span>
              <strong style={{ color: 'var(--accent-amber)' }}>{stats.mushroomStored}</strong>
            </div>
            <PixelBar ratio={stats.mushroomStored / 200} color="var(--accent-amber)" />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', marginBottom: '4px' }}>
              <span>🥩 Beetle Meat:</span>
              <strong style={{ color: 'var(--accent-red)' }}>{stats.meatStored}</strong>
            </div>
            <PixelBar ratio={stats.meatStored / 200} color="var(--accent-red)" />
          </div>
        </div>
      </section>

      {/* Threats */}
      {(stats.beetleCount > 0 || stats.beetleDenCount > 0) && (
        <section style={{
          padding: '8px',
          background: 'var(--ui-bg)',
          border: '2px solid var(--accent-red)',
        }}>
          <h3 className="pixel-heading" style={{ margin: '0 0 8px 0', color: 'var(--accent-red)' }}>
            ⚠️ Threats
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🪲 Beetles:</span>
              <strong style={{ color: 'var(--accent-red)' }}>{stats.beetleCount}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>🕳️ Dens:</span>
              <strong style={{ color: 'var(--accent-red)' }}>{stats.beetleDenCount}</strong>
            </div>
          </div>
        </section>
      )}

      {/* Retreat horn — emergency recall */}
      <button
        onClick={() => gameManager?.soundRetreat()}
        className="pixel-btn"
        style={{
          width: '100%',
          padding: '10px',
          marginBottom: '14px',
          color: 'var(--accent-amber)',
          fontSize: '13px',
          fontWeight: 'bold',
        }}
        title="Todas las hormigas de superficie vuelven al nido"
      >
        📯 ¡RETIRADA AL NIDO!
      </button>

      {/* Colony Priority */}
      <section>
        <h3 className="pixel-heading" style={{ margin: '0 0 12px 0' }}>
          Colony Priority
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { value: ColonyPriority.Gather, label: 'Gather', desc: 'Workers focus on food collection', icon: '🍃' },
            { value: ColonyPriority.Explore, label: 'Explore', desc: 'Scouts wander further afield', icon: '🔭' },
            { value: ColonyPriority.Defend, label: 'Defend', desc: 'Soldiers patrol nest and hunt beetles', icon: '⚔️' },
          ].map((priority) => (
            <button
              key={priority.value}
              onClick={() => handlePriorityChange(priority.value)}
              className={`pixel-btn${stats.colonyPriority === priority.value ? ' pixel-btn--active' : ''}`}
              style={{
                padding: '8px',
                textAlign: 'left',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '16px' }}>
                  {stats.colonyPriority === priority.value ? '■' : '□'}
                </span>
                <strong>{priority.icon} {priority.label}</strong>
              </div>
              <div style={{ fontSize: '11px', marginLeft: '24px', color: 'var(--ui-text-dim)' }}>
                {priority.desc}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Selected Entity */}
      {stats.selectedEntity && (
        <section style={{
          background: 'var(--ui-bg)',
          padding: '12px',
          border: '2px solid var(--accent-amber)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 className="pixel-heading" style={{ margin: 0 }}>
              Selected: {stats.selectedEntity.type === 'ant' && roleIcons[stats.selectedEntity.role!]}
              {stats.selectedEntity.type === 'food' && (
                stats.selectedEntity.foodType === 'beetle_meat' ? '🥩' :
                stats.selectedEntity.foodType === 'mushroom' ? '🍄' : '🍃'
              )}
              {stats.selectedEntity.type === 'nest' && '🏠'}
              {stats.selectedEntity.type === 'beetle' && '🪲'}
              {stats.selectedEntity.type === 'beetle_den' && '🕳️'}
              {' '}
              {stats.selectedEntity.type === 'ant' && `${stats.selectedEntity.role} Ant`}
              {stats.selectedEntity.type === 'food' && (
                stats.selectedEntity.foodType === 'beetle_meat' ? 'Beetle Meat' :
                stats.selectedEntity.foodType === 'mushroom' ? 'Mushroom' : 'Leaf'
              )}
              {stats.selectedEntity.type === 'nest' && 'Nest'}
              {stats.selectedEntity.type === 'beetle' && 'Beetle'}
              {stats.selectedEntity.type === 'beetle_den' && 'Beetle Den'}
            </h3>
            <button
              onClick={handleDeselect}
              className="pixel-btn"
              style={{
                padding: '4px 8px',
                fontSize: '11px',
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
            <div>
              <strong>Position:</strong> ({stats.selectedEntity.position.x}, {stats.selectedEntity.position.y})
            </div>

            {stats.selectedEntity.type === 'ant' && (
              <>
                <div>
                  <strong>State:</strong> {stateLabels[stats.selectedEntity.state!] || stats.selectedEntity.state}
                </div>
                {stats.selectedEntity.health && (
                  <div>
                    <strong>Health:</strong>
                    <div style={{ marginTop: '4px' }}>
                      <PixelBar
                        ratio={stats.selectedEntity.health.current / stats.selectedEntity.health.max}
                        color={healthColor(stats.selectedEntity.health.current / stats.selectedEntity.health.max)}
                      />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--ui-text-dim)', marginTop: '2px' }}>
                      {Math.round(stats.selectedEntity.health.current)} / {stats.selectedEntity.health.max}
                    </div>
                  </div>
                )}
                {stats.selectedEntity.hunger && (
                  <div>
                    <strong>Hunger:</strong>
                    <div style={{ marginTop: '4px' }}>
                      <PixelBar
                        ratio={stats.selectedEntity.hunger.current / stats.selectedEntity.hunger.max}
                        color="var(--accent-green)"
                      />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--ui-text-dim)', marginTop: '2px' }}>
                      {Math.round(stats.selectedEntity.hunger.current)} / {stats.selectedEntity.hunger.max}
                    </div>
                  </div>
                )}
                {stats.selectedEntity.carrying && (
                  <div>
                    <strong>Carrying:</strong>{' '}
                    {stats.selectedEntity.carrying.type
                      ? `${Math.round(stats.selectedEntity.carrying.amount)} ${stats.selectedEntity.carrying.type}`
                      : 'nothing'}
                  </div>
                )}
              </>
            )}

            {stats.selectedEntity.type === 'food' && (
              <>
                <div>
                  <strong>Type:</strong>{' '}
                  {stats.selectedEntity.foodType === 'beetle_meat' ? '🥩 Beetle Meat' :
                   stats.selectedEntity.foodType === 'mushroom' ? '🍄 Mushroom' : '🍃 Leaf'}
                </div>
                <div>
                  <strong>Amount:</strong> {stats.selectedEntity.foodAmount}
                </div>
              </>
            )}

            {stats.selectedEntity.type === 'nest' && (
              <>
                <div>
                  <strong>🍃 Leaves:</strong> {Math.max(0, (stats.selectedEntity.foodStored ?? 0) - (stats.selectedEntity.mushroomStored ?? 0) - (stats.selectedEntity.meatStored ?? 0))}
                </div>
                <div>
                  <strong>🍄 Mushrooms:</strong> {stats.selectedEntity.mushroomStored ?? 0}
                </div>
                <div>
                  <strong>🥩 Beetle Meat:</strong> {stats.selectedEntity.meatStored ?? 0}
                </div>
                <div>
                  <strong>Total Ants:</strong> {stats.selectedEntity.totalAnts}
                </div>
              </>
            )}

            {stats.selectedEntity.type === 'beetle' && (
              <>
                <div>
                  <strong>State:</strong> {beetleStateLabels[stats.selectedEntity.beetleState!] || stats.selectedEntity.beetleState}
                </div>
                {stats.selectedEntity.beetleHealth && (
                  <div>
                    <strong>Health:</strong>
                    <div style={{ marginTop: '4px' }}>
                      <PixelBar
                        ratio={stats.selectedEntity.beetleHealth.current / stats.selectedEntity.beetleHealth.max}
                        color={healthColor(stats.selectedEntity.beetleHealth.current / stats.selectedEntity.beetleHealth.max)}
                      />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--ui-text-dim)', marginTop: '2px' }}>
                      {Math.round(stats.selectedEntity.beetleHealth.current)} / {stats.selectedEntity.beetleHealth.max}
                    </div>
                  </div>
                )}
              </>
            )}

            {stats.selectedEntity.type === 'beetle_den' && (
              <>
                {stats.selectedEntity.denHealth && (
                  <div>
                    <strong>Health:</strong>
                    <div style={{ marginTop: '4px' }}>
                      <PixelBar
                        ratio={stats.selectedEntity.denHealth.current / stats.selectedEntity.denHealth.max}
                        color={healthColor(stats.selectedEntity.denHealth.current / stats.selectedEntity.denHealth.max)}
                      />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--ui-text-dim)', marginTop: '2px' }}>
                      {Math.round(stats.selectedEntity.denHealth.current)} / {stats.selectedEntity.denHealth.max}
                    </div>
                  </div>
                )}
                <div>
                  <strong>Active Beetles:</strong> {stats.selectedEntity.denActiveBeetles} / {stats.selectedEntity.denMaxBeetles}
                </div>
              </>
            )}

            {stats.selectedEntity.type === 'cricket' && (
              <>
                <div><strong>State:</strong> {stats.selectedEntity.cricketState}</div>
                {stats.selectedEntity.cricketHealth && (
                  <div>
                    <strong>Health:</strong>
                    <div style={{ marginTop: '4px' }}>
                      <PixelBar
                        ratio={stats.selectedEntity.cricketHealth.current / stats.selectedEntity.cricketHealth.max}
                        color={healthColor(stats.selectedEntity.cricketHealth.current / stats.selectedEntity.cricketHealth.max)}
                      />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--ui-text-dim)', marginTop: '2px' }}>
                      {Math.round(stats.selectedEntity.cricketHealth.current)} / {stats.selectedEntity.cricketHealth.max}
                    </div>
                  </div>
                )}
              </>
            )}

            {stats.selectedEntity.type === 'cricket_den' && (
              <>
                {stats.selectedEntity.cricketDenHealth && (
                  <div>
                    <strong>Health:</strong>
                    <div style={{ marginTop: '4px' }}>
                      <PixelBar
                        ratio={stats.selectedEntity.cricketDenHealth.current / stats.selectedEntity.cricketDenHealth.max}
                        color={healthColor(stats.selectedEntity.cricketDenHealth.current / stats.selectedEntity.cricketDenHealth.max)}
                      />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--ui-text-dim)', marginTop: '2px' }}>
                      {Math.round(stats.selectedEntity.cricketDenHealth.current)} / {stats.selectedEntity.cricketDenHealth.max}
                    </div>
                  </div>
                )}
                <div>
                  <strong>Active Crickets:</strong> {stats.selectedEntity.cricketDenActiveCrickets}
                </div>
              </>
            )}

            {/* Attack Wave Panel — for any enemy den */}
            {(stats.selectedEntity.type === 'beetle_den' || stats.selectedEntity.type === 'cricket_den') && stats.availableSoldiers > 0 && (
              <div style={{
                marginTop: '10px',
                padding: '8px',
                background: 'var(--ui-bg)',
                border: '2px solid var(--accent-red)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '14px' }}>⚔️</span>
                  <strong style={{ color: 'var(--accent-red)', fontSize: '12px' }}>Attack Wave</strong>
                  <span style={{ fontSize: '10px', color: 'var(--ui-text-dim)', marginLeft: 'auto' }}>
                    {stats.availableSoldiers} available
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="range"
                    min={Math.min(5, stats.availableSoldiers)}
                    max={Math.min(30, stats.availableSoldiers)}
                    value={Math.min(attackCount, stats.availableSoldiers)}
                    onChange={(e) => setAttackCount(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent-red)' }}
                  />
                  <span className="pixel-number" style={{ color: 'var(--accent-amber)', minWidth: '20px', textAlign: 'center' }}>
                    {Math.min(attackCount, stats.availableSoldiers)}
                  </span>
                </div>
                <button
                  onClick={handleDispatchAttack}
                  className="pixel-btn pixel-btn--danger"
                  style={{
                    width: '100%',
                    marginTop: '6px',
                    padding: '6px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                  }}
                >
                  Send {Math.min(attackCount, stats.availableSoldiers)} Soldiers
                </button>
                {lastDispatch && (
                  <div style={{ fontSize: '10px', color: 'var(--accent-green)', marginTop: '4px', textAlign: 'center' }}>
                    {lastDispatch}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
