/**
 * Contracts the schema cannot see.
 *
 * `validate` proves a document is well-formed and that every declared reference resolves. Three
 * things in this format fail at play time rather than at load time, and a module carrying any of
 * them passes every existing check:
 *
 * - `objective.target` is a plain id, not a `ref()`, because a `reach` target may be a point of
 *   interest, a map, a trigger or a gate. A `kill` objective naming a monster that does not exist
 *   compiles clean and never completes.
 * - Flags are free strings. `sisters_restord` and `sisters_restored` both validate; the quest
 *   waiting on the second hangs forever.
 * - Per-quest validity is not reachability. Every quest can be individually fine while nothing
 *   offers half of them.
 *
 * The structure mirrors `modules/shared/dmkit/lint.py`: a `Context` that indexes once and shares
 * its derived sets, a `Contract` of the few facts a shared checker cannot know, and a caller-owned
 * list of rules, because the order of the list is the order of the report.
 *
 * A rule is data. It carries what it reads, so the incremental validator can skip it, and why it
 * exists, so the studio can explain itself.
 */

import type { CollectionPath } from '../schema/module.js';
import type { Diagnostic, Severity } from './lint.js';

/**
 * The few facts about a particular module that no shared checker can know, passed as data rather
 * than guessed.
 */
export interface Contract {
  /** Quests that gate an act, so a chain waiting on one is contained. */
  readonly actGateQuests?: readonly string[];
  /** Factions that are deliberately inert, so silence about them is correct. */
  readonly exemptFactions?: readonly string[];
  /** Collections whose entries are reached without a static reference. */
  readonly reachedIndirectly?: readonly string[];
}

export interface Rule {
  readonly code: string;
  readonly title: string;
  /** Why this matters, in a sentence an author can act on. */
  readonly why: string;
  readonly severity: Severity;
  /** What it reads. Metadata for scoping, and documentation either way. */
  readonly reads: readonly CollectionPath[];
  run(ctx: RuleContext): void;
}

type Entry = Record<string, unknown>;

/** What each objective kind's `target` should resolve against. */
const TARGET_COLLECTION: Readonly<Record<string, readonly string[]>> = {
  kill: ['content.monsters'],
  collect: ['content.items'],
  talk: ['content.npcs'],
  // A `reach` target may be any of these, which is why the schema cannot mark it as a reference.
  reach: ['world.pointsOfInterest', 'world.areas', 'world.dungeons', 'world.gates'],
  custom: [],
};

function asList(value: unknown): Entry[] {
  return Array.isArray(value) ? (value as Entry[]) : [];
}

function collectionOf(doc: Entry, path: string): Entry[] {
  const [section, name] = path.split('.') as [string, string];
  const container = doc[section];
  if (typeof container !== 'object' || container === null) return [];
  return asList((container as Entry)[name]);
}

function idsOf(doc: Entry, path: string): Set<string> {
  return new Set(collectionOf(doc, path).map((entry) => String(entry['id'] ?? '')));
}

/** Walk anything, calling back for each object that carries `key`. */
function walkFor(node: unknown, key: string, seen: (value: unknown, path: string) => void, path = '', depth = 0): void {
  if (depth > 40 || typeof node !== 'object' || node === null) return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkFor(item, key, seen, `${path}.${i}`, depth + 1));
    return;
  }
  for (const [k, child] of Object.entries(node as Entry)) {
    const childPath = path ? `${path}.${k}` : k;
    if (k === key) seen(child, childPath);
    walkFor(child, key, seen, childPath, depth + 1);
  }
}

/**
 * The document, indexed once, with the derived sets every rule wants. Built before any rule runs,
 * because half of them ask the same questions and computing per rule would be slower and a place
 * for two rules to disagree.
 */
export class RuleContext {
  readonly doc: Entry;
  readonly contract: Contract;
  private readonly out: Diagnostic[] = [];

  readonly quests: readonly Entry[];
  readonly npcs: readonly Entry[];
  readonly dialogues: readonly Entry[];

