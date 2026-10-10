import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RUN_SETUP } from '../../game/run/RunSetup';
import { RacePicker } from '../RacePicker';
import { HelpCard } from './HelpCard';
import { TutorialOffer } from './TutorialOffer';
import { HELP_CONTROLS } from './steps';

const noop = () => {};

describe('tutorial entry points', () => {
  it('the race picker offers a Tutorial button when asked to', () => {
    expect(renderToStaticMarkup(<RacePicker initialSetup={DEFAULT_RUN_SETUP} onStart={noop} onTutorial={noop} />)).toMatch(
      /<button[^>]*data-tutorial-start[^>]*>TUTORIAL<\/button>/,
    );
    expect(renderToStaticMarkup(<RacePicker initialSetup={DEFAULT_RUN_SETUP} onStart={noop} />)).not.toContain('data-tutorial-start');
  });

  it('the first-visit offer has Hormi, an accept and a skip button', () => {
    const html = renderToStaticMarkup(<TutorialOffer onAccept={noop} onDecline={noop} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-tutorial-accept');
    expect(html).toContain('data-tutorial-decline');
    expect(html).toContain('Hormi');
  });
});

describe('help card', () => {
  it('shows the touch gestures on a touch screen', () => {
    const html = renderToStaticMarkup(<HelpCard device="touch" onClose={noop} onReplayTutorial={noop} />);
    for (const c of HELP_CONTROLS.touch) expect(html).toContain(c.what);
    expect(html).toContain('Pellizca con dos dedos');
    expect(html).not.toContain('Gira la rueda');
  });

  it('shows mouse and keys on a desktop, with Repetir tutorial', () => {
    const html = renderToStaticMarkup(<HelpCard device="mouse" onClose={noop} onReplayTutorial={noop} />);
    expect(html).toContain('Gira la rueda');
    expect(html).not.toContain('Pellizca');
    expect(html).toMatch(/data-help-replay[^>]*>Repetir tutorial/);
    expect(html).toContain('sobrevive el mayor número de noches');
    expect(html).not.toContain('7 noches');
  });
});
