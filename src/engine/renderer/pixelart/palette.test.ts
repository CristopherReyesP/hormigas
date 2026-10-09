import { describe, expect, it } from 'vitest';
import { PAL } from './palette';

function hsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s, l };
}

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};

const FACTION = new Set<string>([
  ...PAL.swarm.flesh, ...PAL.swarm.vein, PAL.swarm.outline,
  ...PAL.crystal.shell, PAL.crystal.shield, PAL.crystal.outline,
]);

/** Every color the alien terrain paints with (surface, flora, underground). */
const GROUND_RAMPS: Record<string, readonly string[]> = {
  regolith: PAL.soil,
  moss: PAL.grass,
  outcrop: PAL.stone,
  dust: PAL.dust,
  rock: PAL.earth,
  burrow: PAL.tunnel,
};
const TERRAIN_COLORS: string[] = [
  ...Object.values(GROUND_RAMPS).flat(),
  ...PAL.water, ...PAL.leaf,
  ...PAL.flora.stalk, ...PAL.flora.pod, ...PAL.flora.fan,
  PAL.mineralFleck, PAL.outcropVein, PAL.mossGlow, ...PAL.rockVein, PAL.fogVoid,
];

describe('alien terrain palette', () => {
  it('never paints the ground with a faction color', () => {
    for (const c of TERRAIN_COLORS) expect(FACTION.has(c), c).toBe(false);
  });

  it('keeps every ground ramp low-saturation and mid-dark so units pop', () => {
    for (const [name, ramp] of Object.entries(GROUND_RAMPS)) {
      for (const c of ramp) {
        const { s, l } = hsl(c);
        expect(s, `${name} ${c} saturation`).toBeLessThan(0.45);
        expect(l, `${name} ${c} lightness`).toBeLessThan(0.56);
      }
    }
  });

  it('orders every terrain ramp dark to light', () => {
    for (const ramp of [...Object.values(GROUND_RAMPS), PAL.water, PAL.leaf, PAL.flora.pod, PAL.flora.fan, PAL.rockVein]) {
      for (let i = 1; i < ramp.length; i++) expect(luminance(ramp[i])).toBeGreaterThan(luminance(ramp[i - 1]));
    }
  });

  it('reads as another planet: violet regolith and blue-green moss', () => {
    for (const c of PAL.soil) expect(hsl(c).h).toBeGreaterThan(255);
    for (const c of PAL.soil) expect(hsl(c).h).toBeLessThan(300);
    for (const c of PAL.grass) expect(hsl(c).h).toBeGreaterThan(150);
    for (const c of PAL.grass) expect(hsl(c).h).toBeLessThan(195);
  });

  it('keeps food fronds distinct from the moss they lie on', () => {
    const frond = hsl(PAL.leaf[1]);
    const moss = hsl(PAL.grass[2]);
    expect(frond.l - moss.l).toBeGreaterThan(0.15);
    expect(frond.s).toBeGreaterThan(moss.s);
  });
});