  /** Flags something writes, and flags something waits on. */
  readonly flagWrites = new Set<string>();
  readonly flagReads = new Map<string, string>();
  /**
   * Flags read at least once positively. A flag read only under `without` fails the opposite way
   * when nothing sets it: the gate never closes rather than never opening.
   */
  readonly positiveFlagReads = new Set<string>();

  /** Quests a player can actually arrive at, transitively through `unlocks`. */
  readonly startable = new Set<string>();

  /** Monsters some referenced encounter table can produce. */
  readonly spawnable = new Set<string>();

  /** Dialogues something names. `talk` is the only way into one. */
  readonly ownedDialogues = new Set<string>();

  /**
   * Flags whose every writer sits inside a dialogue no NPC owns. Distinct from a flag nothing
   * writes: `flag_never_set` is correctly silent because the writer is in the file, but there is no
   * way to reach the prose that runs it.
   */
  readonly strandedFlags = new Set<string>();

  /**
   * Trigger ids, which a `reach` objective may name. On the context rather than in the rule because
   * it means walking the whole document, and the rule asks per objective.
   */
  readonly triggerIds = new Set<string>();

  constructor(doc: Entry, contract: Contract = {}) {
    this.doc = doc;
    this.contract = contract;
    this.quests = collectionOf(doc, 'narrative.quests');
    this.npcs = collectionOf(doc, 'content.npcs');
    this.dialogues = collectionOf(doc, 'narrative.dialogues');

    this.collectFlags();
    this.collectStartable();
    this.collectSpawnable();
    this.collectOwnedDialogues();
    this.collectStranded();
    walkFor(doc, 'triggers', (value) => {
      for (const trigger of asList(value)) {
        if (typeof trigger['id'] === 'string') this.triggerIds.add(trigger['id']);
      }
    });
  }

  report(rule: Rule, path: string, message: string, hint: string | null = null): void {
    this.out.push({
      severity: rule.severity,
      code: rule.code,
      path,
      message,
      hint,
      position: null,
      excerpt: null,
    });
  }

  diagnostics(): readonly Diagnostic[] {
    return this.out;
  }

  /**
   * Both spellings: the DSL's `flags.x` path, and a requirement's `flag`. What is recorded is where
   * the read is, not what it reads, so a report entry points at a place in the document.
   */
  private collectFlags(): void {
    walkFor(this.doc, 'setFlag', (value) => {
      const flag = (value as Entry | null)?.['flag'];
      if (typeof flag === 'string') this.flagWrites.add(flag);
    });

    walkFor(this.doc, 'ref', (value, path) => {
      if (typeof value === 'string' && value.startsWith('flags.')) {
        const flag = value.slice('flags.'.length);
        if (!this.flagReads.has(flag)) this.flagReads.set(flag, path);
        if (!negated(path)) this.positiveFlagReads.add(flag);
      }
    });
    walkFor(this.doc, 'flags', (value, path) => {
      for (const clause of asList(value)) {
        const flag = clause['flag'];
        if (typeof flag !== 'string') continue;
        if (!this.flagReads.has(flag)) this.flagReads.set(flag, path);
        if (!negated(path)) this.positiveFlagReads.add(flag);
      }
    });
  }

  /**
   * A quest is startable if a player can be offered it, or if something startable unlocks it. Five
   * ways in, mirroring the engine.
   */
  private collectStartable(): void {
    const byId = new Map(this.quests.map((quest) => [String(quest['id']), quest]));

    const emitted = new Set<string>();
    walkFor(this.doc, 'emit', (value) => {
      const emit = value as Entry | null;
      if (emit?.['event'] !== 'startQuest') return;
      const quest = (emit['data'] as Entry | undefined)?.['quest'];
      if (typeof quest === 'string') emitted.add(quest);
    });

    const offered = new Set<string>();
    for (const npc of this.npcs) {
      for (const quest of asList(npc['offersQuests'])) offered.add(String(quest));
    }

    const frontier: string[] = [];
    for (const quest of this.quests) {
      const id = String(quest['id']);
      if (quest['autoStart'] === true || quest['giver'] || emitted.has(id) || offered.has(id)) {
        frontier.push(id);
      }
    }

    // Transitive closure over `unlocks`, which is how a chain is reached.
    while (frontier.length > 0) {
      const id = frontier.pop()!;
      if (this.startable.has(id)) continue;
      this.startable.add(id);
      for (const next of asList(byId.get(id)?.['unlocks'])) {
        if (typeof next === 'string' && !this.startable.has(next)) frontier.push(next);
      }
    }
  }

