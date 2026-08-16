/**
 * Resolution and ordering.
 *
 * Two jobs, both of which have to be identical in the editor and the play app,
 * which is why they live here rather than in either:
 *
 *   1. Decide which declared mods are actually going to run, and say clearly
 *      why any of them are not.
 *   2. Put them in an order that is the same on every machine.
 *
 * Ordering is the subtle half. Load order changes behaviour, so it must not
 * depend on `readdir`, on insertion, or on a `Map`'s iteration — the same
 * reasoning `@dm/module/load` gives for sorting map folders before hashing.
 */

import type { LoadedMod } from './sandbox/host.js';
import { modIdentity } from './schema/manifest.js';

/** One entry from the game document's `mods` section. */
export interface ModDeclaration {
  readonly id: string;
  readonly hash: string;
  readonly target: 'engine' | 'editor';
  readonly required: boolean;
  readonly note: string;
}

export interface ModIssue {
  readonly code:
    | 'mod_missing'
    | 'mod_hash_drift'
    | 'mod_shadowed'
    | 'mod_load_cycle'
    | 'mod_replace_conflict'
    | 'mod_dependency_missing';
  readonly severity: 'error' | 'warning';
  readonly modId: string;
  readonly message: string;
}

export interface ModResolution {
  /** False only when a required mod is missing, or two required mods collide. */
  readonly ok: boolean;
  /** In final order: declaration order, then `loadAfter`. */
  readonly active: readonly LoadedMod[];
  readonly missing: readonly { id: string; hash: string; note: string }[];
  readonly drifted: readonly { id: string; want: string; found: string; note: string }[];
  readonly shadowed: readonly { id: string; hook: string; by: string }[];
  readonly disabled: readonly string[];
  readonly issues: readonly ModIssue[];
}

/**
 * Resolve a game's declared mods against what is installed.
 *
 * The two policies that matter, both decided deliberately:
 *
 *   - **A missing required mod blocks play.** The game says it needs it;
 *     pretending otherwise produces a broken session that looks like an engine
 *     bug.
 *   - **A hash mismatch warns and loads anyway.** The hash lives in a JSON file
 *     the player can edit, so a hard block teaches people to edit the hash
 *     rather than to fix the mismatch. A loud warning is honest about the risk
 *     and leaves the choice where it belongs.
 */
export function resolveMods(
  declared: readonly ModDeclaration[],
  available: readonly LoadedMod[],
  isEnabled: (id: string) => boolean,
  target: 'engine' | 'editor',
): ModResolution {
  const issues: ModIssue[] = [];
  const missing: { id: string; hash: string; note: string }[] = [];
  const drifted: { id: string; want: string; found: string; note: string }[] = [];
  const disabled: string[] = [];

  const byId = new Map<string, LoadedMod[]>();
  for (const mod of available) {
    if (mod.manifest.target !== target) continue;
    const list = byId.get(mod.manifest.id);
    if (list) list.push(mod);
    else byId.set(mod.manifest.id, [mod]);
  }

  const forTarget = declared.filter((entry) => entry.target === target);
  const chosen: { mod: LoadedMod; declaredAt: number; required: boolean }[] = [];

  forTarget.forEach((entry, index) => {
    const candidates = byId.get(entry.id) ?? [];
    if (candidates.length === 0) {
      missing.push({ id: entry.id, hash: entry.hash, note: entry.note });
      issues.push({
        code: 'mod_missing',
        severity: entry.required ? 'error' : 'warning',
        modId: entry.id,
        message: entry.required
          ? `required mod ${entry.id}-${entry.hash} is not installed${entry.note ? ` — ${entry.note}` : ''}`
          : `optional mod ${entry.id}-${entry.hash} is not installed, so it is off`,
      });
      return;
    }

    // Prefer the exact pinned build; several versions of one mod can sit side
    // by side because the folder name carries the hash.
    const exact = candidates.find((c) => c.hash === entry.hash);
    const mod = exact ?? candidates[0]!;

    if (!exact) {
      drifted.push({ id: entry.id, want: entry.hash, found: mod.hash, note: entry.note });
      issues.push({
        code: 'mod_hash_drift',
        severity: 'warning',
        modId: entry.id,
        message:
          `${entry.id} was authored against ${entry.hash} but ${mod.hash} is installed. ` +
          `Loading anyway — behaviour may differ from what the game expects.` +
          (entry.note ? ` ${entry.note}` : ''),
      });
    }

    // Required mods are forced on: the toggle is not consulted at all.
    if (!entry.required && !isEnabled(entry.id)) {
      disabled.push(entry.id);
      return;
    }

    chosen.push({ mod, declaredAt: index, required: entry.required });
  });

  for (const entry of chosen) {
    for (const dependency of entry.mod.manifest.dependencies) {
      const satisfied = chosen.some(
        (c) =>
          c.mod.manifest.id === dependency.id &&
          (dependency.hash === undefined || c.mod.hash === dependency.hash),
      );
      if (!satisfied) {
        issues.push({
          code: 'mod_dependency_missing',
          severity: entry.required ? 'error' : 'warning',
          modId: entry.mod.manifest.id,
          message: `${entry.mod.manifest.id} needs ${dependency.id}${dependency.hash ? `-${dependency.hash}` : ''}, which is not active`,
        });
      }
    }
  }

  const ordered = orderMods(chosen, issues);
  const shadowed = resolveReplaceConflicts(ordered, chosen, issues);
  const active = ordered.filter((mod) => !shadowed.some((s) => s.id === mod.manifest.id && s.whole));

  const ok = !issues.some((issue) => issue.severity === 'error');
  return {
    ok,
    active,
    missing,
    drifted,
    shadowed: shadowed.map(({ id, hook, by }) => ({ id, hook, by })),
    disabled,
    issues,
  };
}

