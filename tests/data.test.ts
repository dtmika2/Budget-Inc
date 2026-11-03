import { describe, expect, it } from 'vitest';
import { loadGameData } from '../src/data/loader';
import { readDataFiles, readLocale } from '../scripts/lib/nodeData';
import { REGION_PATHS } from '../src/ui/map/regionsPath';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const base = () => ({ files: clone(readDataFiles()), locale: clone(readLocale()) });

type AnyObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function codes(files: Record<string, unknown>, locale: Record<string, string>) {
  const r = loadGameData(files, locale);
  return r.ok ? [] : r.errors.map((e) => e.code);
}

describe('data loader', () => {
  it('validates all shipped data', () => {
    const { files, locale } = base();
    const r = loadGameData(files, locale);
    if (!r.ok) console.error(r.errors);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.budget.source).toBe('MOCK DATA');
    expect(r.data.regions.regions).toHaveLength(14);
    expect(r.data.leaders.map((l) => l.id).sort()).toEqual(['abis', 'mupka']);
    // dummy content per spec §11
    expect(r.data.policies.filter((c) => c.id.startsWith('dummy_'))).toHaveLength(6);
    expect(r.data.events.filter((e) => e.id.startsWith('dummy_'))).toHaveLength(4);
    expect(r.data.events.filter((e) => e.id.startsWith('dummy_') && e.responses).length).toBeGreaterThanOrEqual(1);
    expect(r.data.opportunities).toHaveLength(3);
    expect(r.data.budgetVote).toHaveLength(3);
    // filler loaded by default, >= 22 per leader
    for (const l of ['mupka', 'abis'])
      expect(r.data.policies.filter((c) => c.devOnly && c.availableFor.includes(l)).length).toBeGreaterThanOrEqual(22);
    // warns (but loads) with fewer than 18 non-filler cards
    expect(r.warnings.some((w) => w.code === 'tooFewCards')).toBe(true);
  });

  it('excludes filler files when includeDevFiller is false', () => {
    const { files, locale } = base();
    const r = loadGameData(files, locale, { includeDevFiller: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.policies.every((c) => !c.devOnly)).toBe(true);
  });

  it('rejects an unknown budget chapter', () => {
    const { files, locale } = base();
    (files['data/policies/dummy.json'] as AnyObj[])[0].budgetChanges[0].chapter = '999';
    expect(codes(files, locale)).toContain('unknownChapter');
  });

  it('accepts the "*" chapter wildcard', () => {
    const { files, locale } = base();
    (files['data/policies/dummy.json'] as AnyObj[])[0].budgetChanges[0].chapter = '*';
    expect(codes(files, locale)).toEqual([]);
  });

  it('rejects a card that references a missing event', () => {
    const { files, locale } = base();
    (files['data/policies/dummy.json'] as AnyObj[])[0].chaosEvents = ['no_such_event'];
    expect(codes(files, locale)).toContain('unknownEvent');
  });

  it('rejects a broken upgrade DAG (cycle)', () => {
    const { files, locale } = base();
    (files['data/upgrades/support.json'] as AnyObj).nodes[0].requires = ['sup_permanent_campaign'];
    expect(codes(files, locale)).toContain('cycle');
  });

  it('rejects an unknown upgrade prerequisite', () => {
    const { files, locale } = base();
    (files['data/upgrades/support.json'] as AnyObj).nodes[1].requires = ['nope'];
    expect(codes(files, locale)).toContain('unknownUpgrade');
  });

  it('rejects seats that do not sum to 200', () => {
    const { files, locale } = base();
    (files['data/regions.json'] as AnyObj).regions[0].seats += 1;
    expect(codes(files, locale)).toContain('seats');
  });

  it('rejects a reveal order that misses a region', () => {
    const { files, locale } = base();
    (files['data/regions.json'] as AnyObj).revealOrder.pop();
    expect(codes(files, locale)).toContain('revealOrder');
  });

  it('rejects a missing locale key', () => {
    const { files, locale } = base();
    delete locale['policy.dummy_revenue.title'];
    expect(codes(files, locale)).toContain('missingLocale');
  });

  it('rejects an unknown leader id', () => {
    const { files, locale } = base();
    (files['data/policies/dummy.json'] as AnyObj[])[0].availableFor = ['nobody'];
    expect(codes(files, locale)).toContain('unknownLeader');
  });

  it('rejects a default response that is not an option or costs PC', () => {
    const { files, locale } = base();
    const ev = (files['data/events/dummy.json'] as AnyObj[]).find((e) => e.responses);
    ev!.responses.default = 'apologise';
    expect(codes(files, locale)).toContain('badResponse');
  });

  it('rejects malformed schema with a readable path', () => {
    const { files, locale } = base();
    (files['data/budget.json'] as AnyObj).chapters[0].revenue = 'lots';
    const r = loadGameData(files, locale);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatchObject({ code: 'schema', file: 'data/budget.json', path: 'chapters.0.revenue' });
  });

  it('refuses to start when a leader has fewer than 3 cards', () => {
    const { files, locale } = base();
    const r = loadGameData(
      {
        ...files,
        'data/policies/dummy.json': (files['data/policies/dummy.json'] as AnyObj[]).slice(0, 2),
        'data/policies/_filler.json': [],
      },
      locale,
    );
    expect(r.ok ? [] : r.errors.map((e) => e.code)).toContain('tooFewCards');
  });

  it('accepts a different valid budget file without code changes', () => {
    const { files, locale } = base();
    const b = files['data/budget.json'] as AnyObj;
    b.source = 'Some other dataset';
    b.chapters = b.chapters.map((c: AnyObj) => ({ ...c, revenue: c.revenue * 1.1 }));
    expect(codes(files, locale)).toEqual([]);
  });
});

describe('map', () => {
  it('regionsPath has all 14 NUTS3 codes', () => {
    expect(REGION_PATHS.map((r) => r.code).sort()).toEqual(
      ['CZ010', 'CZ020', 'CZ031', 'CZ032', 'CZ041', 'CZ042', 'CZ051', 'CZ052', 'CZ053', 'CZ063', 'CZ064', 'CZ071', 'CZ072', 'CZ080'],
    );
  });
});
