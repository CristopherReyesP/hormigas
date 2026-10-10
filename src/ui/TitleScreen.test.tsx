import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleScreen } from './TitleScreen';

describe('title screen', () => {
  const html = renderToStaticMarkup(<TitleScreen onStart={() => {}} />);

  it('shows the game name and the colony against the crystals', () => {
    expect(html).toContain('HORMIGAS');
    expect(html).toContain('LA COLONIA');
    expect(html).toContain('LOS CRISTALES');
  });

  it('opens with an INICIAR button over an animated scene', () => {
    expect(html).toMatch(/<button[^>]*data-title-start[^>]*>INICIAR<\/button>/);
    expect(html).toContain('<canvas');
  });
});

describe('title screen menu', () => {
  it('holds the saved run and the tutorial', () => {
    const html = renderToStaticMarkup(
      <TitleScreen onStart={() => {}} onTutorial={() => {}} savedRun={<button type="button" data-continue="">CONTINUAR</button>} />,
    );
    expect(html).toContain('data-continue');
    expect(html).toMatch(/<button[^>]*data-tutorial-start[^>]*>TUTORIAL<\/button>/);
  });
});
