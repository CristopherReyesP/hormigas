import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSpriteAtlas } from './sharedAtlas';
import { crispPlacement } from './console/portraitScale';
import { AntRole } from '../game/components/components';
import { SPRITE_GRID } from '../engine/renderer/sprites/spriteScale';
import { ANT_MARK_IDS, MAX_MARK_STACKS, NO_MARKS, marksForRole, type AntMarkId, type AntMarks } from '../engine/renderer/sprites/antMarks';
import type { MutationBuildEntry, MutationOffer, MutationOfferOption } from '../game/run/DawnPick';
import { mutationLines } from '../game/run/mutationSummary';
import type { MutationId, MutationTag } from '../game/run/MutationDefinitions';
import { chamberKeyAction, runChamberAction, tapCardAction, type ChamberAction } from './evolutionPick';

interface EvolutionChamberProps {
  offer: MutationOffer | null;
  /** The card selected in the pending offer (GameManager owns it: keys 1-3 select too). */
  selected: MutationId | null;
  lastPick: MutationId | null;
  /** Select a card, or clear the selection with null. Never applies it. */
  onSelect: (id: MutationId | null) => void;
  /** Apply the selected card. */
  onConfirm: () => void;
  /** The mutations the swarm already carries, with their stacks */
  owned?: readonly MutationBuildEntry[];
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
 * Dawn mutation pick, staged as the Swarm's evolution chamber. Picking takes
 * two steps so a stray tap never evolves the swarm: a tap (or keys 1-3, which
 * GameManager handles) selects a card, and "Confirmar evolución" (or Enter)
 * applies it. Tapping the selected card again, "Cancelar" or Esc deselect.
 * Taps in the first OPEN_GUARD_MS after the chamber opens are ignored. There
 * is no timer: the run stays paused until the player confirms. The last offer
 * stays on screen briefly so the chosen card can flash.
 */
export function EvolutionChamber({ offer, selected, lastPick, onSelect, onConfirm, owned = [] }: EvolutionChamberProps) {
  const [shownOffer, setShownOffer] = useState(offer);
  const [closing, setClosing] = useState<{ offer: MutationOffer; chosenId: MutationId } | null>(null);
  if (offer !== shownOffer) {
    setShownOffer(offer);
    setClosing(offer === null && shownOffer && lastPick ? { offer: shownOffer, chosenId: lastPick } : null);
  }

  // When the current offer appeared, for the accidental-tap guard
  const openedAt = useRef(0);
  useEffect(() => {
    if (offer) openedAt.current = performance.now();
  }, [offer]);

  const dispatch = useCallback((action: ChamberAction | null) => {
    if (!action) return;
    runChamberAction({
      selectMutation: (id) => { onSelect(id as MutationId | null); return true; },
      confirmMutation: () => { onConfirm(); return true; },
    }, action);
  }, [onSelect, onConfirm]);

  const pending = offer !== null;
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const action = chamberKeyAction(e.code, selected);
      if (!action) return;
      // Keeps Enter from also clicking a focused card
      e.preventDefault();
      dispatch(action);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, selected, dispatch]);

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => setClosing(null), CLOSE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [closing]);

  const visible = offer ?? closing?.offer;
  if (!visible) return null;
  const chosenId = offer ? null : closing?.chosenId ?? null;
  const selectedOption = offer && selected ? offer.options.find(option => option.id === selected) ?? null : null;
  const onTap = (id: MutationId) => dispatch(tapCardAction(selected, id, performance.now() - openedAt.current));

  return (
    <div
      className={selectedOption ? 'evo-backdrop evo-backdrop--selecting' : 'evo-backdrop'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="evo-title"
    >
      <div className={chosenId ? 'evo-frame evo-frame--closing' : 'evo-frame'}>
        <div className="chrome-plate evo-panel-plate">
          <div className="chrome-plate-inner evo-panel">
            <h2 id="evo-title" className="evo-title">CÁMARA DE EVOLUCIÓN</h2>
            <p className="evo-subtitle">Día {visible.dayNumber} · El enjambre se alimenta de sus presas y muta</p>
            <div className="evo-vein" aria-hidden="true" />
            <div className="evo-cards">
              {visible.options.map((option, index) => (
                <MutationCard
                  key={option.id}
                  option={option}
                  slot={index + 1}
                  state={chosenId !== null
                    ? (chosenId === option.id ? 'chosen' : 'faded')
                    : selectedOption?.id === option.id ? 'selected' : 'open'}
                  onTap={onTap}
                />
              ))}
            </div>
            <OwnedRow owned={owned} />
            <p className="evo-hint">
              Toca una mutación para verla y luego confírmala · Teclado: 1, 2 y 3 eligen, Enter confirma, Esc cancela
            </p>
          </div>
        </div>
      </div>
      {selectedOption && (
        // Outside the frame: its drop-shadow filter would trap a fixed bar
        <div className="evo-confirm-bar">
          <button type="button" className="evo-cancel-btn" onClick={() => dispatch({ type: 'deselect' })}>Cancelar</button>
          <button type="button" className="evo-confirm-btn" aria-keyshortcuts="Enter" onClick={() => dispatch({ type: 'confirm' })}>
            <span className="evo-confirm-label">Confirmar evolución</span>
            <span className="evo-confirm-name">{selectedOption.name}</span>
          </button>
        </div>
      )}
    </div>
  );
}

interface MutationCardProps {
  option: MutationOfferOption;
  slot: number;
  state: 'open' | 'selected' | 'chosen' | 'faded';
  onTap: (id: MutationId) => void;
}

function MutationCard({ option, slot, state, onTap }: MutationCardProps) {
  const className = state === 'open' ? 'evo-card' : `evo-card evo-card--${state}`;
  const interactive = state === 'open' || state === 'selected';
  return (
    <div className="evo-card-slot" style={{ '--evo-i': slot - 1 } as React.CSSProperties}>
      <button
        type="button"
        className={className}
        disabled={!interactive}
        aria-pressed={interactive ? state === 'selected' : undefined}
        aria-keyshortcuts={String(slot)}
        onClick={() => onTap(option.id)}
      >
        <span className="chrome-plate evo-card-plate">
          <span className="chrome-plate-inner evo-card-inner">
            <span className="evo-card-top">
              <span className="evo-hotkey">[{slot}]</span>
              {state === 'selected' && <span className="evo-card-picked">ELEGIDA</span>}
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
            <StackTotal option={option} />
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

/**
 * A card for a mutation the swarm already has: what all its stacks add up to
 * once this one joins (the percentages multiply, so the total is not obvious).
 */
function StackTotal({ option }: { option: MutationOfferOption }) {
  if (option.stacks <= 0) return null;
  const next = option.stacks + 1;
  return (
    <span className="evo-card-total">
      <span className="evo-card-total-title">Total con esta · nivel {next}/{option.maxStacks}</span>
      {mutationLines(option.id, next).map((line) => (
        <span key={line.stat} className={line.good ? 'evo-card-total-line' : 'evo-card-total-line evo-card-total-line--cost'}>
          {line.text}
        </span>
      ))}
    </span>
  );
}

/** "Tu enjambre": the mutations already carried, so a pick can build on them */
function OwnedRow({ owned }: { owned: readonly MutationBuildEntry[] }) {
  if (owned.length === 0) return null;
  return (
    <div className="evo-owned" aria-label="Mutaciones de tu enjambre">
      <span className="evo-owned-title">TU ENJAMBRE</span>
      {owned.map((m) => (
        <span key={m.id} className="evo-owned-chip">{m.name} <strong>×{m.stacks}</strong></span>
      ))}
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
