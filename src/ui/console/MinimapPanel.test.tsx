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
