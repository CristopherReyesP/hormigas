import type { ReactNode } from 'react';
import type { GameManager, GameStats, SelectedEntityInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { Portrait } from './Portrait';
import type { ColonyDetails, EggInfo } from './useColonyDetails';
import {
  ANT_STATE_LABEL, BEETLE_STATE_LABEL, ROLE_BLURB, CARRY_LABEL, CRICKET_STATE_LABEL, FOOD_LABEL, ROLE_LABEL, ROLE_PLURAL, formatClock,
} from './format';

interface InfoPanelProps {
  stats: GameStats;
  details: ColonyDetails;
  gameManager: GameManager | null;
  attackCount: number;
  onAttackCountChange: (count: number) => void;
}

function healthColor(ratio: number): string {
  return ratio > 0.5 ? 'var(--chrome-accent)' : ratio > 0.25 ? 'var(--chrome-warn)' : 'var(--chrome-danger)';
}

/** One-row bar: icon · label · segmented track · number ('ratio' = value/max, 'value', or none). */
function Bar({ label, value, max, color, icon, numbers = 'ratio' }: {
  label: string; value: number; max: number; color: string; icon?: IconName; numbers?: 'ratio' | 'value' | 'none';
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="info-bar">
      {icon && <PixelIcon name={icon} />}
      <span className="info-bar-label">{label}</span>
      <div className="hud-bar info-bar-track">
        <div className="hud-bar-fill" style={{ width: `${ratio * 100}%`, backgroundColor: color }} />
      </div>
      {numbers !== 'none' && (
        <span className="info-bar-num">
          {Math.round(value)}{numbers === 'ratio' ? `/${Math.round(max)}` : ''}
        </span>
      )}
    </div>
  );
}

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

const ROLE_ICON: Record<AntRole, IconName> = {
  [AntRole.Worker]: 'worker',
  [AntRole.Soldier]: 'sword',
  [AntRole.Scout]: 'eye',
  [AntRole.Nurse]: 'nurse',
  [AntRole.Defender]: 'shield',
};

/** Surface, nothing selected: castes, reserves, threats. */
function ColonySummary({ stats }: { stats: GameStats }) {
  const leaves = Math.max(0, stats.foodStored - stats.mushroomStored - stats.meatStored);
  const capacity = Math.max(stats.pantryCapacity, 1);
  const counts: Record<AntRole, number> = {
    [AntRole.Worker]: stats.workerCount,
    [AntRole.Soldier]: stats.soldierCount,
    [AntRole.Scout]: stats.scoutCount,
    [AntRole.Nurse]: stats.nurseCount,
    [AntRole.Defender]: stats.defenderCount,
  };
  const threats = stats.beetleCount + stats.cricketCount;
  return (
    <div className="info-grid">
      <Column title={`ENJAMBRE · ${stats.antCount}`}>
        {(Object.keys(counts) as AntRole[]).map((role) => (
          <Row key={role} icon={ROLE_ICON[role]} label={ROLE_PLURAL[role]} value={counts[role]} />
        ))}
      </Column>
      <Column title={`RESERVAS · ${stats.pantryStored}/${stats.pantryCapacity}`}>
        <Bar label="Hojas" icon="leaf" value={leaves} max={capacity} color="var(--chrome-accent)" numbers="value" />
        <Bar label="Hongos" icon="fungus" value={stats.mushroomStored} max={capacity} color="var(--chrome-warn)" numbers="value" />
        <Bar label="Carne" icon="meat" value={stats.meatStored} max={capacity} color="var(--chrome-danger)" numbers="value" />
      </Column>
      <Column title="AMENAZAS">
        <Row icon="beetle" label="Escarabajos" value={stats.beetleCount} tone={stats.beetleCount ? 'var(--chrome-danger)' : undefined} />
        <Row icon="den" label="Guaridas" value={stats.beetleDenCount + stats.cricketDenCount} />
        <Row icon="alert" label="Grillos" value={stats.cricketCount} tone={stats.cricketCount ? 'var(--chrome-danger)' : undefined} />
        <div className={`info-note${threats > 0 || stats.invasion.active ? ' info-note--danger' : ''}`}>
          {stats.invasion.active
            ? `¡Oleada ${stats.invasion.waveNumber} en el nido! ${stats.invasion.invadersAlive} invasores`
            : stats.invasion.armed
              ? `La oleada ${stats.invasion.waveNumber + 1} llega al anochecer`
              : `Oleada ${stats.invasion.waveNumber + 1} en ${formatClock(stats.invasion.nextWaveIn)}`}
        </div>
      </Column>
    </div>
  );
}

const FARM_STATUS: Record<string, string> = {
  produciendo: 'Produciendo',
  'sin-hojas': 'Sin hojas en la despensa',
  llena: 'Granja llena',
  'sin-tiles': 'Sin casillas de granja',
};

function EggList({ eggs, empty }: { eggs: EggInfo[]; empty: string }) {
  if (eggs.length === 0) return <div className="info-note">{empty}</div>;
  return (
    <>
      {eggs.slice(0, 3).map((egg, i) => {
        const hungry = egg.fedProgress !== undefined && egg.fedProgress < 1 && egg.progress >= 1;
        return (
          <Bar
            key={i}
            label={`${ROLE_LABEL[egg.role as AntRole] ?? egg.role}${hungry ? ' · con hambre' : ''}`}
            value={egg.progress * 100}
            max={100}
            color={hungry ? 'var(--chrome-warn)' : 'var(--chrome-border-light)'}
            numbers="none"
          />
        );
      })}
      {eggs.length > 3 && <div className="info-note">y {eggs.length - 3} más</div>}
    </>
  );
}

/** Underground, nothing selected: queen, pantry, farm, brood. */
function NestSummary({ details }: { details: ColonyDetails }) {
  const { queen, food, farm, garrison } = details;
  const pantryMax = Math.max(food.total, 1);
  const diet = { leaf: 'hojas', mushroom: 'hongos', meat: 'carne' }[details.eatFirst];
  return (
    <div className="info-grid info-grid--4">
      <Column title="REINA">
        {queen ? (
          <>
            <Bar label="Vida" icon="heart" value={queen.health} max={queen.maxHealth} color={healthColor(queen.health / Math.max(1, queen.maxHealth))} />
            <Bar label="Saciedad" icon="bowl" value={queen.hunger} max={queen.maxHunger} color="var(--chrome-accent)" />
            <div className="info-note">{queen.isLaying ? 'Poniendo huevos' : 'Descansando'} · guarnición {garrison.current}/{garrison.target}</div>
          </>
        ) : (
          <div className="info-note info-note--danger">Sin reina</div>
        )}
      </Column>
      <Column title={`DESPENSA · ${food.total}`}>
        <Bar label="Hojas" icon="leaf" value={food.leaves} max={pantryMax} color="var(--chrome-accent)" numbers="value" />
        <Bar label="Hongos" icon="fungus" value={food.mushrooms} max={pantryMax} color="var(--chrome-warn)" numbers="value" />
        <Bar label="Carne" icon="meat" value={food.meat} max={pantryMax} color="var(--chrome-danger)" numbers="value" />
        <div className="info-note">Comen primero: {diet}</div>
      </Column>
      <Column title={`GRANJA · ${farm.tiles}`}>
        {farm.tiles === 0 ? (
          <div className="info-note">Sin granja. Usa Granja de hongos y haz clic en casillas excavadas: convierte hojas en hongos.</div>
        ) : (
          <>
            <Bar label="Cosecha" icon="fungus" value={farm.stored} max={farm.capacity} color="var(--chrome-warn)" />
            <div className={`info-note${farm.status === 'produciendo' ? ' info-note--good' : ''}`}>
              {FARM_STATUS[farm.status] ?? farm.status}
              {farm.status === 'produciendo' ? ` · +${farm.rate.toFixed(1)}/s` : ''}
            </div>
          </>
        )}
      </Column>
      <Column title={`CRÍA · ${details.eggQueue.length + details.activeEggs.length}`}>
        {details.eggQueue.length > 0 && <div className="info-note">En cola: {details.eggQueue.length}</div>}
        <EggList eggs={details.activeEggs} empty="Sin huevos incubando" />
      </Column>
    </div>
  );
}

const DEN_KIND = new Set<SelectedEntityInfo['type']>(['beetle_den', 'cricket_den']);

function selectionTitle(sel: SelectedEntityInfo): { name: string; faction: string } {
  switch (sel.type) {
    case 'ant': return { name: ROLE_LABEL[sel.role ?? AntRole.Worker], faction: 'Enjambre mutante' };
    case 'nest': return { name: 'Nido', faction: 'Enjambre mutante · colmena' };
    case 'beetle': return { name: 'Escarabajo', faction: 'Fauna salvaje' };
    case 'cricket': return { name: 'Grillo', faction: 'Fauna salvaje' };
    case 'beetle_den': return { name: 'Guarida de escarabajos', faction: 'Fauna salvaje · guarida' };
    case 'cricket_den': return { name: 'Guarida de grillos', faction: 'Fauna salvaje · guarida' };
    case 'food': return { name: FOOD_LABEL[sel.foodType ?? 'leaf'] ?? 'Comida', faction: 'Recurso' };
  }
}

function SelectionBars({ sel }: { sel: SelectedEntityInfo }) {
  const health = sel.health ?? sel.beetleHealth ?? sel.cricketHealth ?? sel.denHealth ?? sel.cricketDenHealth;
  return (
    <>
      {health && (
        <Bar label="Vida" icon="heart" value={health.current} max={health.max} color={healthColor(health.current / Math.max(1, health.max))} />
      )}
      {sel.hunger && <Bar label="Saciedad" icon="bowl" value={sel.hunger.current} max={sel.hunger.max} color="var(--chrome-accent)" />}
      {sel.type === 'food' && (
        <Bar label="Cantidad" icon="leaf" value={sel.foodAmount ?? 0} max={Math.max(100, sel.foodAmount ?? 0)} color="var(--chrome-accent)" numbers="value" />
      )}
    </>
  );
}

function SelectionFacts({ sel }: { sel: SelectedEntityInfo }) {
  return (
    <>
      {sel.type === 'ant' && <div className="info-note">{ROLE_BLURB[sel.role ?? AntRole.Worker]}</div>}
      {sel.type === 'ant' && (
        <div className="info-line">Estado: <strong>{ANT_STATE_LABEL[sel.state ?? ''] ?? sel.state}</strong></div>
      )}
      {sel.type === 'ant' && sel.carrying && (
        <div className="info-line">
          Carga: <strong>{sel.carrying.type ? `${Math.round(sel.carrying.amount)} de ${CARRY_LABEL[sel.carrying.type] ?? sel.carrying.type}` : 'nada'}</strong>
        </div>
      )}
      {sel.type === 'beetle' && (
        <div className="info-line">Estado: <strong>{BEETLE_STATE_LABEL[sel.beetleState ?? ''] ?? sel.beetleState}</strong></div>
      )}
      {sel.type === 'cricket' && (
        <div className="info-line">Estado: <strong>{CRICKET_STATE_LABEL[sel.cricketState ?? ''] ?? sel.cricketState}</strong></div>
      )}
      {sel.type === 'nest' && (
        <>
          <div className="info-line">Hormigas: <strong>{sel.totalAnts}</strong></div>
          <div className="info-line">En el nido: <strong>{Math.round(sel.foodStored ?? 0)}</strong> de comida</div>
        </>
      )}
      {sel.type === 'beetle_den' && (
        <div className="info-line">Escarabajos activos: <strong>{sel.denActiveBeetles}/{sel.denMaxBeetles}</strong></div>
      )}
      {sel.type === 'cricket_den' && (
        <div className="info-line">Grillos activos: <strong>{sel.cricketDenActiveCrickets}</strong></div>
      )}
    </>
  );
}

function SelectionInfo({ stats, gameManager, attackCount, onAttackCountChange }: Omit<InfoPanelProps, 'details'>) {
  const sel = stats.selectedEntity!;
  const { name, faction } = selectionTitle(sel);
  const enemy = sel.type === 'beetle' || sel.type === 'cricket' || DEN_KIND.has(sel.type);
  const maxAttack = Math.min(30, stats.availableSoldiers);
  const sending = Math.min(attackCount, maxAttack);
  return (
    <div className="info-selection">
      <Portrait kind={sel.type} role={sel.role} foodType={sel.foodType} carrying={Boolean(sel.carrying?.type)} />
      <div className="info-unit">
        <div className={`info-name${enemy ? ' info-name--enemy' : ''}`}>{name.toUpperCase()}</div>
        <div className="info-note">{faction} · ({sel.position.x}, {sel.position.y})</div>
        <SelectionBars sel={sel} />
      </div>
      <div className="info-side">
        <SelectionFacts sel={sel} />
        {sel.type === 'nest' && (
          <div className="info-note">Haz clic otra vez en el nido, o usa Bajar al nido, para entrar al hormiguero.</div>
        )}
        {DEN_KIND.has(sel.type) && (
          <>
            <h3 className="hud-label">OLEADA DE ATAQUE</h3>
            <div className="info-note">{stats.availableSoldiers} soldados libres</div>
            <div className="info-stepper">
              <button type="button" className="hud-btn" disabled={sending <= 1} onClick={() => onAttackCountChange(Math.max(1, sending - 5))}>-5</button>
              <span className="info-stepper-value">{sending}</span>
              <button type="button" className="hud-btn" disabled={sending >= maxAttack} onClick={() => onAttackCountChange(Math.min(30, sending + 5))}>+5</button>
            </div>
            <div className="info-note">Envíalos con Atacar guarida (B)</div>
          </>
        )}
      </div>
      <button type="button" className="hud-btn info-close" title="Quitar selección (Esc)" onClick={() => gameManager?.clearSelection()}>
        ×
      </button>
    </div>
  );
}

/** Center console plate: what is selected, or the state of the colony on this layer. */
export function InfoPanel(props: InfoPanelProps) {
  const { stats, details } = props;
  return (
    <section className="console-info" aria-label="Información">
      <div className="chrome-plate console-plate">
      <div className="chrome-plate-inner console-info-inner">
        {stats.selectedEntity ? (
          <SelectionInfo {...props} />
        ) : stats.activeLayer === 'underground' ? (
          <NestSummary details={details} />
        ) : (
          <ColonySummary stats={stats} />
        )}
      </div>
      </div>
    </section>
  );
}
