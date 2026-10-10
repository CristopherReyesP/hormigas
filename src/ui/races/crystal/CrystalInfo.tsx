import type { GameManager, GameStats } from '../../../game/GameManager';
import type { CrystalPlayerSnapshot, CrystalSelectionInfo } from '../../../game/races/crystal/CrystalPlayerController';
import { CRYSTAL_UNIT_BLURB, CRYSTAL_UNIT_NAME, SPIRE_BLURB, SPIRE_NAME } from '../../../game/rival/crystalNames';
import { Bar, Column, Row, SelectionBars, SelectionFacts } from '../../console/InfoPanel';
import { Portrait } from '../../console/Portrait';
import { PixelIcon } from '../../console/PixelIcon';
import { HumanPortrait } from '../../console/HumanPortrait';
import { selectionTitle } from '../../console/infoSummary';
import { formatClock } from '../../console/format';
import { useTouchUi } from '../../layout/touch';

interface CrystalInfoProps {
  stats: GameStats;
  gameManager: GameManager | null;
  crystal: CrystalPlayerSnapshot;
}

const SHIELD = 'var(--race-crystal)';

function healthColor(ratio: number): string {
  return ratio > 0.5 ? 'var(--chrome-accent)' : ratio > 0.25 ? 'var(--chrome-warn)' : 'var(--chrome-danger)';
}

function Close({ gameManager }: { gameManager: GameManager | null }) {
  return (
    <button type="button" className="hud-btn info-close" title="Quitar selección (Esc)" onClick={() => gameManager?.clearSelection()}>
      ×
    </button>
  );
}

/** Nothing selected: the Hive, the army, the structures and the next wave */
function Summary({ stats, crystal }: { stats: GameStats; crystal: CrystalPlayerSnapshot }) {
  const { invasion } = stats;
  return (
    <div className="info-grid info-grid--4">
      <Column title="COLMENA">
        {crystal.hiveShield && <Bar label="Escudo" icon="shield" value={crystal.hiveShield.current} max={crystal.hiveShield.max} color={SHIELD} />}
        {crystal.hiveHealth && (
          <Bar label="Vida" icon="heart" value={crystal.hiveHealth.current} max={crystal.hiveHealth.max} color={healthColor(crystal.hiveHealth.current / Math.max(1, crystal.hiveHealth.max))} />
        )}
        <div className="info-note">Si cae la colmena, pierdes. Dispara a los enemigos cercanos.</div>
      </Column>
      <Column title={`EJÉRCITO · ${crystal.supply.used}/${crystal.supply.cap}`}>
        <Row icon="sword" label="Drones" value={crystal.units.drones} />
        <Row icon="eye" label="Centinelas" value={crystal.units.sentinels} />
        <div className="info-note">Más pisos en las agujas, más suministro.</div>
      </Column>
      <Column title="ESTRUCTURAS" optional>
        <Row icon="mineral" label="Extractores" value={crystal.structures.extractors} />
        <Row icon="upgrade" label="Agujas" value={crystal.structures.forges + crystal.structures.prisms} />
        {crystal.structures.growing > 0 && <Row icon="hourglass" label="Cristalizando" value={crystal.structures.growing} />}
        <div className="info-note">+{crystal.income.toFixed(1)} minerales por segundo</div>
      </Column>
      <Column title="AMENAZAS">
        <Row icon="beetle" label="Acorazados" value={stats.beetleCount} tone={stats.beetleCount ? 'var(--chrome-danger)' : undefined} />
        <div className={`info-note${invasion.active ? ' info-note--danger' : ''}`}>
          {invasion.active
            ? `¡Oleada ${invasion.waveNumber}! ${invasion.invadersAlive} enemigos van hacia la colmena`
            : `Oleada ${invasion.waveNumber + 1} en ${formatClock(invasion.nextWaveIn)}: llegará por la superficie`}
        </div>
      </Column>
    </div>
  );
}

