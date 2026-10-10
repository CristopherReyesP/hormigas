import { useEffect, useState, type ReactNode } from 'react';
import { installAudioUi } from '../audio';
import { sanitizeRunSetup, withPlayerRace, withRivalRace, type RunSetup } from '../game/run/RunSetup';
import { RACE_CARDS, raceName, rivalName, rivalOptionsFor, type RaceCardInfo, type RaceStat, type RivalInfo } from './racePicker/races';
import { SpecimenCanvas } from './racePicker/SpecimenCanvas';
import { runGoalText } from '../game/run/nightMilestones';

interface RacePickerProps {
  /** The last choice (or the default); anything not available yet falls back to the default. */
  initialSetup: RunSetup;
  onStart: (setup: RunSetup) => void;
  /** Shown above the setup: the saved run to continue, when there is one */
  savedRun?: ReactNode;
}

/**
 * Pre-run skirmish setup, StarCraft style: pick your race and the rival, then
 * COMENZAR. Races that are not playable yet show as "Próximamente" cards so
 * the roster (and its identity) is visible from the first run. The rival list
 * follows the race: the Crystal Hive also lists the Swarm, coming soon.
 */
export function RacePicker({ initialSetup, onStart, savedRun }: RacePickerProps) {
  const [setup, setSetup] = useState(() => sanitizeRunSetup(initialSetup));
  // The first screen: from here on every button ticks and taps, and the first click unlocks audio
  useEffect(() => installAudioUi(), []);

  return (
    <div className="race-picker" role="dialog" aria-modal="true" aria-labelledby="race-picker-title">
      <div className="race-picker-frame">
        {savedRun}
        <header className="race-picker-head">
          <h1 id="race-picker-title" className="race-picker-title">NUEVA PARTIDA</h1>
          <p className="race-picker-subtitle">Elige tu raza y contra quién vas a combatir</p>
        </header>

        <section aria-labelledby="race-picker-own">
          <h2 id="race-picker-own" className="race-picker-section">TU RAZA</h2>
          <div className="race-cards">
            {RACE_CARDS.map((race, index) => (
              <RaceCard
                key={race.id}
                race={race}
                slot={index}
                chosen={setup.playerRace === race.id}
                onPick={() => setSetup((s) => withPlayerRace(s, race.id))}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="race-picker-rival">
          <h2 id="race-picker-rival" className="race-picker-section">RIVAL</h2>
          <div className="rival-options">
            {rivalOptionsFor(setup.playerRace).map((rival) => (
              <RivalOption
                key={rival.id}
                rival={rival}
                chosen={setup.rivalRace === rival.id}
                onPick={() => setSetup((s) => withRivalRace(s, rival.id))}
              />
            ))}
          </div>
        </section>

        {/* Centered on purpose: the console's info panel (no hover tooltips) appears under the cursor */}
        <div className="race-launch">
          <p className="race-matchup">
            <span className="race-matchup-side">{raceName(setup.playerRace)}</span>
            <span className="race-matchup-vs">VS</span>
            <span className="race-matchup-side">{rivalName(setup.rivalRace)}</span>
          </p>
          <button type="button" className="race-start" data-start="" data-sfx="start" onClick={() => onStart(setup)}>
            COMENZAR
          </button>
          <p className="race-launch-hint">{runGoalText(setup.playerRace)}</p>
          <p className="race-launch-hint">Tu elección se recordará en la próxima partida</p>
        </div>
      </div>
    </div>
  );
}

interface RaceCardProps {
  race: RaceCardInfo;
  slot: number;
  chosen: boolean;
  onPick: () => void;
}

function RaceCard({ race, slot, chosen, onPick }: RaceCardProps) {
  return (
    <div className="race-card-slot" style={{ '--race-i': slot } as React.CSSProperties}>
      <button
        type="button"
        className={`race-card race-card--${race.id}`}
        data-race={race.id}
        aria-pressed={chosen}
        disabled={!race.available}
        onClick={onPick}
      >
        <span className="chrome-plate race-card-plate">
          <span className="chrome-plate-inner race-card-inner">
            <span className="race-card-head">
              <span className="race-card-name">{race.name}</span>
              {!race.available && <span className="race-badge race-badge--soon">Próximamente</span>}
              {race.available && chosen && <span className="race-badge race-badge--chosen">Elegida</span>}
            </span>
            <span className="race-card-tagline">{race.tagline}</span>
            <span className="race-specimens">
              {race.units.map((unit) => (
                <span key={unit.label} className="race-unit">
                  <SpecimenCanvas specimen={unit} />
                  <span className="race-unit-label">{unit.label}</span>
                </span>
              ))}
            </span>
            <span className="race-traits">
              {race.traits.map((trait) => (
                <span key={trait.label} className="race-trait">
                  <span className="race-trait-label">{trait.label}</span>
                  <span className="race-trait-text">{trait.text}</span>
                </span>
              ))}
            </span>
            <span className="race-stats">
              {race.stats.map((stat) => (
                <StatPips key={stat.label} stat={stat} />
              ))}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

function StatPips({ stat }: { stat: RaceStat }) {
  const label = `${stat.label}: ${stat.level} de 3`;
  return (
    <span className="race-stat">
      <span>{stat.label}</span>
      <span className="race-pips" role="img" aria-label={label} title={label}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= stat.level ? 'race-pip race-pip--on' : 'race-pip'} />
        ))}
      </span>
    </span>
  );
}

interface RivalOptionProps {
  rival: RivalInfo;
  chosen: boolean;
  onPick: () => void;
}

function RivalOption({ rival, chosen, onPick }: RivalOptionProps) {
  return (
    <button
      type="button"
      className={`rival-option rival-option--${rival.id}`}
      data-rival={rival.id}
      aria-pressed={chosen}
      disabled={!rival.available}
      onClick={onPick}
    >
      <span className="chrome-plate rival-plate">
        <span className="chrome-plate-inner rival-inner">
          <span className="rival-specimen">
            <SpecimenCanvas specimen={rival.portrait} />
          </span>
          <span className="rival-text">
            <span className="rival-name">{rival.name}</span>
            <span className={rival.available ? 'rival-note' : 'rival-note race-badge race-badge--soon'}>{rival.note}</span>
          </span>
        </span>
      </span>
    </button>
  );
}
