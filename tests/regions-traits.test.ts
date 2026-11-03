import { describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { applyBundle } from '../src/core/effects';
import { exportRun } from '../src/core/log';
import { traitFactors, traitMult } from '../src/core/regions';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { advanceQuiet, gameData, quietSim } from './helpers';

function withProfiles(mutate: (p: { regions: Record<string, { traits: string[]; coalition: { parties: string[] } }> }) => void) {
  const files = readDataFiles();
  const profiles = JSON.parse(JSON.stringify(files['data/region_profiles.json']));
  mutate(profiles);
  return loadGameData({ ...files, 'data/region_profiles.json': profiles }, readLocale());
}

describe('region profiles data', () => {
  it('every region has one settlement trait, one economy trait and at most one special trait', () => {
    const d = gameData();
    const axes = config.regions.traits;
    for (const r of d.regions.regions) {
      const tr = d.regionProfiles.regions[r.code].traits;
      expect(tr.filter((x) => axes.settlement.includes(x))).toHaveLength(1);
      expect(tr.filter((x) => axes.economy.includes(x))).toHaveLength(1);
      expect(tr.filter((x) => axes.special.includes(x)).length).toBeLessThanOrEqual(1);
    }
  });

  it('unknown traits, two settlement traits and unknown parties are load errors', () => {
    const a = withProfiles((p) => (p.regions.CZ010.traits = ['urban', 'nope']));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.errors.some((e) => e.code === 'unknownTrait' && e.detail === 'nope')).toBe(true);
    const b = withProfiles((p) => (p.regions.CZ010.traits = ['urban', 'rural', 'services']));
    expect(b.ok).toBe(false);
    const c = withProfiles((p) => (p.regions.CZ010.coalition.parties = ['nope']));
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.errors.some((e) => e.code === 'unknownParty')).toBe(true);
    const d = withProfiles((p) => delete (p.regions as Record<string, unknown>).CZ080);
    expect(d.ok).toBe(false);
  });

  it('demographics without real values load (status TODO, value null)', () => {
    const p = gameData().regionProfiles.regions.CZ041;
    expect(p.demographics.population.status).toBe('TODO');
    expect(p.demographics.population.value).toBeNull();
    expect(p.demographics.population.source.length).toBeGreaterThan(0);
  });

  it('an unknown card tag is a load error', () => {
    const files = readDataFiles();
    const cards = JSON.parse(JSON.stringify(files['data/policies/dummy.json'])) as { tags?: string[] }[];
    cards[0].tags = ['nope'];
    const r = loadGameData({ ...files, 'data/policies/dummy.json': cards }, readLocale());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.code === 'unknownTag')).toBe(true);
  });
});

describe('trait multipliers', () => {
  it('multiply over the region traits and the card tags', () => {
    const d = gameData();
    const traits = d.regionProfiles.regions.CZ042.traits; // mixed, industry, coal
    let want = 1;
    for (const tr of traits) want *= config.regions.traitResponse[tr]?.industry ?? 1;
    expect(traitMult(d, config, 'CZ042', ['industry'])).toBeCloseTo(want);
    expect(want).not.toBe(1);
    expect(traitMult(d, config, 'CZ042', [])).toBe(1);
    expect(traitFactors(d, config, 'CZ042', ['industry']).map((f) => f.trait).sort()).toEqual(['coal', 'industry']);
  });

  it('a tagged support change keeps national support and shifts regions by v x (mult - 1)', () => {
    const sim = quietSim({ seed: 'traits' });
    const before = { ...sim.state.regionShift };
    const sup0 = sim.state.resources.support;
    const { deltas } = applyBundle(sim, { effects: { support: { min: 4, max: 4 } }, tags: ['agriculture'] }, 'policy', 'test', sim.rng.effects);
    const v = sim.state.resources.support - sup0;
    expect(v).toBeCloseTo(4);
    for (const r of sim.data.regions.regions) {
      const m = traitMult(sim.data, config, r.code, ['agriculture']);
      expect(sim.state.regionShift[r.code] - before[r.code]).toBeCloseTo(v * (m - 1));
      if (m !== 1) expect(deltas.regions?.[r.code]).toBeCloseTo(v * (m - 1));
    }
  });

  it('the preview shows the same regional changes as applied', () => {
    const sim = quietSim({ seed: 'traits-prev' });
    const bundle = { effects: { support: { min: 3, max: 3 } }, regions: { CZ063: { min: 2, max: 2 } }, tags: ['agriculture'] };
    const p = sim.preview(bundle, 'policy');
    const before = { ...sim.state.regionShift };
    applyBundle(sim, bundle, 'policy', 'test', sim.rng.effects);
    for (const [code, r] of Object.entries(p.regions)) expect(sim.state.regionShift[code] - before[code]).toBeCloseTo(r!.min);
    expect(p.regions.CZ063!.min).toBeCloseTo(2 * traitMult(sim.data, config, 'CZ063', ['agriculture']) + 3 * (traitMult(sim.data, config, 'CZ063', ['agriculture']) - 1));
  });
});

describe('regional history', () => {
  it('records regional and national support every projection week', () => {
    const sim = quietSim({ seed: 'hist' });
    expect(sim.state.regionHistory).toHaveLength(1);
    advanceQuiet(sim, 70);
    const weeks = sim.state.regionHistory.length - 1;
    expect(weeks).toBe(Math.floor(sim.absDay / config.election.projectionEveryDays));
    const last = sim.state.regionHistory.at(-1)!;
    expect(Object.keys(last.s).sort()).toEqual(sim.data.regions.regions.map((r) => r.code).sort());
    expect(last.national).toBeGreaterThanOrEqual(0);
  });

  it('is part of the JSON export', () => {
    const sim = quietSim({ seed: 'hist-export' });
    advanceQuiet(sim, 14);
    expect(exportRun(sim.state).regionHistory?.length).toBe(sim.state.regionHistory.length);
  });
});
