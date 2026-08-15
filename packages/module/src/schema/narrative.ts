/**
 * Narrative: the text grammar, dialogue, and quests.
 *
 * With no LLM at runtime, prose quality comes from weighted template pools
 * keyed on world state. `textGrammar` is that vocabulary; the narrator expands
 * it with a scene-seeded RNG so a room reads the same every time you re-enter
 * it, but differs between playthroughs.
 */

import { z } from 'zod';
import { ExprSchema, PredicateSchema, EffectSchema } from '../dsl/schema.js';
import { idSchema, displayName, description, ref, tags, weighted } from './common.js';
import { requirementSchema } from './requirement.js';
import { memoryModelSchema } from './memory.js';

/**
 * One way of saying something. Variants may carry conditions, so a room reads
 * differently once it has been looted or its occupants are dead.
 */
export const textVariantSchema = z
  .object({
    /** Supports `{placeholder}` interpolation resolved against the scene scope. */
    text: z.string().min(1),
    when: PredicateSchema.optional(),
    /** Say it differently once they know you, or fear you. */
    requires: requirementSchema.optional(),
    weight: z.number().min(0).default(1),
    tags,
  })
  .strict();

/**
 * A named pool of phrasings. The compiler warns when a pool is small enough
 * that players will notice the repetition.
 */
export const textPoolSchema = z
  .object({
    id: idSchema,
    description: description.default(''),
    variants: z.array(textVariantSchema).min(1),
  })
  .strict();

/**
 * One thing the player can say.
 *
 * Options are gated by the same requirement vocabulary as everything else, so
 * a line can appear only for a certain class, only while carrying proof, only
 * once a faction trusts you, or only if this NPC has *not* heard what you did.
 */
export const dialogueOptionSchema = z
  .object({
    id: idSchema,
    text: z.string().min(1),
    requires: requirementSchema.optional(),
    when: PredicateSchema.optional(),
    /** Shown greyed out with this reason instead of hidden. */
    showWhenLocked: z.boolean().default(false),
    lockedHint: z.string().default(''),
    /** A persuasion or intimidation attempt: the NPC resists. */
    check: z
      .object({
        skill: ref('content.skills'),
        difficulty: z.number().int().default(12),
        /** The NPC's own roll opposes it, rather than a fixed number. */
        opposedBy: ref('content.skills').optional(),
        onSuccess: idSchema.optional(),
        onFailure: idSchema.optional(),
      })
      .strict()
      .optional(),
    effects: z.array(EffectSchema).default([]),
    /** Selectable once, ever. */
    onceOnly: z.boolean().default(false),
    /** Omit to end the conversation. */
    goto: idSchema.optional(),
  })
  .strict();

export const dialogueNodeSchema = z
  .object({
    id: idSchema,
    /** What the NPC says; picked from a pool so repeat visits vary. */
    says: z.array(textVariantSchema).min(1),
    /** Runs when the node is first reached. */
    onEnter: z.array(EffectSchema).default([]),
    /** Reaching this node is itself remembered, so later talk can refer back. */
    remembers: ref('narrative.deedKinds').optional(),
    /** Skip to another node when the party already qualifies. */
    redirectWhen: z
      .array(z.object({ requires: requirementSchema, goto: idSchema }).strict())
      .default([]),
    options: z.array(dialogueOptionSchema).default([]),
  })
  .strict();

export const dialogueSchema = z
  .object({
    id: idSchema,
    start: idSchema,
    nodes: z.array(dialogueNodeSchema).min(1),
  })
  .strict()
  .superRefine((d, ctx) => {
    const ids = new Set(d.nodes.map((n) => n.id));
    if (!ids.has(d.start)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `start node "${d.start}" is not defined` });
    }
    // A `goto` into nowhere would strand the player mid-conversation.
    for (const node of d.nodes) {
      for (const target of node.redirectWhen) {
        if (!ids.has(target.goto)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['nodes'],
            message: `node "${node.id}" redirects to unknown node "${target.goto}"`,
          });
        }
      }
      for (const option of node.options) {
        // Every branch an option can take must land somewhere real, including
        // the success and failure outcomes of a persuasion check.
        for (const [label, goto] of [
          ['goto', option.goto],
          ['check.onSuccess', option.check?.onSuccess],
          ['check.onFailure', option.check?.onFailure],
        ] as const) {
          if (goto !== undefined && !ids.has(goto)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['nodes'],
              message: `option "${option.id}" in node "${node.id}" has ${label} pointing at unknown node "${goto}"`,
            });
          }
        }
      }
    }
  });

