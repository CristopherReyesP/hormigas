/**
 * 8×8 pixel icons for the HUD — drawn as SVG rects, never OS emoji.
 * One art pixel = 2 screen px at the 16 px size, matching the world's art scale.
 * Colors are chrome / palette tokens (src/engine/renderer/pixelart/palette.ts).
 */

const COLORS: Record<string, string> = {
  k: '#0e080b', // chrome bg / outline
  w: '#e8d8dc', // chrome text
  d: '#9a8088', // chrome dim
  n: '#5a3048', // chrome border
  N: '#8a4a6a', // chrome border light
  a: '#c6ff3d', // swarm vein glow (accent)
  v: '#5a8a1c', // swarm vein dark
  f: '#7a2453', // swarm flesh
  m: '#b03a72',
  p: '#e06a9a',
  G: '#2e4a23', // leaf ramp
  g: '#558741',
  l: '#8adb5a',
  r: '#93583a', // mushroom cap
  R: '#b5794f',
  s: '#e8d8b8', // mushroom stem / bone
  e: '#8a3b3b', // meat
  E: '#b8625a',
  y: '#f0b541', // warn / amber
  Y: '#ffe27a', // gold light
  x: '#ff3b3b', // danger
  b: '#4e9ad1', // scout blue
  o: '#6e6844', // beetle olive
  O: '#ffb02e', // beetle eye
  t: '#7d7d88', // iron
  T: '#a0a0aa',
  h: '#6b4a2c', // wood
  H: '#8f6a3e',
  q: '#0e2a3a', // crystal ramp (PAL.crystal.shell)
  c: '#2fa3b8',
  C: '#7fe8f0',
  Q: '#e8ffff',
};

