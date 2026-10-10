import type { SlotId, SlotInfo } from '../../game/save/storage';
import { OLD_VERSION_TEXT, describeSave, slotTitle } from './saveText';

interface SlotListProps {
  /** Saving writes a manual slot; loading reads any slot, the autosave included */
  mode: 'save' | 'load';
  slots: SlotInfo[];
  onPick: (slot: SlotId) => void;
  onDelete: (slot: SlotId) => void;
  onClose: () => void;
}

/** The autosave and the three manual slots, each with what it holds */
export function SlotList({ mode, slots, onPick, onDelete, onClose }: SlotListProps) {
  const shown = mode === 'save' ? slots.filter((s) => s.slot !== 'auto') : slots;
  return (
    <div className="save-overlay" onClick={onClose}>
      <div
        className="save-panel save-slots"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-slots-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="save-slots-title" className="save-title">{mode === 'save' ? 'GUARDAR PARTIDA' : 'CARGAR PARTIDA'}</h2>
        <ul className="save-slot-list">
          {shown.map((info) => (
            <SlotRow key={info.slot} info={info} mode={mode} onPick={onPick} onDelete={onDelete} />
          ))}
        </ul>
        <button type="button" className="save-btn save-btn--wide" data-slots-close="" onClick={onClose}>
          Volver
        </button>
      </div>
    </div>
  );
}

interface SlotRowProps {
  info: SlotInfo;
  mode: 'save' | 'load';
  onPick: (slot: SlotId) => void;
  onDelete: (slot: SlotId) => void;
}

function SlotRow({ info, mode, onPick, onDelete }: SlotRowProps) {
  const title = slotTitle(info.slot);
  const text = info.meta ? describeSave(info.meta) : null;
  const canLoad = mode === 'load' && info.meta !== undefined && info.compatible;
  return (
    <li className={info.meta ? 'save-slot' : 'save-slot save-slot--empty'}>
      <div className="save-slot-text">
        <span className="save-slot-name">{title}</span>
        {text ? (
          <>
            <span className="save-slot-matchup">{text.matchup}</span>
            <span className="save-slot-detail">{text.detail}</span>
            <span className="save-slot-date">{text.date}</span>
            {!info.compatible && <span className="save-slot-old">{OLD_VERSION_TEXT}</span>}
          </>
        ) : (
          <span className="save-slot-detail">Vacía</span>
        )}
      </div>
      <div className="save-slot-actions">
        {mode === 'save' && (
          <button type="button" className="save-btn save-btn--accent" data-slot-save={info.slot} onClick={() => onPick(info.slot)}>
            {info.meta ? 'Sobrescribir' : 'Guardar aquí'}
          </button>
        )}
        {canLoad && (
          <button type="button" className="save-btn save-btn--accent" data-slot-load={info.slot} onClick={() => onPick(info.slot)}>
            Cargar
          </button>
        )}
        {info.meta && (
          <button
            type="button"
            className="save-btn save-btn--danger save-btn--icon"
            data-slot-delete={info.slot}
            aria-label={`Borrar ${title}`}
            title={info.compatible ? `Borrar ${title}` : 'Descartar'}
            onClick={() => onDelete(info.slot)}
          >
            {info.compatible ? 'Borrar' : 'Descartar'}
          </button>
        )}
      </div>
    </li>
  );
}
