/** Zod schemas for every data file in spec §13. */
import { z } from 'zod';
import { DEMOGRAPHIC_FIELDS, GROUP_IDS, LEANING_IDS, RESOURCE_IDS } from '../core/types';

export const rangeSchema = z
  .object({ min: z.number(), max: z.number() })
  .strict()
  .refine((r) => r.min <= r.max, { message: 'min must be <= max' });

const effectsSchema = z
  .object({
    finances: rangeSchema,
    financesExtra: rangeSchema,
    support: rangeSchema,
    coalition: rangeSchema,
    prestige: rangeSchema,
  })
  .partial()
  .strict();

const angerSchema = z.object(Object.fromEntries(GROUP_IDS.map((g) => [g, rangeSchema]))).partial().strict();

export const ongoingSchema = z
  .object({
    target: z.string(),
    perDay: z.number(),
    days: z.number().int().positive(),
    label: z.string().optional(),
  })
  .strict();

export const budgetChangeSchema = z
  .object({
    chapter: z.string().min(1),
    type: z.enum(['revenue', 'expenditure']),
    changePct: z.number(),
  })
  .strict();

const modifierSourceSchema = z.enum([
  'policy', 'chaos', 'response', 'opportunity', 'budget_vote', 'ongoing', 'drift', 'penalty', 'ability', 'compromise', 'demand', 'region_event', 'any',
]);

export const modifierSchema = z
  .object({
    type: z.enum(['add', 'multiplier']),
    target: z.string(),
    value: z.number(),
    source: modifierSourceSchema.optional(),
    days: z.number().int().positive().optional(),
  })
  .strict();

const bundleShape = {
  effects: effectsSchema.optional(),
  anger: angerSchema.optional(),
  ongoing: z.array(ongoingSchema).optional(),
  budgetChanges: z.array(budgetChangeSchema).optional(),
  pc: z.number().optional(),
  /** Regional support shifts keyed by kraj code (validated against data/regions.json). */
  regions: z.record(z.string(), rangeSchema).optional(),
  /** Hidden tags that region traits react to (validated against config.regions.tags). */
  tags: z.array(z.string()).optional(),
};

export const bundleSchema = z.object(bundleShape).strict();

export const policySchema = z
  .object({
    ...bundleShape,
    id: z.string().regex(/^[a-z0-9_]+$/, 'id must be snake_case'),
    leaning: z.enum(LEANING_IDS),
    availableFor: z.array(z.string()).min(1),
    title: z.string(),
    description: z.string(),
    drivenBy: z.string(),
    chaosEvents: z.array(z.string()).max(3).default([]),
    devOnly: z.boolean().default(false),
  })
  .strict();

export const compromiseSchema = z
  .object({
    ...bundleShape,
    id: z.string().regex(/^[a-z0-9_]+$/, 'id must be snake_case'),
    availableFor: z.array(z.string()).min(1),
    title: z.string(),
    description: z.string(),
    drivenBy: z.string(),
    chaosEvents: z.array(z.string()).max(3).default([]),
    devOnly: z.boolean().default(false),
  })
  .strict()
  .refine((c) => c.regions && Object.keys(c.regions).length > 0, { message: 'a compromise needs at least one regional effect' });

export const responseOptionSchema = z
  .object({
    ...bundleShape,
    id: z.string(),
    label: z.string(),
    cost: z.object({ pc: z.number().min(0) }).strict().default({ pc: 0 }),
  })
  .strict();

export const eventSchema = z
  .object({
    ...bundleShape,
    id: z.string(),
    chance: z.number().min(0).max(1),
    quarterOffset: z.number().int().min(0).max(3).default(0),
    window: z
      .object({ fromDay: z.number().int().min(1).max(91), toDay: z.number().int().min(1).max(91) })
      .strict()
      .refine((w) => w.fromDay <= w.toDay, { message: 'fromDay must be <= toDay' }),
    text: z.string(),
    responses: z
      .object({ default: z.string(), options: z.array(responseOptionSchema).min(2).max(3) })
      .strict()
      .nullable()
      .default(null),
    devOnly: z.boolean().optional(),
  })
  .strict();

