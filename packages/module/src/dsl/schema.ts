/**
 * Zod schemas for the DSL.
 *
 * These are the source of truth in two directions: they validate a module at
 * load time, and they generate the JSON Schema that drives autocomplete and
 * inline errors in the editor. Every object is `.strict()`, so a misspelled key
 * (`"conditon"`) is a load error rather than a silently ignored field — the
 * failure mode that would otherwise have an ability quietly do nothing.
 */

import { z } from 'zod';
import { parseDice } from '@dm/core';
import type { Effect, Expr, Predicate, Rule } from './types.js';

/** Dice notation validated at load, so a typo cannot surface mid-combat. */
export const diceNotation = z.string().superRefine((value, ctx) => {
  try {
    parseDice(value);
  } catch (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
  }
});

/** A dotted scope path, e.g. `actor.attr.might`. */
export const refPath = z
  .string()
  .min(1)
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/,
    'must be a dotted path such as "actor.attr.might"',
  );

// `z.lazy` + an explicit annotation is how Zod expresses these mutually
// recursive shapes; zod-to-json-schema turns them into $ref definitions.

export const ExprSchema: z.ZodType<Expr> = z.lazy(() =>
  z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.null(),
    z.object({ ref: refPath, else: ExprSchema.optional() }).strict(),
    z.object({ add: z.array(ExprSchema) }).strict(),
    z.object({ sub: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ mul: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ div: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ mod: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ neg: ExprSchema }).strict(),
    z.object({ min: z.array(ExprSchema).min(1) }).strict(),
    z.object({ max: z.array(ExprSchema).min(1) }).strict(),
    z.object({ floor: ExprSchema }).strict(),
    z.object({ ceil: ExprSchema }).strict(),
    z.object({ round: ExprSchema }).strict(),
    z.object({ abs: ExprSchema }).strict(),
    z.object({ clamp: z.tuple([ExprSchema, ExprSchema, ExprSchema]) }).strict(),
    z.object({ roll: ExprSchema }).strict(),
    z.object({ cond: PredicateSchema, then: ExprSchema, else: ExprSchema }).strict(),
    z.object({ concat: z.array(ExprSchema).min(1) }).strict(),
    z.object({ length: ExprSchema }).strict(),
    z.object({ list: z.array(ExprSchema) }).strict(),
  ]),
) as z.ZodType<Expr>;

export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.object({ all: z.array(PredicateSchema) }).strict(),
    z.object({ any: z.array(PredicateSchema) }).strict(),
    z.object({ not: PredicateSchema }).strict(),
    z.object({ eq: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ ne: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ gt: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ gte: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ lt: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ lte: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ in: z.tuple([ExprSchema, ExprSchema]) }).strict(),
    z.object({ chance: ExprSchema }).strict(),
    z.object({ exists: refPath }).strict(),
    z.object({ test: ExprSchema }).strict(),
  ]),
) as z.ZodType<Predicate>;

export const EffectSchema: z.ZodType<Effect> = z.lazy(() =>
  z.union([
    z
      .object({
        damage: z
          .object({ target: ExprSchema, amount: ExprSchema, damageType: ExprSchema.optional() })
          .strict(),
      })
      .strict(),
    z.object({ heal: z.object({ target: ExprSchema, amount: ExprSchema }).strict() }).strict(),
    z
      .object({
        applyCondition: z
          .object({
            target: ExprSchema,
            condition: ExprSchema,
            duration: ExprSchema.optional(),
            magnitude: ExprSchema.optional(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        removeCondition: z.object({ target: ExprSchema, condition: ExprSchema }).strict(),
      })
      .strict(),
    z
      .object({
        adjustResource: z
          .object({ target: ExprSchema, resource: ExprSchema, amount: ExprSchema })
          .strict(),
      })
      .strict(),
    z
      .object({ setFlag: z.object({ flag: ExprSchema, value: ExprSchema.optional() }).strict() })
      .strict(),
    z
      .object({
        grantItem: z
          .object({ target: ExprSchema, item: ExprSchema, quantity: ExprSchema.optional() })
          .strict(),
      })
      .strict(),
    z
      .object({
        removeItem: z
          .object({ target: ExprSchema, item: ExprSchema, quantity: ExprSchema.optional() })
          .strict(),
      })
      .strict(),
    z
      .object({
        adjustReputation: z.object({ faction: ExprSchema, amount: ExprSchema }).strict(),
      })
      .strict(),
    z.object({ move: z.object({ target: ExprSchema, to: ExprSchema }).strict() }).strict(),
    z
      .object({
        /** Make a sound — or a smell, or whatever the sense carries. */
        noise: z
          .object({
            sense: ExprSchema,
            loudness: ExprSchema.optional(),
            /** Who or what made it; the acting creature when omitted. */
            source: ExprSchema.optional(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        emit: z
          .object({ event: ExprSchema, data: z.record(z.string(), ExprSchema).optional() })
          .strict(),
      })
      .strict(),
    z
      .object({
        if: z
          .object({
            when: PredicateSchema,
            then: z.array(EffectSchema),
            else: z.array(EffectSchema).optional(),
          })
          .strict(),
      })
      .strict(),
    z
      .object({ repeat: z.object({ times: ExprSchema, do: z.array(EffectSchema) }).strict() })
      .strict(),
    z
      .object({
        forEach: z
          .object({
            in: ExprSchema,
            as: z.string().min(1).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
            do: z.array(EffectSchema),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        let: z
          .object({
            name: z.string().min(1).regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
            value: ExprSchema,
            in: z.array(EffectSchema),
          })
          .strict(),
      })
      .strict(),
  ]),
) as z.ZodType<Effect>;

export const RuleSchema: z.ZodType<Rule> = z
  .object({
    when: PredicateSchema.optional(),
    then: z.array(EffectSchema),
  })
  .strict() as z.ZodType<Rule>;
