/**
 * Where mod output enters the engine.
 *
 * One object, two responsibilities:
 *
 *   - **`has()`** is the hot-path gate. It is a `Set` lookup over what the
 *     manifests declared, so a turn with no interested mod costs nothing —
 *     no allocation, no serialization, no boundary crossing.
 *   - **`run()`** crosses into the sandbox and applies whatever comes back.
 *     It never throws. A mod that explodes, hangs, or returns nonsense becomes
 *     a `modError` event and the turn continues.
 *
 * Mods are not restricted in *what* they change — `patch` writes anywhere in
 * `GameState`. The two things enforced here are the ones that are not game
 * rules: values must be JSON-safe so a replay reproduces, and a failure must
 * not take the session down.
 */

import { Rng } from '@dm/core';
import type { EffectOp, Value } from '@dm/module';
import {
  checkJsonSafe,
  modDirectivesSchema,
  MOD_STATE_BUDGET,
  type ModDirective,
  type SandboxHost,
  type LoadedMod,
} from '@dm/mods';

import { applyOps, Transaction } from '../rules/apply.js';
import { literal } from '../narrate/systemText.js';
import { interpolate } from '../narrate/grammar.js';
import type { GameState } from '../state.js';
import { matchKeyFor, MUST_MATCH, NO_HOOK_OUTCOME } from './hooks.js';
import type { HookName, HookOutcome, HookSubjects } from './hooks.js';

/**
 * Composite map keys.
 *
 * Each goes through one helper rather than being inlined at both ends, because
 * a `${a} ${b}` written twice is a key that agrees only by luck. When the two
 * spellings drift the lookup silently misses and the feature quietly does
 * nothing — which is exactly how the mod-refusal text went missing once.
 */
const KEY_SEP = String.fromCharCode(31);
/** Stands for "this declaration did not narrow"; cannot collide with a real match. */
const ANY = String.fromCharCode(30);

const gateKey = (hook: string, match: string | undefined): string =>
  `${hook}${KEY_SEP}${match ?? ''}`;
const textKey = (modId: string, key: string): string => `${modId}${KEY_SEP}${key}`;
const shadowKey = (modId: string, hook: string): string => `${modId}${KEY_SEP}${hook}`;

interface Registration {
  readonly modId: string;
  readonly mode: 'before' | 'after' | 'replace';
  readonly priority: number;
  readonly match: string | undefined;
  /** Position in the resolved order; the deterministic tiebreak. */
  readonly at: number;
}

export interface ModRuntimeOptions {
  readonly host: SandboxHost;
  /** In resolved order. Order is behaviour, so it is decided before we get here. */
  readonly mods: readonly LoadedMod[];
  /** Mods whose `replace` on a given hook lost, as `<modId> <hook>`. */
  readonly shadowed?: ReadonlySet<string>;
}

export class ModRuntime {
  private readonly host: SandboxHost;
  /** hook name → registrations, pre-sorted into run order. */
  private readonly byHook = new Map<string, Registration[]>();
  /** `${hook} ${match}` and `${hook} ` — what `has()` probes. */
  private readonly gate = new Set<string>();
  /** A mod's prose is the mod author's to write. */
  private readonly systemText = new Map<string, string>();
  /**
   * Declarations refused when the runtime was built, with the reason.
   *
   * Kept rather than thrown: one bad declaration should cost a mod that hook,
   * not the whole session — and a silently ignored declaration is the most
   * confusing outcome for the author.
   */
  readonly rejected: string[] = [];

  constructor(options: ModRuntimeOptions) {
    this.host = options.host;
    const shadowed = options.shadowed ?? new Set<string>();

    options.mods.forEach((mod, at) => {
      for (const [key, template] of Object.entries(mod.manifest.systemText)) {
        this.systemText.set(textKey(mod.manifest.id, key), template);
      }
      for (const decl of mod.manifest.hooks) {
        if (decl.mode === 'replace' && shadowed.has(shadowKey(mod.manifest.id, decl.hook))) continue;

        // `event.emit` runs hundreds of times a turn. An unfiltered declaration
        // would put a WASM crossing on every event in the game, so it is
        // refused outright rather than merely discouraged — a mod author who
        // wants everything can declare the handful of types they actually mean.
        if (MUST_MATCH.includes(decl.hook as HookName) && decl.match === undefined) {
          this.rejected.push(
            `${mod.manifest.id} declares ${decl.hook} without a \`match\`, which would fire on every event; ` +
              `name the event types it cares about`,
          );
          continue;
        }
        const list = this.byHook.get(decl.hook) ?? [];
        list.push({
          modId: mod.manifest.id,
          mode: decl.mode,
          priority: decl.priority,
          match: decl.match,
          at,
        });
        this.byHook.set(decl.hook, list);

        // An unfiltered declaration has to answer for every subject, so it
        // registers the bare key too.
        this.gate.add(gateKey(decl.hook, decl.match));
        if (decl.match === undefined) this.gate.add(gateKey(decl.hook, ANY));
      }
    });

    // Run order: before, then replace, then after; within a mode by priority
    // descending, then by resolved position. Fixed here so `run` never sorts.
    const modeRank = { before: 0, replace: 1, after: 2 } as const;
    for (const list of this.byHook.values()) {
      list.sort((a, b) => {
        if (modeRank[a.mode] !== modeRank[b.mode]) return modeRank[a.mode] - modeRank[b.mode];
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.at - b.at;
      });
    }
  }

