/**
 * Build standard dialogue fragments for rumour, favour, and talk prompts.
 * Each fragment keeps the option payload on the success path so failed rolls do not grant rewards.
 */

import { standingDc } from './standing.js';

export interface Voice {
  /** Continue text after a successful clue. */
  readonly goOn: string;
  /** Continue text after a refusal. */
  readonly leaveIt: string;
  /** Refusal text for a rumour. */
  readonly rumourRefused: string;
  /** Continue text after a gift. */
  readonly thanks: string;
  /** Refusal text for a favour. */
  readonly favourRefused: string;
}

export interface Fragment {
  /** Option attached to the opening node. */
  readonly option: Record<string, unknown>;
  /** Dialogue nodes created by the fragment. */
  readonly nodes: readonly Record<string, unknown>[];
}

interface Common {
  /** Prefix used for all generated ids. */
  readonly key: string;
  /** Prompt text shown to the player. */
  readonly ask: string;
  readonly voice: Voice;
  readonly skill?: string;
  readonly base?: number;
  /** Faction used for a standing-based check. */
  readonly faction?: string;
  readonly span?: number;
  /** Reputation lost on refusal. */
  readonly cost?: number;
  /** Node both outcomes return to. */
  readonly back?: string;
  /** Extra gate requirements merged into the option. */
  readonly requires?: Record<string, unknown>;
  readonly refused?: string;
}

const NO_HINT = { onceOnly: false, showWhenLocked: false, lockedHint: '' };

/** Flag set when a key item is given instead of looted. */
export function givenFlag(itemId: string): string {
  return `given:${itemId}`;
}

/** Merge requirements into a gate, combining `without` lists. */
function mergeGate(
  gate: Record<string, unknown>,
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!extra) return gate;
  const out: Record<string, unknown> = { ...gate };
  for (const [name, value] of Object.entries(extra)) {
    if (name !== 'without') {
      out[name] = value;
      continue;
    }
    const mine = (out['without'] ?? {}) as Record<string, unknown[]>;
    const theirs = value as Record<string, unknown[]>;
    const merged: Record<string, unknown[]> = { ...mine };
    for (const [inner, entries] of Object.entries(theirs)) {
      merged[inner] = [...(mine[inner] ?? []), ...entries];
    }
    out['without'] = merged;
  }
  return out;
}

function checkedOption(
  common: Common,
  gate: Record<string, unknown>,
  onSuccess: string,
  onFailure: string,
): Record<string, unknown> {
  const base = common.base ?? 12;
  return {
    id: common.key,
    text: common.ask,
    requires: gate,
    // Effects must stay off the option; they run on the success path only.
    effects: [],
    ...NO_HINT,
    check: {
      skill: common.skill ?? 'persuasion',
      difficulty: common.faction
        ? standingDc(base, common.faction, common.span === undefined ? {} : { span: common.span })
        : base,
      onSuccess,
      onFailure,
    },
  };
}

function exit(id: string, text: string, back: string): Record<string, unknown> {
  return { id, text, goto: back, effects: [], ...NO_HINT };
}

/**
 * Offer a clue behind a persuasion check.
 * The option disappears once the party already knows the clue.
 */
export function rumour(
  common: Common & { readonly told: string; readonly clue: string },
): Fragment {
  const back = common.back ?? 'greet';
  const yes = `${common.key}_told`;
  const no = `${common.key}_wont`;
  const gate = mergeGate({ without: { lore: [common.clue] } }, common.requires);
  const cost = common.cost ?? 1;

  return {
    option: checkedOption(common, gate, yes, no),
    nodes: [
      {
        id: yes,
        says: [{ text: common.told }],
        // Keep the lore gain on the success node, not the option.
        onEnter: [{ learnLore: { entry: common.clue } }],
        options: [exit(`${common.key}_on`, common.voice.goOn, back)],
        redirectWhen: [],
      },
      {
        id: no,
        says: [{ text: common.refused ?? common.voice.rumourRefused }],
        onEnter:
          common.faction && cost
            ? [{ adjustReputation: { faction: common.faction, amount: -cost } }]
            : [],
        options: [exit(`${common.key}_drop`, common.voice.leaveIt, back)],
        redirectWhen: [],
      },
    ],
  };
}

/**
 * Offer an item behind a persuasion check.
 * The option is blocked if the party already has it or has already been gifted it.
 */
export function favour(
  common: Common & {
    readonly given: string;
    readonly item: string;
    readonly quantity?: number;
    /** Anything else handed over with it. */
    readonly extra?: readonly Record<string, unknown>[];
  },
): Fragment {
  const back = common.back ?? 'greet';
  const yes = `${common.key}_gave`;
  const no = `${common.key}_kept`;
  const gate = mergeGate(
    { without: { items: [common.item], flags: [{ flag: givenFlag(common.item) }] } },
    common.requires,
  );
  const cost = common.cost ?? 2;

  return {
    option: checkedOption({ ...common, base: common.base ?? 14 }, gate, yes, no),
    nodes: [
      {
        id: yes,
        says: [{ text: common.given }],
        onEnter: [
          { grantItem: { target: { ref: 'actor.id' }, item: common.item, quantity: common.quantity ?? 1 } },
          // Prevent a gifted item from being looted twice from the same corpse.
          { setFlag: { flag: givenFlag(common.item), value: true } },
          ...(common.extra ?? []),
        ],
        options: [exit(`${common.key}_thanks`, common.voice.thanks, back)],
        redirectWhen: [],
      },
      {
        id: no,
        says: [{ text: common.refused ?? common.voice.favourRefused }],
        onEnter:
          common.faction && cost
            ? [{ adjustReputation: { faction: common.faction, amount: -cost } }]
            : [],
        options: [exit(`${common.key}_drop`, common.voice.leaveIt, back)],
        redirectWhen: [],
      },
    ],
  };
}

/**
 * Offer a plain statement with no skill check.
 * The payload remains on the node so a later roll can be added without moving effects.
 */
export function talk(
  common: Pick<Common, 'key' | 'ask' | 'voice' | 'back' | 'requires'> & {
    readonly says: string;
    readonly clue?: string;
    readonly effects?: readonly Record<string, unknown>[];
  },
): Fragment {
  const back = common.back ?? 'greet';
  const node = `${common.key}_said`;
  const gate = mergeGate(common.clue ? { without: { lore: [common.clue] } } : {}, common.requires);

  return {
    option: {
      id: common.key,
      text: common.ask,
      ...(Object.keys(gate).length > 0 ? { requires: gate } : {}),
      effects: [],
      ...NO_HINT,
      goto: node,
    },
    nodes: [
      {
        id: node,
        says: [{ text: common.says }],
        onEnter: [
          ...(common.clue ? [{ learnLore: { entry: common.clue } }] : []),
          ...(common.effects ?? []),
        ],
        options: [exit(`${common.key}_on`, common.voice.goOn, back)],
        redirectWhen: [],
      },
    ],
  };
}
