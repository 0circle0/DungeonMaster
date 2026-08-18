/**
 * Composing the conversation shapes that make up most of a world's dialogue.
 *
 * 211 calls to three functions produce most of Aurendel's 105 dialogues, and
 * the reason is not that a conversation is long — it is that each of these is
 * a fixed arrangement of an option, two nodes, a check and a way back, and
 * every one of them has a trap in it that the schema cannot see.
 *
 * ## The trap
 *
 * **`option.effects` run before `option.check`, and regardless of it.** So a
 * `learnLore` on the option teaches the clue on a *failed* roll too, and a
 * `grantItem` hands the item over to someone who was refused. The payload
 * belongs on the success node's `onEnter`, and nowhere else.
 *
 * A dialogue that gets this wrong validates perfectly, compiles, and plays as
 * a conversation where failing a persuasion check costs nothing — which reads
 * as generosity rather than as a bug, and is the reason these ship as code
 * instead of as a shape an author assembles by hand.
 *
 * Each function returns the option and the nodes separately, because that
 * separation *is* the fix.
 */

import { standingDc } from './standing.js';

export interface Voice {
  /** "Go on." — leaving a told clue. */
  readonly goOn: string;
  /** "Leave it." — leaving a refusal. */
  readonly leaveIt: string;
  /** What they say when they will not tell you. */
  readonly rumourRefused: string;
  /** "Thank you." — leaving a gift. */
  readonly thanks: string;
  /** What they say when they will not hand it over. */
  readonly favourRefused: string;
}

export interface Fragment {
  /** Goes in the greeting node's `options`. */
  readonly option: Record<string, unknown>;
  /** Go in the dialogue's `nodes`. */
  readonly nodes: readonly Record<string, unknown>[];
}

interface Common {
  /** Prefixes every id this makes, so two fragments cannot collide. */
  readonly key: string;
  /** What the party says to ask. */
  readonly ask: string;
  readonly voice: Voice;
  readonly skill?: string;
  readonly base?: number;
  /** When set, the check moves with standing in this faction. */
  readonly faction?: string;
  readonly span?: number;
  /** Standing lost on a refusal. */
  readonly cost?: number;
  /** Where both outcomes return to. */
  readonly back?: string;
  /** Merged into the option's gate. */
  readonly requires?: Record<string, unknown>;
  readonly refused?: string;
}

const NO_HINT = { onceOnly: false, showWhenLocked: false, lockedHint: '' };

/** The flag that says a key item was given rather than taken off the body. */
export function givenFlag(itemId: string): string {
  return `given:${itemId}`;
}

/** Merge a caller's requirements into a gate, unioning the `without` lists. */
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
    // Empty, and that is the point: anything here would run before the check
    // and on a failure too.
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
 * A clue somebody has, behind a roll their opinion of you moves.
 *
 * Gated `without: {lore: [id]}`, which is what makes the option disappear once
 * you know — an NPC who keeps offering to tell you a thing you already know is
 * a menu, not a person.
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
        // Here, not on the option. This is the whole reason for the shape.
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
 * Asking somebody for the thing they are holding.
 *
 * Gated on not already having it and on the gift not already having been made
 * — never on standing. The roll gets harder as they like you less and there is
 * no floor below which asking stops being possible, because the other route
 * (taking it off the body) is always open and costs more than a roll.
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
          // So a gift already made cannot be looted a second time off the
          // corpse: ask politely, then kill them, and you would have two.
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
 * Something they will simply tell you, with no roll.
 *
 * The same shape minus the check, so the payload still lands on a node rather
 * than the option — an author who later adds a roll does not have to know to
 * move it.
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
