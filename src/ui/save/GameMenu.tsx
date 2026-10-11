import './save.css';
import { GAME_VERSION } from '../../shared/version';
import { useCallback, useState } from 'react';
import type { GameManager } from '../../game/GameManager';
import type { SaveFile } from '../../game/save/format';
import type { SaveStorage, SlotId, SlotInfo } from '../../game/save/storage';
import { ConfirmDialog } from './ConfirmDialog';
import { SlotList } from './SlotList';
import { deleteSlot, readSlot, saveToSlot } from './saveActions';
import { slotTitle } from './saveText';

interface GameMenuPanelProps {
  onResume: () => void;
  onSave: () => void;
  onLoad: () => void;
  onExit: () => void;
}

/** The pause menu itself: big touch targets, one column */
export function GameMenuPanel({ onResume, onSave, onLoad, onExit }: GameMenuPanelProps) {
  return (
    <div className="save-overlay" onClick={onResume}>
      <div className="save-panel save-menu" role="dialog" aria-modal="true" aria-labelledby="save-menu-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="save-menu-title" className="save-title">PAUSA</h2>
        <button type="button" className="save-btn save-btn--wide save-btn--accent" data-menu-resume="" onClick={onResume}>
          Seguir jugando
        </button>
        <button type="button" className="save-btn save-btn--wide" data-menu-save="" onClick={onSave}>
          Guardar
        </button>
        <button type="button" className="save-btn save-btn--wide" data-menu-load="" onClick={onLoad}>
          Cargar
        </button>
        <button type="button" className="save-btn save-btn--wide save-btn--danger" data-menu-exit="" onClick={onExit}>
          Salir al menú
        </button>
        <p className="game-version" data-game-version="">{GAME_VERSION}</p>
      </div>
    </div>
  );
}

interface Confirm {
  message: string;
  label: string;
  action: () => void;
}

interface GameMenuProps {
  game: GameManager;
  storage: SaveStorage;
  /** A slot was loaded: replace the running game with it */
  onLoad: (save: SaveFile) => void;
  /** Back to the start screen (the caller autosaves first) */
  onExit: () => void;
}

/** The in-game MENÚ button and everything behind it: save, load, delete, exit */
export function GameMenu({ game, storage, onLoad, onExit }: GameMenuProps) {
  const [view, setView] = useState<'closed' | 'menu' | 'save' | 'load'>('closed');
  const [wasPaused, setWasPaused] = useState(false);
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const refresh = useCallback(() => setSlots(storage.list()), [storage]);

  const open = () => {
    setWasPaused(game.isPaused());
    game.setPaused(true);
    refresh();
    setView('menu');
  };
  const close = () => {
    setView('closed');
    setConfirm(null);
    if (!wasPaused) game.setPaused(false);
  };

  const pickSlot = (slot: SlotId) => {
    const info = slots.find((s) => s.slot === slot);
    if (view === 'save') {
      const write = () => {
        setConfirm(null);
        void saveToSlot(storage, game, slot).then(refresh);
      };
      if (info?.meta) setConfirm({ message: `¿Sobrescribir la ${slotTitle(slot)}?`, label: 'Sobrescribir', action: write });
      else write();
      return;
    }
    setConfirm({
      message: `¿Cargar ${slotTitle(slot)}? Se perderá lo que no hayas guardado.`,
      label: 'Cargar',
      action: () => {
        setConfirm(null);
        void readSlot(storage, slot).then((save) => {
          if (save) onLoad(save);
        });
      },
    });
  };

  const askDelete = (slot: SlotId) =>
    setConfirm({
      message: `¿Borrar ${slotTitle(slot)}? No se puede deshacer.`,
      label: 'Borrar',
      action: () => {
        setConfirm(null);
        void deleteSlot(storage, slot).then(refresh);
      },
    });

  return (
    <>
      <button type="button" className="save-menu-btn" data-menu-open="" aria-label="Menú de pausa" onClick={open}>
        MENÚ
      </button>
      {view === 'menu' && (
        <GameMenuPanel
          onResume={close}
          onSave={() => setView('save')}
          onLoad={() => setView('load')}
          onExit={() =>
            setConfirm({ message: '¿Salir al menú? La partida queda en el autoguardado.', label: 'Salir', action: onExit })
          }
        />
      )}
      {(view === 'save' || view === 'load') && (
        <SlotList mode={view} slots={slots} onPick={pickSlot} onDelete={askDelete} onClose={() => setView('menu')} />
      )}
      {confirm && (
        <ConfirmDialog message={confirm.message} confirmLabel={confirm.label} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}
