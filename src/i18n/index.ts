/** Minimal i18n: every player-facing string goes through t(key). Czech lives in locales/cs.json. */
import cs from '../../locales/cs.json';

let dict: Record<string, string> = cs as Record<string, string>;
const reported = new Set<string>();

export type Params = Record<string, string | number>;

export function setLocale(d: Record<string, string>): void {
  dict = d;
}

export function hasKey(key: string): boolean {
  return key in dict;
}

/** Translate `key`, substituting `{name}` placeholders. A missing key renders as a visible marker. */
export function t(key: string, params?: Params): string {
  const s = dict[key];
  if (s === undefined) {
    if (!reported.has(key)) {
      reported.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    return `⟦${key}⟧`;
  }
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

const nf = new Map<number, Intl.NumberFormat>();
/** Locale-formatted number (decimal comma). */
export function fmt(n: number, digits = 0): string {
  let f = nf.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    nf.set(digits, f);
  }
  return f.format(Object.is(Math.round(n * 10 ** digits), -0) ? 0 : n);
}

/** Signed number, e.g. "+3" / "−2". */
export function fmtSigned(n: number, digits = 0): string {
  const r = Math.round(n * 10 ** digits) / 10 ** digits;
  if (r === 0) return fmt(0, digits);
  return (r > 0 ? '+' : '−') + fmt(Math.abs(r), digits);
}

/** Signed range, e.g. "+2...+4" (collapses to one value when min == max). */
export function fmtRange(min: number, max: number, digits = 0): string {
  const a = fmtSigned(min, digits);
  const b = fmtSigned(max, digits);
  return a === b ? a : `${a}…${b}`;
}
