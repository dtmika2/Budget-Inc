/**
 * Generates clearly labelled [FILLER] policy cards and chaos events so full runs and the simulator work
 * before real content exists (spec §11). Seeded and deterministic. All output is `devOnly: true`.
 *
 * Writes data/policies/_filler.json, data/events/_filler.json and the matching [FILLER] keys in
 * locales/cs.json (event texts in locales/events.cs.json). Turn filler off with `config.includeDevFiller = false`.
 *
 * Usage: npm run gen:filler
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { config } from '../src/config';
import { Rng } from '../src/core/rng';
import type {
  BudgetData,
  CompromiseCard,
  RegionsData,
  ChaosEventDef,
  GroupId,
  LeaderDef,
  LeaningId,
  OngoingDef,
  PolicyCard,
  Range,
  ResponseOption,
} from '../src/core/types';
import { GROUP_IDS, LEANING_IDS } from '../src/core/types';

const F = config.filler;
const rng = new Rng(F.seed);
const budget: BudgetData = JSON.parse(readFileSync('data/budget.json', 'utf8'));
const leaders: LeaderDef[] = JSON.parse(readFileSync('data/leaders.json', 'utf8'));
const locale: Record<string, string> = JSON.parse(readFileSync('locales/cs.json', 'utf8'));
const eventLocale: Record<string, string> = JSON.parse(readFileSync('locales/events.cs.json', 'utf8'));
const regionsData: RegionsData = JSON.parse(readFileSync('data/regions.json', 'utf8'));

const LEANING_CZ: Record<LeaningId, string> = {
  libertarianism: 'libertarianismus',
  conservatism: 'konzervatismus',
  populism: 'populismus',
  socialism: 'socialismus',
  progressivism: 'progresivismus',
  fascism: 'fašismus',
  communism: 'komunismus',
};
const OTHER_RESOURCES = ['support', 'coalition', 'prestige'] as const;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const between = (r: Range) => rng.uniform(r.min, r.max);
/** A small integer range of width 1–2 centred near `c`. */
const rangeAround = (c: number): Range => {
  const w = rng.int(1, 2);
  const min = Math.round(c - w / 2);
  return { min, max: min + w };
};

/** Seats per leaning: one each, the rest by leader weights (largest remainder). */
function leaningSlots(weights: Record<LeaningId, number>, total: number): LeaningId[] {
  const out: LeaningId[] = [...LEANING_IDS];
  const rest = total - out.length;
  const sum = LEANING_IDS.reduce((s, l) => s + weights[l], 0);
  const quotas = LEANING_IDS.map((l) => ({ l, q: (weights[l] / sum) * rest }));
  let given = 0;
  for (const { l, q } of quotas) {
    const n = Math.floor(q);
    for (let i = 0; i < n; i++) out.push(l);
    given += n;
  }
  quotas.sort((a, b) => (b.q % 1) - (a.q % 1));
  for (let i = 0; given < rest; i++, given++) out.push(quotas[i % quotas.length].l);
  return out;
}

const E0 = budget.chapters.reduce((s, c) => s + c.expenditure, 0);

/** Budget change sized so its Finances effect is about `points` (sign included). */
function budgetChangeFor(points: number) {
  const chapter = rng.pick(budget.chapters);
  const type = rng.next() < 0.5 ? 'revenue' : 'expenditure';
  const base = type === 'revenue' ? chapter.revenue : chapter.expenditure;
  const perPct = (config.finances.scale * base) / E0; // finances points per 1 % change
  let pct = Math.abs(points) / Math.max(perPct, 1e-9);
  pct = Math.min(20, Math.max(0.5, Math.round(pct * 2) / 2));
  // revenue up / expenditure down improve finances
  const improves = points > 0;
  const changePct = type === 'revenue' ? (improves ? pct : -pct) : improves ? -pct : pct;
  return { chapter: chapter.code, type, changePct } as const;
}

