import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleScreen } from './TitleScreen';
import { GAME_VERSION } from '../shared/version';

describe('title screen', () => {
  const html = renderToStaticMarkup(<TitleScreen onStart={() => {}} />);

  it('shows the game name and the colony against the crystals', () => {
    expect(html).toContain('HORMIGAS');
    expect(html).toContain('LA COLONIA');
    expect(html).toContain('LOS CRISTALES');
  });

  it('shows the game version, small, at the bottom: the build date and its commit', () => {
    expect(html).toMatch(/<p class="game-version game-version--title"[^>]*>v\d{4}-\d{2}-\d{2} \d{2}:\d{2} · [0-9a-z]+<\/p>/);
    expect(html).toContain(GAME_VERSION);
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
