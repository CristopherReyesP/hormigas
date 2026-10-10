import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MinimapPanel } from './MinimapPanel';

describe('minimap panel', () => {
  it('can fold away to its layer tabs (the compact layout shows this button)', () => {
    const html = renderToStaticMarkup(<MinimapPanel gameManager={null} activeLayer="surface" onSwitchLayer={() => {}} />);
    expect(html).toMatch(/<button[^>]*class="minimap-tab minimap-toggle"[^>]*aria-expanded="true"[^>]*aria-label="Ocultar el minimapa"/);
  });

  it('keeps the layer names on the tabs for screen readers and the desktop', () => {
    const html = renderToStaticMarkup(<MinimapPanel gameManager={null} activeLayer="underground" onSwitchLayer={() => {}} />);
    expect(html).toMatch(/aria-label="Superficie"[\s\S]*SUPERFICIE/);
    expect(html).toMatch(/aria-selected="true"[^>]*aria-label="Nido"[\s\S]*NIDO/);
  });
});

describe('minimap tabs under attack', () => {
  it('pulses the NIDO tab red with the count of invaders inside while the player is on the surface', () => {
    const html = renderToStaticMarkup(
      <MinimapPanel gameManager={null} activeLayer="surface" onSwitchLayer={() => {}} invaders={{ underground: 4, surface: 0 }} />,
    );
    expect(html).toMatch(/class="minimap-tab minimap-tab--alert"[^>]*aria-label="Nido: 4 invasores dentro"/);
    expect(html).toMatch(/<span class="minimap-tab-badge"[^>]*>⚔ 4<\/span>/);
    // Nothing on the surface tab
    expect(html).not.toMatch(/aria-label="Superficie:/);
  });

  it('flags SUPERFICIE when the player is in the nest and the surface is under attack', () => {
    const html = renderToStaticMarkup(
      <MinimapPanel gameManager={null} activeLayer="underground" onSwitchLayer={() => {}} invaders={{ underground: 2, surface: 3 }} />,
    );
    expect(html).toMatch(/class="minimap-tab minimap-tab--alert"[^>]*aria-label="Superficie: 3 enemigos atacando"/);
    expect(html).toMatch(/>⚔ 3<\/span>/);
    // The nest keeps its count, without pulsing (the player is already looking at it)
    expect(html).toMatch(/class="minimap-tab minimap-tab--active"[^>]*aria-label="Nido: 2 invasores dentro"/);
    expect(html).toMatch(/>⚔ 2<\/span>/);
  });

  it('shows no badge when the nest is clear', () => {
    const html = renderToStaticMarkup(
      <MinimapPanel gameManager={null} activeLayer="surface" onSwitchLayer={() => {}} invaders={{ underground: 0, surface: 0 }} />,
    );
    expect(html).not.toContain('minimap-tab-badge');
    expect(html).not.toContain('minimap-tab--alert');
  });
});
