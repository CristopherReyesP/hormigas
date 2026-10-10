import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PantryFullNote } from './PantryFullNote';

describe('PantryFullNote', () => {
  it('says the pantry is full, with the food still on its way and the tool that makes room', () => {
    const html = renderToStaticMarkup(<PantryFullNote inTransit={14} />);
    expect(html).toMatch(/class="pantry-full-note"[^>]*role="status"/);
    expect(html).toContain('+14 en camino · ');
    expect(html).toMatch(/Despensa llena: marca más casillas de Almacén \([A-Z]\)/);
  });

  it('leaves out the food on its way when there is none', () => {
    expect(renderToStaticMarkup(<PantryFullNote inTransit={0} />)).not.toContain('en camino');
  });
});
