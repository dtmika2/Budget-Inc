/**
 * Environment-agnostic data loader: takes raw parsed JSON keyed by repo path (e.g. `data/budget.json`)
 * plus the locale, validates every file (zod) and the cross-file rules, and returns GameData or a list
 * of readable errors. Browser (import.meta.glob) and Node (fs) adapters only collect the files.
 */
import type { z } from 'zod';
import { config } from '../config';
import { shortHash } from '../core/rng';
import type {
  CompromiseCard,
  BudgetItem,
  BudgetVoteOption,
  ChaosEventDef,
  DemandTemplate,
  RegionEventTemplate,
  EffectBundle,
  EndingDef,
  GameData,
  LeaderDef,
  MinigameTexts,
  ModifierDef,
  OpportunityDef,
  PartyDef,
  PolicyCard,
  RegionProfiles,
  UpgradeTree,
} from '../core/types';
import { GROUP_IDS, RESOURCE_IDS } from '../core/types';
import {
  demandSchema,
  regionEventSchema,
  budgetItemSchema,
  budgetSchema,
  budgetVoteOptionSchema,
  compromiseSchema,
  endingSchema,
  eventSchema,
  leaderSchema,
  minigameTextsSchema,
  opportunitySchema,
  partySchema,
  policySchema,
  regionProfilesSchema,
  regionsSchema,
  upgradeTreeSchema,
} from './schemas';

export const EXPECTED_REGION_CODES = [
  'CZ010', 'CZ020', 'CZ031', 'CZ032', 'CZ041', 'CZ042', 'CZ051',
  'CZ052', 'CZ053', 'CZ063', 'CZ064', 'CZ071', 'CZ072', 'CZ080',
];

export type DataErrorCode =
  | 'schema'
  | 'missingFile'
  | 'duplicateId'
  | 'unknownChapter'
  | 'unknownEvent'
  | 'unknownLeader'
  | 'unknownUpgrade'
  | 'missingStart'
  | 'cycle'
  | 'missingLocale'
  | 'seats'
  | 'revealOrder'
  | 'unknownRegion'
  | 'tooFewCards'
  | 'badResponse'
  | 'badTarget'
  | 'unknownItem'
  | 'unknownTrait'
  | 'unknownTag'
  | 'unknownParty'
  | 'badDemand';

export interface DataIssue {
  code: DataErrorCode;
  file: string;
  path: string;
  detail: string;
}

export type LoadResult =
  | { ok: true; data: GameData; warnings: DataIssue[] }
  | { ok: false; errors: DataIssue[]; warnings: DataIssue[] };

export interface LoadOptions {
  includeDevFiller?: boolean;
}

const isFiller = (path: string) => /(^|\/)_[^/]*\.json$/.test(path);

/** Valid ongoing / stand-in penalty targets: a resource or `anger.<group>`. */
export function isValidOngoingTarget(t: string): boolean {
  if ((RESOURCE_IDS as readonly string[]).includes(t)) return true;
  const m = /^anger\.(\w+)$/.exec(t);
  return !!m && (GROUP_IDS as readonly string[]).includes(m[1]);
}

/** Modifier target grammar from spec §4.8. */
export function isValidModifierTarget(t: string): boolean {
  if (['finances.negative', 'election.T_base', 'pc.perQuarter'].includes(t)) return true;
  const r = /^(\w+)\.(gain|loss|drift)$/.exec(t);
  if (r && (RESOURCE_IDS as readonly string[]).includes(r[1])) return true;
  const a = /^anger\.(\w+)\.(gain|loss)$/.exec(t);
  return !!a && (GROUP_IDS as readonly string[]).includes(a[1]);
}

