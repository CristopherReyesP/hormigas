import { useState, type ReactNode } from 'react';
import type { GameManager, GameStats, SelectedEntityInfo, SelectedGroupInfo } from '../../game/GameManager';
import { AntRole } from '../../game/components/components';
import { LEAPER_NAME } from '../../shared/wildlifeNames';
import { PixelIcon } from './PixelIcon';
import type { IconName } from './pixelIcons';
import { Portrait } from './Portrait';
import { HumanPortrait } from './HumanPortrait';
import type { ColonyDetails } from './useColonyDetails';
import { deriveBroodPipeline } from './brood';
import { BroodReadout } from './BroodReadout';
import { broodKeys } from './commands';
import { ControlGroupBar } from './ControlGroupBar';
import { infoSummary, selectionHealth, selectionTitle } from './infoSummary';
import { CRYSTAL_UNIT_BLURB, SPIRE_BLURB } from '../../game/rival/crystalNames';
import { CRYSTAL_MAX_FLOORS } from '../../game/rival/crystalRival';
import { useTouchUi } from '../layout/touch';
import { HumanBaseSummary, HumanGroupPanel, HumanProduction } from '../races/human/HumanInfo';
import {
  ANT_STATE_LABEL, BEETLE_STATE_LABEL, ROLE_BLURB, CARRY_LABEL, CRICKET_STATE_LABEL, ROLE_ICON, ROLE_LABEL, ROLE_PLURAL, formatClock,
} from './format';