export const opportunitySchema = z
  .object({
    id: z.string(),
    weight: z.number().positive(),
    text: z.string(),
    reward: bundleSchema,
  })
  .strict();

export const budgetVoteOptionSchema = z
  .object({
    ...bundleShape,
    id: z.string(),
    label: z.string(),
    description: z.string(),
    passChanceMod: z.number(),
    sliders: z.record(z.string(), z.number().int()).default({}),
  })
  .strict();

const budgetZoneSchema = z
  .object({ ...bundleShape, regionTraits: z.record(z.string(), rangeSchema).optional(), pass: z.number().optional() })
  .strict();

export const budgetItemSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/, 'id must be snake_case'),
    label: z.string(),
    chapters: z
      .array(
        z
          .object({ chapter: z.string().min(1), type: z.enum(['revenue', 'expenditure']), weight: z.number().positive().max(1) })
          .strict(),
      )
      .min(1),
    angerPerStep: z.object(Object.fromEntries(GROUP_IDS.map((g) => [g, z.number()]))).partial().strict().default({}),
    supportPerStep: z.number().default(0),
    passPerStep: z.number().default(0),
    canBeRedLine: z.boolean().default(true),
    core: z.boolean().default(false),
    band: z
      .object({ min: z.number().int().max(0), max: z.number().int().min(0) })
      .strict()
      .default({ min: -1, max: 1 }),
    onCut: budgetZoneSchema.default({}),
    onOverspend: budgetZoneSchema.default({}),
    advisor: z.object({ cut: z.string(), overspend: z.string() }).strict().nullable().default(null),
  })
  .strict();

export const upgradeTreeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Leader tree: only this leader sees and can buy it. Omit for trees every leader has. */
    leader: z.string().optional(),
    /** Start node per leader id (owned for free at run start). */
    start: z.record(z.string(), z.string()).default({}),
    /** Fork groups: buying one node locks out the others. */
    exclusive: z.array(z.array(z.string()).min(2)).default([]),
    /** Axis labels around the tree view (locale keys). */
    axes: z.object({ top: z.string(), bottom: z.string(), left: z.string(), right: z.string() }).strict().optional(),
    nodes: z.array(
      z
        .object({
          id: z.string(),
          cost: z.number().min(0),
          requires: z.array(z.string()).default([]),
          links: z.array(z.string()).default([]),
          modifiers: z.array(modifierSchema),
          name: z.string(),
          description: z.string(),
          pos: z.object({ col: z.number(), row: z.number() }).strict(),
        })
        .strict(),
    ),
  })
  .strict();

export const endingSchema = z
  .object({
    id: z.string(),
    group: z.enum(GROUP_IDS),
    threshold: z.number().min(0).max(100),
    built: z.boolean(),
    title: z.string(),
    text: z.string(),
    art: z.string(),
    standInPenalty: z.object({ target: z.string(), perDay: z.number() }).strict(),
  })
  .strict();

const pct = z.number().min(0).max(100);

export const leaderSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    party: z.string(),
    profile: z.string(),
    color: z.string(),
    colorLight: z.string(),
    start: z.object(Object.fromEntries(RESOURCE_IDS.map((r) => [r, pct]))).strict(),
    startAnger: z.object(Object.fromEntries(GROUP_IDS.map((g) => [g, pct]))).strict(),
    leaningWeights: z.object(Object.fromEntries(LEANING_IDS.map((l) => [l, z.number().min(0)]))).strict(),
    ability: z
      .object({
        id: z.string(),
        name: z.string(),
        description: z.string(),
        modifiers: z.array(modifierSchema).default([]),
        bundle: bundleSchema.default({}),
      })
      .strict(),
    sprite: z.string(),
  })
  .strict();