  /**
   * A monster is spawnable only through a table something actually draws from. A table nothing
   * references is invisible to the world, so a `kill` objective naming a creature that only appears
   * there can never be completed.
   */
  private collectSpawnable(): void {
    const referenced = new Set<string>();
    walkFor(this.doc, 'encounterTables', (value) => {
      for (const table of asList(value)) if (typeof table === 'string') referenced.add(table);
    });
    walkFor(this.doc, 'bossTable', (value) => {
      if (typeof value === 'string') referenced.add(value);
    });

    for (const table of collectionOf(this.doc, 'world.encounterTables')) {
      if (!referenced.has(String(table['id']))) continue;
      walkFor(table, 'monster', (value) => {
        if (typeof value === 'string') this.spawnable.add(value);
      });
    }
  }

  /**
   * One walk, sorting each write by whether it is inside an unreachable dialogue. A flag is
   * stranded only if nothing else writes it, so the two sets are collected together and subtracted.
   */
  private collectStranded(): void {
    const unowned = new Set<number>();
    this.dialogues.forEach((dialogue, i) => {
      if (!this.ownedDialogues.has(String(dialogue['id']))) unowned.add(i);
    });
    if (unowned.size === 0) return;

    const stranded = new Set<string>();
    const live = new Set<string>();
    walkFor(this.doc, 'setFlag', (value, path) => {
      const flag = (value as Entry | null)?.['flag'];
      if (typeof flag !== 'string') return;
      const inDialogue = /^narrative\.dialogues\.(\d+)\./.exec(path);
      const isStranded = inDialogue !== null && unowned.has(Number(inDialogue[1]));
      (isStranded ? stranded : live).add(flag);
    });
    for (const flag of stranded) if (!live.has(flag)) this.strandedFlags.add(flag);
  }

  private collectOwnedDialogues(): void {
    walkFor(this.doc, 'dialogue', (value) => {
      if (typeof value === 'string') this.ownedDialogues.add(value);
    });
  }

  ids(path: string): Set<string> {
    return idsOf(this.doc, path);
  }