const ICON_ART = {
  leaf: [
    '.....Gg.',
    '...Gglg.',
    '..Gllgg.',
    '.Gllgg..',
    '.Glgg...',
    '.Ggg....',
    'G.......',
    '........',
  ],
  fungus: [
    '..rrrr..',
    '.rRRrrr.',
    'rRRrrrrr',
    'rrrrrrrr',
    '..ssss..',
    '...ss...',
    '...ss...',
    '..ssss..',
  ],
  meat: [
    '....eEE.',
    '...eEEEe',
    '..eEEEee',
    '..eEEeee',
    '..eeeee.',
    '.ss.ee..',
    'ss......',
    's.......',
  ],
  ant: [
    '.p....p.',
    '..p..p..',
    '..mppm..',
    '...mm...',
    '.m.mm.m.',
    '..mmmm..',
    '.mmmmmm.',
    '..mmmm..',
  ],
  worker: [
    '.....gg.',
    '....glg.',
    '.p..gg..',
    '..mpg...',
    '.mmpm...',
    '..mm.m..',
    '.m..m...',
    '........',
  ],
  sword: [
    '......ww',
    '.....wTw',
    '....wTw.',
    '.d.wTw..',
    '..dTw...',
    '..hd....',
    '.h..d...',
    'h.......',
  ],
  eye: [
    '........',
    '..kkkk..',
    '.kwwwwk.',
    'kwwbbwwk',
    'kwwbkwwk',
    '.kwwwwk.',
    '..kkkk..',
    '........',
  ],
  egg: [
    '...ww...',
    '..wwww..',
    '.wwwwww.',
    '.wwwwdw.',
    '.wwwwdw.',
    '.wwwddw.',
    '..wddd..',
    '........',
  ],
  nurse: [
    '...ss...',
    '..ssss..',
    '.sspsss.',
    '.spppss.',
    '.sspsss.',
    '.ssssds.',
    '..sdds..',
    '........',
  ],
  shield: [
    '.nnnnnn.',
    'nNNNNNNn',
    'nNaaaaNn',
    'nNaNNaNn',
    'nNNaaNNn',
    '.nNaaNn.',
    '..nNNn..',
    '...nn...',
  ],
  sun: [
    '...y....',
    '.y.y.y..',
    '..yYy...',
    'yyYYYyy.',
    '..yYy...',
    '.y.y.y..',
    '...y....',
    '........',
  ],
  moon: [
    '..ppp...',
    '.pp.....',
    'pp......',
    'pp......',
    'pp......',
    '.pp...p.',
    '..pppp..',
    '........',
  ],
  hourglass: [
    '.wwwwww.',
    '.w....w.',
    '..wyyw..',
    '...yy...',
    '...yy...',
    '..w..w..',
    '.wyyyyw.',
    '.wwwwww.',
  ],
  beetle: [
    '.k....k.',
    '..kOOk..',
    'k.oooo.k',
    '.ookkoo.',
    'kookkook',
    '.ookkoo.',
    'k.oooo.k',
    '........',
  ],
  den: [
    '........',
    '..oooo..',
    '.oooooo.',
    'ookkkkoo',
    'okkkkkko',
    '.okkkko.',
    '..oooo..',
    '........',
  ],
  pause: [
    '........',
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '.ww..ww.',
    '........',
  ],
  play: [
    '.a......',
    '.aa.....',
    '.aaa....',
    '.aaaa...',
    '.aaaa...',
    '.aaa....',
    '.aa.....',
    '.a......',
  ],
  pick: [
    '.TTTTT..',
    'T..h..T.',
    '...h....',
    '...h....',
    '...h....',
    '...h....',
    '...h....',
    '........',
  ],
  /** A cluster of crystal shards: the minerals bank */
  mineral: [
    '...Q....',
    '..qCc...',
    '..qCc.Q.',
    'Q.qCcqC.',
    'Cqqcc.qc',
    'CcqccqCc',
    'qcqqcqcq',
    '.qqqqqq.',
  ],
  /** Underground chamber holding a mixed food pile: the stock that pays for eggs */
  pantry: [
    '.nnnnnn.',
    'nkkkkkkn',
    'nkkkRkkn',
    'nklgRRkn',
    'nlggrEEn',
    'nGgrrEen',
    'nnnnnnnn',
    '........',
  ],
  crate: [
    'hhhhhhhh',
    'hHHHHHHh',
    'hHhHHhHh',
    'hHHhhHHh',
    'hHHhhHHh',
    'hHhHHhHh',
    'hHHHHHHh',
    'hhhhhhhh',
  ],
  crown: [
    '........',
    'y..yy..y',
    'yy.yy.yy',
    'yyyyyyyy',
    'yxyYYyxy',
    'yyyyyyyy',
    '........',
    '........',
  ],
  horn: [
    '......yy',
    '....yyYy',
    '.yyyYYYy',
    'yYYYYYYy',
    '.yyyYYYy',
    '....yyYy',
    '......yy',
    '........',
  ],
  descend: [
    '...aa...',
    '...aa...',
    'aaaaaaaa',
    '.aaaaaa.',
    '..aaaa..',
    '...aa...',
    'NNN..NNN',
    '.nnnnnn.',
  ],
  ascend: [
    '...aa...',
    '..aaaa..',
    '.aaaaaa.',
    'aaaaaaaa',
    '...aa...',
    '...aa...',
    '........',
    'llgglggl',
  ],
  upgrade: [
    '...aa...',
    '..aaaa..',
    '.aa..aa.',
    'aa....aa',
    '...aa...',
    '..aaaa..',
    '.aa..aa.',
    'aa....aa',
  ],
  /** Move order: an arrow heading for a ground marker */
  move: [
    '...a....',
    '...aa...',
    'aaaaaa..',
    'aaaaaaa.',
    'aaaaaa..',
    '...aa...',
    '...a..l.',
    '.....lll',
  ],
  /** Attack order: a blade driven into a red ground mark */
  attack: [
    '......ww',
    '.....wTw',
    '....wTw.',
    '.d.wTw..',
    '..dTw...',
    '..hd..x.',
    '.h..dxxx',
    'h.....x.',
  ],
  /** Hold position: a shield barred across, it does not move */
  hold: [
    '.nnnnnn.',
    'nNNNNNNn',
    'nNNNNNNn',
    'nwwwwwwn',
    'nwwwwwwn',
    '.nNNNNn.',
    '..nNNn..',
    '...nn...',
  ],
  /** Stop order: a red octagon with a white bar */
  stop: [
    '..xxxx..',
    '.xxxxxx.',
    'xxxxxxxx',
    'xwwwwwwx',
    'xwwwwwwx',
    'xxxxxxxx',
    '.xxxxxx.',
    '..xxxx..',
  ],
  back: [
    '...w....',
    '..ww....',
    '.wwwwwww',
    'wwwwwwww',
    '.wwwwwww',
    '..ww....',
    '...w....',
    '........',
  ],
  minus: [
    '........',
    '........',
    '........',
    '.wwwwww.',
    '.wwwwww.',
    '........',
    '........',
    '........',
  ],
  plus: [
    '........',
    '...ww...',
    '...ww...',
    '.wwwwww.',
    '.wwwwww.',
    '...ww...',
    '...ww...',
    '........',
  ],
  bowl: [
    '........',
    '..l.R.E.',
    '.lgrRee.',
    'wwwwwwww',
    '.wddddw.',
    '..wwww..',
    '........',
    '........',
  ],
  flag: [
    '.waaa...',
    '.waaaaa.',
    '.waaa...',
    '.w......',
    '.w......',
    '.w......',
    '.w......',
    'www.....',
  ],
  alert: [
    '...xx...',
    '...xx...',
    '...xx...',
    '...xx...',
    '...xx...',
    '........',
    '...xx...',
    '...xx...',
  ],
  star: [
    '...y....',
    '...y....',
    '.yyYyy..',
    '..yYy...',
    '..y.y...',
    '.y...y..',
    '........',
    '........',
  ],
  skull: [
    '.wwwwww.',
    'wwwwwwww',
    'wkkwwkkw',
    'wkkwwkkw',
    'wwwkkwww',
    '.wwwwww.',
    '.w.ww.w.',
    '........',
  ],
  heart: [
    '.xx..xx.',
    'xxxxxxxx',
    'xxxxxxxx',
    'xxxxxxxx',
    '.xxxxxx.',
    '..xxxx..',
    '...xx...',
    '........',
  ],
  vein: [
    '.......a',
    '......av',
    '..a..av.',
    '.ava.v..',
    'av.vav..',
    'v...v...',
    '........',
    '........',
  ],
  /** Seleccionar área: a dashed selection box around an ant */
  area: [
    'aa.aa.aa',
    'a......a',
    '...pp...',
    'a..mm..a',
    'a..pp..a',
    '...mm...',
    'a......a',
    'aa.aa.aa',
  ],
  /** Control group binding: a number tag */
  group: [
    'nnnnnn..',
    'nwwwwwn.',
    'nwaawwwn',
    'nwwawwwn',
    'nwwawwwn',
    'nwaaawn.',
    'nnnnnn..',
    '........',
  ],
  /** Espina: a chitin turret with a spine on top */
  spine: [
    '....s...',
    '...sa...',
    '...am...',
    '..fmmf..',
    '..mpfm..',
    '.fmaamf.',
    'ffmmmmff',
    '.kkkkkk.',
  ],
  /** Trampa de resina: an amber puddle with a bubble */
  trap: [
    '........',
    '...Y....',
    '..y.y...',
    '...Y..Y.',
    '.yyyyyy.',
    'yYyyYyyy',
    '.yyyyyy.',
    '........',
  ],
  /** Muro de quitina: stacked chitin plates */
  wall: [
    '........',
    'fmmfmmmf',
    'mppmppmp',
    'ffmmfmmf',
    'mmfmmmfm',
    'pmmppmmp',
    'fmmfmmff',
    'kkkkkkkk',
  ],
  /** Recenter the camera: crosshair */
  target: [
    '...aa...',
    '...aa...',
    '........',
    'aa.ww.aa',
    'aa.ww.aa',
    '........',
    '...aa...',
    '...aa...',
  ],
  map: [
    'nnnnnnnn',
    'nggGGkkn',
    'nglGkkkn',
    'nGGgakkn',
    'nGggGGkn',
    'nkGgggGn',
    'nkkGGggn',
    'nnnnnnnn',
  ],
} as const;

export type IconName = keyof typeof ICON_ART;

export interface IconRun {
  x: number;
  y: number;
  w: number;
  color: string;
}

const runCache = new Map<IconName, IconRun[]>();

/** Horizontal same-color runs of an icon — one SVG rect each. */
export function iconRuns(name: IconName): IconRun[] {
  const cached = runCache.get(name);
  if (cached) return cached;
  const runs: IconRun[] = [];
  ICON_ART[name].forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const char = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === char) end++;
      const color = COLORS[char];
      if (color) runs.push({ x, y, w: end - x, color });
      x = end;
    }
  });
  runCache.set(name, runs);
  return runs;
}
