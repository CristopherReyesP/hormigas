import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CommandCard } from './CommandCard';
import type { CommandDef } from './commands';

const noop = () => {};

function breed(overrides: Partial<CommandDef> = {}): CommandDef {
  return {
    id: 'breed-worker',
    label: 'Criar obrera',
    icon: 'worker',
    description: 'La reina pone un huevo.',
    cost: { amount: 20, resource: 'comida', short: false },
    run: noop,
    ...overrides,
  };
}

function render(commands: Array<CommandDef | null>): string {
  return renderToStaticMarkup(<CommandCard commands={commands} hotkeysEnabled={false} onEscape={noop} />);
}

describe('command card face', () => {
  it('prints the cost with the pantry icon on the button itself', () => {
    const html = render([breed()]);
    expect(html).toMatch(/<span class="cmd-cost"[^>]*>.*<svg.*20<\/span>/);
    expect(html).toContain('cmd-face cmd-face--cost');
  });

  it('paints a cost the pantry cannot pay in the danger tone', () => {
    const html = render([breed({ cost: { amount: 35, resource: 'comida', short: true } })]);
    expect(html).toContain('cmd-cost cmd-cost--short');
  });

  it('keeps the queued count on the face and marks a full queue', () => {
    expect(render([breed({ badge: '2' })])).toContain('<span class="cmd-badge">2</span>');
    expect(render([breed({ badge: '5/5', badgeTone: 'warn' })])).toContain('<span class="cmd-badge cmd-badge--warn">5/5</span>');
  });

  it('marks a disabled command with aria-disabled so a click can still explain why', () => {
    const html = render([breed({ disabled: true, disabledReason: 'Falta comida en la despensa: hay 0 de 20.' })]);
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('cmd-btn--disabled');
  });

  it('leaves commands without a cost unchanged', () => {
    const html = render([{ id: 'gather', label: 'Recolectar', icon: 'leaf', description: 'x', run: noop }]);
    expect(html).not.toContain('cmd-cost');
    expect(html).toContain('class="cmd-face"');
  });
});
