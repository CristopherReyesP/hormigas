import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_RUN_SETUP } from '../game/run/RunSetup';
import { RacePicker } from './RacePicker';
import { RACE_CARDS, RIVAL_OPTIONS, rivalOptionsFor } from './racePicker/races';

const noop = () => {};

/** The opening tag of the first button carrying `attr`. */
function buttonTag(html: string, attr: string): string {
  const match = html.match(new RegExp(`<button[^>]*${attr}[^>]*>`));
  if (!match) throw new Error(`no button with ${attr}`);
  return match[0];
}

/** Everything inside the element whose opening tag carries `attr`, up to the next card. */
function cardHtml(html: string, attr: string): string {
  const start = html.indexOf(buttonTag(html, attr));
  const end = html.indexOf('</button>', start);
  return html.slice(start, end);
}

describe('race picker', () => {
  const html = renderToStaticMarkup(<RacePicker initialSetup={DEFAULT_RUN_SETUP} onStart={noop} />);

  it('opens as a full-screen skirmish setup: your race, the rival and a start button', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('TU RAZA');
    expect(html).toContain('RIVAL');
    expect(html).toMatch(/<button[^>]*data-start[^>]*>[^]*COMENZAR/);
    expect(buttonTag(html, 'data-start')).not.toContain('disabled');
  });

  it('offers the three races, with the Swarm playable and chosen', () => {
    for (const race of RACE_CARDS) expect(html).toContain(race.name);
    const swarm = buttonTag(html, 'data-race="swarm"');
    expect(swarm).not.toContain('disabled');
    expect(swarm).toContain('aria-pressed="true"');
  });

  it('offers the Swarm, the Humans and the Crystal Hive as playable races', () => {
    for (const id of ['swarm', 'human', 'crystal']) {
      expect(buttonTag(html, `data-race="${id}"`)).not.toContain('disabled');
      expect(cardHtml(html, `data-race="${id}"`)).not.toContain('Próximamente');
    }
  });

  it('playing the Crystal Hive: fight the wildlife, the Humans or a mirror Crystal Hive; the Swarm rival is coming soon', () => {
    const out = renderToStaticMarkup(<RacePicker initialSetup={{ playerRace: 'crystal', rivalRace: 'human' }} onStart={noop} />);
    expect(buttonTag(out, 'data-race="crystal"')).toContain('aria-pressed="true"');
    expect(buttonTag(out, 'data-rival="human"')).toContain('aria-pressed="true"');
    for (const id of ['wildlife', 'crystal', 'human']) expect(buttonTag(out, `data-rival="${id}"`)).not.toContain('disabled');
    const swarm = buttonTag(out, 'data-rival="swarm"');
    expect(swarm).toContain('disabled=""');
    expect(cardHtml(out, 'data-rival="swarm"')).toContain('Próximamente');
    expect(out).toMatch(/Colmena de Cristal[^]*VS[^]*Humanos[^]*COMENZAR/);
  });

  it('as the Humans: fight the wildlife, the Crystal Hive or a mirror Human base; the Swarm AI is "Próximamente"', () => {
    const out = renderToStaticMarkup(<RacePicker initialSetup={{ playerRace: 'human', rivalRace: 'crystal' }} onStart={noop} />);
    expect(buttonTag(out, 'data-race="human"')).toContain('aria-pressed="true"');
    expect(cardHtml(out, 'data-race="human"')).toContain('Elegida');
    for (const id of ['wildlife', 'crystal', 'human']) expect(buttonTag(out, `data-rival="${id}"`)).not.toContain('disabled');
    expect(buttonTag(out, 'data-rival="crystal"')).toContain('aria-pressed="true"');
    expect(buttonTag(out, 'data-rival="swarm"')).toContain('disabled=""');
    expect(cardHtml(out, 'data-rival="swarm"')).toContain('Próximamente');
    expect(out).toMatch(/Humanos[^]*VS[^]*Colmena de Cristal[^]*COMENZAR/);
    expect(rivalOptionsFor('human').map((r) => r.id)).toEqual(['wildlife', 'crystal', 'human', 'swarm']);
  });

  it('gives every race its identity: food, breeding, building, strength and tactics', () => {
    for (const race of RACE_CARDS) {
      const card = cardHtml(html, `data-race="${race.id}"`);
      expect(race.traits.map((t) => t.label)).toEqual(['Come', 'Cría', 'Construye', 'Fuerza', 'Tácticas']);
      for (const trait of race.traits) {
        expect(card).toContain(trait.label);
        expect(card).toContain(trait.text);
      }
      expect(race.units).toHaveLength(3);
      for (const unit of race.units) expect(card).toContain(unit.label);
      expect((card.match(/<canvas/g) ?? []).length).toBe(3);
    }
  });

  it('lets you fight the wildlife, the Crystal Hive or the Humans', () => {
    expect(RIVAL_OPTIONS.map((r) => r.name)).toEqual(['Fauna salvaje', 'Colmena de Cristal', 'Humanos']);
    const wildlife = buttonTag(html, 'data-rival="wildlife"');
    expect(wildlife).not.toContain('disabled');
    expect(wildlife).toContain('aria-pressed="true"');
    for (const id of ['crystal', 'human']) {
      expect(buttonTag(html, `data-rival="${id}"`)).not.toContain('disabled');
      expect(buttonTag(html, `data-rival="${id}"`)).toContain('aria-pressed="false"');
      expect(cardHtml(html, `data-rival="${id}"`)).not.toContain('Próximamente');
    }
  });

  it('opens on the Crystal Hive when that was the last rival picked', () => {
    const out = renderToStaticMarkup(<RacePicker initialSetup={{ playerRace: 'swarm', rivalRace: 'crystal' }} onStart={noop} />);
    expect(buttonTag(out, 'data-rival="crystal"')).toContain('aria-pressed="true"');
    expect(out).toMatch(/Enjambre[^]*VS[^]*Colmena de Cristal[^]*COMENZAR/);
  });

  it('spells out the matchup next to the start button', () => {
    expect(html).toMatch(/Enjambre[^]*VS[^]*Fauna salvaje[^]*COMENZAR/);
  });

  it('opens on a sanitized default even if handed a race that is not playable yet', () => {
    const out = renderToStaticMarkup(
      <RacePicker initialSetup={{ playerRace: 'robots' as never, rivalRace: 'human' }} onStart={noop} />,
    );
    expect(buttonTag(out, 'data-race="swarm"')).toContain('aria-pressed="true"');
    expect(buttonTag(out, 'data-rival="human"')).toContain('aria-pressed="true"');
  });
});
