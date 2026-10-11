import { useEffect, useRef, useState } from 'react';
import type { UpgradeInfo } from '../../game/upgrades/upgradeView';
import type { UpgradeCost, UpgradeId } from '../../game/upgrades/upgradeTable';
import type { ColonyStatsReport } from '../../game/upgrades/colonyStats';
import type { UpgradeFunds } from '../../game/upgrades/purchase';
import { PixelIcon } from '../console/PixelIcon';
import { ROLE_ICON, ROLE_PLURAL } from '../console/format';
import { confirmSelected, doubleClickLine, guarded, openFlow, selectLine, type PurchaseFlow } from './purchaseFlow';
import { UPGRADE_ICON, UPGRADE_TABS, affordableIn, effectText, isInfoTab, missingText, type UpgradeTab } from './upgradeUi';
import type { MutationId } from '../../game/run/MutationDefinitions';
import { mutationCapacity, mutationTotals, ownedMutations, type StatLine } from '../../game/run/mutationSummary';
import './upgrades.css';

export interface UpgradesPanelProps {
  upgrades: readonly UpgradeInfo[];
  report: ColonyStatsReport | null;
  funds: UpgradeFunds;
  initialTab: UpgradeTab;
  /** The run's mutation picks, in order (the Mutaciones tab) */
  mutations?: readonly MutationId[];
  touch: boolean;
  /** Buy the line's next level; false when the colony could not pay */
  onBuy: (id: UpgradeId) => boolean;
  onClose: () => void;
  /** Clock for the open guard (tests pass their own) */
  now?: () => number;
}

const LEVEL_UP_MS = 900;
const defaultNow = () => performance.now();

function CostChips({ cost, missing }: { cost: UpgradeCost; missing: UpgradeCost }) {
  const chip = (amount: number, short: boolean, icon: 'pantry' | 'mineral' | 'fungus', label: string) =>
    amount > 0 && (
      <span className={short ? 'upg-cost upg-cost--short' : 'upg-cost'} title={label}>
        <PixelIcon name={icon} size={8} />
        {amount}
      </span>
    );
  return (
    <span className="upg-costs">
      {chip(cost.food, missing.food > 0, 'pantry', 'comida de la despensa')}
      {chip(cost.minerals, missing.minerals > 0, 'mineral', 'minerales')}
      {chip(cost.mushrooms, missing.mushrooms > 0, 'fungus', 'hongos')}
    </span>
  );
}

function LevelPips({ level, max }: { level: number; max: number }) {
  return (
    <span className="upg-level" aria-label={`Nivel ${level} de ${max}`}>
      <span className="upg-pips" aria-hidden="true">
        {Array.from({ length: max }, (_, i) => <span key={i} className={i < level ? 'upg-pip upg-pip--on' : 'upg-pip'} />)}
      </span>
      {level}/{max}
    </span>
  );
}

interface CardProps {
  info: UpgradeInfo;
  selected: boolean;
  levelUp: number | null;
  onSelect: () => void;
  onDouble: () => void;
}

function UpgradeCard({ info, selected, levelUp, onSelect, onDouble }: CardProps) {
  const maxed = info.cost === null;
  const classes = [
    'upg-card',
    selected ? 'upg-card--selected' : '',
    info.affordable ? 'upg-card--ready' : '',
    maxed ? 'upg-card--max' : '',
    levelUp !== null ? 'upg-card--levelup' : '',
  ].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      className={classes}
      aria-pressed={selected}
      data-upgrade={info.id}
      data-sfx="none"
      onMouseDown={(e) => e.preventDefault()} // keep focus off: Space must stay the pause key
      onClick={onSelect}
      onDoubleClick={onDouble}
    >
      <span className="upg-card-icon"><PixelIcon name={UPGRADE_ICON[info.id]} size={16} /></span>
      <span className="upg-card-main">
        <span className="upg-card-title">
          <span className="upg-card-name">{info.name}</span>
          <LevelPips level={info.level} max={info.maxLevel} />
        </span>
        {info.effects.map((line) => (
          <span key={line.label} className="upg-effect">
            {line.label}: <strong>{line.now}</strong>
            {line.next !== null && <> <span className="upg-arrow" aria-label="pasa a">→</span> <strong className="upg-next">{line.next}</strong></>}
          </span>
        ))}
        <span className="upg-card-foot">
          {maxed ? <span className="upg-maxed">NIVEL MÁXIMO</span> : <CostChips cost={info.cost!} missing={info.missing} />}
        </span>
      </span>
      {levelUp !== null && <span key={levelUp} className="upg-levelup">¡NIVEL {info.level}!</span>}
    </button>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="upg-stat">
      <span className="upg-stat-label">{label}</span>
      <span className="upg-stat-value">{value}</span>
    </div>
  );
}