  /** Is any mod interested? A `Set` lookup, called on every hooked path. */
  has(hook: HookName, match?: string): boolean {
    if (this.gate.size === 0) return false;
    if (this.gate.has(gateKey(hook, ANY))) return true;
    return match !== undefined && this.gate.has(gateKey(hook, match));
  }

  /**
   * Run every interested handler and apply what they return.
   *
   * Never throws.
   */
  run<K extends HookName>(
    txn: Transaction,
    hook: K,
    subject: HookSubjects[K],
    rng: Rng,
  ): HookOutcome {
    const registrations = this.byHook.get(hook);
    if (!registrations || registrations.length === 0) return NO_HOOK_OUTCOME;

    const match = matchKeyFor(hook, subject);
    let replaced = false;
    let refused = false;

    for (const registration of registrations) {
      if (registration.match !== undefined && registration.match !== match) continue;
      if (this.host.quarantined(registration.modId)) continue;

      const payload = this.buildPayload(txn.state, hook, subject, registration);
      let drew = 0;
      const stream = rng.derive(`mod:${registration.modId}:${hook}`);

      const result = this.host.call({
        mod: registration.modId,
        hook,
        payload,
        // Derived, so how many times a mod draws cannot perturb anything
        // downstream — `derive` reads the parent without advancing it.
        random: () => {
          drew += 1;
          return stream.nextFloat();
        },
        query: (path) => this.query(txn, path),
      });

      if (!result.ok) {
        txn.emit({
          type: 'custom',
          event: 'modError',
          data: { mod: registration.modId, hook, kind: result.kind, message: result.error },
        });
        continue;
      }

      for (const message of result.logs) {
        txn.emit({ type: 'custom', event: 'modLog', data: { mod: registration.modId, message } });
      }

      const parsed = modDirectivesSchema.safeParse(result.directives);
      if (!parsed.success) {
        txn.emit({
          type: 'custom',
          event: 'modError',
          data: {
            mod: registration.modId,
            hook,
            kind: 'badreturn',
            message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          },
        });
        continue;
      }

      let ranCore = false;
      for (const directive of parsed.data) {
        if (directive.kind === 'core') {
          ranCore = true;
          continue;
        }
        if (this.apply(txn, registration.modId, directive)) refused = true;
      }

      if (registration.mode === 'replace' && !ranCore) replaced = true;
      void drew;
    }

    return { replaced, refused };
  }

  /**
   * Apply one directive. Returns whether it refused the action.
   *
   * Everything goes through the transaction, so a mod's changes land the same
   * way the module's own do.
   */
  private apply(txn: Transaction, modId: string, directive: ModDirective): boolean {
    switch (directive.kind) {
      case 'ops': {
        // Through the same door the module DSL uses: already validated,
        // clamped, immunity-checked, and refusing by name on anything unknown.
        applyOps(txn, directive.ops as readonly EffectOp[], null);
        return false;
      }

      case 'patch': {
        for (const patch of directive.patches) {
          if (patch.op === 'set') {
            const issue = checkJsonSafe(patch.value, patch.path.join('.'));
            if (issue) {
              txn.emit({
                type: 'custom',
                event: 'modError',
                data: { mod: modId, kind: 'badreturn', message: issue },
              });
              continue;
            }
            txn.set(setAt(txn.state, patch.path, patch.value));
          } else {
            txn.set(deleteAt(txn.state, patch.path));
          }
        }
        return false;
      }

      case 'event': {
        txn.emit({ type: 'custom', event: directive.event, data: directive.data });
        return false;
      }

      case 'say': {
        // Resolved here and emitted as text, rather than emitted as a key for
        // the narrator to resolve: the narrator has no idea which mod a key
        // belongs to, and two mods may reasonably use the same key name.
        const template = this.systemText.get(textKey(modId, directive.textKey));
        txn.emit({
          type: 'custom',
          event: 'modSay',
          data: {
            mod: modId,
            // A missing key shows the key rather than nothing at all, so an
            // author sees which one they forgot instead of a silent turn.
            text: template === undefined
              ? `${modId}: ${directive.textKey}`
              : interpolate(template, directive.params),
            tone: directive.tone,
          },
        });
        return false;
      }

      case 'refuse': {
        // Resolved against the mod's own `systemText`, not the engine's.
        //
        // The engine's key union is closed on purpose — `spine.test.ts` fails
        // on a literal string in engine code — but that rule exists so engine
        // *prose* stays authorable, and a mod's prose is the mod author's to
        // write. Resolving here keeps mod text as data while leaving the
        // engine's union alone.
        const template = this.systemText.get(textKey(modId, directive.textKey));
        txn.emit({
          type: 'refused',
          action: directive.action,
          reason: literal(
            template === undefined
              ? `${modId}: ${directive.textKey}`
              : interpolate(template, directive.params),
          ),
        });
        return true;
      }

      case 'modState': {
        const issue = checkJsonSafe(directive.value, directive.key);
        if (issue) {
          txn.emit({
            type: 'custom',
            event: 'modError',
            data: { mod: modId, kind: 'badreturn', message: issue },
          });
          return false;
        }
        const own = { ...(txn.state.modState[modId] ?? {}), [directive.key]: directive.value as Value };
        const size = JSON.stringify(own).length;
        if (size > MOD_STATE_BUDGET) {
          txn.emit({
            type: 'custom',
            event: 'modError',
            data: {
              mod: modId,
              kind: 'badreturn',
              message: `modState would be ${size} bytes, over the ${MOD_STATE_BUDGET} budget — a save has to stay loadable`,
            },
          });
          return false;
        }
        txn.set({ ...txn.state, modState: { ...txn.state.modState, [modId]: own } });
        return false;
      }

      default:
        return false;
    }
  }