function makeEvent(id: string, label: string): ChaosEventDef {
  const respondable = rng.next() < F.respondableShare;
  const quarterOffset = rng.next() < 0.75 ? 0 : rng.int(1, 2);
  const fromDay = rng.int(5, 40);
  const toDay = Math.min(88, fromDay + rng.int(20, 45));
  const lossRes = rng.pick(OTHER_RESOURCES);
  const effects: Record<string, Range> = { [lossRes]: rangeAround(-between(F.eventLoss)) };
  if (rng.next() < 0.3) effects.financesExtra = rangeAround(-rng.uniform(1, 3));
  const anger: Partial<Record<GroupId, Range>> = {};
  if (rng.next() < 0.7) anger[rng.pick(GROUP_IDS)] = rangeAround(between(F.eventAnger));
  const ev: ChaosEventDef = {
    id,
    chance: round2(between(F.eventChance)),
    quarterOffset,
    window: { fromDay, toDay },
    text: `event.${id}.text`,
    effects,
    anger,
    responses: null,
    devOnly: true,
  };
  eventLocale[`event.${id}.text`] = `[FILLER] Událost ${label}`;
  if (respondable) {
    const options: ResponseOption[] = [
      {
        id: 'a',
        label: `event.${id}.resp.a`,
        cost: { pc: 0 },
        effects: { [rng.pick(OTHER_RESOURCES)]: rangeAround(-rng.uniform(1, 3)) },
        anger: { [rng.pick(GROUP_IDS)]: rangeAround(-rng.uniform(2, 5)) },
      },
      {
        id: 'b',
        label: `event.${id}.resp.b`,
        cost: { pc: 1 },
        effects: { [lossRes]: rangeAround(rng.uniform(2, 4)) },
      },
      { id: 'c', label: `event.${id}.resp.c`, cost: { pc: 0 } },
    ];
    ev.responses = { default: 'c', options };
    eventLocale[`event.${id}.resp.a`] = '[FILLER] Reakce A';
    eventLocale[`event.${id}.resp.b`] = '[FILLER] Reakce B';
    eventLocale[`event.${id}.resp.c`] = '[FILLER] Nereagovat';
  }
  return ev;
}

function makeCard(leader: LeaderDef, n: number, leaning: LeaningId): { card: PolicyCard; event: ChaosEventDef } {
  const tag = `${leader.id[0].toUpperCase()}${String(n).padStart(2, '0')}`;
  const id = `filler_${leader.id}_${String(n).padStart(2, '0')}`;
  const eventId = `filler_evt_${leader.id}_${String(n).padStart(2, '0')}`;

  // resources: one primary gain, 1–2 secondaries (mostly costs) => roughly net-neutral trade-offs
  const shuffled = [...OTHER_RESOURCES].sort(() => rng.next() - 0.5);
  const count = rng.int(2, 3);
  const effects: Record<string, Range> = {};
  effects[shuffled[0]] = rangeAround(between(F.primaryGain));
  for (let i = 1; i < count; i++) effects[shuffled[i]] = rangeAround(between(F.secondary));

  // anger: 1–3 groups, a trade-off between groups
  const groups = [...GROUP_IDS].sort(() => rng.next() - 0.5).slice(0, rng.int(1, 3));
  const anger: Partial<Record<GroupId, Range>> = {};
  groups.forEach((g, i) => {
    const up = i === 0 ? true : rng.next() < 0.45;
    anger[g] = rangeAround(up ? between(F.angerUp) : between(F.angerDown));
  });

  // budget: 1–2 changes, finances effect of a few points either way
  const budgetChanges = Array.from({ length: rng.int(1, 2) }, () => {
    const pts = between(F.budgetPct) * (rng.next() < 0.5 ? 1 : -1);
    return budgetChangeFor(pts);
  });

  let ongoing: OngoingDef[] | undefined;
  if (rng.next() < F.ongoingShare) {
    const toAnger = rng.next() < 0.4;
    const target = toAnger ? `anger.${rng.pick(GROUP_IDS)}` : rng.pick(OTHER_RESOURCES);
    const good = rng.next() < 0.55;
    const mag = round2(between(F.ongoingPerDay));
    // for anger, "good" means falling anger
    const perDay = toAnger ? (good ? -mag : mag) : good ? mag : -mag;
    ongoing = [{ target, perDay, days: Math.round(between(F.ongoingDays) / 10) * 10, label: `policy.${id}.ongoing` }];
    locale[`policy.${id}.ongoing`] = `[FILLER] Trvalý efekt ${tag}`;
  }

  locale[`policy.${id}.title`] = `[FILLER] Karta ${tag} (${LEANING_CZ[leaning]})`;
  locale[`policy.${id}.desc`] = '[FILLER] Generovaná karta pro testování mechanik.';
  locale[`policy.${id}.drivenBy`] = '[FILLER]';

  const card: PolicyCard = {
    id,
    leaning,
    availableFor: [leader.id],
    title: `policy.${id}.title`,
    description: `policy.${id}.desc`,
    drivenBy: `policy.${id}.drivenBy`,
    effects,
    anger,
    ...(ongoing ? { ongoing } : {}),
    budgetChanges: budgetChanges.map((b) => ({ ...b, changePct: round1(b.changePct) })),
    chaosEvents: [eventId],
    devOnly: true,
  };
  return { card, event: makeEvent(eventId, tag) };
}

// Cards already written by the team (they have a topic; source: content/policies/Policies_filler.docx, imported
// with scripts/policy_docx.py) are kept as they are, texts included. Everything else is regenerated.
const previous: PolicyCard[] = existsSync('data/policies/_filler.json') ? JSON.parse(readFileSync('data/policies/_filler.json', 'utf8')) : [];
const written = new Map(previous.filter((c) => c.topic).map((c) => [c.id, c]));
// Compromises edited in content/compromises/kompro_filler.docx (their name no longer the generated
// "[FILLER] Kompromis …") are kept the same way.
const previousComp: CompromiseCard[] = existsSync('data/compromises/_filler.json')
  ? JSON.parse(readFileSync('data/compromises/_filler.json', 'utf8'))
  : [];