interface InfoPanelProps {
  stats: GameStats;
  details: ColonyDetails;
  gameManager: GameManager | null;
  attackCount: number;
  onAttackCountChange: (count: number) => void;
  /** Compact HUD: the panel is open over the map (the hint line's details button drives it when given) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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

/** `optional` columns repeat the top strip and give way to the brood readout on narrow screens */
function Column({ title, children, optional = false }: { title: string; children: ReactNode; optional?: boolean }) {
  return (
    <section className={optional ? 'info-col info-col--optional' : 'info-col'}>
      <h3 className="hud-label">{title}</h3>
      {children}
    </section>
  );
}

function Brood({ details }: { details: ColonyDetails }) {
  return <BroodReadout pipeline={deriveBroodPipeline(details.brood, broodKeys())} />;
}

/** Surface, nothing selected: castes, reserves, threats, brood. */
function ColonySummary({ stats, details }: { stats: GameStats; details: ColonyDetails }) {
  const counts: Record<AntRole, number> = {
    [AntRole.Worker]: stats.workerCount,
    [AntRole.Soldier]: stats.soldierCount,
    [AntRole.Scout]: stats.scoutCount,
    [AntRole.Nurse]: stats.nurseCount,
    [AntRole.Defender]: stats.defenderCount,
  };
  const threats = stats.beetleCount + stats.cricketCount;
  return (
    <div className="info-grid info-grid--brood">
      <Column title={`ENJAMBRE · ${stats.antCount}`} optional>
        {(Object.keys(counts) as AntRole[]).map((role) => (
          <Row key={role} icon={ROLE_ICON[role]} label={ROLE_PLURAL[role]} value={counts[role]} />
        ))}
      </Column>
      <Column title="RESERVAS">
        <Row icon="leaf" label="En la entrada" value={details.brood.surfaceStock} />
        <Bar label="Despensa" icon="pantry" value={stats.pantryStored} max={stats.pantryCapacity} color="var(--chrome-accent)" />
        <div className="info-note">Las obreras bajan la comida a la despensa. Arriba se pudre.</div>
      </Column>
      <Column title="AMENAZAS">
        <Row icon="beetle" label="Acorazados" value={stats.beetleCount} tone={stats.beetleCount ? 'var(--chrome-danger)' : undefined} />
        <Row icon="den" label="Guaridas" value={stats.beetleDenCount + stats.cricketDenCount} />
        <Row icon="alert" label={LEAPER_NAME.many} value={stats.cricketCount} tone={stats.cricketCount ? 'var(--chrome-danger)' : undefined} />
        <div className={`info-note${threats > 0 || stats.invasion.active ? ' info-note--danger' : ''}`}>
          {stats.invasion.active
            ? `¡Oleada ${stats.invasion.waveNumber} en el nido! ${stats.invasion.invadersAlive} invasores`
            : stats.invasion.armed
              ? `La oleada ${stats.invasion.waveNumber + 1} llega al anochecer, en ${formatClock(stats.invasion.nextWaveIn)}`
              : `Oleada ${stats.invasion.waveNumber + 1} en ${formatClock(stats.invasion.nextWaveIn)}`}
        </div>
      </Column>
      <Brood details={details} />
    </div>
  );
}

const FARM_STATUS: Record<string, string> = {
  produciendo: 'Produciendo',
  'sin-hojas': 'Sin hojas en la despensa',
  llena: 'Granja llena',
  'sin-tiles': 'Sin casillas de granja',
};

/** Underground, nothing selected: queen, pantry, farm, brood. */
function NestSummary({ details }: { details: ColonyDetails }) {
  const { queen, food, farm, garrison } = details;
  const pantryMax = Math.max(food.total, 1);
  const diet = { leaf: 'hojas', mushroom: 'hongos', meat: 'carne' }[details.eatFirst];
  return (
    <div className="info-grid info-grid--brood">
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
      <Column title={`DESPENSA · ${food.total}`} optional>
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
      <Brood details={details} />
    </div>
  );
}

const DEN_KIND = new Set<SelectedEntityInfo['type']>(['beetle_den', 'cricket_den', 'crystal_hive', 'crystal_spire', 'human_building']);

/** What the attack-wave note calls the selected base */
function attackLabel(type: SelectedEntityInfo['type']): string {
  if (type === 'crystal_hive') return 'Atacar colmena';
  if (type === 'crystal_spire') return 'Atacar aguja';
  if (type === 'human_building') return 'Atacar edificio';
  return 'Atacar guarida';
}

/** Crystal shields read in the hive's own cyan */
const SHIELD_COLOR = 'var(--race-crystal)';

const CRYSTAL_STATE_LABEL: Record<string, string> = {
  guarding: 'En guardia en la colmena',
  assaulting: 'Al asalto de tu nido',
  raiding: 'De incursión en tus minas',
};

function SelectionBars({ sel }: { sel: SelectedEntityInfo }) {
  const health = selectionHealth(sel);
  return (
    <>
      {sel.shield && <Bar label="Escudo" icon="shield" value={sel.shield.current} max={sel.shield.max} color={SHIELD_COLOR} />}
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
        <div className="info-line">Acorazados activos: <strong>{sel.denActiveBeetles}/{sel.denMaxBeetles}</strong></div>
      )}
      {sel.type === 'cricket_den' && (
        <div className="info-line">{LEAPER_NAME.many} activos: <strong>{sel.cricketDenActiveCrickets}</strong></div>
      )}
      {sel.type === 'crystal_unit' && (
        <>
          <div className="info-line">Estado: <strong>{CRYSTAL_STATE_LABEL[sel.crystalState ?? ''] ?? sel.crystalState}</strong></div>
          <div className="info-note">{CRYSTAL_UNIT_BLURB[sel.crystalKind ?? 'drone']}</div>
        </>
      )}
      {sel.type === 'crystal_spire' && (
        <>
          <div className="info-line">Pisos: <strong>{sel.spireFloors ?? 1}/{CRYSTAL_MAX_FLOORS}</strong></div>
          <div className="info-note">{SPIRE_BLURB[sel.spireKind ?? 'forge']}</div>
        </>
      )}
      {sel.type === 'crystal_hive' && sel.rival && (
        <>
          <div className="info-line">Minerales: <strong>{sel.rival.bank}</strong> · Agujas: <strong>{sel.rival.spires}</strong></div>
          <div className="info-line">Guardia: <strong>{sel.rival.garrison}</strong></div>
          <div className="info-note">El escudo absorbe los golpes y se recarga si dejas de atacar.</div>
        </>
      )}
      {sel.human && (
        <>
          <div className="info-note">{sel.human.blurb}</div>
          {sel.human.facts.map((fact) => (
            <div key={fact} className="info-line">{fact}</div>
          ))}
        </>
      )}
    </>
  );
}

