/** Presentation helpers for demands and pledges (no game rules). */
import type { Simulation } from '@core/simulation';
import type { Requester } from '@core/types';
import { t } from '@i18n/index';

export function requesterLabel(sim: Simulation, r: Requester): string {
  if (r.type === 'interestGroup') return t(`group.${r.id}`);
  const party = sim.data.parties.find((p) => p.id === r.id);
  return t('demand.party', { name: party ? t(party.label) : r.id });
}

export function regionName(code: string): string {
  return t(`region.${code}`);
}

export function dateParts(sim: Simulation, absDay: number): { d: number; m: number; y: number } {
  const [y, m, d] = sim.dateOf(absDay).split('-').map(Number);
  return { d, m, y };
}
