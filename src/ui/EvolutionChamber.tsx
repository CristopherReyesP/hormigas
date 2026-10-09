import { useEffect, useRef, useState } from 'react';
import { getSpriteAtlas } from './sharedAtlas';
import { AntRole } from '../game/components/components';
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
              <AntPreview tags={option.tags} mark={option.mark} />
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

/** The atlas ant frame is 48 px (16 art px × 3); the preview shows it at 2×. */
const SPRITE_SIZE = 48;
const ART_PX = 3;
const PREVIEW_SCALE = 2;
const PREVIEW_SIZE = SPRITE_SIZE * PREVIEW_SCALE;

const VEIN_DIM = '#5a8a1c';
const VEIN_GLOW = '#c6ff3d';
const FLESH = ['#2a0f1f', '#4a1736', '#7a2453', '#b03a72', '#e06a9a'];
const OUTLINE = '#1a0a12';
const BONE = '#e8d8dc';
const MEMBRANE = '#9a8088';

/** One run of art pixels of a mark; `pulse` swaps the color for the glow step. */
interface MarkRun {
  pixels: ReadonlyArray<readonly [number, number]>;
  color: string;
  pulse?: string;
}

/**
 * Placeholder mark overlays in art-pixel coordinates of the right-facing atlas
 * ant (soldier geometry for Assault/Defense marks, worker otherwise). The full
 * mark layer on the in-game sprites comes in P2.
 */
const MARKS: Record<string, readonly MarkRun[]> = {
  chartreuse_jaws: [
    { pixels: [[14, 6], [14, 7], [14, 9], [14, 10]], color: VEIN_GLOW },
    { pixels: [[15, 7], [14, 11]], color: VEIN_DIM, pulse: VEIN_GLOW },
  ],
  pulsing_vein: [
    { pixels: [[2, 8], [3, 8], [4, 8], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8]], color: VEIN_DIM, pulse: VEIN_GLOW },
  ],
  swollen_pale_gaster: [
    { pixels: [[2, 5], [3, 5], [4, 5], [5, 5], [2, 11], [3, 11], [4, 11], [5, 11], [0, 7], [0, 8], [0, 9],
      [1, 6], [1, 10], [6, 6], [6, 10], [7, 7], [7, 9]], color: OUTLINE },
    { pixels: [[2, 6], [3, 6], [4, 6], [5, 6], [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7],
      [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [6, 8]], color: BONE },
    { pixels: [[1, 9], [2, 9], [3, 9], [4, 9], [5, 9], [6, 9], [2, 10], [3, 10], [4, 10], [5, 10]], color: MEMBRANE },
  ],
  leg_spurs: [
    { pixels: [[5, 4], [8, 4], [11, 4], [5, 12], [8, 12], [11, 12]], color: BONE },
  ],
  pink_stitches: [
    { pixels: [[2, 9], [3, 8], [4, 9], [5, 8], [6, 9], [8, 7], [9, 8], [10, 7]], color: FLESH[4] },
  ],
  dark_gaster_rings: [
    { pixels: [[3, 7], [3, 8], [3, 9], [6, 7], [6, 8], [6, 9]], color: FLESH[0] },
  ],
  thorax_pustules: [
    { pixels: [[8, 7], [10, 9]], color: FLESH[3], pulse: FLESH[4] },
    { pixels: [[9, 5], [7, 11]], color: FLESH[2], pulse: FLESH[4] },
  ],
  thick_head_plate: [
    { pixels: [[9, 7], [9, 9]], color: FLESH[1] },
    { pixels: [[9, 8], [12, 8]], color: FLESH[3] },
    { pixels: [[10, 8], [11, 8]], color: FLESH[4] },
  ],
  wing_stubs: [
    { pixels: [[7, 6], [6, 6], [5, 5], [7, 10], [6, 10], [5, 11]], color: BONE },
    { pixels: [[4, 5], [4, 11]], color: MEMBRANE },
  ],
  glowing_antenna_tips: [
    { pixels: [[15, 4], [15, 5], [15, 11], [15, 12]], color: VEIN_DIM, pulse: VEIN_GLOW },
  ],
};

function previewRole(tags: readonly MutationTag[]): AntRole {
  return tags.includes('Assault') || tags.includes('Defense') ? AntRole.Soldier : AntRole.Worker;
}

/** Atlas ant walking in place with its mutation mark; static under reduced motion. */
function AntPreview({ tags, mark }: { tags: readonly MutationTag[]; mark: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const role = previewRole(tags);
    const runs = MARKS[mark] ?? [];
    const draw = (step: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(PREVIEW_SCALE, 0, 0, PREVIEW_SCALE, 0, 0);
      // legPhase centered in frame (step % 4) of the atlas walk cycle
      const legPhase = ((step % 4) + 0.5) * (Math.PI / 2);
      getSpriteAtlas().drawAnt(ctx, SPRITE_SIZE / 2, SPRITE_SIZE / 2, 0, legPhase, role, false);
      const glow = Math.floor(step / 3) % 2 === 0;
      for (const run of runs) {
        ctx.fillStyle = glow && run.pulse ? run.pulse : run.color;
        for (const [x, y] of run.pixels) ctx.fillRect(x * ART_PX, y * ART_PX, ART_PX, ART_PX);
      }
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(0);
      return;
    }
    let step = 0;
    draw(step);
    const timer = window.setInterval(() => draw(++step), 160);
    return () => window.clearInterval(timer);
  }, [tags, mark]);

  return (
    <canvas ref={canvasRef} className="evo-preview" width={PREVIEW_SIZE} height={PREVIEW_SIZE} aria-hidden="true" />
  );
}