export function StatsView({ report }: { report: ColonyStatsReport | null }) {
  if (!report) return <p className="upg-hint">Sin datos todavía.</p>;
  const { queen, brood, run } = report;
  return (
    <div className="upg-stats">
      <section className="upg-stats-block">
        <h3 className="upg-stats-title">COLONIA</h3>
        <StatRow label="Población" value={report.population} />
        <StatRow label="Comida en la despensa" value={report.food} />
        <StatRow label="Hongos" value={report.mushrooms} />
        <StatRow label="Minerales" value={report.minerals} />
      </section>
      <section className="upg-stats-block">
        <h3 className="upg-stats-title">REINA Y CRÍA</h3>
        {queen ? (
          <>
            <StatRow label="Puesta de un huevo" value={`${queen.layTime.toFixed(1)} s`} />
            <StatRow label="Huevos por minuto (máx.)" value={queen.eggsPerMinute} />
            <StatRow label="Huevos por casta en cola" value={queen.queuePerCaste} />
            <StatRow label="Vida de la reina" value={`${queen.health}/${queen.maxHealth}`} />
          </>
        ) : <StatRow label="Reina" value="Sin reina" />}
        <StatRow label="Una obrera nace en" value={`${brood.hatchTimeWorker.toFixed(1)} s`} />
        <StatRow label="Huevos por casilla" value={brood.eggsPerTile} />
        <StatRow label="Nacimientos" value={`${brood.hatched} (${brood.hatchedPerMinute}/min)`} />
      </section>
      <section className="upg-stats-block upg-stats-block--wide">
        <h3 className="upg-stats-title">CASTAS (PROMEDIO)</h3>
        <div className="upg-caste-table" role="table" aria-label="Promedio por casta">
          <div className="upg-caste-row upg-caste-row--head" role="row">
            <span role="columnheader">Casta</span>
            <span role="columnheader">N.º</span>
            <span role="columnheader">Vida</span>
            <span role="columnheader">Daño</span>
            <span role="columnheader">Vel.</span>
            <span role="columnheader">Carga</span>
          </div>
          {report.castes.map((row) => (
            <div key={row.role} className="upg-caste-row" role="row">
              <span role="cell" className="upg-caste-name"><PixelIcon name={ROLE_ICON[row.role]} size={8} />{ROLE_PLURAL[row.role]}</span>
              <span role="cell">{row.count}</span>
              <span role="cell">{row.count ? row.health : '-'}</span>
              <span role="cell">{row.count ? row.damage : '-'}</span>
              <span role="cell">{row.count ? row.speed : '-'}</span>
              <span role="cell">{row.count ? row.carry : '-'}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="upg-stats-block">
        <h3 className="upg-stats-title">PARTIDA</h3>
        <StatRow label="Día" value={run.day} />
        <StatRow label="Noches sobrevividas" value={run.nightsSurvived} />
        <StatRow label="Oleadas rechazadas" value={run.wavesRepelled} />
        <StatRow label="Enemigos derrotados" value={run.enemiesDefeated} />
        <StatRow label="Hormigas perdidas" value={run.antsLost} />
        <StatRow label="Comida recolectada" value={run.foodGathered} />
        <StatRow label="Minerales extraídos" value={run.mineralsGathered} />
        <StatRow label="Minutos de juego" value={run.minutes} />
      </section>
    </div>
  );
}

function EffectLines({ lines }: { lines: readonly StatLine[] }) {
  return (
    <>
      {lines.map((l) => (
        <span key={l.stat} className={l.good ? 'upg-mut-line upg-mut-line--good' : 'upg-mut-line upg-mut-line--cost'}>
          {l.good ? '▲' : '▼'} {l.text}
        </span>
      ))}
    </>
  );
}

/** Mutaciones: what the dawn picks gave the swarm, how many times each, and what it all adds up to */
export function MutationsView({ mutations }: { mutations: readonly MutationId[] }) {
  const owned = ownedMutations(mutations);
  const capacity = mutationCapacity();
  if (owned.length === 0) {
    return (
      <p className="upg-hint">
        Aún no hay mutaciones. Cada amanecer, desde el día 2, la Cámara de Evolución ofrece tres: elegir otra vez la misma
        la acumula (hasta 3 veces).
      </p>
    );
  }
  const totals = mutationTotals(mutations);
  return (
    <div className="upg-mutations">
      <p className="upg-mut-summary">
        {owned.length} de {capacity.kinds} mutaciones · {mutations.length} de {capacity.stacks} niveles
      </p>
      <div className="upg-list">
        {owned.map((m) => (
          <div key={m.id} className={m.stacks >= m.maxStacks ? 'upg-card upg-card--static upg-card--max' : 'upg-card upg-card--static'} data-mutation={m.id}>
            <span className="upg-card-icon upg-mut-count" aria-label={`${m.stacks} veces`}>×{m.stacks}</span>
            <span className="upg-card-main">
              <span className="upg-card-title">
                <span className="upg-card-name">{m.name}</span>
                <LevelPips level={m.stacks} max={m.maxStacks} />
              </span>
              <EffectLines lines={m.lines} />
              {m.stacks >= m.maxStacks && <span className="upg-maxed">NIVEL MÁXIMO</span>}
            </span>
          </div>
        ))}
      </div>
      <section className="upg-stats-block">
        <h3 className="upg-stats-title">TOTAL DE LA COLONIA</h3>
        {totals.length > 0 ? <EffectLines lines={totals} /> : <span className="upg-stat-label">Los efectos se anulan entre sí.</span>}
        <span className="upg-mut-note">
          Cada nivel multiplica: tres veces +40% es ×2.7, no +120%. Las mutaciones afectan también a las hormigas que ya viven.
        </span>
      </section>
    </div>
  );
}

/**
 * Mejoras: the Swarm's upgrade screen, by tabs (Reina, Incubación, Castas,
 * Colonia) plus Estadísticas. Buying takes two steps (purchaseFlow): a tap
 * selects a line, Mejorar buys it; a desktop double click also buys.
 */
export function UpgradesPanel({ upgrades, report, funds, initialTab, mutations = [], touch, onBuy, onClose, now = defaultNow }: UpgradesPanelProps) {
  const [tab, setTab] = useState<UpgradeTab>(initialTab);
  const [flow, setFlow] = useState<PurchaseFlow>(() => openFlow(now()));
  const [levelUp, setLevelUp] = useState<{ id: UpgradeId; n: number } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (!levelUp) return;
    const timer = window.setTimeout(() => setLevelUp(null), LEVEL_UP_MS);
    return () => window.clearTimeout(timer);
  }, [levelUp]);

  const buy = (id: UpgradeId | null) => {
    if (!id) return;
    const info = upgrades.find((u) => u.id === id);
    if (!info || info.cost === null) return;
    if (!info.affordable || !onBuy(id)) {
      setRefusal(missingText(info.missing) ?? 'No alcanza.');
      return;
    }
    setRefusal(null);
    counter.current += 1;
    setLevelUp({ id, n: counter.current });
  };

  const selected = flow.selected ? upgrades.find((u) => u.id === flow.selected) ?? null : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.code === 'Enter' && selected) {
        e.preventDefault();
        buy(confirmSelected(flow, now()));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const lines = isInfoTab(tab) ? [] : upgrades.filter((u) => u.group === tab);
  const how = touch
    ? 'Toca una mejora para ver su efecto y su costo; luego pulsa Mejorar.'
    : 'Haz clic en una mejora para ver su efecto y su costo; luego pulsa Mejorar (o haz doble clic).';

  return (
    <div
      className="upg-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upg-title"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !guarded(flow, now())) onClose();
      }}
    >
      <div className="upg-frame">
        <div className="chrome-plate upg-plate">
          <div className="chrome-plate-inner upg-panel">
            <header className="upg-head">
              <h2 id="upg-title" className="upg-title"><PixelIcon name="upgrade" size={16} /> MEJORAS</h2>
              <div className="upg-funds" aria-label="Recursos para mejorar">
                <span title="Comida de la despensa"><PixelIcon name="pantry" size={8} />{Math.floor(funds.food)}</span>
                <span title="Minerales"><PixelIcon name="mineral" size={8} />{Math.floor(funds.minerals)}</span>
                <span title="Hongos"><PixelIcon name="fungus" size={8} />{Math.floor(funds.mushrooms)}</span>
              </div>
              <button type="button" className="hud-btn upg-close" aria-label="Cerrar" title="Cerrar (Esc)" onClick={onClose}>×</button>
            </header>
            <nav className="upg-tabs" role="tablist" aria-label="Grupos de mejoras">
              {UPGRADE_TABS.map(({ tab: id, label, icon }) => {
                const ready = affordableIn(upgrades, id);
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={tab === id ? 'upg-tab upg-tab--active' : 'upg-tab'}
                    data-tab={id}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setTab(id);
                      setRefusal(null);
                    }}
                  >
                    <PixelIcon name={icon} size={8} />
                    <span className="upg-tab-label">{label}</span>
                    {ready > 0 && <span className="upg-tab-badge">{ready}</span>}
                    {id === 'mutations' && mutations.length > 0 && <span className="upg-tab-count">{mutations.length}</span>}
                  </button>
                );
              })}
            </nav>
            <div className="upg-body">
              {tab === 'stats' ? (
                <StatsView report={report} />
              ) : tab === 'mutations' ? (
                <MutationsView mutations={mutations} />
              ) : (
                <div className="upg-list">
                  {lines.map((info) => (
                    <UpgradeCard
                      key={info.id}
                      info={info}
                      selected={flow.selected === info.id}
                      levelUp={levelUp?.id === info.id ? levelUp.n : null}
                      onSelect={() => {
                        setRefusal(null);
                        setFlow((f) => selectLine(f, info.id, now()));
                      }}
                      onDouble={() => {
                        const id = doubleClickLine(flow, info.id, now(), touch);
                        if (id) {
                          setFlow((f) => ({ ...f, selected: id }));
                          buy(id);
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            {!isInfoTab(tab) && (
              <footer className="upg-confirm">
                {selected ? (
                  <>
                    <div className="upg-confirm-info">
                      <div className="upg-confirm-name">
                        {selected.name} {selected.cost ? `· nivel ${selected.level + 1}` : '· nivel máximo'}
                      </div>
                      <div className="upg-confirm-effect" aria-label={selected.effects.map(effectText).join(' · ')}>
                        {selected.effects.map((line, i) => (
                          <span key={line.label}>
                            {i > 0 && ' · '}
                            {line.label}: {line.now}
                            {line.next !== null && <> <span className="upg-arrow" aria-hidden="true">→</span> {line.next}</>}
                          </span>
                        ))}
                      </div>
                      {(refusal ?? (selected.cost && !selected.affordable ? missingText(selected.missing) : null)) && (
                        <div className="upg-confirm-warn">{refusal ?? missingText(selected.missing)}</div>
                      )}
                    </div>
                    {selected.cost && <CostChips cost={selected.cost} missing={selected.missing} />}
                    <button
                      type="button"
                      className="upg-buy"
                      data-sfx="none"
                      disabled={!selected.cost || !selected.affordable}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => buy(confirmSelected(flow, now()))}
                    >
                      MEJORAR
                    </button>
                  </>
                ) : (
                  <div className="upg-hint">{how}</div>
                )}
              </footer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
