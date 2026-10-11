import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildMutationOffer } from '../game/run/DawnPick';
import { EvolutionChamber } from './EvolutionChamber';
import type { MutationId } from '../game/run/MutationDefinitions';

const noop = () => {};

/** The specimen canvases of the rendered cards, in card order. */
function previews(html: string): string[] {
  return html.match(/<canvas[^>]*class="evo-preview"[^>]*>/g) ?? [];
}

describe('evolution chamber specimen', () => {
  it("previews each card's own baked mark", () => {
    const offer = buildMutationOffer(2, ['acid_mandibles', 'cargo_sacs', 'hive_mind'], () => 0);
    const html = renderToStaticMarkup(<EvolutionChamber offer={offer} selected={null} lastPick={null} onSelect={noop} onConfirm={noop} />);
    const canvases = previews(html);
    expect(canvases).toHaveLength(3);
    expect(canvases[0]).toContain('data-mark="chartreuse_jaws"');
    expect(canvases[1]).toContain('data-mark="swollen_pale_gaster"');
    expect(canvases[2]).toContain('data-mark="glowing_antenna_tips"');
  });

  it('shows each mark on a caste that wears it', () => {
    const offer = buildMutationOffer(3, ['acid_mandibles', 'cargo_sacs', 'wing_stubs'], () => 0);
    const html = renderToStaticMarkup(<EvolutionChamber offer={offer} selected={null} lastPick={null} onSelect={noop} onConfirm={noop} />);
    const [jaws, sacs, wings] = previews(html);
    expect(jaws).toContain('data-caste="soldier"');
    expect(sacs).toContain('data-caste="worker"');
    // Wing stubs are a scout mark: a worker specimen would show nothing
    expect(wings).toContain('data-caste="scout"');
  });

  it('sizes the specimen canvas to a whole number of screen px per art px of the 24-grid ant', () => {
    const offer = buildMutationOffer(2, ['bone_spurs'], () => 0);
    const [canvas] = previews(renderToStaticMarkup(<EvolutionChamber offer={offer} selected={null} lastPick={null} onSelect={noop} onConfirm={noop} />));
    expect(canvas).toContain('width="96"');
    expect(canvas).toContain('height="96"');
  });

  it('previews the mark at the stack the pick would give: owned stacks + 1', () => {
    const owned: Record<string, number> = { acid_mandibles: 0, cargo_sacs: 1, hive_mind: 2 };
    const offer = buildMutationOffer(4, ['acid_mandibles', 'cargo_sacs', 'hive_mind'], id => owned[id] ?? 0);
    const [fresh, second, third] = previews(renderToStaticMarkup(<EvolutionChamber offer={offer} selected={null} lastPick={null} onSelect={noop} onConfirm={noop} />));
    expect(fresh).toContain('data-stacks="1"');
    expect(second).toContain('data-stacks="2"');
    expect(third).toContain('data-stacks="3"');
  });

  it('never previews more stacks than the mark can show', () => {
    const offer = buildMutationOffer(5, ['bone_spurs'], () => 5);
    const [canvas] = previews(renderToStaticMarkup(<EvolutionChamber offer={offer} selected={null} lastPick={null} onSelect={noop} onConfirm={noop} />));
    expect(canvas).toContain('data-stacks="3"');
  });
});

describe('evolution chamber two-step pick', () => {
  const offer = buildMutationOffer(2, ['acid_mandibles', 'cargo_sacs', 'hive_mind'], () => 0);
  const render = (selected: MutationId | null) => renderToStaticMarkup(
    <EvolutionChamber offer={offer} selected={selected} lastPick={null} onSelect={noop} onConfirm={noop} />,
  );

  it('shows no confirm button until a card is selected', () => {
    const html = render(null);
    expect(html).not.toContain('Confirmar evolución');
    expect(html).not.toContain('evo-card--selected');
    expect(html).not.toContain('aria-pressed="true"');
  });

  it('highlights the selected card and offers to confirm it by name, or cancel', () => {
    const html = render('cargo_sacs');
    expect(html.match(/evo-card--selected/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    const confirm = html.match(/<button[^>]*evo-confirm-btn[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(confirm).toContain('Confirmar evolución');
    expect(confirm).toContain(offer.options[1].name);
    expect(html).toMatch(/<button[^>]*evo-cancel-btn[^>]*>Cancelar<\/button>/);
  });
});

describe('evolution chamber build', () => {
  it('shows the swarm it already carries, and the total a repeat pick reaches', () => {
    const stacks = (id: MutationId) => (id === 'acid_mandibles' ? 2 : 0);
    const offer = buildMutationOffer(5, ['acid_mandibles', 'cargo_sacs', 'hive_mind'], stacks);
    const owned = [{ id: 'acid_mandibles' as const, name: 'Mandíbulas ácidas', stacks: 2 }];
    const html = renderToStaticMarkup(
      <EvolutionChamber offer={offer} selected={null} lastPick={null} onSelect={noop} onConfirm={noop} owned={owned} />,
    );
    expect(html).toContain('TU ENJAMBRE');
    expect(html).toContain('Mandíbulas ácidas <strong>×2</strong>');
    // The third stack: 1.4³ and 0.9³
    expect(html).toContain('Total con esta · nivel 3/3');
    expect(html).toContain('Daño de los soldados ×2.7');
    expect(html).toContain('Velocidad de los soldados −27%');
    // Only the card the swarm already has gets a total
    expect(html.match(/evo-card-total"/g)).toHaveLength(1);
  });

  it('shows no build row before the first pick', () => {
    const offer = buildMutationOffer(2, ['acid_mandibles'], () => 0);
    const html = renderToStaticMarkup(<EvolutionChamber offer={offer} selected={null} lastPick={null} onSelect={noop} onConfirm={noop} />);
    expect(html).not.toContain('TU ENJAMBRE');
    expect(html).not.toContain('evo-card-total');
  });
});
