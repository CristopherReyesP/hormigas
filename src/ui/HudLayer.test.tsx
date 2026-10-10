import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { HudLayer } from './HudLayer';
import { ObjectivePanel } from './ObjectivePanel';
import { NotificationStack } from './NotificationStack';

function hud(introPlaying: boolean, scale?: number): { layer: string; html: string } {
  const html = renderToStaticMarkup(
    <HudLayer introPlaying={introPlaying} scale={scale}>
      <header className="top-strip">DÍA 1</header>
      <ObjectivePanel objective={null} />
      <NotificationStack notifications={[]} hint="Elige dónde excavar" />
    </HudLayer>,
  );
  const layer = html.match(/^<div[^>]*>/)?.[0] ?? '';
  return { layer, html };
}

describe('HUD layer', () => {
  it('hides the whole HUD while the intro runs, so the letterbox bars frame the full screen', () => {
    const { layer, html } = hud(true);
    expect(layer).toContain('hud-layer--intro');
    // Hidden from the pointer, the keyboard and assistive tech, not just faded out
    expect(layer).toContain('inert=""');
    // Still mounted, so it can fade in without a reflow
    expect(html).toContain('top-strip');
    expect(html).toContain('OBJETIVOS');
    expect(html).toContain('notif-feed');
  });

  it('shows the HUD again once the intro ends or is skipped', () => {
    const { layer, html } = hud(false);
    expect(layer).toContain('class="hud-layer"');
    expect(layer).not.toContain('hud-layer--intro');
    expect(layer).not.toContain('inert');
    expect(html).toContain('OBJETIVOS');
  });
});

describe('HUD scale', () => {
  it('passes the viewport step to the CSS as --hud-scale', () => {
    expect(hud(false, 2).layer).toContain('--hud-scale:2');
    expect(hud(false, 1).layer).toContain('--hud-scale:1');
  });
});