/** One step of a quest. Objectives observe the event stream. */
export const objectiveSchema = z
  .object({
    id: idSchema,
    description: description.default(''),
    /** Common shapes, so the usual objective needs no hand-written predicate. */
    kind: z.enum(['custom', 'kill', 'collect', 'reach', 'talk']).default('custom'),
    /** Target of the objective, interpreted per `kind`. */
    target: idSchema.optional(),
    count: z.number().int().min(1).default(1),
    /** Satisfied when this holds; required for `custom`. */
    when: PredicateSchema.optional(),
    /** Additional gate before the objective becomes active. */
    requires: requirementSchema.optional(),
    /** Hidden objectives do not appear in the journal until complete. */
    hidden: z.boolean().default(false),
    optional: z.boolean().default(false),
    onComplete: z.array(EffectSchema).default([]),
  })
  .strict();

export const questSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    tags,
    /** Becomes available when this holds. */
    available: PredicateSchema.optional(),
    /** Starts automatically rather than needing to be accepted. */
    autoStart: z.boolean().default(false),
    giver: ref('content.npcs').optional(),
    /** Gate on development, items, factions, memory, or other quests. */
    requires: requirementSchema.optional(),
    /**
     * Stages run in order; each holds its own objectives. A single-stage quest
     * is just a list of objectives, so simple quests stay simple.
     */
    stages: z
      .array(
        z
          .object({
            id: idSchema,
            name: displayName.optional(),
            description: description.default(''),
            objectives: z.array(objectiveSchema).default([]),
            onStart: z.array(EffectSchema).default([]),
            onComplete: z.array(EffectSchema).default([]),
            /** Prose shown while this stage is the active one. */
            journalKey: ref('narrative.textGrammar').optional(),
          })
          .strict(),
      )
      .default([]),
    objectives: z.array(objectiveSchema).default([]),
    /** Objectives must be completed in order. */
    ordered: z.boolean().default(true),
    onStart: z.array(EffectSchema).default([]),
    onComplete: z.array(EffectSchema).default([]),
    onFail: z.array(EffectSchema).default([]),
    /** Fails the quest when this becomes true, e.g. the giver dies. */
    failWhen: PredicateSchema.optional(),
    rewards: z
      .object({
        xp: ExprSchema.default(0),
        items: z
          .array(
            z
              .object({ item: ref('content.items'), quantity: ExprSchema.default(1) })
              .strict(),
          )
          .default([]),
        reputation: z.record(ref('content.factions'), ExprSchema).default({}),
      })
      .strict()
      .default({}),
    /** Quests unlocked on completion, forming a chain. */
    unlocks: z.array(ref('narrative.quests')).default([]),
    /** What the world remembers about this, and who tells whom. */
    remembersAs: ref('narrative.deedKinds').optional(),
    /** Can be taken again once finished. */
    repeatable: z.boolean().default(false),
    /** Fails automatically this many in-world days after starting. */
    timeLimitDays: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    // A quest with neither stages nor objectives can never be completed, which
    // is the kind of mistake that only shows up hours into playtesting.
    if (q.stages.length === 0 && q.objectives.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'quest has no objectives and no stages, so it can never complete',
      });
    }
    for (const objective of q.objectives) {
      if (objective.kind === 'custom' && objective.when === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `objective "${objective.id}" is custom but has no completion condition`,
        });
      }
    }
  });

/** A story arc: a gated sequence of quests. */
export const arcSchema = z
  .object({
    id: idSchema,
    name: displayName,
    description: description.default(''),
    quests: z.array(ref('narrative.quests')).min(1),
    /** Reaching this ends the game. */
    isEnding: z.boolean().default(false),
  })
  .strict();

/**
 * How a deed is weighted when it reaches a faction's ears. The social sim reads
 * these rather than hardcoding what counts as an outrage.
 */
export const deedKindSchema = z
  .object({
    id: idSchema,
    name: displayName,
    tags,
    /** Standing change for the faction that cares, before witness decay. */
    severity: z.number().int().default(0),
    /** Which faction is affected; omit to derive it from the victim. */
    faction: ref('content.factions').optional(),
    /** How memorable it is, as a multiplier on decay. */
    memorability: z.number().min(0).default(1),
    /** How much the story mutates as it spreads, 0..1. */
    distortion: z.number().min(0).max(1).default(0.2),
  })
  .strict();

export const narrativeSchema = z
  .object({
    textGrammar: z.array(textPoolSchema).default([]),
    dialogues: z.array(dialogueSchema).default([]),
    quests: z.array(questSchema).default([]),
    arcs: z.array(arcSchema).default([]),
    deedKinds: z.array(deedKindSchema).default([]),
    /**
     * Memory, gossip, forgetting, and learning — the GM's dials on emergence.
     * Defaults give a world that runs itself; `mode: "manual"` hands control
     * back to the content.
     */
    memory: memoryModelSchema.default({}),
  })
  .strict();

export type TextPool = z.infer<typeof textPoolSchema>;
export type TextVariant = z.infer<typeof textVariantSchema>;
export type Quest = z.infer<typeof questSchema>;
export type Narrative = z.infer<typeof narrativeSchema>;
export { weighted };
