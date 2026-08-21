/** Requirements — the one gating vocabulary. */

import { z } from 'zod';
import { PredicateSchema } from '../dsl/schema.js';
import type { Predicate } from '../dsl/types.js';
import { idSchema, ref, description } from './common.js';

/** Quest states a requirement can test. */
export const questStatusSchema = z.enum(['available', 'active', 'complete', 'failed', 'unstarted']);

export const skillRequirementSchema = z
  .object({
    skill: ref('content.skills'),
    /** Minimum rank. */
    minRank: z.number().int().min(0).default(1),
    /** Named tier from `rules.masteryTiers`, if the module uses them. */
    minTier: ref('rules.masteryTiers').optional(),
  })
  .strict();

export const itemRequirementSchema = z
  .object({
    item: ref('content.items'),
    quantity: z.number().int().min(1).default(1),
    /** Consume the item when the gate opens, as a key is spent. */
    consume: z.boolean().default(false),
    /** Must be worn or wielded, not merely carried. */
    equipped: z.boolean().default(false),
  })
  .strict();

export const questRequirementSchema = z
  .object({
    quest: ref('narrative.quests'),
    status: questStatusSchema.default('complete'),
    /** Require a specific objective rather than the whole quest. */
    objective: idSchema.optional(),
  })
  .strict();

export const factionRequirementSchema = z
  .object({
    faction: ref('content.factions'),
    minStanding: z.number().int().optional(),
    maxStanding: z.number().int().optional(),
    /** Named rank from the faction's own ladder. */
    minRank: idSchema.optional(),
  })
  .strict();

/** A memory condition. */
export const memoryRequirementSchema = z
  .object({
    deedKind: ref('narrative.deedKinds'),
    /** Whose memory to inspect; defaults to the NPC in the conversation. */
    who: z.enum(['speaker', 'party', 'anyone', 'faction']).default('speaker'),
    /** False tests that they have not heard about it. */
    known: z.boolean().default(true),
    /** Only count deeds within this many in-world days. */
    withinDays: z.number().int().min(0).optional(),
  })
  .strict();