export function loadGameData(
  files: Record<string, unknown>,
  locale: Record<string, string>,
  opts: LoadOptions = {},
): LoadResult {
  const includeFiller = opts.includeDevFiller ?? config.includeDevFiller;
  const errors: DataIssue[] = [];
  const warnings: DataIssue[] = [];
  const err = (code: DataErrorCode, file: string, path: string, detail: string) =>
    errors.push({ code, file, path, detail });

  const paths = Object.keys(files)
    .map((p) => p.replace(/\\/g, '/').replace(/^\.?\//, ''))
    .sort();
  const raw: Record<string, unknown> = {};
  for (const k of Object.keys(files)) raw[k.replace(/\\/g, '/').replace(/^\.?\//, '')] = files[k];
  const active = paths.filter((p) => includeFiller || !isFiller(p));

  function parse<S extends z.ZodTypeAny>(schema: S, file: string, value: unknown, basePath = ''): z.infer<S> | null {
    const r = schema.safeParse(value);
    if (r.success) return r.data;
    for (const issue of r.error.issues) {
      const p = [basePath, ...issue.path.map(String)].filter(Boolean).join('.');
      err('schema', file, p, issue.message);
    }
    return null;
  }

  function single<S extends z.ZodTypeAny>(schema: S, file: string): z.infer<S> | null {
    if (!(file in raw)) {
      err('missingFile', file, '', 'file not found');
      return null;
    }
    return parse(schema, file, raw[file]);
  }

  /** Collect items from every file in a directory; each file is one object or an array of objects. */
  function many<S extends z.ZodTypeAny>(schema: S, dir: string): { item: z.infer<S>; file: string; idx: number }[] {
    const out: { item: z.infer<S>; file: string; idx: number }[] = [];
    for (const file of active.filter((p) => p.startsWith(`${dir}/`) && p.endsWith('.json'))) {
      const v = raw[file];
      const arr = Array.isArray(v) ? v : [v];
      arr.forEach((entry, idx) => {
        const parsed = parse(schema, file, entry, Array.isArray(v) ? `[${idx}]` : '');
        if (parsed) out.push({ item: parsed, file, idx });
      });
    }
    return out;
  }

  const budget = single(budgetSchema, 'data/budget.json');
  const regions = single(regionsSchema, 'data/regions.json');
  const leadersRaw = single(leaderSchema.array().min(1), 'data/leaders.json');
  const endingsRaw = single(endingSchema.array(), 'data/endings.json');
  const voteRaw = single(budgetVoteOptionSchema.array().min(1), 'data/annual/budget_vote.json');
  const itemsRaw = single(budgetItemSchema.array().min(1), 'data/budget_items.json');
  const minigamesRaw = single(minigameTextsSchema, 'data/minigames/texts.json');
  const profilesRaw = single(regionProfilesSchema, 'data/region_profiles.json');
  const partiesRaw = single(partySchema.array().min(1), 'data/parties.json');
  const policies = many(policySchema, 'data/policies');
  const compromises = many(compromiseSchema, 'data/compromises');
  const events = many(eventSchema, 'data/events');
  const opportunities = many(opportunitySchema, 'data/opportunities');
  const trees = many(upgradeTreeSchema, 'data/upgrades');
  const demandsAll = many(demandSchema, 'data/demands');
  const regionEventsAll = many(regionEventSchema, 'data/region_events');
  const regionEvents = regionEventsAll.filter((e) => e.item.status !== 'DRAFT' || includeFiller);
  // DRAFT demands (drafted from programmes, not yet approved) only load with includeDevFiller
  const demands = demandsAll.filter((d) => d.item.status !== 'DRAFT' || includeFiller);

  // ---- normalise: `finances` in effects is an alias of `financesExtra`
  const normalise = <T extends EffectBundle>(b: T): T => {
    if (b.effects && 'finances' in b.effects) {
      const e = { ...(b.effects as Record<string, { min: number; max: number }>) };
      e.financesExtra = e.finances;
      delete e.finances;
      return { ...b, effects: e };
    }
    return b;
  };

  // ---- cross-file checks
  const locKey = (key: string | undefined, file: string, path: string) => {
    if (key !== undefined && !(key in locale)) err('missingLocale', file, path, key);
  };

  const dupCheck = (items: { id: string; file: string; path: string }[]) => {
    const seen = new Map<string, string>();
    for (const it of items) {
      if (seen.has(it.id)) err('duplicateId', it.file, it.path, `"${it.id}" also defined in ${seen.get(it.id)}`);
      else seen.set(it.id, it.file);
    }
  };

  const chapterCodes = new Set(budget?.chapters.map((c) => c.code) ?? []);
  const regionCodes = new Set(regions?.regions.map((r) => r.code) ?? []);
  const leaderIds = new Set(leadersRaw?.map((l) => l.id) ?? []);

  const knownTags = new Set(config.regions.tags);
  const checkBundle = (b: EffectBundle, file: string, path: string) => {
    b.tags?.forEach((tag, i) => {
      if (!knownTags.has(tag)) err('unknownTag', file, `${path}.tags[${i}]`, tag);
    });
    for (const code of Object.keys(b.regions ?? {})) {
      if (code === 'self' && path.includes('.on')) continue; // demand bundles: the demand's own region
      if (regions && !regionCodes.has(code)) err('unknownRegion', file, `${path}.regions.${code}`, code);
    }
    b.budgetChanges?.forEach((bc, i) => {
      if (budget && bc.chapter !== '*' && !chapterCodes.has(bc.chapter))
        err('unknownChapter', file, `${path}.budgetChanges[${i}].chapter`, bc.chapter);
    });
    b.ongoing?.forEach((o, i) => {
      if (!isValidOngoingTarget(o.target)) err('badTarget', file, `${path}.ongoing[${i}].target`, o.target);
      locKey(o.label, file, `${path}.ongoing[${i}].label`);
    });
  };
  const checkModifiers = (mods: ModifierDef[], file: string, path: string) =>
    mods.forEach((m, i) => {
      if (!isValidModifierTarget(m.target)) err('badTarget', file, `${path}.modifiers[${i}].target`, m.target);
    });

  if (budget) {
    dupCheck(budget.chapters.map((c, i) => ({ id: c.code, file: 'data/budget.json', path: `chapters[${i}]` })));
  }

  if (regions) {
    const f = 'data/regions.json';
    const codes = regions.regions.map((r) => r.code);
    dupCheck(regions.regions.map((r, i) => ({ id: r.code, file: f, path: `regions[${i}]` })));
    for (const c of EXPECTED_REGION_CODES) if (!codes.includes(c)) err('unknownRegion', f, 'regions', `missing ${c}`);
    for (const c of codes) if (!EXPECTED_REGION_CODES.includes(c)) err('unknownRegion', f, 'regions', `unexpected ${c}`);
    const total = regions.regions.reduce((s, r) => s + r.seats, 0);
    if (total !== config.election.totalSeats) err('seats', f, 'regions[].seats', `sum is ${total}, expected ${config.election.totalSeats}`);
    const order = regions.revealOrder;
    const orderOk = order.length === codes.length && new Set(order).size === order.length && codes.every((c) => order.includes(c));
    if (!orderOk) err('revealOrder', f, 'revealOrder', `must list each of the ${codes.length} region codes exactly once`);
    regions.regions.forEach((r, i) => {
      locKey(r.name, f, `regions[${i}].name`);
      for (const lid of Object.keys(r.offsets))
        if (leadersRaw && !leaderIds.has(lid)) err('unknownLeader', f, `regions[${i}].offsets.${lid}`, lid);
    });
  }

  if (leadersRaw) {
    const f = 'data/leaders.json';
    dupCheck(leadersRaw.map((l, i) => ({ id: l.id, file: f, path: `[${i}]` })));
    leadersRaw.forEach((l, i) => {
      for (const k of ['name', 'party', 'profile'] as const) locKey(l[k], f, `[${i}].${k}`);
      locKey(l.ability.name, f, `[${i}].ability.name`);
      locKey(l.ability.description, f, `[${i}].ability.description`);
      checkModifiers(l.ability.modifiers, f, `[${i}].ability`);
      checkBundle(l.ability.bundle, f, `[${i}].ability.bundle`);
    });
  }

  if (endingsRaw) {
    const f = 'data/endings.json';
    dupCheck(endingsRaw.map((e, i) => ({ id: e.id, file: f, path: `[${i}]` })));
    endingsRaw.forEach((e, i) => {
      locKey(e.title, f, `[${i}].title`);
      locKey(e.text, f, `[${i}].text`);
      if (!isValidOngoingTarget(e.standInPenalty.target)) err('badTarget', f, `[${i}].standInPenalty.target`, e.standInPenalty.target);
    });
  }

  const partyIds = new Set(partiesRaw?.map((p) => p.id) ?? []);
  if (partiesRaw) {
    const f = 'data/parties.json';
    dupCheck(partiesRaw.map((p, i) => ({ id: p.id, file: f, path: `[${i}]` })));
    partiesRaw.forEach((p, i) => locKey(p.label, f, `[${i}].label`));
  }

  if (profilesRaw) {
    const f = 'data/region_profiles.json';
    const axes = config.regions.traits;
    for (const c of EXPECTED_REGION_CODES) if (!(c in profilesRaw.regions)) err('unknownRegion', f, 'regions', `missing ${c}`);
    for (const [code, p] of Object.entries(profilesRaw.regions)) {
      if (!EXPECTED_REGION_CODES.includes(code)) err('unknownRegion', f, `regions.${code}`, `unexpected ${code}`);
      p.traits.forEach((tr, i) => {
        if (![...axes.settlement, ...axes.economy, ...axes.special].includes(tr)) err('unknownTrait', f, `regions.${code}.traits[${i}]`, tr);
      });
      const count = (list: string[]) => p.traits.filter((tr) => list.includes(tr)).length;
      if (count(axes.settlement) !== 1 || count(axes.economy) !== 1 || count(axes.special) > 1)
        err('unknownTrait', f, `regions.${code}.traits`, 'needs exactly one settlement trait, one economy trait and at most one special trait');
      p.coalition.parties.forEach((pid, i) => {
        if (partiesRaw && !partyIds.has(pid)) err('unknownParty', f, `regions.${code}.coalition.parties[${i}]`, pid);
      });
    }
  }

  if (minigamesRaw) {
    const f = 'data/minigames/texts.json';
    for (const k of ['pressSpin', 'pressGaffe', 'debateQuestions'] as const)
      minigamesRaw[k].forEach((key, i) => locKey(key, f, `${k}[${i}]`));
  }

  const itemIds = new Set(itemsRaw?.map((it) => it.id) ?? []);
  if (itemsRaw) {
    const f = 'data/budget_items.json';
    dupCheck(itemsRaw.map((it, i) => ({ id: it.id, file: f, path: `[${i}]` })));
    itemsRaw.forEach((it, i) => {
      locKey(it.label, f, `[${i}].label`);
      it.chapters.forEach((c, j) => {
        if (budget && !chapterCodes.has(c.chapter)) err('unknownChapter', f, `[${i}].chapters[${j}].chapter`, c.chapter);
      });
    });
  }

  if (voteRaw) {
    const f = 'data/annual/budget_vote.json';
    dupCheck(voteRaw.map((o, i) => ({ id: o.id, file: f, path: `[${i}]` })));
    voteRaw.forEach((o, i) => {
      locKey(o.label, f, `[${i}].label`);
      locKey(o.description, f, `[${i}].description`);
      checkBundle(o, f, `[${i}]`);
      for (const [item, steps] of Object.entries(o.sliders)) {
        if (itemsRaw && !itemIds.has(item)) err('unknownItem', f, `[${i}].sliders.${item}`, item);
        const { minSteps, maxSteps } = config.budgetVote.sliders;
        if (steps < minSteps || steps > maxSteps) err('schema', f, `[${i}].sliders.${item}`, `steps must be within ${minSteps}..${maxSteps}`);
      }
    });
  }

  const eventIds = new Set(events.map((e) => e.item.id));
  dupCheck(events.map((e) => ({ id: e.item.id, file: e.file, path: `[${e.idx}]` })));
  for (const { item: ev, file, idx } of events) {
    const p = `[${idx}]`;
    locKey(ev.text, file, `${p}.text`);
    checkBundle(ev, file, p);
    if (ev.responses) {
      const ids = ev.responses.options.map((o) => o.id);
      if (new Set(ids).size !== ids.length) err('badResponse', file, `${p}.responses.options`, 'duplicate option id');
      const def = ev.responses.options.find((o) => o.id === ev.responses!.default);
      if (!def) err('badResponse', file, `${p}.responses.default`, `"${ev.responses.default}" is not an option`);
      else if (def.cost.pc > 0) err('badResponse', file, `${p}.responses.default`, 'the default response must cost 0 PC');
      ev.responses.options.forEach((o, j) => {
        locKey(o.label, file, `${p}.responses.options[${j}].label`);
        checkBundle(o, file, `${p}.responses.options[${j}]`);
      });
    }
  }

  // policies and compromises share the draft hand, so ids must be unique across both
  dupCheck([
    ...policies.map((c) => ({ id: c.item.id, file: c.file, path: `[${c.idx}]` })),
    ...compromises.map((c) => ({ id: c.item.id, file: c.file, path: `[${c.idx}]` })),
  ]);
  for (const { item: card, file, idx } of compromises) {
    const p = `[${idx}]`;
    for (const k of ['title', 'description', 'drivenBy'] as const) locKey(card[k], file, `${p}.${k}`);
    checkBundle(card, file, p);
    card.chaosEvents.forEach((id: string, i: number) => {
      if (!eventIds.has(id)) err('unknownEvent', file, `${p}.chaosEvents[${i}]`, id);
    });
    card.availableFor.forEach((lid: string, i: number) => {
      if (leadersRaw && !leaderIds.has(lid)) err('unknownLeader', file, `${p}.availableFor[${i}]`, lid);
    });
  }
  for (const { item: card, file, idx } of policies) {
    const p = `[${idx}]`;
    for (const k of ['title', 'description', 'drivenBy'] as const) locKey(card[k], file, `${p}.${k}`);
    checkBundle(card, file, p);
    card.chaosEvents.forEach((id: string, i: number) => {
      if (!eventIds.has(id)) err('unknownEvent', file, `${p}.chaosEvents[${i}]`, id);
    });
    card.availableFor.forEach((lid: string, i: number) => {
      if (leadersRaw && !leaderIds.has(lid)) err('unknownLeader', file, `${p}.availableFor[${i}]`, lid);
    });
  }

  // demands (phase 14)
  dupCheck(demandsAll.map((d) => ({ id: d.item.id, file: d.file, path: `[${d.idx}]` })));
  const policyTags = new Set(policies.flatMap((c) => c.item.tags ?? []));
  const policyIds = new Set(policies.map((c) => c.item.id));
  for (const { item: d, file, idx } of demandsAll) {
    const p = `[${idx}]`;
    locKey(d.text, file, `${p}.text`);
    locKey(d.fulfilHint, file, `${p}.fulfilHint`);
    for (const k of ['onAccept', 'onFulfil', 'onFail', 'onReject'] as const) checkBundle(d[k], file, `${p}.${k}`);
    d.parties.forEach((pid: string, i: number) => {
      if (partiesRaw && !partiesRaw.some((x) => x.id === pid)) err('unknownParty', file, `${p}.parties[${i}]`, pid);
    });
    d.regions.forEach((code: string, i: number) => {
      if (regions && !regionCodes.has(code)) err('unknownRegion', file, `${p}.regions[${i}]`, code);
    });
    if (d.requesterTypes.includes('party') && d.status !== 'DUMMY' && !d.programmeRef)
      err('badDemand', file, `${p}.programmeRef`, 'a party demand needs a programmeRef (spec: demands come from real party programmes)');
    if (d.programmeRef && !d.parties.includes(d.programmeRef.party))
      err('badDemand', file, `${p}.programmeRef.party`, `"${d.programmeRef.party}" is not one of the demand's parties`);
    d.fulfil.forEach((f, i: number) => {
      const fp = `${p}.fulfil[${i}]`;
      if (f.type === 'policy') {
        if (!f.tags?.length && !f.cardIds?.length) err('badDemand', file, fp, 'a policy condition needs tags or cardIds');
        f.tags?.forEach((tag) => {
          if (!policyTags.has(tag)) err('badDemand', file, `${fp}.tags`, `no policy card has tag "${tag}"`);
        });
        f.cardIds?.forEach((id) => {
          if (!policyIds.has(id)) err('badDemand', file, `${fp}.cardIds`, `unknown card "${id}"`);
        });
      } else if (f.type === 'budget') {
        if (itemsRaw && !itemIds.has(f.item)) err('unknownItem', file, `${fp}.item`, f.item);
      } else if (f.region !== 'self' && regions && !regionCodes.has(f.region)) err('unknownRegion', file, `${fp}.region`, f.region);
    });
  }

  // region events (regions workspace)
  dupCheck(regionEventsAll.map((e) => ({ id: e.item.id, file: e.file, path: `[${e.idx}]` })));
  const knownTraits = new Set(Object.values(config.regions.traits).flat());
  for (const { item: e, file, idx } of regionEventsAll) {
    const p = `[${idx}]`;
    locKey(e.title, file, `${p}.title`);
    locKey(e.text, file, `${p}.text`);
    e.variants.forEach((v, i: number) => locKey(v.text, file, `${p}.variants[${i}].text`));
    for (const k of ['onIntervene', 'onIgnore'] as const) checkBundle(e[k], file, `${p}.${k}`);
    for (const tr of Object.keys(e.regionWeights)) if (!knownTraits.has(tr)) err('unknownTrait', file, `${p}.regionWeights.${tr}`, tr);
  }

  dupCheck(opportunities.map((o) => ({ id: o.item.id, file: o.file, path: `[${o.idx}]` })));
  for (const { item: o, file, idx } of opportunities) {
    locKey(o.text, file, `[${idx}].text`);
    checkBundle(o.reward, file, `[${idx}].reward`);
  }

  // upgrade trees: ids unique across trees, prerequisites exist, DAG
  const allNodes = trees.flatMap((t) => t.item.nodes.map((n, i) => ({ node: n, file: t.file, path: `nodes[${i}]` })));
  dupCheck(allNodes.map((n) => ({ id: n.node.id, file: n.file, path: n.path })));
  const nodeIds = new Set(allNodes.map((n) => n.node.id));
  for (const t of trees) {
    const tree = t.item;
    locKey(tree.name, t.file, 'name');
    if (tree.leader && leadersRaw && !leaderIds.has(tree.leader)) err('unknownLeader', t.file, 'leader', tree.leader);
    if (tree.axes) for (const side of ['top', 'bottom', 'left', 'right'] as const) locKey(tree.axes[side], t.file, `axes.${side}`);
    const own = new Set(tree.nodes.map((n) => n.id));
    tree.nodes.forEach((n, i) =>
      n.links.forEach((l: string, j: number) => {
        if (!own.has(l)) err('unknownUpgrade', t.file, `nodes[${i}].links[${j}]`, l);
      }),
    );
    tree.exclusive.forEach((g: string[], i: number) =>
      g.forEach((id, j) => {
        if (!own.has(id)) err('unknownUpgrade', t.file, `exclusive[${i}][${j}]`, id);
      }),
    );
    for (const [lid, nid] of Object.entries(tree.start) as [string, string][]) {
      if (leadersRaw && !leaderIds.has(lid)) err('unknownLeader', t.file, `start.${lid}`, lid);
      if (!own.has(nid)) err('unknownUpgrade', t.file, `start.${lid}`, nid);
    }
    // a tree with start nodes needs one for every leader who has the tree
    if (Object.keys(tree.start).length > 0 && leadersRaw)
      for (const l of leadersRaw) if ((!tree.leader || tree.leader === l.id) && !(l.id in tree.start)) err('missingStart', t.file, 'start', l.id);
  }
  for (const { node, file, path } of allNodes) {
    locKey(node.name, file, `${path}.name`);
    locKey(node.description, file, `${path}.description`);
    checkModifiers(node.modifiers, file, path);
    node.requires.forEach((r: string, i: number) => {
      if (!nodeIds.has(r)) err('unknownUpgrade', file, `${path}.requires[${i}]`, r);
    });
  }
  {
    const req = new Map(allNodes.map((n) => [n.node.id, n.node.requires as string[]]));
    const state = new Map<string, 1 | 2>();
    const visit = (id: string, stack: string[]): boolean => {
      if (state.get(id) === 2) return true;
      if (state.get(id) === 1) {
        const n = allNodes.find((x) => x.node.id === id)!;
        err('cycle', n.file, n.path, [...stack, id].join(' -> '));
        return false;
      }
      state.set(id, 1);
      for (const r of req.get(id) ?? []) if (req.has(r) && !visit(r, [...stack, id])) return false;
      state.set(id, 2);
      return true;
    };
    for (const id of req.keys()) if (!visit(id, [])) break;
  }

  // content minimum per leader (§5.3)
  if (leadersRaw) {
    for (const l of leadersRaw) {
      const forLeader = policies.filter((c) => c.item.availableFor.includes(l.id));
      const real = forLeader.filter((c) => !c.item.devOnly).length;
      if (forLeader.length < config.content.minCardsPerLeader)
        err('tooFewCards', 'data/policies', l.id, `${forLeader.length} cards, need at least ${config.content.minCardsPerLeader}`);
      if (real < config.content.warnCardsPerLeader)
        warnings.push({
          code: 'tooFewCards',
          file: 'data/policies',
          path: l.id,
          detail: `${real} non-filler cards (target >= ${config.content.warnCardsPerLeader})`,
        });
    }
  }

  if (errors.length > 0 || !budget || !regions || !leadersRaw || !endingsRaw || !voteRaw || !itemsRaw || !minigamesRaw || !profilesRaw || !partiesRaw) {
    return { ok: false, errors, warnings };
  }

  const fileHashes: Record<string, string> = {};
  for (const p of active) fileHashes[p] = shortHash(JSON.stringify(raw[p]));

  const data: GameData = {
    budget,
    regions: {
      ...regions,
      regions: regions.regions.map((r) => ({
        ...r,
        offsets: Object.fromEntries(leadersRaw.map((l) => [l.id, r.offsets[l.id] ?? 0])),
      })),
    },
    leaders: leadersRaw.map((l) => ({ ...l, ability: { ...l.ability, bundle: normalise(l.ability.bundle) } })) as LeaderDef[],
    policies: policies.map((c) => normalise(c.item)) as PolicyCard[],
    compromises: compromises.map((c) => normalise(c.item)) as CompromiseCard[],
    events: events.map((e) => {
      const ev = normalise(e.item);
      return ev.responses
        ? { ...ev, responses: { ...ev.responses, options: ev.responses.options.map((o) => normalise(o)) } }
        : ev;
    }) as ChaosEventDef[],
    opportunities: opportunities.map((o) => ({ ...o.item, reward: normalise(o.item.reward) })) as OpportunityDef[],
    budgetVote: voteRaw.map(normalise) as BudgetVoteOption[],
    budgetItems: itemsRaw as BudgetItem[],
    minigames: minigamesRaw as MinigameTexts,
    regionProfiles: profilesRaw as RegionProfiles,
    parties: partiesRaw as PartyDef[],
    demands: demands.map((d) => d.item) as DemandTemplate[],
    regionEvents: regionEvents.map((e) => ({ ...e.item, onIntervene: normalise(e.item.onIntervene), onIgnore: normalise(e.item.onIgnore) })) as RegionEventTemplate[],
    upgrades: trees.map((t) => t.item) as UpgradeTree[],
    endings: endingsRaw as EndingDef[],
    fileHashes,
  };
  return { ok: true, data, warnings };
}
