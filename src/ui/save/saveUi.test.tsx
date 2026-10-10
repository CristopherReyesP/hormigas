import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SAVE_VERSION, type SaveMeta } from '../../game/save/format';
import type { SlotInfo } from '../../game/save/storage';
import { ContinueCard } from './ContinueCard';
import { SlotList } from './SlotList';
import { ConfirmDialog } from './ConfirmDialog';
import { GameMenuPanel } from './GameMenu';
import { describeSave, formatSavedAt, slotTitle } from './saveText';

const noop = () => {};

const META: SaveMeta = {
  playerRace: 'swarm', rivalRace: 'crystal', day: 3, phase: 'night', ants: 12, wave: 2, minerals: 40, ticks: 9000,
  savedAt: new Date(2026, 9, 10, 14, 5).getTime(),
};

function slots(overrides: Partial<Record<string, Partial<SlotInfo>>> = {}): SlotInfo[] {
  return (['auto', 'slot1', 'slot2', 'slot3'] as const).map((slot) => ({ slot, compatible: true, ...overrides[slot] }));
}

describe('save text', () => {
  it('names the slots', () => {
    expect(slotTitle('auto')).toBe('Autoguardado');
    expect(slotTitle('slot2')).toBe('Ranura 2');
  });

  it('describes a save by race, rival, day and colony', () => {
    const d = describeSave(META);
    expect(d.matchup).toBe('Enjambre vs Colmena de Cristal');
    expect(d.detail).toContain('Día 3');
    expect(d.detail).toContain('noche');
    expect(d.detail).toContain('12 hormigas');
  });

  it('counts a Humans run in units, not ants', () => {
    const d = describeSave({ ...META, playerRace: 'human', rivalRace: 'crystal', ants: 6 });
    expect(d.matchup).toBe('Humanos vs Colmena de Cristal');
    expect(d.detail).toContain('6 unidades');
  });

  it('formats the date in Spanish, day first', () => {
    expect(formatSavedAt(META.savedAt)).toMatch(/^10\/10\/2026 14:05$/);
  });
});

describe('ContinueCard', () => {
  it('offers Continuar with the race, rival, day and date of the autosave', () => {
    const html = renderToStaticMarkup(<ContinueCard info={{ slot: 'auto', meta: META, version: SAVE_VERSION, compatible: true }} onContinue={noop} onDiscard={noop} onOpenSlots={noop} />);
    expect(html).toMatch(/<button[^>]*data-continue[^>]*>[^]*CONTINUAR/);
    expect(html).toContain('Enjambre');
    expect(html).toContain('Colmena de Cristal');
    expect(html).toContain('Día 3');
    expect(html).toContain('10/10/2026');
  });

  it('an old save can only be discarded', () => {
    const html = renderToStaticMarkup(<ContinueCard info={{ slot: 'auto', meta: META, version: 0, compatible: false }} onContinue={noop} onDiscard={noop} onOpenSlots={noop} />);
    expect(html).toContain('Partida de una versión anterior');
    expect(html).toContain('Descartar');
    expect(html).not.toContain('data-continue');
  });

  it('shows nothing to continue without an autosave, but still opens the slots', () => {
    const html = renderToStaticMarkup(<ContinueCard info={undefined} onContinue={noop} onDiscard={noop} onOpenSlots={noop} />);
    expect(html).not.toContain('data-continue');
  });
});

describe('SlotList', () => {
  it('lists the autosave and three slots with their metadata', () => {
    const html = renderToStaticMarkup(
      <SlotList mode="load" slots={slots({ slot2: { meta: META, version: SAVE_VERSION } })} onPick={noop} onDelete={noop} onClose={noop} />,
    );
    for (const title of ['Autoguardado', 'Ranura 1', 'Ranura 2', 'Ranura 3']) expect(html).toContain(title);
    expect(html).toContain('Vacía');
    expect(html).toContain('Día 3');
    expect(html).toMatch(/<button[^>]*data-slot-load="slot2"/);
    expect(html).not.toMatch(/data-slot-load="slot1"/); // an empty slot has nothing to load
    expect(html).toMatch(/<button[^>]*aria-label="Borrar Ranura 2"/);
  });

  it('saving goes to the manual slots, never over the autosave', () => {
    const html = renderToStaticMarkup(<SlotList mode="save" slots={slots({ auto: { meta: META, version: SAVE_VERSION } })} onPick={noop} onDelete={noop} onClose={noop} />);
    expect(html).not.toMatch(/data-slot-save="auto"/);
    for (const slot of ['slot1', 'slot2', 'slot3']) expect(html).toMatch(new RegExp(`data-slot-save="${slot}"`));
  });

  it('an old save shows the version notice and can be discarded, not loaded', () => {
    const html = renderToStaticMarkup(<SlotList mode="load" slots={slots({ slot1: { meta: META, version: 0, compatible: false } })} onPick={noop} onDelete={noop} onClose={noop} />);
    expect(html).toContain('Partida de una versión anterior');
    expect(html).not.toMatch(/data-slot-load="slot1"/);
    expect(html).toMatch(/aria-label="Borrar Ranura 1"/);
  });
});

describe('ConfirmDialog', () => {
  it('asks before deleting', () => {
    const html = renderToStaticMarkup(<ConfirmDialog message="¿Borrar la Ranura 1?" confirmLabel="Borrar" onConfirm={noop} onCancel={noop} />);
    expect(html).toContain('role="alertdialog"');
    expect(html).toContain('¿Borrar la Ranura 1?');
    expect(html).toContain('Borrar');
    expect(html).toContain('Cancelar');
  });
});

describe('GameMenuPanel', () => {
  it('has Guardar, Cargar and Salir al menú', () => {
    const html = renderToStaticMarkup(<GameMenuPanel onResume={noop} onSave={noop} onLoad={noop} onExit={noop} />);
    expect(html).toContain('PAUSA');
    for (const label of ['Seguir jugando', 'Guardar', 'Cargar', 'Salir al menú']) expect(html).toContain(label);
  });
});
