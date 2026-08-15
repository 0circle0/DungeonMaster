/**
 * The behaviour DSL.
 *
 * Data alone cannot express behaviour, so this small JSON language covers every
 * place a module needs logic: ability effects, spell payloads, item procs, trap
 * triggers, dialogue gates, loot rules, and quest objectives. One evaluator
 * serves all of them.
 *
 * Three properties are non-negotiable:
 *
 *   - **Sandboxed.** No `eval`, no host access. A shared module cannot run code.
 *   - **Deterministic.** Chance flows through the passed-in RNG, so a replay
 *     with the same seed produces the same outcome.
 *   - **Inspectable.** It is plain JSON, so the editor can render, validate,
 *     and diff it without executing anything.
 *
 * Reads go through a single mechanism: `{ "ref": "actor.attr.might" }` walks the
 * scope the engine supplies. Deliberately there is no `hasFlag` / `hasItem` /
 * `hasCondition` primitive — those are just paths (`flags.met_vess`,
 * `actor.inventory.rope`), which keeps the language small and lets the editor
 * autocomplete every readable value from one schema.
 */

/** Anything the DSL can read or produce. */
export type Value = number | string | boolean | null | readonly Value[] | { readonly [k: string]: Value };

/** An expression evaluating to a {@link Value}. Bare literals are valid expressions. */
export type Expr =
  | number
  | string
  | boolean
  | null
  /** Read a dotted path from scope, e.g. `actor.attr.might`. */
  | { readonly ref: string }
  /** Read a path, falling back when it is missing or null. */
  | { readonly ref: string; readonly else: Expr }
  | { readonly add: readonly Expr[] }
  | { readonly sub: readonly [Expr, Expr] }
  | { readonly mul: readonly [Expr, Expr] }
  | { readonly div: readonly [Expr, Expr] }
  | { readonly mod: readonly [Expr, Expr] }
  | { readonly neg: Expr }
  | { readonly min: readonly Expr[] }
  | { readonly max: readonly Expr[] }
  | { readonly floor: Expr }
  | { readonly ceil: Expr }
  | { readonly round: Expr }
  | { readonly abs: Expr }
  /** Clamp a value between a lower and upper bound. */
  | { readonly clamp: readonly [Expr, Expr, Expr] }
  /** Roll dice notation, consuming RNG. The notation may itself be computed. */
  | { readonly roll: Expr }
  /** Ternary. */
  | { readonly cond: Predicate; readonly then: Expr; readonly else: Expr }
  /** Join values into a string. */
  | { readonly concat: readonly [Expr, ...Expr[]] }
  /** Length of an array or string. */
  | { readonly length: Expr }
  /** Literal array, e.g. for the `in` predicate. */
  | { readonly list: readonly Expr[] };

/** An expression evaluating to a boolean. */
export type Predicate =
  | boolean
  | { readonly all: readonly Predicate[] }
  | { readonly any: readonly Predicate[] }
  | { readonly not: Predicate }
  | { readonly eq: readonly [Expr, Expr] }
  | { readonly ne: readonly [Expr, Expr] }
  | { readonly gt: readonly [Expr, Expr] }
  | { readonly gte: readonly [Expr, Expr] }
  | { readonly lt: readonly [Expr, Expr] }
  | { readonly lte: readonly [Expr, Expr] }
  /** Membership: `{ "in": [expr, { "list": [...] }] }`. */
  | { readonly in: readonly [Expr, Expr] }
  /** True with probability 0..1, consuming RNG. */
  | { readonly chance: Expr }
  /** True when a path resolves to something other than null/undefined. */
  | { readonly exists: string }
  /** Truthiness of an expression: non-zero, non-empty, true. */
  | { readonly test: Expr };

/**
 * Effects do not mutate anything. They evaluate to a list of {@link EffectOp}
 * intents that the engine validates and applies, which keeps evaluation pure
 * and lets the engine veto an illegal op (healing the dead, spending resources
 * the actor lacks) in one place rather than in every content file.
 */
export type Effect =
  | { readonly damage: { readonly target: Expr; readonly amount: Expr; readonly damageType?: Expr } }
  | { readonly heal: { readonly target: Expr; readonly amount: Expr } }
  | {
      readonly applyCondition: {
        readonly target: Expr;
        readonly condition: Expr;
        readonly duration?: Expr;
        readonly magnitude?: Expr;
      };
    }
  | { readonly removeCondition: { readonly target: Expr; readonly condition: Expr } }
  | {
      readonly adjustResource: {
        readonly target: Expr;
        readonly resource: Expr;
        readonly amount: Expr;
      };
    }
  | { readonly setFlag: { readonly flag: Expr; readonly value?: Expr } }
  | {
      readonly grantItem: {
        readonly target: Expr;
        readonly item: Expr;
        readonly quantity?: Expr;
      };
    }
  | {
      readonly removeItem: {
        readonly target: Expr;
        readonly item: Expr;
        readonly quantity?: Expr;
      };
    }
  | { readonly adjustReputation: { readonly faction: Expr; readonly amount: Expr } }
  | { readonly move: { readonly target: Expr; readonly to: Expr } }
  /** Emit a custom event for quests and the narrator to observe. */
  | { readonly emit: { readonly event: Expr; readonly data?: { readonly [k: string]: Expr } } }
  | { readonly if: { readonly when: Predicate; readonly then: readonly Effect[]; readonly else?: readonly Effect[] } }
  | { readonly repeat: { readonly times: Expr; readonly do: readonly Effect[] } }
  /** Bind each element of a list to `as` and run the body. */
  | { readonly forEach: { readonly in: Expr; readonly as: string; readonly do: readonly Effect[] } }
  /** Bind a computed value to a name, so an expensive roll is made once. */
  | { readonly let: { readonly name: string; readonly value: Expr; readonly in: readonly Effect[] } };

/** A resolved intent produced by evaluating an {@link Effect}. */
export type EffectOp =
  | {
      readonly op: 'damage';
      readonly target: Value;
      readonly amount: number;
      readonly damageType: string | null;
      /**
       * What the blow carries besides its type — `silvered`, `magical`, `cold_iron`.
       * A resistance may declare itself void `unless` the damage has one of these.
       */
      readonly tags?: readonly string[];
    }
  | { readonly op: 'heal'; readonly target: Value; readonly amount: number }
  | { readonly op: 'adjustCurrency'; readonly amount: number }
  | {
      readonly op: 'applyCondition';
      readonly target: Value;
      readonly condition: string;
      readonly duration: number | null;
      readonly magnitude: number | null;
    }
  | { readonly op: 'removeCondition'; readonly target: Value; readonly condition: string }
  | { readonly op: 'adjustResource'; readonly target: Value; readonly resource: string; readonly amount: number }
  | { readonly op: 'setFlag'; readonly flag: string; readonly value: Value }
  | { readonly op: 'grantItem'; readonly target: Value; readonly item: string; readonly quantity: number }
  | { readonly op: 'removeItem'; readonly target: Value; readonly item: string; readonly quantity: number }
  | { readonly op: 'adjustReputation'; readonly faction: string; readonly amount: number }
  | { readonly op: 'move'; readonly target: Value; readonly to: Value }
  | { readonly op: 'emit'; readonly event: string; readonly data: { readonly [k: string]: Value } }
  | {
      readonly op: 'noise';
      readonly sense: string;
      readonly loudness: number;
      readonly source: string | null;
    };

/** A guarded block of effects, the shape most content uses. */
export interface Rule {
  readonly when?: Predicate;
  readonly then: readonly Effect[];
}
