import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createAudioSettingsStore, type MuteMode, type SettingsStorage } from '../settings';
import { SoundToggle } from './SoundToggle';

function storeIn(mode: MuteMode) {
  const data: Record<string, string> = {};
  const storage: SettingsStorage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
  const store = createAudioSettingsStore(() => storage);
  store.update({ mode });
  return store;
}

describe('speaker toggle', () => {
  it.each<[MuteMode, string, string]>([
    ['on', 'Sonido activado', 'sin música'],
    ['noMusic', 'Sin música', 'silencio'],
    ['muted', 'Silencio', 'sonido activado'],
  ])('in mode %s says what it is and what a click does', (mode, now, next) => {
    const html = renderToStaticMarkup(<SoundToggle store={storeIn(mode)} />);
    expect(html).toContain(`strip-sound--${mode}`);
    expect(html).toContain(`title="${now}. Clic: ${next}"`);
  });

  it('draws a different speaker for each mode', () => {
    const icons = (['on', 'noMusic', 'muted'] as const).map((mode) => renderToStaticMarkup(<SoundToggle store={storeIn(mode)} />));
    expect(new Set(icons.map((html) => html.match(/<svg[\s\S]*?<\/svg>/)![0])).size).toBe(3);
  });

  it('offers the volume popover, closed until asked', () => {
    const html = renderToStaticMarkup(<SoundToggle store={storeIn('on')} />);
    expect(html).toMatch(/aria-expanded="false"[^>]*title="Volumen"|title="Volumen"[^>]*aria-expanded="false"/);
    expect(html).not.toContain('type="range"');
  });
});
