// Where two JSON values differ, as short paths: readable test failures for
// states too large to print.

export function stateDiff(a: unknown, b: unknown, limit = 12): string[] {
  const out: string[] = [];
  walk(a, b, '$', out, limit);
  return out;
}

function show(v: unknown): string {
  const text = JSON.stringify(v) ?? 'undefined';
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function walk(a: unknown, b: unknown, path: string, out: string[], limit: number): void {
  if (out.length >= limit) return;
  if (a === b) return;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: ${show(a)} != ${show(b)}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}.length: ${a.length} != ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) walk(a[i], b[i], `${path}[${i}]`, out, limit);
    return;
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const ka = Object.keys(ra);
  const kb = Object.keys(rb);
  if (ka.join() !== kb.join()) out.push(`${path} keys: ${show(ka)} != ${show(kb)}`);
  for (const key of ka) if (key in rb) walk(ra[key], rb[key], `${path}.${key}`, out, limit);
}
