/** Election projection and election night (spec §4.6): one model for outcome AND regional seats. */
import type { Config } from '../config';
import type { Rng } from './rng';
import type { ElectionResult, GroupId, LeaderId, Projection, RegionsData } from './types';
import { GROUP_IDS } from './types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** s_r = clamp(support + offset_r[leader] + shift_r, 0, 100). Shifts come from regional politics. */
export function regionalSupport(
  regions: RegionsData,
  leader: LeaderId,
  support: number,
  shifts: Record<string, number> = {},
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of regions.regions) out[r.code] = clamp(support + (r.offsets[leader] ?? 0) + (shifts[r.code] ?? 0), 0, 100);
  return out;
}

export function threshold(cfg: Config, T_base: number, anger: Record<GroupId, number>): number {
  const e = cfg.election;
  let T = T_base;
  for (const g of GROUP_IDS) T += (e.groupWeights[g] * Math.max(0, anger[g] - e.angerThreshold)) / e.angerScale;
  return T;
}

export function projection(
  cfg: Config,
  regions: RegionsData,
  leader: LeaderId,
  support: number,
  anger: Record<GroupId, number>,
  T_base: number,
  shifts: Record<string, number> = {},
): Projection {
  const total = regions.regions.reduce((s, r) => s + r.seats, 0) || 1;
  const regionSupport = regionalSupport(regions, leader, support, shifts);
  let S = 0;
  for (const r of regions.regions) S += (r.seats / total) * regionSupport[r.code];
  const T = threshold(cfg, T_base, anger);
  const P = 1 / (1 + Math.exp(-(S - T) / cfg.election.k));
  return { S, T, P, regionSupport };
}

/** D'Hondt-style split of G seats with per-region caps. Ties go to the earlier region in data order. */
export function distributeSeats(regions: { code: string; seats: number; s: number }[], G: number): Record<string, number> {
  const won: Record<string, number> = Object.fromEntries(regions.map((r) => [r.code, 0]));
  for (let i = 0; i < G; i++) {
    let best: string | null = null;
    let bestQ = -Infinity;
    for (const r of regions) {
      if (won[r.code] >= r.seats) continue;
      const q = (r.seats * r.s) / (won[r.code] + 1);
      if (q > bestQ) {
        bestQ = q;
        best = r.code;
      }
    }
    if (best === null) break;
    won[best] += 1;
  }
  return won;
}

export function electionNight(
  cfg: Config,
  regions: RegionsData,
  proj: Projection,
  rng: Rng,
  snap: boolean,
): ElectionResult {
  const e = cfg.election;
  // 1. national swing; logistic noise makes P(win) exactly P
  const u = rng.nextOpen();
  const epsilon = e.k * Math.log(u / (1 - u));
  const S_final = proj.S + epsilon;
  const win = S_final > proj.T;
  // 2. regional results
  const finals = regions.regions.map((r) => {
    const eta = rng.uniform(-e.regionalNoise, e.regionalNoise);
    return { code: r.code, seats: r.seats, s: clamp(proj.regionSupport[r.code] + epsilon + eta, 0, 100) };
  });
  // 3. governing-bloc seats
  const G_raw = e.majority - 0.5 + (S_final - proj.T) * e.seatsPerPoint;
  let G = win ? Math.max(e.majority, Math.round(G_raw)) : Math.min(e.majority - 1, Math.round(G_raw));
  G = clamp(G, 0, e.totalSeats);
  // 4. distribute
  const won = distributeSeats(finals, G);
  return {
    S: proj.S,
    T: proj.T,
    P: proj.P,
    u,
    epsilon,
    S_final,
    G,
    win,
    snap,
    regions: finals.map((f) => ({ code: f.code, s_final: f.s, seats: f.seats, won: won[f.code] })),
  };
}
