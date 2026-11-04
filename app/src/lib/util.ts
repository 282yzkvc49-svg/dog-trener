export function uid(prefix = ''): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix + rnd;
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function pct(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 100) : null;
}

export function sum<T>(arr: readonly T[], f: (x: T) => number): number {
  let s = 0;
  for (const x of arr) s += f(x);
  return s;
}

export function groupBy<T, K extends string | number>(arr: readonly T[], key: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of arr) {
    const k = key(x);
    const list = m.get(k);
    if (list) list.push(x); else m.set(k, [x]);
  }
  return m;
}

export function deepClone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/** Разбор числа с русской запятой. */
export function parseNum(s: string): number | undefined {
  const v = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}
