import { useEffect, useMemo, useRef, useState } from 'react';
import { getSpriteAtlas } from './sharedAtlas';
import { crispPlacement } from './console/portraitScale';
import { AntRole } from '../game/components/components';
import { SPRITE_GRID } from '../engine/renderer/sprites/spriteScale';
import { ANT_MARK_IDS, MAX_MARK_STACKS, NO_MARKS, marksForRole, type AntMarkId, type AntMarks } from '../engine/renderer/sprites/antMarks';
import type { MutationOffer, MutationOfferOption } from '../game/run/DawnPick';
import type { MutationId, MutationTag } from '../game/run/MutationDefinitions';

interface EvolutionChamberProps {
  offer: MutationOffer | null;
  lastPick: MutationId | null;
  onChoose: (id: MutationId) => void;
}

/** How long the chosen card flashes before the chamber closes. */
const CLOSE_DELAY_MS = 360;

const TAG_LABELS: Record<MutationTag, string> = {
  Assault: 'Asalto',
  Tempo: 'Ritmo',
  Economy: 'Economía',
  Defense: 'Defensa',
  Sustain: 'Sustento',
  Combat: 'Combate',
  Info: 'Visión',
  Capstone: 'Cumbre',
};

/**
 * Dawn mutation pick, staged as the Swarm's evolution chamber. Keys 1-3 are
 * handled by GameManager; this overlay renders the pending offer, takes clicks,
 * and keeps the last offer on screen briefly so the chosen card can flash.
 */
