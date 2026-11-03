/** Decision log (spec §10). Every entry carries quarter, day, date and a post-event snapshot. */
import type { Deltas, GameState, LogEntry, RecordedInput } from './types';
import { GROUP_IDS, RESOURCE_IDS } from './types';

const r2 = (n: number) => Math.round(n * 100) / 100;

export function makeEntry(
  state: GameState,
  type: string,
  absDay: number,
  date: string,
  wallTime: number,
  extra: Record<string, unknown>,
  deltas?: Deltas,
): LogEntry {
  const resources = {} as LogEntry['snapshot']['resources'];
  for (const r of RESOURCE_IDS) resources[r] = r2(state.resources[r]);
  const anger = {} as LogEntry['snapshot']['anger'];
  for (const g of GROUP_IDS) anger[g] = r2(state.anger[g]);
  const entry: LogEntry = {
    type,
    quarter: state.quarter,
    day: state.day,
    absDay,
    date,
    wallTime,
    snapshot: { resources, anger, pc: state.pc },
    ...extra,
  };
  if (deltas) {
    const clean: Deltas = { resources: {}, anger: {} };
    for (const [k, v] of Object.entries(deltas.resources)) if (v) clean.resources[k as keyof Deltas['resources']] = r2(v);
    for (const [k, v] of Object.entries(deltas.anger)) if (v) clean.anger[k as keyof Deltas['anger']] = r2(v);
    if (deltas.pc) clean.pc = deltas.pc;
    if (deltas.regions) {
      const regions: Record<string, number> = {};
      for (const [k, v] of Object.entries(deltas.regions)) if (v) regions[k] = r2(v);
      if (Object.keys(regions).length) clean.regions = regions;
    }
    entry.deltas = clean;
  }
  return entry;
}

export interface RunExport {
  format: 'budget-inc-log';
  version: 1;
  runId: string;
  seed: string;
  leader: string;
  difficulty: string;
  inputs: RecordedInput[];
  log: LogEntry[];
}

export function exportRun(state: GameState): RunExport {
  return {
    format: 'budget-inc-log',
    version: 1,
    runId: state.runId,
    seed: state.seed,
    leader: state.leader,
    difficulty: state.difficulty,
    inputs: state.inputs,
    log: state.log,
  };
}