  /** Every objective in a quest, stages included, with where it lives. */
  objectivesOf(quest: Entry, questIndex: number): { objective: Entry; path: string }[] {
    const out: { objective: Entry; path: string }[] = [];
    asList(quest['objectives']).forEach((objective, i) => {
      out.push({ objective, path: `narrative.quests.${questIndex}.objectives.${i}` });
    });
    asList(quest['stages']).forEach((stage, s) => {
      asList(stage['objectives']).forEach((objective, i) => {
        out.push({ objective, path: `narrative.quests.${questIndex}.stages.${s}.objectives.${i}` });
      });
    });
    return out;
  }
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

export const objectiveTargetsResolve: Rule = {
  code: 'objective_target_missing',
  title: 'Objective targets resolve',
  why:
    'An objective target is a plain id rather than a reference, because a `reach` target ' +
    'may be a place, a map, a trigger or a gate. Nothing checks it, so a typo compiles ' +
    'cleanly and the objective simply never completes.',
  severity: 'warning',
  reads: ['narrative.quests', 'content.monsters', 'content.items', 'content.npcs'],
  run(ctx) {
    const cache = new Map<string, Set<string>>();
    const known = (path: string): Set<string> => {
      let ids = cache.get(path);
      if (!ids) {
        ids = ctx.ids(path);
        cache.set(path, ids);
      }
      return ids;
    };

    ctx.quests.forEach((quest, questIndex) => {
      for (const { objective, path } of ctx.objectivesOf(quest, questIndex)) {
        const kind = String(objective['kind'] ?? 'custom');
        const target = objective['target'];
        const collections = TARGET_COLLECTION[kind];
        if (!collections || collections.length === 0 || typeof target !== 'string') continue;

        // `reach` may name a trigger, which lives inside a point of interest rather than in a
        // collection of its own.
        const found =
          collections.some((collection) => known(collection).has(target)) ||
          (kind === 'reach' && ctx.triggerIds.has(target));
        if (found) continue;

        ctx.report(
          this,
          `${path}.target`,
          `${JSON.stringify(target)} is not ${
            kind === 'reach' ? 'a place, dungeon, gate or trigger' : `in ${collections.join(' or ')}`
          }, so this objective can never complete`,
          'Objective targets are not checked by the schema — the id has to be right by hand.',
        );
      }
    });
  },
};

/**
 * Flags the engine writes, which no module will be seen setting.
 *
 * The engine keeps its own records in the same flag space under computed names — a trigger that has
 * fired, a place that has been found, a door that has been opened — and content may read them.
 *
 * Prefixes rather than names, because the second half is an id. Kept honest by `rules.test.ts`,
 * which greps the engine for each one.
 */
export const ENGINE_FLAG_PREFIXES = [
  'trigger:',
  'found:',
  'gate:',
  'spoils:',
  'unique:',
  'detect:',
  'ending:',
  'concentration:',
  'seen:',
] as const;

function engineWritten(flag: string): boolean {
  return ENGINE_FLAG_PREFIXES.some((prefix) => flag.startsWith(prefix));
}

export const flagsHaveWriters: Rule = {
  code: 'flag_never_set',
  title: 'Every flag waited on is set by something',
  why:
    'Flags are free strings, so a misspelling validates perfectly and the thing waiting ' +
    'on it waits forever.',
  severity: 'warning',
  reads: ['narrative.quests', 'narrative.dialogues', 'world.pointsOfInterest'],
  run(ctx) {
    for (const [flag, path] of ctx.flagReads) {
      if (ctx.flagWrites.has(flag)) continue;
      if (engineWritten(flag)) continue;
      const name = JSON.stringify(flag);
      ctx.report(
        this,
        path,
        ctx.positiveFlagReads.has(flag)
          ? `nothing ever sets the flag ${name}, so whatever waits on it never comes true`
          : `nothing ever sets the flag ${name}, and it is only ever checked for absence — ` +
            'so that gate is always open',
        nearest(flag, [...ctx.flagWrites]),
      );
    }
  },
};

/**
 * Separate from `flag_never_set` rather than folded into it: the two look alike in a report and are
 * opposite to fix — one is a name nobody wrote, the other is prose nobody can open.
 */
export const flagWritersCanRun: Rule = {
  code: 'flag_writer_unreachable',
  title: 'The thing that sets a flag can be reached',
  why:
    'A flag whose only writer is inside a dialogue no NPC owns has a writer that never ' +
    'runs. The flag is in the file, so searching for it finds it and every other check ' +
    'stays quiet, and the objective waiting on it can never complete.',
  severity: 'warning',
  reads: ['narrative.quests', 'narrative.dialogues', 'content.npcs'],
  run(ctx) {
    for (const [flag, path] of ctx.flagReads) {
      if (!ctx.strandedFlags.has(flag)) continue;
      ctx.report(
        this,
        path,
        `the flag ${JSON.stringify(flag)} is only ever set inside a dialogue no NPC owns, ` +
          'so nothing can reach the thing that sets it',
        'give that dialogue an owner, or set the flag somewhere reachable',
      );
    }
  },
};

/**
 * A road is a thing between two places, and the format stores it twice.
 *
 * `connections` is per area, so a road from A to B is one entry in A and another in B, and nothing
 * makes the second follow from the first.
 *
 * The failure is quiet: the party walks somewhere and cannot walk back, which reads as design
 * rather than as a missing line. `oneWay` says it was meant.
 */
export const roadsAreTwoWay: Rule = {
  code: 'road_is_one_sided',
  title: 'Roads go both ways unless they say otherwise',
  why:
    'A connection lives on the area it leaves from, so the return trip is a separate entry ' +
    'that nothing requires. A missing one is indistinguishable from a deliberate one-way road, ' +
    'except to whoever walks it.',
  severity: 'warning',
  reads: ['world.areas'],
  run(ctx) {
    const areas = collectionOf(ctx.doc, 'world.areas');
    const byId = new Map(areas.map((area) => [String(area['id']), area]));

    for (const [i, area] of areas.entries()) {
      const from = String(area['id']);
      for (const [j, road] of asList(area['connections']).entries()) {
        if (road['oneWay'] === true) continue;
        const to = String(road['to']);
        const far = byId.get(to);
        // A road to somewhere that does not exist is a dangling reference the compiler has already
        // reported.
        if (!far) continue;
        const returns = asList(far['connections']).some((back) => String(back['to']) === from);
        if (returns) continue;
        ctx.report(
          this,
          `world.areas.${i}.connections.${j}`,
          `${JSON.stringify(from)} has a road to ${JSON.stringify(to)}, but ${JSON.stringify(to)} has none back`,
          `add the return road to ${JSON.stringify(to)}, or mark this one oneWay if it is meant`,
        );
      }
    }
  },
};

/**
 * The engine runs an option's effects before its check, and regardless of the result, so anything
 * given away from `option.effects` is given away on a failed roll too.
 */
const GRANTS = ['learnLore', 'grantItem', 'grantXp', 'setFlag', 'startQuest', 'completeQuest'];

export const effectsRunBeforeChecks: Rule = {
  code: 'effect_before_check',
  title: 'Nothing is given away before the roll that decides it',
  why:
    "An option's effects run before its check and whether or not it passes, so a reward on " +
    'the option is handed over on a failure too. It belongs on the success node, which is ' +
    'reached only when the roll passes.',
  severity: 'warning',
  reads: ['narrative.dialogues'],
  run(ctx) {
    for (const [d, dialogue] of collectionOf(ctx.doc, 'narrative.dialogues').entries()) {
      for (const [n, node] of asList(dialogue['nodes']).entries()) {
        for (const [o, option] of asList(node['options']).entries()) {
          const check = option['check'];
          if (typeof check !== 'object' || check === null) continue;
          for (const [e, effect] of asList(option['effects']).entries()) {
            const kind = Object.keys(effect).find((key) => GRANTS.includes(key));
            if (!kind) continue;
            const success = (check as Entry)['onSuccess'];
            ctx.report(
              this,
              `narrative.dialogues.${d}.nodes.${n}.options.${o}.effects.${e}`,
              `this option rolls ${JSON.stringify((check as Entry)['skill'] ?? 'a check')} and ` +
                `runs ${JSON.stringify(kind)} either way — failing the roll costs nothing`,
              typeof success === 'string'
                ? `move it to the onEnter of ${JSON.stringify(success)}`
                : 'move it to the onEnter of the node the check succeeds into',
            );
          }
        }
      }
    }
  },
};

/**
 * A hidden place needs a `discover`: without it there is no check to make, so the place is
 * unreachable rather than hidden.
 */
export const hiddenPlacesCanBeFound: Rule = {
  code: 'hidden_place_unfindable',
  title: 'A hidden place has a way of being found',
  why:
    '`hidden` takes a place off the list of what is here. `discover` is the check that puts ' +
    'it back. A place with the first and not the second cannot be arrived at by any route.',
  severity: 'warning',
  reads: ['world.pointsOfInterest'],
  run(ctx) {
    for (const [i, poi] of collectionOf(ctx.doc, 'world.pointsOfInterest').entries()) {
      if (poi['hidden'] !== true || poi['discover'] !== undefined) continue;
      ctx.report(
        this,
        `world.pointsOfInterest.${i}`,
        `${JSON.stringify(String(poi['id']))} is hidden and has no way of being discovered`,
        'give it a `discover` check, or stop hiding it',
      );
    }
  },
};

/**
 * The difficulty of finding a hidden place usually falls as the party collects a thread's clues,
 * linked by a `threads.<id>.known` reference inside the formula. It is the only such link; nothing
 * records a thread's anchors anywhere else.
 *
 * A misspelling there is silent: the reference reads as nothing, the difficulty never falls, and
 * the place stays at its hardest check.
 */
export const discoverNamesAThread: Rule = {
  code: 'discover_names_no_thread',
  title: 'A discovery formula names a thread that exists',
  why:
    'The only thing tying a hidden place to the clues that reveal it is a `threads.<id>.known` ' +
    'reference inside its difficulty. A name that matches no thread never changes, so the ' +
    'place stays at its hardest and no amount of investigation helps.',
  severity: 'warning',
  reads: ['world.pointsOfInterest', 'narrative.loreThreads'],
  run(ctx) {
    const threads = ctx.ids('narrative.loreThreads');
    for (const [i, poi] of collectionOf(ctx.doc, 'world.pointsOfInterest').entries()) {
      const named = new Set<string>();
      walkFor(poi['discover'], 'ref', (value) => {
        if (typeof value !== 'string') return;
        const thread = /^threads\.(.+)\.known$/.exec(value)?.[1];
        if (thread) named.add(thread);
      });
      for (const thread of named) {
        if (threads.has(thread)) continue;
        ctx.report(
          this,
          `world.pointsOfInterest.${i}.discover`,
          `${JSON.stringify(String(poi['id']))} gets easier to find as ${JSON.stringify(thread)} ` +
            'fills, and there is no such thread — so it never gets easier',
          nearest(thread, [...threads]),
        );
      }
    }
  },
};

export const questsAreReachable: Rule = {
  code: 'quest_unreachable',
  title: 'Every quest can be arrived at',
  why:
    'A quest with no giver, not offered by anyone, not auto-starting, not unlocked and not ' +
    'started by any effect is content nobody can reach — which each quest being individually ' +
    'valid does nothing to catch.',
  severity: 'warning',
  reads: ['narrative.quests', 'content.npcs'],
  run(ctx) {
    ctx.quests.forEach((quest, index) => {
      const id = String(quest['id']);
      if (ctx.startable.has(id)) return;
      ctx.report(
        this,
        `narrative.quests.${index}`,
        `nothing can start ${JSON.stringify(id)}: no giver offers it, nothing unlocks it, and no effect emits it`,
        'A giver is a label; what puts the job in front of a player is that NPC’s offersQuests.',
      );
    });
  },
};

export const killTargetsCanSpawn: Rule = {
  code: 'kill_target_never_spawns',
  title: 'Kill targets can appear',
  why:
    'A creature that exists in the content but that no referenced encounter table produces ' +
    'is never on any map, so the objective naming it cannot be completed by playing.',
  severity: 'warning',
  reads: ['narrative.quests', 'content.monsters', 'world.encounterTables'],
  run(ctx) {
    ctx.quests.forEach((quest, questIndex) => {
      for (const { objective, path } of ctx.objectivesOf(quest, questIndex)) {
        if (objective['kind'] !== 'kill') continue;
        const target = objective['target'];
        if (typeof target !== 'string') continue;
        // A target that does not exist at all is the other rule's business.
        if (!ctx.ids('content.monsters').has(target)) continue;
        if (ctx.spawnable.has(target)) continue;

        ctx.report(
          this,
          `${path}.target`,
          `${JSON.stringify(target)} exists but no encounter table anything draws from can produce it`,
          'A table nothing references is invisible to the world.',
        );
      }
    });
  },
};

export const dialoguesAreReachable: Rule = {
  code: 'dialogue_unowned',
  title: 'Every dialogue can be opened',
  why: 'Talking is the only way into a dialogue, so one nothing names is prose nobody reads.',
  severity: 'warning',
  reads: ['narrative.dialogues', 'content.npcs'],
  run(ctx) {
    ctx.dialogues.forEach((dialogue, index) => {
      const id = String(dialogue['id']);
      if (ctx.ownedDialogues.has(id)) return;
      ctx.report(
        this,
        `narrative.dialogues.${index}`,
        `nothing opens ${JSON.stringify(id)} — no npc names it`,
        'Give it to an npc, or delete it.',
      );
    });
  },
};

/**
 * The order is the report, and callers own the list: a module with no quests wants a different set
 * from Aurendel.
 */
/**
 * The two halves of sense suppression name each other, and neither can be a schema reference.
 *
 * `conditions[].suppressesSenses` cannot be a `ref` because it would make the composer's `damage`
 * section depend on `movement`, which already reaches back to `damage` through `skills`;
 * `senses[].ignores` has the mirror of the same problem. So both are bare ids, and a typo in either
 * is silent.
 */
export const senseLinksResolve: Rule = {
  code: 'sense_link_dangling',
  title: 'Sense suppression names things that exist',
  why:
    'A condition names the senses it shuts off and a sense names the conditions it works ' +
    'through anyway. Neither can be checked by the schema, so a misspelling does nothing at ' +
    'all rather than failing: the blindness never lands, or the blindsight is an exception to ' +
    'nothing.',
  severity: 'warning',
  reads: ['rules.conditions', 'rules.senses'],
  run(ctx) {
    const senses = ctx.ids('rules.senses');
    const conditions = ctx.ids('rules.conditions');

    for (const [i, condition] of collectionOf(ctx.doc, 'rules.conditions').entries()) {
      for (const [j, named] of asList(condition['suppressesSenses']).entries()) {
        if (typeof named !== 'string' || senses.has(named)) continue;
        ctx.report(
          this,
          `rules.conditions.${i}.suppressesSenses.${j}`,
          `${JSON.stringify(String(condition['id']))} shuts off ${JSON.stringify(named)}, and ` +
            'there is no such sense — so it shuts off nothing',
          nearest(named, [...senses]),
        );
      }
    }

    for (const [i, sense] of collectionOf(ctx.doc, 'rules.senses').entries()) {
      for (const [j, named] of asList(sense['ignores']).entries()) {
        if (typeof named !== 'string' || conditions.has(named)) continue;
        ctx.report(
          this,
          `rules.senses.${i}.ignores.${j}`,
          `${JSON.stringify(String(sense['id']))} works through ${JSON.stringify(named)}, and ` +
            'there is no such condition — so the exception never applies',
          nearest(named, [...conditions]),
        );
      }
    }
  },
};

export const DEFAULT_RULES: readonly Rule[] = [
  objectiveTargetsResolve,
  flagsHaveWriters,
  flagWritersCanRun,
  roadsAreTwoWay,
  effectsRunBeforeChecks,
  hiddenPlacesCanBeFound,
  discoverNamesAThread,
  questsAreReachable,
  killTargetsCanSpawn,
  dialoguesAreReachable,
  senseLinksResolve,
];

export function runRules(
  doc: Entry,
  rules: readonly Rule[] = DEFAULT_RULES,
  contract: Contract = {},
): readonly Diagnostic[] {
  const ctx = new RuleContext(doc, contract);
  for (const rule of rules) rule.run(ctx);
  return ctx.diagnostics();
}

/**
 * Whether a requirement path sits under a negation. `without` is the schema's only negation for a
 * flag clause; `not` is the DSL's.
 */
function negated(path: string): boolean {
  return /(^|\.)(without|not)(\.|$)/.test(path);
}

/** "did you mean" for a flag, which is the mistake this catches most often. */
function nearest(want: string, candidates: readonly string[]): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (Math.abs(candidate.length - want.length) > 3) continue;
    let differences = 0;
    for (let i = 0; i < Math.max(candidate.length, want.length); i += 1) {
      if (candidate[i] !== want[i]) differences += 1;
    }
    if (differences < bestScore) {
      bestScore = differences;
      best = candidate;
    }
  }
  return best && bestScore <= 3 ? `did you mean ${JSON.stringify(best)}?` : null;
}
