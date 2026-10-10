import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ObjectiveState } from '../game/systems/ObjectiveSystem';
import { ObjectivePanel, ObjectivePanelView } from './ObjectivePanel';

const OBJECTIVE: ObjectiveState = {
  title: 'Primera generación',
  description: 'Cría tu primera hormiga',
  progress: 0,
  target: 1,
  completedCount: 0,
  totalCount: 8,
};

const noop = () => {};

describe('objectives panel', () => {
  it('starts collapsed to a small OBJETIVOS toggle, so nothing covers the intro', () => {
    const html = renderToStaticMarkup(<ObjectivePanel objective={OBJECTIVE} />);
    expect(html).toContain('<button');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('OBJETIVOS');
    expect(html).not.toContain('Primera generación');
    expect(html).not.toContain('hud-bar');
  });

  it('expands to the full tracker: title, description, progress bar and count', () => {
    const html = renderToStaticMarkup(<ObjectivePanelView objective={OBJECTIVE} open onToggle={noop} />);
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Primera generación');
    expect(html).toContain('Cría tu primera hormiga');
    expect(html).toContain('hud-bar-fill');
    expect(html).toContain('0/8');
  });

  it('states the endless goal of the run when open', () => {
    const html = renderToStaticMarkup(<ObjectivePanelView objective={OBJECTIVE} open onToggle={noop} />);
    expect(html).toContain('Haz crecer la colonia y sobrevive el mayor número de noches. Si muere la reina, pierdes.');
    expect(html).not.toContain('7 noches');
  });

  it('keeps the all-done message when every objective is met', () => {
    const html = renderToStaticMarkup(<ObjectivePanelView objective={null} open onToggle={noop} />);
    expect(html).toContain('¡Todos cumplidos!');
  });
});
