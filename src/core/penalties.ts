/** Resources at zero (spec §4.4) and stand-in penalties for not-yet-built endings (spec §4.5). */
import { applyDaily } from './effects';
import { resourceChange } from './modifiers';
import type { Simulation } from './simulation';
import type { ZeroPenaltyId } from './types';

export const ZERO_PENALTY_IDS: ZeroPenaltyId[] = ['finances', 'support', 'prestige'];
const EPS = 1e-9;

/** Daily effects of every active zero penalty (state from the previous day). */
export function applyZeroPenalties(sim: Simulation): void {
  const { state, cfg } = sim;
  for (const id of ZERO_PENALTY_IDS) {
    if (!state.zeroPenalties[id]) continue;
    for (const eff of cfg.zeroPenalty.effects[id]) {
      if (eff.target === 'financeMod') {
        // Isolation: accumulates, stays after the penalty ends, capped (lasting reputational damage)
        const v = resourceChange(sim.pipeline(), 'finances', eff.perDay, 'penalty');
        state.financeModAccum = Math.max(cfg.zeroPenalty.isolationFinanceCap, state.financeModAccum + v);
      } else {
        applyDaily(sim, eff.target, eff.perDay, 'penalty');
      }
    }
  }
}

/** Start a penalty when the resource reaches 0; end it when it climbs back to `exitAt`. */
export function updateZeroPenalties(sim: Simulation): void {
  const { state, cfg } = sim;
  for (const id of ZERO_PENALTY_IDS) {
    const v = state.resources[id];
    if (!state.zeroPenalties[id] && v <= EPS) {
      state.zeroPenalties[id] = true;
      sim.log('zero_penalty_started', { resource: id });
    } else if (state.zeroPenalties[id] && v >= cfg.zeroPenalty.exitAt) {
      state.zeroPenalties[id] = false;
      sim.log('zero_penalty_ended', { resource: id });
    }
  }
}

/** Unbuilt endings: while the meter sits at the threshold, apply the stand-in penalty. */
export function applyStandInPenalties(sim: Simulation): void {
  for (const e of sim.data.endings) {
    if (e.built) continue;
    if (sim.state.anger[e.group] >= e.threshold - EPS) applyDaily(sim, e.standInPenalty.target, e.standInPenalty.perDay, 'penalty');
  }
}
