import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildMutationOffer } from '../game/run/DawnPick';
import { EvolutionChamber } from './EvolutionChamber';

const noop = () => {};

/** The specimen canvases of the rendered cards, in card order. */
function previews(html: string): string[] {
  return html.match(/<canvas[^>]*class="evo-preview"[^>]*>/g) ?? [];
}

describe('evolution chamber specimen', () => {
  it("previews each card's own baked mark", () => {
    const offer = buildMutationOffer(2, ['acid_mandibles', 'cargo_sacs', 'hive_mind'], () => 0);
    const html = renderToStaticMarkup(<EvolutionChamber offer={offer} lastPick={null} onChoose={noop} />);
    const canvases = previews(html);
    expect(canvases).toHaveLength(3);
    expect(canvases[0]).toContain('data-mark="chartreuse_jaws"');
    expect(canvases[1]).toContain('data-mark="swollen_pale_gaster"');
    expect(canvases[2]).toContain('data-mark="glowing_antenna_tips"');
  });

  it('shows each mark on a caste that wears it', () => {
    const offer = buildMutationOffer(3, ['acid_mandibles', 'cargo_sacs', 'wing_stubs'], () => 0);
    const html = renderToStaticMarkup(<EvolutionChamber offer={offer} lastPick={null} onChoose={noop} />);
    const [jaws, sacs, wings] = previews(html);
    expect(jaws).toContain('data-caste="soldier"');
    expect(sacs).toContain('data-caste="worker"');
    // Wing stubs are a scout mark: a worker specimen would show nothing
    expect(wings).toContain('data-caste="scout"');
  });

  it('sizes the specimen canvas to a whole number of screen px per art px of the 24-grid ant', () => {
    const offer = buildMutationOffer(2, ['bone_spurs'], () => 0);
    const [canvas] = previews(renderToStaticMarkup(<EvolutionChamber offer={offer} lastPick={null} onChoose={noop} />));
    expect(canvas).toContain('width="96"');
    expect(canvas).toContain('height="96"');
  });

  it('previews the mark at the stack the pick would give: owned stacks + 1', () => {
    const owned: Record<string, number> = { acid_mandibles: 0, cargo_sacs: 1, hive_mind: 2 };
    const offer = buildMutationOffer(4, ['acid_mandibles', 'cargo_sacs', 'hive_mind'], id => owned[id] ?? 0);
    const [fresh, second, third] = previews(renderToStaticMarkup(<EvolutionChamber offer={offer} lastPick={null} onChoose={noop} />));
    expect(fresh).toContain('data-stacks="1"');
    expect(second).toContain('data-stacks="2"');
    expect(third).toContain('data-stacks="3"');
  });

  it('never previews more stacks than the mark can show', () => {
    const offer = buildMutationOffer(5, ['bone_spurs'], () => 5);
    const [canvas] = previews(renderToStaticMarkup(<EvolutionChamber offer={offer} lastPick={null} onChoose={noop} />));
    expect(canvas).toContain('data-stacks="3"');
  });
});
