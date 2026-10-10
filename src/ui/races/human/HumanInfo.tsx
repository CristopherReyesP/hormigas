import type { ReactNode } from 'react';
import type { GameManager, GameStats } from '../../../game/GameManager';
import type { HumanGroupInfo, HumanPlayerStats, HumanSelectedBuilding } from '../../../game/races/human/HumanPlayerRun';
import type { HumanUnitType } from '../../../game/rival/humanBase';
import { HUMAN_UNIT_NAME } from '../../../game/rival/humanInfo';
import { PixelIcon } from '../../console/PixelIcon';
import type { IconName } from '../../console/pixelIcons';
import { formatClock } from '../../console/format';
import './human.css';

const UNIT_ICON: Record<HumanUnitType, IconName> = {
  builder: 'pick',
  soldier: 'sword',
  marksman: 'target',
  tank: 'shield',
};

const UNIT_PLURAL: Record<HumanUnitType, string> = {
  builder: 'Constructores',
  soldier: 'Soldados',
  marksman: 'Tiradores',
  tank: 'Tanques',
};

const TYPES: readonly HumanUnitType[] = ['soldier', 'marksman', 'tank', 'builder'];

function Row({ icon, label, value, tone }: { icon: IconName; label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="info-row">
      <PixelIcon name={icon} />
      <span className="info-row-label">{label}</span>
      <span className="info-row-value" style={tone ? { color: tone } : undefined}>{value}</span>
    </div>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="info-col">
      <h3 className="hud-label">{title}</h3>
      {children}
    </section>
  );
}

function Bar({ label, ratio, color }: { label: string; ratio: number; color: string }) {
  return (
    <div className="info-bar">
      <span className="info-bar-label">{label}</span>
      <div className="hud-bar info-bar-track">
        <div className="hud-bar-fill" style={{ width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`, backgroundColor: color }} />
      </div>
      <span className="info-bar-num">{Math.round(ratio * 100)}%</span>
    </div>
  );
}

/** Nothing selected: the expedition's troops, economy and the next wave */
export function HumanBaseSummary({ human, stats }: { human: HumanPlayerStats; stats: GameStats }) {
  const total = TYPES.reduce((n, t) => n + human.units[t], 0);
  const full = human.supply >= human.supplyCap;
  return (
    <div className="info-grid">
      <Column title={`EXPEDICIÓN · ${total}`}>
        {TYPES.map((type) => <Row key={type} icon={UNIT_ICON[type]} label={UNIT_PLURAL[type]} value={human.units[type]} />)}
      </Column>
      <Column title="ECONOMÍA">
        <Row icon="bowl" label="Raciones" value={`${human.rations} (+${String(human.income).replace('.', ',')}/s)`} />
        <Row icon="mineral" label="Minerales" value={human.minerals} />
        <Row icon="group" label="Suministro" value={`${human.supply}/${human.supplyCap}`} tone={full ? 'var(--chrome-danger)' : undefined} />
        <div className={`info-note${full ? ' info-note--danger' : ''}`}>
          {full ? 'Suministro lleno: construye un depósito de suministros.' : 'Los constructores llevan los minerales al Centro de Mando.'}
        </div>
      </Column>
      <Column title="AMENAZAS">
        <div className={`info-note${stats.invasion.active ? ' info-note--danger' : ''}`}>
          {stats.invasion.active
            ? `¡Oleada ${stats.invasion.waveNumber}! ${stats.invasion.invadersAlive} enemigos van hacia el Centro de Mando`
            : `Oleada ${stats.invasion.waveNumber + 1} en ${formatClock(stats.invasion.nextWaveIn)}`}
        </div>
        {human.idleBuilders > 0 && (
          <div className="info-note info-note--danger">
            {human.idleBuilders === 1 ? 'Hay 1 constructor ocioso.' : `Hay ${human.idleBuilders} constructores ociosos.`}
          </div>
        )}
      </Column>
    </div>
  );
}

/** Several own Human units: a cell per unit (click one to keep only it) and the count per type */
export function HumanGroupPanel({ group, gameManager }: { group: HumanGroupInfo; gameManager: GameManager | null }) {
  return (
    <div className="info-group">
      <div className="group-grid" aria-label={`${group.count} unidades seleccionadas`}>
        {group.units.map((unit) => {
          const tier = unit.health > 0.5 ? 'ok' : unit.health > 0.25 ? 'hurt' : 'critical';
          const name = HUMAN_UNIT_NAME[unit.type];
          return (
            <button
              key={unit.id}
              type="button"
              className={`group-cell group-cell--${tier}${unit.ordered ? ' group-cell--ordered' : ''}`}
              aria-label={`${name}, vida ${Math.round(unit.health * 100)}%`}
              title={`${name} · vida ${Math.round(unit.health * 100)}%`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => gameManager?.selectOnly(unit.id)}
            >
              <PixelIcon name={UNIT_ICON[unit.type]} size={16} />
              <span className="group-cell-hp" style={{ width: `${Math.round(unit.health * 100)}%` }} />
            </button>
          );
        })}
      </div>
      <div className="group-side">
        <h3 className="hud-label">GRUPO · {group.count}</h3>
        {TYPES.filter((type) => group.byType[type]).map((type) => (
          <Row key={type} icon={UNIT_ICON[type]} label={UNIT_PLURAL[type]} value={group.byType[type]} />
        ))}
        <div className={`info-note${group.ordered > 0 ? ' info-note--good' : ''}`}>
          {group.ordered > 0 ? `${group.ordered} en marcha` : 'Clic derecho: mover o atacar · A: avanzar atacando'}
        </div>
      </div>
      <button type="button" className="hud-btn info-close" title="Quitar selección (Esc)" onClick={() => gameManager?.clearSelection()}>
        ×
      </button>
    </div>
  );
}

/** The selected own building: construction, then its production queue and rally point */
export function HumanProduction({ selected }: { selected: HumanSelectedBuilding }) {
  if (selected.construction !== null) {
    return (
      <>
        <h3 className="hud-label">EN CONSTRUCCIÓN</h3>
        <Bar label="Obra" ratio={selected.construction} color="var(--chrome-warn)" />
        <div className="info-note">Otro constructor puede ayudar: selecciónalo y haz clic derecho en la obra.</div>
      </>
    );
  }
  if (selected.trains.length === 0) return null;
  return (
    <>
      <h3 className="hud-label">PRODUCCIÓN · {selected.queue.length}/5</h3>
      {selected.queue.length > 0 ? (
        <>
          <Bar label={HUMAN_UNIT_NAME[selected.queue[0]]} ratio={selected.progress} color="var(--chrome-accent)" />
          <div className="info-line">Lista en <strong>{selected.remaining} s</strong></div>
          <div className="human-queue" aria-label="Cola de producción">
            {selected.queue.map((type, i) => (
              <span key={i} className="human-queue-slot" title={HUMAN_UNIT_NAME[type]}><PixelIcon name={UNIT_ICON[type]} size={16} /></span>
            ))}
          </div>
        </>
      ) : (
        <div className="info-note">Sin producción. Usa los botones de entrenar.</div>
      )}
      <div className="info-note">{selected.rally ? `Punto de reunión: (${selected.rally.x}, ${selected.rally.y})` : 'Clic derecho en el suelo: punto de reunión'}</div>
    </>
  );
}