/** An own spire: its growth, floors, queue and rally point */
function SpireInfo({ sel, stats, gameManager }: { sel: CrystalSelectionInfo; stats: GameStats; gameManager: GameManager | null }) {
  const touch = useTouchUi();
  const entity = stats.selectedEntity!;
  const kind = sel.spireKind ?? 'forge';
  const producer = sel.producer;
  return (
    <div className="info-selection">
      <Portrait kind="crystal_spire" />
      <div className="info-unit">
        <div className="info-name">{SPIRE_NAME[kind].toUpperCase()}</div>
        <div className="info-note">Tuya · pisos {sel.floors ?? 1}/{sel.maxFloors ?? 3}</div>
        <SelectionBars sel={entity} />
        {sel.construction && (
          <Bar
            label={sel.construction.kind === 'build' ? 'Cristaliza' : 'Nuevo piso'}
            icon="hourglass"
            value={Math.round(sel.construction.progress * 100)}
            max={100}
            color={SHIELD}
            numbers="none"
          />
        )}
      </div>
      <div className="info-side">
        <div className="info-note">{SPIRE_BLURB[kind]}</div>
        {producer && (
          <>
            <h3 className="hud-label">COLA · {producer.queue.length}/5</h3>
            <div className="info-line crystal-queue" aria-label="Cola de producción">
              {producer.queue.length === 0 && <span className="hud-dim">Vacía</span>}
              {producer.queue.map((unit, i) => (
                <span key={i} className="crystal-queue-chip" title={CRYSTAL_UNIT_NAME[unit]}>
                  <PixelIcon name={unit === 'drone' ? 'sword' : 'eye'} />
                </span>
              ))}
            </div>
            {producer.queue.length > 0 && (
              <Bar label={producer.blocked ? 'Sin suministro' : `${Math.ceil(producer.remaining)} s`} icon="hourglass" value={producer.progress * 100} max={100} color="var(--chrome-accent)" numbers="none" />
            )}
            {producer.blocked && <div className="info-note info-note--danger">Suministro al máximo: añade un piso o pierde unidades.</div>}
            <div className="info-note">
              {producer.rally ? `Reunión en (${producer.rally.x}, ${producer.rally.y}). ` : ''}
              {touch ? 'Toca el suelo para fijar el punto de reunión.' : 'Clic derecho en el suelo: punto de reunión.'}
            </div>
          </>
        )}
      </div>
      <Close gameManager={gameManager} />
    </div>
  );
}

/** One selected entity that is not an own spire: own units and the Hive, or an enemy */
function EntityInfo({ stats, gameManager }: { stats: GameStats; gameManager: GameManager | null }) {
  const sel = stats.selectedEntity!;
  const { name, faction } = selectionTitle(sel);
  return (
    <div className="info-selection">
      {sel.human ? (
        <HumanPortrait human={sel.human} />
      ) : (
        <Portrait kind={sel.type} role={sel.role} foodType={sel.foodType} crystalKind={sel.crystalKind} />
      )}
      <div className="info-unit">
        <div className={`info-name${sel.owned ? '' : ' info-name--enemy'}`}>{name.toUpperCase()}</div>
        <div className="info-note">{faction} · ({sel.position.x}, {sel.position.y})</div>
        <SelectionBars sel={sel} />
      </div>
      <div className="info-side">
        {sel.owned && sel.type === 'crystal_unit' && <div className="info-note">{CRYSTAL_UNIT_BLURB[sel.crystalKind ?? 'drone']}</div>}
        {sel.owned && sel.type === 'crystal_hive' && (
          <div className="info-note">Tu núcleo: da suministro y minerales, y dispara a los enemigos cercanos. Si cae, pierdes.</div>
        )}
        {!sel.owned && <SelectionFacts sel={sel} />}
        {!sel.owned && sel.type !== 'food' && (
          <div className="info-note">Selecciona tus unidades y haz clic derecho sobre él para atacarlo.</div>
        )}
      </div>
      <Close gameManager={gameManager} />
    </div>
  );
}

/** Several own units: how many of each kind, and how many are on the move */
function GroupInfo({ stats, crystal, gameManager }: { stats: GameStats; crystal: CrystalPlayerSnapshot; gameManager: GameManager | null }) {
  const touch = useTouchUi();
  const group = stats.selectedGroup!;
  return (
    <div className="info-group">
      <div className="group-side">
        <h3 className="hud-label">GRUPO · {group.count}</h3>
        {crystal.selectedKinds.drones > 0 && <Row icon="sword" label={CRYSTAL_UNIT_NAME.drone} value={crystal.selectedKinds.drones} />}
        {crystal.selectedKinds.sentinels > 0 && <Row icon="eye" label={CRYSTAL_UNIT_NAME.sentinel} value={crystal.selectedKinds.sentinels} />}
        <div className={`info-note${group.ordered > 0 ? ' info-note--good' : ''}`}>
          {group.ordered > 0 ? `${group.ordered} en marcha` : touch ? 'Toca el suelo para mover, o un enemigo para atacar' : 'Clic derecho: mover o atacar · S: detener'}
        </div>
      </div>
      <Close gameManager={gameManager} />
    </div>
  );
}

/** The info panel's body while the player plays the Crystal Hive */
export function CrystalInfo({ stats, gameManager, crystal }: CrystalInfoProps) {
  if (stats.selectedGroup) return <GroupInfo stats={stats} crystal={crystal} gameManager={gameManager} />;
  if (stats.selectedEntity && crystal.selection?.kind === 'spire') return <SpireInfo sel={crystal.selection} stats={stats} gameManager={gameManager} />;
  if (stats.selectedEntity) return <EntityInfo stats={stats} gameManager={gameManager} />;
  return <Summary stats={stats} crystal={crystal} />;
}
