/**
 * Special cards data (catastrophes workspace, see CATASTROPHES.md): zod schema for data/catastrophes/*.json
 * and the cross-file checks the loader runs on them.
 */
import { z } from 'zod';
import type { SpecialCardDef } from '../core/specialCards';
import { GROUP_IDS, RESOURCE_IDS, type EffectBundle } from '../core/types';
import { bundleSchema } from './schemas';

const op = z.enum(['gte', 'lte']);

const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resource'), resource: z.enum(RESOURCE_IDS), op, value: z.number() }).strict(),
  z.object({ type: z.literal('anger'), group: z.enum(GROUP_IDS), op, value: z.number() }).strict(),
  z.object({ type: z.literal('pc'), op, value: z.number() }).strict(),
  z.object({ type: z.literal('region'), region: z.string(), op, value: z.number() }).strict(),
]);

export const specialCardSchema = z
  .object({
    id: z.string(),
    kind: z.enum(['catastrophe', 'agent']),
    title: z.string(),
    text: z.string(),
    condition: conditionSchema,
    onFail: bundleSchema.optional(),
    onPass: bundleSchema.optional(),
    weight: z.number().positive().default(1),
    availableFor: z.array(z.string()).optional(),
    /** Pixel-art scene key (src/catastrophes/cardArt.tsx). */
    art: z.string().optional(),
  })
  .strict()
  .refine((c) => (c.kind === 'catastrophe' ? !!c.onFail && !c.onPass : !!c.onPass && !c.onFail), {
    message: 'a catastrophe needs onFail (no onPass), an agent needs onPass (no onFail)',
  });

export interface SpecialCheckCtx {
  err: (code: 'unknownRegion' | 'unknownLeader', file: string, path: string, detail: string) => void;
  locKey: (key: string | undefined, file: string, path: string) => void;
  checkBundle: (b: EffectBundle, file: string, path: string) => void;
  regionCodes: Set<string> | null;
  leaderIds: Set<string> | null;
}

/** Cross-file checks: texts, region codes, leaders, bundles. */
export function validateSpecialCards(cards: { item: SpecialCardDef; file: string; idx: number }[], ctx: SpecialCheckCtx): void {
  for (const { item: c, file, idx } of cards) {
    const p = `[${idx}]`;
    ctx.locKey(c.title, file, `${p}.title`);
    ctx.locKey(c.text, file, `${p}.text`);
    if (c.condition.type === 'region' && ctx.regionCodes && !ctx.regionCodes.has(c.condition.region))
      ctx.err('unknownRegion', file, `${p}.condition.region`, c.condition.region);
    c.availableFor?.forEach((l, i) => {
      if (ctx.leaderIds && !ctx.leaderIds.has(l)) ctx.err('unknownLeader', file, `${p}.availableFor[${i}]`, l);
    });
    // path without ".on": the demand-only `self` region is not allowed here
    if (c.onFail) ctx.checkBundle(c.onFail, file, `${p}.sanction`);
    if (c.onPass) ctx.checkBundle(c.onPass, file, `${p}.bonus`);
  }
}
