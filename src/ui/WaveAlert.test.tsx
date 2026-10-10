import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InvasionInfo } from '../game/systems/UndergroundInvasionSystem';
import { WaveAlert } from './WaveAlert';
import { edgeMarker } from './waveAlertLayout';

const IDLE: InvasionInfo = {
  waveNumber: 1,
  nextWaveIn: 120,
  active: false,
  invadersAlive: 0,
  armed: false,
  waveSize: 5,
  remaining: 0,
  banner: null,
  threats: [],
};
const VIEW = { x: 10, y: 10, w: 40, h: 20 };

const render = (invasion: Partial<InvasionInfo>, layer: 'surface' | 'underground' = 'surface') =>
  renderToStaticMarkup(<WaveAlert invasion={{ ...IDLE, ...invasion }} activeLayer={layer} view={VIEW} />);

describe('edgeMarker', () => {
  it('pins a target off to the right on the right edge, pointing right', () => {
    const m = edgeMarker(VIEW, { x: 100, y: 20 });
    expect(m.inside).toBe(false);
    expect(m.left).toBeGreaterThan(90);
    expect(m.top).toBeCloseTo(50, 0);
    expect(m.angle).toBeCloseTo(0, 0);
  });

  it('pins a target above on the top edge, pointing up', () => {
    const m = edgeMarker(VIEW, { x: 30, y: -50 });
    expect(m.top).toBeLessThan(10);
    expect(m.left).toBeCloseTo(50, 0);
    expect(m.angle).toBeCloseTo(-90, 0);
  });

  it('keeps the marker inside the band of the screen the view fills, clear of the HUD', () => {
    const band = { left: 0, top: 0.05, width: 1, height: 0.7 };
    const m = edgeMarker({ ...VIEW, band }, { x: 30, y: 500 });
    expect(m.top).toBeLessThan(75);
    expect(m.top).toBeGreaterThan(65);
    expect(edgeMarker({ ...VIEW, band }, { x: 30, y: 20 }).top).toBeCloseTo(40, 5);
  });

  it('marks a target in view where it is', () => {
    expect(edgeMarker(VIEW, { x: 20, y: 15 })).toMatchObject({ inside: true, left: 25, top: 25 });
  });
});

describe('WaveAlert', () => {
  it('shows nothing on a quiet day', () => {
    expect(render({})).toBe('');
  });

  it('warns half a minute ahead with a live countdown and the enemy count', () => {
    const html = render({ nextWaveIn: 27.3, banner: { id: 1, kind: 'warning', wave: 2, count: 5 } });
    expect(html).toContain('¡Oleada 2 en 28 s!');
    expect(html).toContain('5 enemigos');
  });

  it('announces the arrival big, in the middle of the screen', () => {
    const html = render({ active: true, remaining: 12, waveSize: 12, banner: { id: 2, kind: 'arrival', wave: 4, count: 12 } });
    expect(html).toMatch(/wave-announce[^>]*>.*OLEADA 4.*12 enemigos/);
  });

  it('counts the enemies left while the wave is on', () => {
    const html = render({ waveNumber: 4, active: true, remaining: 7, waveSize: 12 });
    expect(html).toMatch(/wave-counter[^>]*>.*Oleada 4.*7.*restantes/);
  });

  it('celebrates the clear', () => {
    const html = render({ banner: { id: 3, kind: 'cleared', wave: 4, count: 12 } });
    expect(html).toContain('¡Oleada 4 superada!');
  });

  it('points at the threats of the layer on screen, red edge arrows for those off view', () => {
    const threats: InvasionInfo['threats'] = [
      { x: 120, y: 20, layer: 'surface' },
      { x: 30, y: 2, layer: 'underground' },
    ];
    const surface = render({ active: true, remaining: 3, threats }, 'surface');
    expect(surface.match(/class="wave-arrow"/g)).toHaveLength(1);
    const underground = render({ active: true, remaining: 3, threats }, 'underground');
    expect(underground.match(/class="wave-arrow"/g)).toHaveLength(1);
    const none = render({ active: false, threats: [] }, 'surface');
    expect(none).not.toContain('wave-arrow');
  });

  it('says where the fight is when it is on the other layer', () => {
    const html = render({ active: true, remaining: 3, threats: [{ x: 30, y: 2, layer: 'underground' }] }, 'surface');
    expect(html).toContain('restantes · en el NIDO');
    expect(html).not.toContain('wave-arrow');
  });
});
