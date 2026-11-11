import { useState } from 'react';
import {
  ACHIEVEMENT_DNA, ACHIEVEMENT_IDS, ACHIEVEMENTS, PERK_IDS, PERKS, buyPerk, loadLegacy, perkCost, type Legacy, type PerkId,
} from '../game/meta/legacy';

interface LegacyPanelProps {
  onClose: () => void;
}

/**
 * LEGADO, opened from the title screen: the ADN the runs on this browser have
 * banked, the herencias it buys (every new Swarm run starts with them) and the
 * achievements unlocked so far.
 */
export function LegacyPanel({ onClose }: LegacyPanelProps) {
  const [legacy, setLegacy] = useState<Legacy>(() => loadLegacy());
  const buy = (id: PerkId) => {
    if (buyPerk(id)) setLegacy(loadLegacy());
  };

  return (
    <div className="legacy-backdrop" role="dialog" aria-modal="true" aria-labelledby="legacy-title">
      <div className="legacy-panel pixel-panel">
        <header className="legacy-head">
          <h2 id="legacy-title" className="legacy-title">LEGADO</h2>
          <span className="legacy-dna" data-legacy-dna="">{`ADN ${legacy.dna}`}</span>
        </header>
        <p className="legacy-note">
          Cada partida deja ADN: noches sobrevividas, trofeos de jefe, capitanas y logros. Gástalo en herencias: toda colonia nueva empieza con ellas.
        </p>

        <h3 className="legacy-sub">Herencias</h3>
        <ul className="legacy-list">
          {PERK_IDS.map((id) => {
            const def = PERKS[id];
            const level = legacy.perks[id];
            const cost = perkCost(legacy, id);
            const canBuy = cost !== null && legacy.dna >= cost;
            return (
              <li key={id} className="legacy-row">
                <span className="legacy-row-text">
                  <strong>{def.name}</strong>
                  <span className="legacy-row-blurb">{`${def.blurb} · nivel ${level}/${def.costs.length}`}</span>
                </span>
                <button
                  type="button"
                  className="pixel-btn legacy-buy"
                  data-perk={id}
                  disabled={!canBuy}
                  onClick={() => buy(id)}
                >
                  {cost === null ? 'MÁX' : `${cost} ADN`}
                </button>
              </li>
            );
          })}
        </ul>

        <h3 className="legacy-sub">{`Logros ${legacy.achievements.length}/${ACHIEVEMENT_IDS.length} · +${ACHIEVEMENT_DNA} ADN cada uno`}</h3>
        <ul className="legacy-list legacy-list--achievements">
          {ACHIEVEMENT_IDS.map((id) => {
            const done = legacy.achievements.includes(id);
            return (
              <li key={id} className={`legacy-ach${done ? ' legacy-ach--done' : ''}`}>
                <strong>{`${done ? '★' : '☆'} ${ACHIEVEMENTS[id].name}`}</strong>
                <span className="legacy-row-blurb">{ACHIEVEMENTS[id].description}</span>
              </li>
            );
          })}
        </ul>

        <button type="button" className="pixel-btn legacy-close" data-legacy-close="" autoFocus onClick={onClose}>
          VOLVER
        </button>
      </div>
    </div>
  );
}