export const flagRequirementSchema = z
  .object({
    flag: z.string().min(1),
    /** Omit to test merely that the flag is set. */
    equals: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict();

/** Something the party has found out. */
export const loreRequirementSchema = z
  .object({
    entry: ref('narrative.lore'),
    known: z.boolean().default(true),
  })
  .strict();

export const attributeRequirementSchema = z
  .object({
    attribute: ref('rules.attributes'),
    min: z.number().int().optional(),
    max: z.number().int().optional(),
  })
  .strict();

/** The clauses shared by a requirement and by each of its alternatives. */
const requirementClauses = {
  description: description.default(''),

  minLevel: z.number().int().min(1).optional(),
  maxLevel: z.number().int().min(1).optional(),

  /** Character development: which classes and ancestries qualify. */
  classes: z.array(ref('content.classes')).default([]),
  ancestries: z.array(ref('content.ancestries')).default([]),
  abilities: z.array(ref('content.abilities')).default([]),
  attributes: z.array(attributeRequirementSchema).default([]),
  skills: z.array(skillRequirementSchema).default([]),

  /** What the actor is — "this only affects undead", "this line only appears if you speak Dwarvish". */
  creatureTypes: z.array(ref('rules.creatureTypes')).default([]),
  alignments: z.array(ref('rules.alignments')).default([]),
  languages: z.array(ref('rules.languages')).default([]),

  /** Coin in the party's purse — what makes a toll gate a toll. */
  currency: z.number().int().min(0).optional(),

  items: z.array(itemRequirementSchema).default([]),
  quests: z.array(questRequirementSchema).default([]),
  factions: z.array(factionRequirementSchema).default([]),
  memories: z.array(memoryRequirementSchema).default([]),
  flags: z.array(flagRequirementSchema).default([]),
  /** `.optional()` where its neighbours default to `[]`, so no module hash moves. */
  lore: z.array(loreRequirementSchema).optional(),

  /** Conditions that must NOT hold — "only before you have met her". */
  without: z
    .object({
      classes: z.array(ref('content.classes')).default([]),
      abilities: z.array(ref('content.abilities')).default([]),
      items: z.array(ref('content.items')).default([]),
      quests: z.array(questRequirementSchema).default([]),
      flags: z.array(flagRequirementSchema).default([]),
      conditions: z.array(ref('rules.conditions')).default([]),
      /** `.optional()` for the hash reason given on the positive clause above. */
      lore: z.array(ref('narrative.lore')).optional(),
    })
    .strict()
    .default({}),

  /** Escape hatch for anything the structured clauses cannot express. */
  custom: PredicateSchema.optional(),
} as const;

/** One alternative branch. */
export const requirementBranchSchema = z.object(requirementClauses).strict();

/** A gate. */
export const requirementSchema = z
  .object({
    ...requirementClauses,
    anyOf: z.array(requirementBranchSchema).default([]),
  })
  .strict();

export type Requirement = z.infer<typeof requirementSchema>;
export type RequirementBranch = z.infer<typeof requirementBranchSchema>;

/** Alternatives are absent on a branch, so treat that uniformly. */
function alternativesOf(req: Requirement | RequirementBranch): readonly RequirementBranch[] {
  return (('anyOf' in req ? req.anyOf : []) ?? []);
}

/** Read a clause list defensively. */
function clause<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/** The `without` block, likewise, may be missing entirely. */
function withoutOf(req: Requirement | RequirementBranch): {
  classes: readonly string[];
  abilities: readonly string[];
  items: readonly string[];
  quests: readonly z.infer<typeof questRequirementSchema>[];
  flags: readonly z.infer<typeof flagRequirementSchema>[];
  conditions: readonly string[];
  lore: readonly string[];
} {
  const raw = (req.without ?? {}) as Partial<Requirement['without']>;
  return {
    classes: clause(raw.classes),
    abilities: clause(raw.abilities),
    items: clause(raw.items),
    quests: clause(raw.quests),
    flags: clause(raw.flags),
    conditions: clause(raw.conditions),
    lore: clause(raw.lore),
  };
}

/** True when nothing is gated, so callers can skip evaluation entirely. */
export function isEmptyRequirement(req: Requirement | RequirementBranch | undefined): boolean {
  if (!req) return true;
  const without = withoutOf(req);
  return (
    req.minLevel === undefined &&
    req.currency === undefined &&
    req.maxLevel === undefined &&
    clause(req.classes).length === 0 &&
    clause(req.ancestries).length === 0 &&
    clause(req.abilities).length === 0 &&
    clause(req.attributes).length === 0 &&
    clause(req.skills).length === 0 &&
    clause(req.creatureTypes).length === 0 &&
    clause(req.alignments).length === 0 &&
    clause(req.languages).length === 0 &&
    clause(req.items).length === 0 &&
    clause(req.quests).length === 0 &&
    clause(req.factions).length === 0 &&
    clause(req.memories).length === 0 &&
    clause(req.flags).length === 0 &&
    clause(req.lore).length === 0 &&
    alternativesOf(req).length === 0 &&
    req.custom === undefined &&
    without.classes.length === 0 &&
    without.abilities.length === 0 &&
    without.items.length === 0 &&
    without.quests.length === 0 &&
    without.flags.length === 0 &&
    without.conditions.length === 0 &&
    without.lore.length === 0
  );
}

/** Lower a requirement to a DSL predicate. */
export function compileRequirement(req: Requirement | RequirementBranch | undefined): Predicate {
  if (isEmptyRequirement(req)) return true;
  const r = req!;
  const clauses: Predicate[] = [];

  if (r.minLevel !== undefined) clauses.push({ gte: [{ ref: 'actor.level' }, r.minLevel] });
  if (r.maxLevel !== undefined) clauses.push({ lte: [{ ref: 'actor.level' }, r.maxLevel] });

  // Class and ancestry lists are alternatives: any of them qualifies.
  if (clause(r.classes).length > 0) {
    clauses.push({ in: [{ ref: 'actor.class' }, { list: [...clause(r.classes)] }] });
  }
  if (clause(r.ancestries).length > 0) {
    clauses.push({ in: [{ ref: 'actor.ancestry' }, { list: [...clause(r.ancestries)] }] });
  }
  for (const ability of clause(r.abilities)) {
    clauses.push({ in: [ability, { ref: 'actor.abilities' }] });
  }

  for (const attribute of clause(r.attributes)) {
    if (attribute.min !== undefined) {
      clauses.push({ gte: [{ ref: `actor.attr.${attribute.attribute}` }, attribute.min] });
    }
    if (attribute.max !== undefined) {
      clauses.push({ lte: [{ ref: `actor.attr.${attribute.attribute}` }, attribute.max] });
    }
  }

  for (const skill of clause(r.skills)) {
    clauses.push({ gte: [{ ref: `actor.skills.${skill.skill}`, else: 0 }, skill.minRank] });
    // A tier is a named rung on the rank ladder, per `masteryTier.atRank`.
    if (skill.minTier) {
      clauses.push({
        gte: [{ ref: `actor.skills.${skill.skill}`, else: 0 }, { ref: `tiers.${skill.minTier}` }],
      });
    }
  }

  if (clause(r.creatureTypes).length > 0) {
    clauses.push({ in: [{ ref: 'actor.creatureType' }, { list: [...clause(r.creatureTypes)] }] });
  }
  if (clause(r.alignments).length > 0) {
    clauses.push({ in: [{ ref: 'actor.alignment' }, { list: [...clause(r.alignments)] }] });
  }
  // Every named tongue must be spoken, not merely one of them.
  for (const language of clause(r.languages)) {
    clauses.push({ in: [language, { ref: 'actor.languages' }] });
  }

  if (r.currency !== undefined) clauses.push({ gte: [{ ref: 'purse' }, r.currency] });

  for (const item of clause(r.items)) {
    const path = item.equipped ? `actor.equippedItems.${item.item}` : `actor.inventory.${item.item}`;
    clauses.push({ gte: [{ ref: path, else: 0 }, item.quantity] });
  }

  for (const quest of clause(r.quests)) clauses.push(questClause(quest));

  for (const faction of clause(r.factions)) {
    if (faction.minStanding !== undefined) {
      clauses.push({ gte: [{ ref: `reputation.${faction.faction}`, else: 0 }, faction.minStanding] });
    }
    if (faction.maxStanding !== undefined) {
      clauses.push({ lte: [{ ref: `reputation.${faction.faction}`, else: 0 }, faction.maxStanding] });
    }
    // Ranks are thresholds on the faction's own standing, scoped per faction.
    if (faction.minRank) {
      clauses.push({
        gte: [
          { ref: `reputation.${faction.faction}`, else: 0 },
          { ref: `ranks.${faction.faction}.${faction.minRank}` },
        ],
      });
    }
  }

  for (const memory of clause(r.memories)) {
    // `memory.<who>.<deedKind>` is how the engine exposes what is remembered.
    const path = `memory.${memory.who}.${memory.deedKind}`;
    const known: Predicate = memory.withinDays === undefined
      ? { exists: path }
      : { all: [{ exists: path }, { lte: [{ sub: [{ ref: 'world.day' }, { ref: `${path}.at` }] }, memory.withinDays] }] };
    clauses.push(memory.known ? known : { not: known });
  }

  for (const flag of clause(r.flags)) clauses.push(flagClause(flag));

  // `lore.<id>` is the minute it was learned, so `exists` is the whole test.
  for (const lore of clause(r.lore)) {
    const known: Predicate = { exists: `lore.${lore.entry}` };
    clauses.push(lore.known ? known : { not: known });
  }

  // Negations.
  const without = withoutOf(r);
  for (const cls of without.classes) clauses.push({ not: { eq: [{ ref: 'actor.class' }, cls] } });
  for (const ability of without.abilities) {
    clauses.push({ not: { in: [ability, { ref: 'actor.abilities' }] } });
  }
  for (const item of without.items) {
    clauses.push({ lt: [{ ref: `actor.inventory.${item}`, else: 0 }, 1] });
  }
  for (const quest of without.quests) clauses.push({ not: questClause(quest) });
  for (const flag of without.flags) clauses.push({ not: flagClause(flag) });
  for (const entry of without.lore) clauses.push({ not: { exists: `lore.${entry}` } });
  for (const condition of without.conditions) {
    clauses.push({ not: { exists: `actor.conditions.${condition}` } });
  }

  const alternatives = alternativesOf(r);
  if (alternatives.length > 0) {
    clauses.push({ any: alternatives.map((alternative) => compileRequirement(alternative)) });
  }

  if (r.custom !== undefined) clauses.push(r.custom);

  if (clauses.length === 0) return true;
  if (clauses.length === 1) return clauses[0]!;
  return { all: clauses };
}

function questClause(quest: z.infer<typeof questRequirementSchema>): Predicate {
  if (quest.objective) {
    return { exists: `quests.${quest.quest}.objectives.${quest.objective}` };
  }
  if (quest.status === 'unstarted') {
    return { not: { exists: `quests.${quest.quest}` } };
  }
  return { eq: [{ ref: `quests.${quest.quest}.status`, else: 'unstarted' }, quest.status] };
}

function flagClause(flag: z.infer<typeof flagRequirementSchema>): Predicate {
  if (flag.equals === undefined) return { test: { ref: `flags.${flag.flag}`, else: false } };
  return { eq: [{ ref: `flags.${flag.flag}`, else: null }, flag.equals] };
}
