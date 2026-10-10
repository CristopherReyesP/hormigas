import './save.css';
import { useCallback, useState } from 'react';
import type { SaveFile } from '../../game/save/format';
import type { SaveStorage, SlotId, SlotInfo } from '../../game/save/storage';
import { ConfirmDialog } from './ConfirmDialog';
import { ContinueCard } from './ContinueCard';
import { SlotList } from './SlotList';
import { deleteSlot, readSlot } from './saveActions';
import { OLD_VERSION_TEXT, slotTitle } from './saveText';

interface StartSavesProps {
  storage: SaveStorage;
  onLoad: (save: SaveFile) => void;
}

/** The start screen's saves: Continuar (the autosave) and the slot list */
export function StartSaves({ storage, onLoad }: StartSavesProps) {
  const [slots, setSlots] = useState<SlotInfo[]>(() => storage.list());
  const [listOpen, setListOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ message: string; label: string; action: () => void } | null>(null);
  const refresh = useCallback(() => setSlots(storage.list()), [storage]);

  const load = (slot: SlotId) => {
    void readSlot(storage, slot).then((save) => {
      if (save) onLoad(save);
      else refresh();
    });
  };
  const askDelete = (slot: SlotId) => {
    const info = slots.find((s) => s.slot === slot);
    setConfirm({
      message: info?.compatible === false ? `${OLD_VERSION_TEXT}. ¿Descartarla?` : `¿Borrar ${slotTitle(slot)}? No se puede deshacer.`,
      label: info?.compatible === false ? 'Descartar' : 'Borrar',
      action: () => {
        setConfirm(null);
        void deleteSlot(storage, slot).then(refresh);
      },
    });
  };

  const auto = slots.find((s) => s.slot === 'auto' && s.meta);
  return (
    <>
      <ContinueCard
        info={auto}
        hasSaves={slots.some((s) => s.meta)}
        onContinue={() => load('auto')}
        onDiscard={() => askDelete('auto')}
        onOpenSlots={() => {
          refresh();
          setListOpen(true);
        }}
      />
      {listOpen && <SlotList mode="load" slots={slots} onPick={load} onDelete={askDelete} onClose={() => setListOpen(false)} />}
      {confirm && (
        <ConfirmDialog message={confirm.message} confirmLabel={confirm.label} onConfirm={confirm.action} onCancel={() => setConfirm(null)} />
      )}
    </>
  );
}
