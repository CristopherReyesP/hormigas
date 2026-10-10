// Pixel art palette — single source of truth for every color in the game.
// Derived from DawnBringer-32 hues, re-tuned for an alien world: the meteorite's
// spores turned the garden into violet regolith, blue-green moss and glowing
// flora. Terrain stays low-saturation and mid-dark so the factions pop.
// RULES:
//  - No color literals anywhere else in rendering code. Import from here.
//  - No alpha gradients on sprites: shading is done with ramp steps + dithering.
//  - Each material has a ramp ordered dark → light (index 0 = darkest).

// Alien fungus ramps, hoisted so the farm-crop tokens can share them
const FUNGUS = {
  cap: ['#221c3c', '#382f66', '#544c92', '#776eb6', '#a59ed8'],
  stalk: ['#2e2838', '#4a4258', '#6c6480', '#948ca6'],
  glow: ['#3f7a70', '#7cc4ae', '#c4f2e0'], // pore and gill light, dark → bright
} as const;

export const PAL = {
  // ── Neutrals ──────────────────────────────────────────────
  black: '#000000',
  outline: '#1a1410', // universal sprite outline (warm near-black, NOT pure black)
  white: '#f4f0e8',

  // ── Surface terrain ramps (alien) ─────────────────────────
  // Key names keep the tile types they paint: `soil` is Dirt, `grass` is Grass…
  soil: ['#1c1424', '#2a1d36', '#3a2a4a', '#4e3a5e', '#6a5078'], // violet-grey regolith dust
  grass: ['#142826', '#1f3a37', '#2b5550', '#3f7468'], // low bioluminescent moss
  dust: ['#3e3248', '#5a4c66', '#7a6c88'], // pale ash flats (Sand tiles)
  stone: ['#262030', '#3b3347', '#575066', '#7a7290'], // alien outcrops
  sand: ['#9c7e4e', '#bfa066', '#d9c084'], // straw, eggs and nest wood only
  water: ['#120f24', '#1d1838', '#2c2852', '#7a6aa8'], // ink pools, lilac glints
  mineralFleck: '#b8aac8', // pale mineral flecks in the regolith
  outcropVein: '#6c8c94', // faint vein lines through outcrops
  mossGlow: '#8cc4b0', // pale bioluminescent beads on moss cushions
  fogVoid: '#0a0610', // unexplored void (fog colour)

  // ── Alien flora: thin stalks with soft glowing pods, fungal fans ──
  flora: {
    stalk: ['#2e2638', '#6e5f80'],
    pod: ['#9c8260', '#e6d2a8', '#fbf0d4'], // pale amber/cream, glows at night
    fan: ['#3d2f44', '#5f4b66', '#86708a'], // dusty mauve shelf fungus
  },

  // ── Underground ramps: violet chitin-rock with faint glowing veins ──
  earth: ['#140e18', '#21182a', '#31243d', '#433352'],
  tunnel: ['#2a2034', '#382b45', '#4a3a5a'],
  rockVein: ['#2c4446', '#4f7f78'],

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
    gold: ['#8a6a1c', '#d9a935', '#ffe27a'], // straight pincers and spire bands
  },

  // ── Meteorite opening: fireball trail (head → tail) and the crater ──
  meteor: ['#fff4d0', '#ff7a2e', '#b0301e'],
  crater: ['#2a2320', '#3b3346'],

  // ── Combat VFX (src/game/vfx) ─────────────────────────────
  // Swarm acid and goo, dark rim → vein → glow → hot core: the vein ramp
  // stretched one step darker (puddle rims) and one lighter (droplet heads).
  acid: ['#2e4a10', '#5a8a1c', '#c6ff3d', '#f2ffc4'],
  vfxFlash: '#ffffff', // the 1-frame death flash: pure white, brighter than PAL.white

  // ── Neutral wildlife: muted, no glow, never the faction hues ──
  beetle: ['#2b2a1e', '#4a4630', '#6e6844'], // olive hide
  beetleAsh: ['#3a3832', '#5f5b50', '#8c877a'], // ash-grey bony plates and teeth
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
  // Alien fronds: still the food-leaf shape, pale teal-lime, brighter than moss
  leaf: ['#2c5a48', '#5cb890', '#aeeccb'],
  // Underground farm crops: the alien fungus ramp (dusky blue-violet caps on
  // mauve-grey stalks), never a brown Earth mushroom or the UI danger red.
  shroomCap: FUNGUS.cap[2],
  shroomCapLight: FUNGUS.cap[3],
  shroomStem: FUNGUS.stalk[3],
  meat: ['#6e2f2f', '#8a3b3b', '#b8625a'],
  wood: ['#4a3220', '#6b4a2c', '#8f6a3e'],

  // ── Sky washes: the surface time-of-day ramp ──────────────
  // Ordered dawn -> noon -> dusk -> night. PostProcessor picks ONE of these per
  // frame (never blends two) so the sky steps between states the way the rest
  // of the art steps between shades.
  skyDawn: '#e0834a',
  skyMorning: '#f0b541',
  skyNoon: '#c8b4f0', // alien noon: a faint violet cast
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

  // ── The Humans (third faction): muted steel and olive drab, no glow ──
  // Low-chroma ramps so they never compete with the Swarm's magenta or the
  // Crystal Hive's cyan; the dull amber visor is their only warm accent.
  human: {
    steel: ['#1c2024', '#33393f', '#525a62', '#7a838a', '#a9b0b4'],
    olive: ['#23271a', '#3a4128', '#56603a', '#77804f'],
    visor: '#c8a050',
    outline: '#0f1210',
  },

  // ── Alien fungus (giant mushroom, mushroom food) ──────────
  // A dusky blue-violet cap, bluer and lighter than the violet regolith it
  // grows on, with mint bioluminescent pores and gills, on a cool mauve-grey
  // stalk. Duller than the faction flesh and shell so units still pop.
  fungus: FUNGUS,

  // ── Alien flesh (wildlife meat): amber ichor pulp ──────────
  // Warm amber, far from the Swarm's magenta and from raw red meat, so a
  // carcass never reads as a Swarm body or an Earth steak.
  alienFlesh: ['#3e2614', '#7a4224', '#b0703a', '#dca456', '#f6d68e'],
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