function SelectionInfo({ stats, gameManager, attackCount, onAttackCountChange }: Omit<InfoPanelProps, 'details'>) {
  const sel = stats.selectedEntity!;
  const { name, faction } = selectionTitle(sel);
  const enemy = !sel.human?.own && (sel.type === 'beetle' || sel.type === 'cricket' || sel.type === 'crystal_unit' || sel.type === 'crystal_spire'
    || sel.type === 'human_unit' || DEN_KIND.has(sel.type));
  const maxAttack = Math.min(30, stats.availableSoldiers);
  const sending = Math.min(attackCount, maxAttack);
  return (
    <div className="info-selection">
      {sel.human ? (
        <HumanPortrait human={sel.human} />
      ) : (
        <Portrait kind={sel.type} role={sel.role} foodType={sel.foodType} carrying={Boolean(sel.carrying?.type)} crystalKind={sel.crystalKind} />
      )}
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
        {stats.human?.selected && <HumanProduction selected={stats.human.selected} />}
        {/* The attack wave sends free soldier ants: a Human player orders troops instead */}
        {DEN_KIND.has(sel.type) && !stats.human && (
          <>
            <h3 className="hud-label">OLEADA DE ATAQUE</h3>
            <div className="info-note">{stats.availableSoldiers} soldados libres</div>
            <div className="info-stepper">
              <button type="button" className="hud-btn" disabled={sending <= 1} onClick={() => onAttackCountChange(Math.max(1, sending - 5))}>-5</button>
              <span className="info-stepper-value">{sending}</span>
              <button type="button" className="hud-btn" disabled={sending >= maxAttack} onClick={() => onAttackCountChange(Math.min(30, sending + 5))}>+5</button>
            </div>
            <div className="info-note">Envíalos con {attackLabel(sel.type)} (A)</div>
          </>
        )}
      </div>
      <button type="button" className="hud-btn info-close" title="Quitar selección (Esc)" onClick={() => gameManager?.clearSelection()}>
        ×
      </button>
    </div>
  );
}

/** Wireframe cells that fit the panel: 3 rows of 8. */
const GROUP_CELLS = 24;

/** Castes in the order the group panel lists them: fighters first. */
const GROUP_ROLES: readonly AntRole[] = [AntRole.Soldier, AntRole.Defender, AntRole.Worker, AntRole.Scout, AntRole.Nurse];

function healthTier(ratio: number): 'ok' | 'hurt' | 'critical' {
  return ratio > 0.5 ? 'ok' : ratio > 0.25 ? 'hurt' : 'critical';
}

/**
 * StarCraft's multi-unit view: one wireframe cell per ant, tinted by its
 * health (click one to select only that ant), and the count per caste.
 */
