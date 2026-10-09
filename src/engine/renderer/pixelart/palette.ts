// Pixel art palette — single source of truth for every color in the game.
// Derived from DawnBringer-32 hues, re-tuned for an earthy ant-colony world.
// RULES:
//  - No color literals anywhere else in rendering code. Import from here.
//  - No alpha gradients on sprites: shading is done with ramp steps + dithering.
//  - Each material has a ramp ordered dark → light (index 0 = darkest).

export const PAL = {
  // ── Neutrals ──────────────────────────────────────────────
  black: '#000000',
  outline: '#1a1410', // universal sprite outline (warm near-black, NOT pure black)
  white: '#f4f0e8',

  // ── Surface terrain ramps ─────────────────────────────────
  soil: ['#3e2d1c', '#5a4226', '#7a5a33', '#9a7847'],
  grass: ['#2e4a23', '#3f6630', '#558741', '#73a85a'],
  sand: ['#9c7e4e', '#bfa066', '#d9c084'],
  stone: ['#3f3f46', '#5a5a64', '#7d7d88', '#a0a0aa'],
  water: ['#1d3a5f', '#2c5784', '#4179ad', '#7db3d9'],

  // ── Underground ramps ─────────────────────────────────────
  earth: ['#171210', '#241b15', '#33271d', '#453425'],
  tunnel: ['#2a2018', '#3a2c1f', '#4c3a28'],

  // ── Chitin (insect bodies) ────────────────────────────────
  chitin: ['#241712', '#3c2418', '#5c3a22', '#80522e'],

  // ── The Swarm (player faction): mutant flesh + glowing vein ──
  // Magenta flesh so the colony never melts into brown soil; the chartreuse
  // vein is the faction's "glow" (a lit 1px line, no alpha on sprites).
  swarm: {
    flesh: ['#2a0f1f', '#4a1736', '#7a2453', '#b03a72', '#e06a9a'],
    vein: ['#5a8a1c', '#c6ff3d'],
    outline: '#1a0a12',
  },

  // ── The Crystal Hive (rival faction): faceted cyan shell ──
  crystal: {
    shell: ['#0e2a3a', '#1b5a73', '#2fa3b8', '#7fe8f0', '#e8ffff'],
    shield: '#5ff3ff',
    outline: '#0a1620',
  },

  // ── Meteorite opening: fireball trail (head → tail) and the crater ──
  meteor: ['#fff4d0', '#ff7a2e', '#b0301e'],
  crater: ['#2a2320', '#3b3346'],

  // ── Neutral wildlife: muted, no glow, never the faction hues ──
  beetle: ['#2b2a1e', '#4a4630', '#6e6844'], // olive shell
  beetleEye: '#ffb02e', // amber
  cricket: ['#5c5a2e', '#8a8444', '#b8b062'], // straw — reads on grass

  // ── Role accents (kept close to current hues for recognition) ──
  worker: '#c08a4a',
  soldier: '#c4452f',
  scout: '#4e9ad1',
  nurse: '#d9a0c0',
  defender: '#8a5fc8',
  queen: '#e0b347',

  // ── Flora & food ──────────────────────────────────────────
  leaf: ['#2e4a23', '#558741', '#8adb5a'],
  // Muted rust cap (panther-cap Amanita): food must not out-shout units, and
  // must never be mistaken for the UI danger red.
  shroomCap: '#93583a',
  shroomCapLight: '#b5794f',
  shroomStem: '#e8d8b8',
  meat: ['#6e2f2f', '#8a3b3b', '#b8625a'],
  wood: ['#4a3220', '#6b4a2c', '#8f6a3e'],

  // ── Sky washes: the surface time-of-day ramp ──────────────
  // Ordered dawn -> noon -> dusk -> night. PostProcessor picks ONE of these per
  // frame (never blends two) so the sky steps between states the way the rest
  // of the art steps between shades.
  skyDawn: '#e0834a',
  skyMorning: '#f0b541',
  skyNoon: '#f6e6bc',
  skyAfternoon: '#e8a24e',
  skyDusk: '#c9553a',
  // Night is red-violet (the Swarm's hour), not navy
  skyNightEdge: '#2a0d1e',
  skyNightDeep: '#1a0612',
  nightAlarm: '#ff2d2d', // dusk alarm vignette pulse

  // ── Glows, pheromones, FX ─────────────────────────────────
  glowAmber: '#f0b541',
  glowGreen: '#8adb5a',
  dangerRed: '#e23d28',
  healthGreen: '#5fbf4a',
  healthYellow: '#e8c440',
  pheroHome: '#4e9ad1',
  pheroFood: '#8adb5a',
  pheroDanger: '#e23d28',

  // ── UI tokens (mirrored as CSS vars in index.css) ─────────
  uiBg: '#12100c',
  uiPanel: '#1e1a14',
  uiPanelLight: '#2a241b',
  uiBorder: '#4a3a26',
  uiText: '#d8d0c0',
  uiTextDim: '#8a8070',
} as const;

/** `#rrggbb` palette token → `rgba()` string for screen-space washes. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Deterministic 2D hash — stable per tile/entity, no Math.random in render code.
export function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967295; // [0, 1)
}

export function pick<T>(arr: readonly T[], h: number): T {
  return arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];
}