/**
 * Deterministic order.
 *
 * Base sequence is the order the game document declares, because that is
 * stable across machines, is part of the module hash, and is something an
 * author can *fix* by reordering. Ties break on the mod id, bytewise.
 *
 * `loadAfter` is then applied as a stable topological sort seeded by that
 * sequence, so a constraint reorders only what it has to.
 */
function orderMods(
  chosen: readonly { mod: LoadedMod; declaredAt: number }[],
  issues: ModIssue[],
): readonly LoadedMod[] {
  const base = [...chosen].sort((a, b) => {
    if (a.declaredAt !== b.declaredAt) return a.declaredAt - b.declaredAt;
    const idA = a.mod.manifest.id;
    const idB = b.mod.manifest.id;
    return idA < idB ? -1 : idA > idB ? 1 : 0;
  });

  const present = new Set(base.map((entry) => entry.mod.manifest.id));
  const indegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const entry of base) {
    indegree.set(entry.mod.manifest.id, 0);
  }
  for (const entry of base) {
    for (const before of entry.mod.manifest.loadAfter) {
      if (!present.has(before)) continue; // not active: nothing to order against
      indegree.set(entry.mod.manifest.id, (indegree.get(entry.mod.manifest.id) ?? 0) + 1);
      const list = dependents.get(before);
      if (list) list.push(entry.mod.manifest.id);
      else dependents.set(before, [entry.mod.manifest.id]);
    }
  }

  const byIdOrder = new Map(base.map((entry, i) => [entry.mod.manifest.id, i]));
  const modById = new Map(base.map((entry) => [entry.mod.manifest.id, entry.mod]));

  // Kahn, always taking the earliest still-available id in the base sequence,
  // which is what makes the result stable rather than merely valid.
  const ready = base.filter((e) => (indegree.get(e.mod.manifest.id) ?? 0) === 0).map((e) => e.mod.manifest.id);
  const out: LoadedMod[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => (byIdOrder.get(a) ?? 0) - (byIdOrder.get(b) ?? 0));
    const next = ready.shift()!;
    out.push(modById.get(next)!);
    for (const dependent of dependents.get(next) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  if (out.length !== base.length) {
    const stuck = base.map((e) => e.mod.manifest.id).filter((id) => !out.some((m) => m.manifest.id === id));
    issues.push({
      code: 'mod_load_cycle',
      severity: 'error',
      modId: stuck[0] ?? '',
      message: `loadAfter cycle between ${stuck.join(' -> ')} — one of them has to give`,
    });
    // Fall back to the base order so callers still get something sensible to
    // show; `ok` is already false.
    return base.map((entry) => entry.mod);
  }

  return out;
}

/**
 * Two mods replacing the same hook.
 *
 * Highest priority wins, then the earlier of the deterministic order. The loser
 * is reported rather than silently skipped — a mod that quietly did nothing is
 * the single most confusing outcome for a player.
 *
 * The exception is two *required* mods claiming the same replace: the game
 * insists on both, and silently picking one is worse than saying so.
 */
function resolveReplaceConflicts(
  ordered: readonly LoadedMod[],
  chosen: readonly { mod: LoadedMod; required: boolean }[],
  issues: ModIssue[],
): readonly { id: string; hook: string; by: string; whole: boolean }[] {
  const requiredIds = new Set(chosen.filter((c) => c.required).map((c) => c.mod.manifest.id));
  const winners = new Map<string, { id: string; priority: number; at: number }>();
  const shadowed: { id: string; hook: string; by: string; whole: boolean }[] = [];

  ordered.forEach((mod, at) => {
    for (const decl of mod.manifest.hooks) {
      if (decl.mode !== 'replace') continue;
      const key = `${decl.hook} ${decl.match ?? ''}`;
      const current = winners.get(key);
      if (!current) {
        winners.set(key, { id: mod.manifest.id, priority: decl.priority, at });
        continue;
      }

      const bothRequired = requiredIds.has(current.id) && requiredIds.has(mod.manifest.id);
      if (bothRequired) {
        issues.push({
          code: 'mod_replace_conflict',
          severity: 'error',
          modId: mod.manifest.id,
          message:
            `${current.id} and ${mod.manifest.id} both replace ${decl.hook}${decl.match ? `:${decl.match}` : ''}, ` +
            `and the game requires both. One of them has to be optional.`,
        });
        continue;
      }

      const incumbentWins =
        current.priority > decl.priority || (current.priority === decl.priority && current.at < at);
      const loser = incumbentWins ? mod.manifest.id : current.id;
      const winner = incumbentWins ? current.id : mod.manifest.id;
      if (!incumbentWins) winners.set(key, { id: mod.manifest.id, priority: decl.priority, at });

      shadowed.push({ id: loser, hook: decl.hook, by: winner, whole: false });
      issues.push({
        code: 'mod_shadowed',
        severity: 'warning',
        modId: loser,
        message: `${loser}'s replacement of ${decl.hook} is shadowed by ${winner}`,
      });
    }
  });

  return shadowed;
}

/** `<id>-<hash>` for every active mod, sorted — what a save records. */
export function activeModIdentities(active: readonly LoadedMod[]): readonly string[] {
  return active.map((mod) => modIdentity({ id: mod.manifest.id, hash: mod.hash })).sort();
}
