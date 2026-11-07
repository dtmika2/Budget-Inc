/**
 * The Czech flag on the map only shows for a moment after a decision. A decision is a choice the player
 * actively made; things that happen on their own, and letting a timer run out, are not.
 */
import type { LogEntry } from '@core/types';

const DECISIONS = new Set([
  'policy_picked',
  'compromise_made',
  'budget_vote',
  'event_response',
  'demand_accepted',
  'demand_rejected',
  'region_event_intervened',
  'region_event_ignored',
  'region_action',
  'ability_used',
  'upgrade_action',
  'upgrade_bought',
]);

export const isDecisionEntry = (e: LogEntry) => DECISIONS.has(e.type) && !e.timedOut;