  private buildPayload<K extends HookName>(
    state: GameState,
    hook: K,
    subject: HookSubjects[K],
    registration: Registration,
  ): string {
    return JSON.stringify({
      hook,
      mode: registration.mode,
      now: {
        minute: state.minute,
        day: Math.floor(state.minute / (24 * 60)),
        map: state.currentMap,
        outcome: state.outcome,
      },
      selected: state.selected,
      subject,
      self: state.modState[registration.modId] ?? {},
    });
  }

  /**
   * Pull one value by dotted path.
   *
   * Pull rather than push: serializing `GameState` for every hook would be tens
   * to hundreds of KB per crossing and would make mods unusable. A mod asks for
   * the handful of fields it needs.
   *
   * Two roots. A bare path walks `GameState`. A `module.` prefix reaches the
   * compiled module, and `module.<section>.<collection>.<id>` resolves through
   * the id index rather than walking the array — which is the shape content is
   * actually addressed by, and is how a mod reads an author's `extra` bag.
   */
  private query(txn: Transaction, path: string): string | null {
    const segments = path.split('.');
    let cursor: unknown;

    if (segments[0] === 'module') {
      // `module.rules.conditions.bleeding` → the entry, not the array.
      if (segments.length >= 4) {
        const collection = `${segments[1]}.${segments[2]}`;
        const entry = txn.module.find(collection, segments[3]!);
        if (entry !== undefined) {
          cursor = entry;
          return this.finish(cursor, segments.slice(4));
        }
      }
      cursor = txn.module.source;
      return this.finish(cursor, segments.slice(1));
    }

    return this.finish(txn.state, segments);
  }

  private finish(root: unknown, segments: readonly string[]): string | null {
    let cursor = root;
    for (const segment of segments) {
      if (cursor === null || typeof cursor !== 'object') return null;
      cursor = (cursor as Record<string, unknown>)[segment];
      if (cursor === undefined) return null;
    }
    try {
      return JSON.stringify(cursor) ?? null;
    } catch {
      return null;
    }
  }
}

/** Immutably set a value at a path, creating plain objects as needed. */
function setAt(root: GameState, path: readonly (string | number)[], value: unknown): GameState {
  if (path.length === 0) return root;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  const container = root as unknown as Record<string, unknown>;
  const next =
    rest.length === 0
      ? value
      : setAt(
          (container[String(head)] ?? {}) as GameState,
          rest,
          value,
        );
  return { ...container, [String(head)]: next } as unknown as GameState;
}

/** Immutably remove a key at a path. */
function deleteAt(root: GameState, path: readonly (string | number)[]): GameState {
  if (path.length === 0) return root;
  const container = root as unknown as Record<string, unknown>;
  const [head, ...rest] = path as [string | number, ...(string | number)[]];
  const key = String(head);
  if (rest.length === 0) {
    const copy = { ...container };
    delete copy[key];
    return copy as unknown as GameState;
  }
  const child = container[key];
  if (child === null || typeof child !== 'object') return root;
  return { ...container, [key]: deleteAt(child as GameState, rest) } as unknown as GameState;
}
