/** Zod schemas for every data file in spec §13. */
import { z } from 'zod';
import { GROUP_IDS, LEANING_IDS, RESOURCE_IDS } from '../core/types';

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
  'policy', 'chaos', 'response', 'opportunity', 'budget_vote', 'ongoing', 'drift', 'penalty', 'ability', 'compromise', 'any',
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
  })
  .strict();

export const upgradeTreeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    nodes: z.array(
      z
        .object({
          id: z.string(),
          cost: z.number().min(0),
          requires: z.array(z.string()).default([]),
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
