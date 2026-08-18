/**
 * Wiring a list of quests into a chain that can actually be started.
 *
 * Sixteen calls produce fifteen side chains in Aurendel, and the reason is not
 * that a chain is complicated — it is that a chain is four separate pieces of
 * bookkeeping that all have to agree, and each of them fails quietly on its
 * own:
 *
 * - Only the head is offered. Give every link a giver and the whole chain is
 *   available at once, out of order.
 * - Every later link requires the one before it. Miss one and a chain has two
 *   heads, which validates perfectly and plays as two chains.
 * - Every link but the last names the next in `unlocks`. This is what
 *   `questsAreReachable` follows; without it the tail is unreachable.
 * - The level floor goes on the head *only*. Gating every link on it would
 *   make the middle of a chain look conditional when it is not.
 *
 * None of that is checkable after the fact without knowing the author meant a
 * chain, which is exactly what this records.
 */

export interface ChainLink {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly objectives?: readonly unknown[];
  /** Anything else the quest carries; merged as written. */
  readonly [key: string]: unknown;
}

export interface ChainOptions {
  /** What the head waits on — an act gate, a flag, whatever the world uses. */
  readonly gate?: Record<string, unknown>;
  /** Who offers the head. */
  readonly giver?: string;
  /** A level floor, on the head only. */
  readonly minLevel?: number;
  /** Stamped on every quest, so a rule can assert containment. */
  readonly tags?: readonly string[];
}

/**
 * The quests, in order, wired to each other.
 *
 * Pure: it returns new objects and reads its input only. The studio shows the
 * result as a diff before writing it, because a builder that edits eight quests
 * the moment you press a button is not a tool, it is a surprise.
 */
export function buildChain(
  links: readonly ChainLink[],
  options: ChainOptions = {},
): Record<string, unknown>[] {
  return links.map((link, index) => {
    const { id, name, description, objectives, requires, unlocks, ...rest } = link as ChainLink & {
      requires?: Record<string, unknown>;
      unlocks?: readonly string[];
    };

    const wants: Record<string, unknown> = { ...(requires ?? {}) };
    const quest: Record<string, unknown> = {
      ...rest,
      id,
      name,
      description,
      objectives: objectives ?? [],
    };

    if (index === 0) {
      Object.assign(wants, options.gate ?? {});
      if (options.minLevel !== undefined) wants['minLevel'] = options.minLevel;
      if (options.giver !== undefined) quest['giver'] = options.giver;
    } else {
      const previous = links[index - 1]!.id;
      const already = Array.isArray(wants['quests']) ? (wants['quests'] as unknown[]) : [];
      wants['quests'] = [...already, { quest: previous, status: 'complete' }];
    }

    const next = links[index + 1];
    if (next) {
      const already = unlocks ?? [];
      quest['unlocks'] = already.includes(next.id) ? [...already] : [...already, next.id];
    } else if (unlocks) {
      quest['unlocks'] = [...unlocks];
    }

    if (Object.keys(wants).length > 0) quest['requires'] = wants;
    if (options.tags && options.tags.length > 0) quest['tags'] = [...options.tags];
    return quest;
  });
}

export interface ChainCheckOptions {
  /**
   * Quests outside the chain that its head may legitimately wait on.
   *
   * A side chain gated on an act opening is contained, not leaking: the ten
   * chains in Aurendel that wait on `the_open_door` or `the_undercroft` are
   * doing the intended thing. Without this the check rejects every chain in
   * the only world that has any, which is a check nobody would keep on. Passed
   * as data rather than guessed, the same way `Contract.actGateQuests` is.
   */
  readonly gates?: readonly string[];
}

/**
 * What is wrong with a set of quests that is meant to be a chain.
 *
 * The inverse of the builder, for quests that already exist — which is most of
 * them, since a chain is usually recognised after it has been written rather
 * than declared before.
 */
export function chainProblems(
  quests: readonly Record<string, unknown>[],
  options: ChainCheckOptions = {},
): string[] {
  const out: string[] = [];
  const ids = quests.map((quest) => String(quest['id']));
  const required = new Set<string>();

  for (const quest of quests) {
    const requires = quest['requires'] as { quests?: unknown[] } | undefined;
    for (const clause of requires?.quests ?? []) {
      const id = (clause as { quest?: unknown })?.quest;
      if (typeof id === 'string') required.add(id);
    }
  }

  const heads = quests.filter((quest, i) => {
    const requires = quest['requires'] as { quests?: unknown[] } | undefined;
    const waitsOnAnother = (requires?.quests ?? []).some((clause) =>
      ids.includes(String((clause as { quest?: unknown })?.quest)),
    );
    return !waitsOnAnother && i >= 0;
  });

  if (heads.length === 0) out.push('every quest waits on another — the chain has no head, so nothing starts it');
  if (heads.length > 1) {
    out.push(`${heads.length} quests wait on nothing (${heads.map((q) => String(q['id'])).join(', ')}) — a chain has one head, and this plays as ${heads.length} chains`);
  }

  for (const [i, quest] of quests.entries()) {
    const next = quests[i + 1];
    if (!next) continue;
    const unlocks = Array.isArray(quest['unlocks']) ? (quest['unlocks'] as unknown[]) : [];
    if (!unlocks.includes(next.id ?? next['id'])) {
      out.push(`${String(quest['id'])} does not unlock ${String(next['id'])} — nothing offers it, so the chain stops here`);
    }
  }

  for (const quest of heads.slice(1)) {
    if (!quest['giver'] && quest['autoStart'] !== true) {
      out.push(`${String(quest['id'])} waits on nothing and has no giver — nobody can be asked for it`);
    }
  }

  // A quest required by something but not present is the chain reaching out —
  // unless it is a declared gate, which is the chain being placed in the story.
  const gates = new Set(options.gates ?? []);
  for (const id of required) {
    if (ids.includes(id) || gates.has(id)) continue;
    out.push(`waits on ${JSON.stringify(id)}, which is neither in this chain nor a declared gate`);
  }
  return out;
}
