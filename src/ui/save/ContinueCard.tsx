import type { SlotInfo } from '../../game/save/storage';
import { OLD_VERSION_TEXT, describeSave } from './saveText';

interface ContinueCardProps {
  /** The autosave's slot, or undefined when there is none */
  info: SlotInfo | undefined;
  onContinue: () => void;
  /** Throw away an old-version autosave */
  onDiscard: () => void;
  /** Open the slot list to load a manual save */
  onOpenSlots: () => void;
  /** Some slot holds a save (shows "Cargar partida") */
  hasSaves?: boolean;
}

/** Start screen: resume the last run (the autosave), or load another slot */
export function ContinueCard({ info, onContinue, onDiscard, onOpenSlots, hasSaves = false }: ContinueCardProps) {
  const text = info?.meta ? describeSave(info.meta) : null;
  if (!text && !hasSaves) return null;
  return (
    <section className="save-continue" aria-label="Partida guardada">
      {text && info?.compatible && (
        <button type="button" className="save-continue-btn" data-continue="" data-sfx="start" onClick={onContinue}>
          <span className="save-continue-label">CONTINUAR</span>
          <span className="save-continue-matchup">{text.matchup}</span>
          <span className="save-continue-detail">{text.detail} · {text.date}</span>
        </button>
      )}
      {text && info && !info.compatible && (
        <div className="save-continue-old" role="status">
          <span>{OLD_VERSION_TEXT}</span>
          <span className="save-continue-detail">{text.matchup} · {text.date}</span>
          <button type="button" className="save-btn save-btn--danger" data-discard="" onClick={onDiscard}>
            Descartar
          </button>
        </div>
      )}
      {hasSaves && (
        <button type="button" className="save-btn save-btn--wide" data-open-slots="" onClick={onOpenSlots}>
          Cargar partida
        </button>
      )}
    </section>
  );
}
