/** Wiring a list of quests into a chain that can actually be started. */

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

/** The quests, in order, wired to each other. */
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
  /** Quests outside the chain that its head may legitimately wait on. */
  readonly gates?: readonly string[];
}

/** What is wrong with a set of quests that is meant to be a chain. */
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

  // A required quest that is absent is the chain reaching out, unless it is a declared gate.
  const gates = new Set(options.gates ?? []);
  for (const id of required) {
    if (ids.includes(id) || gates.has(id)) continue;
    out.push(`waits on ${JSON.stringify(id)}, which is neither in this chain nor a declared gate`);
  }
  return out;
}
