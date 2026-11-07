/** Presentation helpers shared by components (no game rules). */
import type { Simulation } from '@core/simulation';
import type { LeaderDef, Range } from '@core/types';
import { fmt, fmtSigned, t } from '@i18n/index';

export function dateLabel(sim: Simulation): string {
  const s = sim.state;
  const iso = sim.dateOf(sim.absDay);
  const [, m, d] = iso.split('-').map(Number);
  return t('hud.date', { q: s.quarter, y: Math.ceil(s.quarter / 4), d, m });
}

export function initials(leader: LeaderDef): string {
  return t(leader.name)
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2);
}

/** "+2…+4" with 0 decimals, or 1 decimal for small values. */
export function rangeText(r: Range): string {
  const digits = Math.max(Math.abs(r.min), Math.abs(r.max)) < 3 && (r.min % 1 !== 0 || r.max % 1 !== 0) ? 1 : 0;
  const a = fmtSigned(r.min, digits);
  const b = fmtSigned(r.max, digits);
  return a === b ? a : `${a}…${b}`;
}

export const pct = (p: number) => `${fmt(p * 100)} %`;

/** Tone of a change: resources up = good; anger up = bad. */
export function tone(value: number, isAnger: boolean): 'good' | 'bad' | 'neutral' {
  if (Math.abs(value) < 1e-9) return 'neutral';
  return value > 0 !== isAnger ? 'good' : 'bad';
}

/** The band a 0-100 resource value sits in (the `resource.zone.*` labels). */
export const resourceZone = (v: number) => (v < 20 ? 'critical' : v < 40 ? 'weak' : v < 70 ? 'ok' : 'strong');

export function mid(r: Range): number {
  return (r.min + r.max) / 2;
}

export function download(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
