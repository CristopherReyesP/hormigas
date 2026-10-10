import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MilestoneBanner } from './MilestoneBanner';

describe('night milestone banner', () => {
  it('celebrates the milestone with its reward', () => {
    const html = renderToStaticMarkup(
      <MilestoneBanner milestone={{ night: 7, title: '¡Sobreviviste 7 noches!', minerals: 140, food: 105, foodUnit: 'comida' }} />,
    );
    expect(html).toContain('¡Sobreviviste 7 noches!');
    expect(html).toContain('+140 minerales');
    expect(html).toContain('+105 comida');
    expect(html).toContain('role="status"');
  });

  it('names a Human expedition food share as rations', () => {
    const html = renderToStaticMarkup(
      <MilestoneBanner milestone={{ night: 12, title: '¡Noche 12!', minerals: 240, food: 180, foodUnit: 'raciones' }} />,
    );
    expect(html).toContain('+180 raciones');
  });

  it('renders nothing without a milestone', () => {
    expect(renderToStaticMarkup(<MilestoneBanner milestone={null} />)).toBe('');
  });
});