export function EvolutionChamber({ offer, lastPick, onChoose }: EvolutionChamberProps) {
  const [shownOffer, setShownOffer] = useState(offer);
  const [closing, setClosing] = useState<{ offer: MutationOffer; chosenId: MutationId } | null>(null);
  if (offer !== shownOffer) {
    setShownOffer(offer);
    setClosing(offer === null && shownOffer && lastPick ? { offer: shownOffer, chosenId: lastPick } : null);
  }

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => setClosing(null), CLOSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const visible = offer ?? closing?.offer;
  if (!visible) return null;
  const chosenId = offer ? null : closing?.chosenId ?? null;

  return (
    <div className="evo-backdrop" role="dialog" aria-modal="true" aria-labelledby="evo-title">
      <div className={chosenId ? 'evo-frame evo-frame--closing' : 'evo-frame'}>
        <div className="chrome-plate evo-panel-plate">
          <div className="chrome-plate-inner evo-panel">
            <h2 id="evo-title" className="evo-title">CÁMARA DE EVOLUCIÓN</h2>
            <p className="evo-subtitle">Amanecer del día {visible.dayNumber} · El enjambre muta</p>
            <div className="evo-vein" aria-hidden="true" />
            <div className="evo-cards">
              {visible.options.map((option, index) => (
                <MutationCard
                  key={option.id}
                  option={option}
                  slot={index + 1}
                  state={chosenId === null ? 'open' : chosenId === option.id ? 'chosen' : 'faded'}
                  onChoose={onChoose}
                />
              ))}
            </div>
            <p className="evo-hint">Elige una mutación con clic o con las teclas 1, 2 y 3</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MutationCardProps {
  option: MutationOfferOption;
  slot: number;
  state: 'open' | 'chosen' | 'faded';
  onChoose: (id: MutationId) => void;
}

function MutationCard({ option, slot, state, onChoose }: MutationCardProps) {
  const className = state === 'open' ? 'evo-card' : `evo-card evo-card--${state}`;
  return (
    <div className="evo-card-slot" style={{ '--evo-i': slot - 1 } as React.CSSProperties}>
      <button
        type="button"
        className={className}
        disabled={state !== 'open'}
        aria-keyshortcuts={String(slot)}
        onClick={() => onChoose(option.id)}
      >
        <span className="chrome-plate evo-card-plate">
          <span className="chrome-plate-inner evo-card-inner">
            <span className="evo-card-top">
              <span className="evo-hotkey">[{slot}]</span>
              <StackPips stacks={option.stacks} maxStacks={option.maxStacks} />
            </span>
            <span className="evo-specimen">
              <AntPreview tags={option.tags} mark={option.mark} stacks={option.stacks + 1} />
            </span>
            <span className="evo-card-name">{option.name}</span>
            <span className="evo-card-desc">{option.description}</span>
            <span className="evo-card-up">▲ {option.upsideText}</span>
            {option.costText
              ? <span className="evo-card-cost">▼ {option.costText}</span>
              : <span className="evo-card-cost evo-card-cost--none">Sin costo</span>}
            <span className="evo-tags">
              {option.tags.map(tag => (
                <span key={tag} className={`evo-tag evo-tag--${tag.toLowerCase()}`}>{TAG_LABELS[tag]}</span>
              ))}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

function StackPips({ stacks, maxStacks }: { stacks: number; maxStacks: number }) {
  const label = `Nivel ${stacks} de ${maxStacks}`;
  return (
    <span className="evo-pips" role="img" aria-label={label} title={label}>
      {Array.from({ length: maxStacks }, (_, i) => (
        <span
          key={i}
          className={i < stacks ? 'evo-pip evo-pip--owned' : i === stacks ? 'evo-pip evo-pip--next' : 'evo-pip'}
        />
      ))}
    </span>
  );
}

// ── Mini ant preview ─────────────────────────────────────────

/** The specimen canvas: the 24-grid atlas ant at 4 screen px per art px. */
const PREVIEW_SIZE = 96;
const PREVIEW = crispPlacement(SPRITE_GRID.ant, PREVIEW_SIZE, 'pivot');

/** Castes tried, in order, when the card's preferred caste does not wear its mark. */
const SPECIMEN_CASTES: readonly AntRole[] = [AntRole.Worker, AntRole.Soldier, AntRole.Scout, AntRole.Nurse, AntRole.Defender];

/** The card's mark as an atlas mark id (an unknown mark shows a bare ant). */
function markId(mark: string): AntMarkId | undefined {
  return ANT_MARK_IDS.find(id => id === mark);
}

/**
 * The specimen of a card: its mark at `stacks` (the stack the pick would
 * give, clamped to what a mark can show) on a soldier for Assault/Defense
 * cards and a worker otherwise, or on the first caste that wears the mark
 * when that one does not (wing stubs are a scout mark).
 */
function specimenOf(tags: readonly MutationTag[], mark: string, stacks: number): { role: AntRole; marks: AntMarks; id?: AntMarkId } {
  const id = markId(mark);
  const marks: AntMarks = id ? new Map([[id, Math.max(1, Math.min(MAX_MARK_STACKS, stacks))]]) : NO_MARKS;
  const preferred = tags.includes('Assault') || tags.includes('Defense') ? AntRole.Soldier : AntRole.Worker;
  if (!id) return { role: preferred, marks };
  const role = [preferred, ...SPECIMEN_CASTES].find(caste => marksForRole(marks, caste).size > 0) ?? preferred;
  return { role, marks, id };
}

/** Atlas ant walking in place with its baked mutation mark; static under reduced motion. */
function AntPreview({ tags, mark, stacks }: { tags: readonly MutationTag[]; mark: string; stacks: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // One mark set per card: the atlas indexes its baked sheet by this object
  const specimen = useMemo(() => specimenOf(tags, mark, stacks), [tags, mark, stacks]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { role, marks } = specimen;
    const { scale, offset, at } = PREVIEW;
    const draw = (step: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(scale, 0, 0, scale, offset, offset);
      // legPhase centered in frame (step % 4) of the atlas walk cycle
      const legPhase = ((step % 4) + 0.5) * (Math.PI / 2);
      getSpriteAtlas().drawAnt(ctx, at, at, 0, legPhase, role, false, false, marks);
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(0);
      return;
    }
    let step = 0;
    draw(step);
    const timer = window.setInterval(() => draw(++step), 160);
    return () => window.clearInterval(timer);
  }, [specimen]);

  return (
    <canvas
      ref={canvasRef}
      className="evo-preview"
      width={PREVIEW_SIZE}
      height={PREVIEW_SIZE}
      data-mark={specimen.id}
      data-stacks={specimen.id ? specimen.marks.get(specimen.id) : undefined}
      data-caste={specimen.role}
      aria-hidden="true"
    />
  );
}