const writtenComp = new Map(previousComp.filter((c) => locale[c.title] !== undefined && !locale[c.title].startsWith('[FILLER] Kompromis ')).map((c) => [c.id, c]));
const writtenTexts = Object.fromEntries(
  Object.entries(locale).filter(
    ([k]) => [...written.keys()].some((id) => k.startsWith(`policy.${id}.`)) || [...writtenComp.keys()].some((id) => k.startsWith(`compromise.${id}.`)),
  ),
);

// drop previously generated filler keys, then regenerate
for (const k of Object.keys(locale)) if (/^(policy|compromise)\.filler_/.test(k)) delete locale[k];
for (const k of Object.keys(eventLocale)) if (/^event\.filler_/.test(k)) delete eventLocale[k];

const cards: PolicyCard[] = [];
const events: ChaosEventDef[] = [];
for (const leader of leaders) {
  const slots = leaningSlots(leader.leaningWeights, F.cardsPerLeader);
  slots.forEach((leaning, i) => {
    const { card, event } = makeCard(leader, i + 1, leaning);
    cards.push(written.get(card.id) ?? card);
    events.push(event);
  });
}

// ---- regional compromises (generated after cards/events so their output stays unchanged)
// Variants: A region vs region, B regional support vs oligarchs (either way), C regions bought with Finances.
const regionCodes = regionsData.regions.map((r) => r.code);
const compromises: CompromiseCard[] = [];
for (let n = 1; n <= F.compromises; n++) {
  const id = `filler_comp_${String(n).padStart(2, '0')}`;
  const tag = `K${String(n).padStart(2, '0')}`;
  const shuffled = [...regionCodes].sort(() => rng.next() - 0.5);
  const roll = rng.next();
  const variant = roll < 0.5 ? 'A' : roll < 0.75 ? 'B' : 'C';
  const regions: Record<string, Range> = {};
  const card: CompromiseCard = {
    id,
    availableFor: leaders.map((l) => l.id),
    title: `compromise.${id}.title`,
    description: `compromise.${id}.desc`,
    drivenBy: `compromise.${id}.drivenBy`,
    regions,
    chaosEvents: [],
    devOnly: true,
  };
  if (variant === 'A') {
    const ups = rng.int(1, 2);
    const downs = rng.int(1, 2);
    shuffled.slice(0, ups).forEach((c) => (regions[c] = rangeAround(between(F.regionGain))));
    shuffled.slice(ups, ups + downs).forEach((c) => (regions[c] = rangeAround(-between(F.regionLoss))));
  } else if (variant === 'B') {
    // favour the oligarchs (their anger falls) at the cost of regional support, or the reverse
    const favourOligarchs = rng.next() < 0.5;
    shuffled
      .slice(0, rng.int(1, 2))
      .forEach((c) => (regions[c] = rangeAround(favourOligarchs ? -between(F.regionLoss) : between(F.regionGain))));
    card.anger = { oligarchs: rangeAround(favourOligarchs ? -between(F.compromiseOligarchs) : between(F.compromiseOligarchs)) };
  } else {
    shuffled.slice(0, rng.int(1, 2)).forEach((c) => (regions[c] = rangeAround(between(F.regionGain))));
    const bc = budgetChangeFor(-between(F.compromiseFinanceCost));
    card.budgetChanges = [{ ...bc, changePct: round1(bc.changePct) }];
  }
  const kind = { A: 'kraj proti kraji', B: 'kraje a oligarchové', C: 'kraje za peníze' }[variant];
  locale[`compromise.${id}.title`] = `[FILLER] Kompromis ${tag} (${kind})`;
  locale[`compromise.${id}.desc`] = '[FILLER] Generovaný regionální kompromis pro testování mechanik.';
  locale[`compromise.${id}.drivenBy`] = '[FILLER]';
  compromises.push(writtenComp.get(id) ?? card);
}

Object.assign(locale, writtenTexts);
writeFileSync('data/policies/_filler.json', JSON.stringify(cards, null, 2) + '\n');
writeFileSync('data/events/_filler.json', JSON.stringify(events, null, 2) + '\n');
writeFileSync('data/compromises/_filler.json', JSON.stringify(compromises, null, 2) + '\n');
writeFileSync('locales/cs.json', JSON.stringify(locale, null, 2) + '\n');
writeFileSync('locales/events.cs.json', JSON.stringify(eventLocale, null, 2) + '\n');
const respondable = events.filter((e) => e.responses).length;
console.log(
  `Generated ${cards.length} [FILLER] cards (${F.cardsPerLeader} per leader x ${leaders.length}), ${events.length} events (${respondable} respondable) and ${compromises.length} compromises.`,
);