function GroupInfo({ group, gameManager, underground }: { group: SelectedGroupInfo; gameManager: GameManager | null; underground: boolean }) {
  // A full grid gives its last cell to the "+N" counter
  const shown = group.count > GROUP_CELLS ? group.units.slice(0, GROUP_CELLS - 1) : group.units;
  const hidden = group.count - shown.length;
  const touch = useTouchUi();
  return (
    <div className="info-group">
      <div className="group-grid" aria-label={`${group.count} hormigas seleccionadas`}>
        {shown.map((unit) => {
          const name = ROLE_LABEL[unit.role];
          const classes = [
            'group-cell',
            `group-cell--${healthTier(unit.health)}`,
            unit.ordered ? 'group-cell--ordered' : '',
          ].filter(Boolean).join(' ');
          return (
            <button
              key={unit.id}
              type="button"
              className={classes}
              aria-label={`${name}, vida ${Math.round(unit.health * 100)}%`}
              title={`${name} · vida ${Math.round(unit.health * 100)}%${unit.ordered ? ' · en marcha' : ''}`}
              onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
              onClick={() => gameManager?.selectOnly(unit.id)}
            >
              <PixelIcon name={ROLE_ICON[unit.role]} size={16} />
              <span className="group-cell-hp" style={{ width: `${Math.round(unit.health * 100)}%` }} />
            </button>
          );
        })}
        {hidden > 0 && <div className="group-more">+{hidden}</div>}
      </div>
      <div className="group-side">
        <h3 className="hud-label">GRUPO · {group.count}</h3>
        {GROUP_ROLES.filter((role) => group.byRole[role]).map((role) => (
          <Row key={role} icon={ROLE_ICON[role]} label={ROLE_PLURAL[role]} value={group.byRole[role]} />
        ))}
        <div className={`info-note${group.ordered > 0 ? ' info-note--good' : ''}`}>
          {group.ordered > 0
            ? `${group.ordered} en marcha`
            : underground
              ? 'Por ahora las órdenes solo funcionan en la superficie.'
              : touch
                ? 'Toca el suelo para mover, o un enemigo para atacar'
                : 'Clic derecho: mover o atacar · S: detener'}
        </div>
      </div>
      <button type="button" className="hud-btn info-close" title="Quitar selección (Esc)" onClick={() => gameManager?.clearSelection()}>
        ×
      </button>
    </div>
  );
}

/**
 * Center console plate: what is selected, or the state of the colony on this
 * layer; control group chips ride its top edge. The compact HUD folds it to
 * a one-line bar (info-summary) that a tap opens over the map.
 */
export function InfoPanel(props: InfoPanelProps) {
  const { stats, details } = props;
  const [ownOpen, setOwnOpen] = useState(false);
  const open = props.open ?? ownOpen;
  const setOpen = (next: (o: boolean) => boolean) => {
    const value = next(open);
    if (props.onOpenChange) props.onOpenChange(value);
    else setOwnOpen(value);
  };
  const selected = Boolean(stats.selectedGroup || stats.selectedEntity);
  return (
    <section className={open ? 'console-info console-info--open' : 'console-info'} aria-label="Información">
      <ControlGroupBar groups={stats.controlGroups ?? []} onRecall={(slot) => props.gameManager?.recallControlGroup(slot)} />
      <div className="info-summary">
        <button
          type="button"
          className="info-toggle"
          aria-expanded={open}
          title={open ? 'Ocultar los detalles' : 'Ver los detalles'}
          onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
          onClick={() => setOpen((o) => !o)}
        >
          <span className="info-toggle-text">{infoSummary(stats, details)}</span>
          <PixelIcon name={open ? 'minus' : 'plus'} />
        </button>
        {selected && (
          <button
            type="button"
            className="hud-btn info-summary-close"
            aria-label="Quitar selección"
            title="Quitar selección (Esc)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => props.gameManager?.clearSelection()}
          >
            ×
          </button>
        )}
      </div>
      <div className="chrome-plate console-plate">
      <div className="chrome-plate-inner console-info-inner">
        {stats.human?.group ? (
          <HumanGroupPanel group={stats.human.group} gameManager={props.gameManager} />
        ) : stats.selectedGroup ? (
          <GroupInfo group={stats.selectedGroup} gameManager={props.gameManager} underground={stats.activeLayer === 'underground'} />
        ) : stats.selectedEntity ? (
          <SelectionInfo {...props} />
        ) : stats.activeLayer === 'underground' ? (
          <NestSummary details={details} />
        ) : stats.human ? (
          <HumanBaseSummary human={stats.human} stats={stats} />
        ) : (
          <ColonySummary stats={stats} details={details} />
        )}
      </div>
      </div>
    </section>
  );
}