export const budgetSchema = z
  .object({
    source: z.string(),
    year: z.number().int(),
    currency: z.string(),
    chapters: z
      .array(
        z
          .object({
            code: z.string().min(1),
            name: z.string(),
            revenue: z.number().min(0),
            expenditure: z.number().min(0),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const regionsSchema = z
  .object({
    seatsSource: z.string(),
    regions: z.array(
      z
        .object({
          code: z.string(),
          name: z.string(),
          seats: z.number().int().min(0),
          offsets: z.record(z.string(), z.number()).default({}),
        })
        .strict(),
    ),
    revealOrder: z.array(z.string()),
  })
  .strict();

export const localeSchema = z.record(z.string(), z.string());

export const minigameTextsSchema = z
  .object({
    pressSpin: z.array(z.string()).min(3),
    pressGaffe: z.array(z.string()).min(2),
    debateQuestions: z.array(z.string()).min(5),
  })
  .strict();

const statValueSchema = z
  .object({
    value: z.number().nullable(),
    year: z.number().int().nullable(),
    source: z.string(),
    status: z.enum(['TODO', 'OK']),
  })
  .strict()
  .refine((v) => v.status === 'TODO' || (v.value !== null && v.year !== null), { message: 'status OK needs a value and a year' });

export const regionProfilesSchema = z
  .object({
    traitsSource: z.string(),
    regions: z.record(
      z.string(),
      z
        .object({
          traits: z.array(z.string()).min(2).max(3),
          demographics: z.object(Object.fromEntries(DEMOGRAPHIC_FIELDS.map((f) => [f, statValueSchema]))).strict(),
          coalition: z
            .object({
              council: z.enum(['kraj', 'city']),
              parties: z.array(z.string()),
              source: z.string(),
              asOf: z.string().nullable(),
              status: z.enum(['TODO', 'OK']),
            })
            .strict(),
        })
        .strict(),
    ),
  })
  .strict();

export const partySchema = z.object({ id: z.string().regex(/^[a-z0-9_]+$/), label: z.string() }).strict();

const fulfilSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('policy'), tags: z.array(z.string()).optional(), cardIds: z.array(z.string()).optional() }).strict(),
  z.object({ type: z.literal('compromise'), region: z.string(), minRegionGain: z.number().positive() }).strict(),
  z.object({ type: z.literal('budget'), item: z.string(), minSteps: z.number().int().refine((n) => n !== 0, 'minSteps must not be 0') }).strict(),
]);

export const regionEventSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/, 'id must be snake_case'),
    status: z.enum(['DUMMY', 'DRAFT', 'APPROVED']),
    animation: z.enum(['flood', 'blackout', 'protest', 'factory', 'duo']),
    regionWeights: z.record(z.string(), z.number().min(0)).default({}),
    title: z.string(),
    text: z.string(),
    variants: z.array(z.object({ id: z.string().regex(/^[a-z0-9_]+$/), text: z.string() }).strict()).default([]),
    onIntervene: bundleSchema,
    onIgnore: bundleSchema,
  })
  .strict();

export const demandSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/, 'id must be snake_case'),
    status: z.enum(['DUMMY', 'DRAFT', 'APPROVED']),
    requesterTypes: z.array(z.enum(['party', 'interestGroup'])).min(1),
    parties: z.array(z.string()).default([]),
    interestGroups: z.array(z.enum(GROUP_IDS)).default([]),
    regionWeights: z.record(z.string(), z.number().min(0)).default({}),
    regions: z.array(z.string()).default([]),
    text: z.string(),
    fulfilHint: z.string(),
    fulfil: z.array(fulfilSchema).min(1),
    onAccept: bundleSchema.default({}),
    onFulfil: bundleSchema,
    onFail: bundleSchema,
    onReject: bundleSchema,
    programmeRef: z
      .object({
        party: z.string(),
        file: z.string(),
        page: z.number().int().positive().optional(),
        section: z.string().optional(),
        quote: z.string().max(240).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
