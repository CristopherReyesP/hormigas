// Which top-strip readouts fold away when the strip runs out of width.
//
// The strip is one nowrap row; on a narrow window its three groups used to
// spill into each other. Now TopStrip measures what the row needs and folds
// the least important readouts (into the Más datos drawer) until the rest
// fits. The pantry total, the minerals, the wave timer and pause never fold;
// the ant total is nearly the last to go.

export type StripFoldId =
  | 'pop'
  | 'sound'
  | 'eventNames'
  | 'events'
  | 'incoming'
  | 'labels'
  | 'phase'
  | 'day'
  | 'miners'
  | 'badge'
  | 'help'
  | 'otherFood'
  | 'fullTag'
  | 'waveWords'
  | 'antTotal'
  | 'leaf';

export interface StripFold {
  id: StripFoldId;
  /** The elements of this unit inside the strip */
  selector: string;
  /** Higher folds first */
  priority: number;
}

/**
 * Fold units, from the first to go to the last. Hidden readouts stay in the
 * drawer (Más datos) and in the tooltips.
 */
export const STRIP_FOLDS: readonly StripFold[] = [
  { id: 'pop', selector: '.strip-pop, .strip-sep', priority: 12 },
  { id: 'sound', selector: '.strip-sound', priority: 11 },
  // An event first shrinks to its star and clock (the name stays in its tooltip), then goes
  { id: 'eventNames', selector: '.strip-event-name', priority: 10.5 },
  { id: 'events', selector: '.strip-item--event', priority: 10 },
  // "+N en camino" (and the Crystal income): the tooltip and the drawer keep it
  { id: 'incoming', selector: '.strip-pantry-incoming', priority: 9 },
  // DESPENSA, SUMINISTRO, Raciones…: the icons stay
  { id: 'labels', selector: '.strip-pantry-label', priority: 8 },
  { id: 'phase', selector: '.strip-phase', priority: 7 },
  { id: 'day', selector: '.strip-day', priority: 6 },
  { id: 'miners', selector: '.strip-miners', priority: 5 },
  { id: 'badge', selector: '.strip-food-badge', priority: 4 },
  // The help card also opens from the drawer
  { id: 'help', selector: '.strip-help', priority: 3 },
  { id: 'otherFood', selector: '.strip-food--fungus, .strip-food--meat', priority: 2 },
  // LLENA: the stock turns amber when the pantry is full anyway
  { id: 'fullTag', selector: '.strip-pantry-full-short', priority: 1.5 },
  // "OLEADA 3 EN 0:45" → "0:45" beside the beetle; "¡OLEADA 3! 9 INVASORES" → "9"
  { id: 'waveWords', selector: '.strip-wave-word', priority: 1 },
  // The colony's head count: the castes went first, the total holds out to the end
  { id: 'antTotal', selector: '.strip-ant-total', priority: 0.75 },
  { id: 'leaf', selector: '.strip-food--leaf', priority: 0.5 },
];

export interface FoldPlanInput {
  /** Width (px) the row needs with nothing folded */
  natural: number;
  /** Width (px) the row has */
  available: number;
  /** Width (px) the Más datos button takes once anything folds (0 when it always shows) */
  reserve: number;
  /** Each unit with the width (px) folding it wins; 0 when it is not on the strip */
  items: ReadonlyArray<{ id: StripFoldId; priority: number; cost: number }>;
}

/**
 * The units to fold, least important first: none when the row fits, else as
 * many as it takes to fit beside the Más datos button. It reads only widths
 * measured with everything unfolded, so the plan never flips back and forth.
 */
export function planStripFolds({ natural, available, reserve, items }: FoldPlanInput): StripFoldId[] {
  if (natural <= available) return [];
  const budget = available - reserve;
  const order = items
    .map((item, index) => ({ ...item, index }))
    .filter((item) => item.cost > 0)
    .sort((a, b) => b.priority - a.priority || b.index - a.index);
  const folded: StripFoldId[] = [];
  let width = natural;
  for (const item of order) {
    if (width <= budget) break;
    folded.push(item.id);
    width -= item.cost;
  }
  return folded;
}

/** Header classes for the folded units (index.css hides each one while the drawer is closed) */
export function foldClassNames(folded: readonly StripFoldId[]): string {
  if (folded.length === 0) return '';
  return ['top-strip--folded', ...folded.map((id) => `top-strip--fold-${id}`)].join(' ');
}
