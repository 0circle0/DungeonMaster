/**
 * Conversation.
 *
 * A dialogue is a graph whose edges are gated by the same requirement vocabulary as everything
 * else.
 *
 * Options are evaluated against what the speaker knows rather than against what is true, which is
 * what lets the same NPC greet one party warmly and turn another away.
 */

import { Rng } from '@dm/core';
import { evalEffects, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Effect, Predicate, Requirement } from '@dm/module';
import type { Entity, EntityId } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps } from '../rules/apply.js';
import { skillCheck, check, succeeded, skillModifier, difficultyFrom } from '../rules/check.js';
import { memoryScope } from './memoryscope.js';
import { npcIdOf } from '../character.js';
import { message, literal } from '../narrate/systemText.js';

interface TextVariant {
  text: string;
  when?: Predicate;
  requires?: Requirement;
  weight: number;
}

interface OptionDef {
  id: string;
  text: string;
  requires?: Requirement;
  when?: Predicate;
  showWhenLocked: boolean;
  lockedHint: string;
  check?: {
    skill: string;
    difficulty: unknown;
    opposedBy?: string;
    onSuccess?: string;
    onFailure?: string;
  };
  effects: Effect[];
  onceOnly: boolean;
  goto?: string;
}

interface NodeDef {
  id: string;
  says: TextVariant[];
  onEnter: Effect[];
  remembers?: string;
  redirectWhen: { requires: Requirement; goto: string }[];
  options: OptionDef[];
}

interface DialogueDef {
  id: string;
  start: string;
  nodes: NodeDef[];
}

export interface VisibleOption {
  readonly id: string;
  readonly text: string;
  readonly locked: boolean;
  readonly hint: string;
}

/**
 * The scope a conversation is judged in. `memory.speaker.<deedKind>` is filled from what this NPC
 * knows, which is how `memories` requirements in dialogue work.
 */
function conversationScope(txn: Transaction, actor: Entity, speaker: Entity) {
  return buildScope(txn.module, txn.state, actor, {
    speaker: { id: speaker.id, name: speaker.name } as never,
    // `buildScope` supplies `memory` keyed on the actor, but in a conversation `speaker` has to
    // mean the person being talked to, so this rebuilds it around them — with `anyone`, `party` and
    // `faction` all properly populated.
    memory: memoryScope(txn.module, txn.state, speaker) as never,
  });
}

function passes(
  requirement: Requirement | undefined,
  when: Predicate | undefined,
  scope: ReturnType<typeof conversationScope>,
  rng: Rng,
): boolean {
  if (!isEmptyRequirement(requirement)) {
    if (!evalPredicate(compileRequirement(requirement), { scope, rng, openNamespaces: OPEN_NAMESPACES })) return false;
  }
  if (when && !evalPredicate(when, { scope, rng, openNamespaces: OPEN_NAMESPACES })) return false;
  return true;
}

/** Pick a line, weighted, from the variants whose conditions hold. */
function pickLine(
  variants: readonly TextVariant[],
  scope: ReturnType<typeof conversationScope>,
  rng: Rng,
): string {
  const eligible = variants.filter((variant) => passes(variant.requires, variant.when, scope, rng));
  const pool = eligible.length > 0 ? eligible : variants;
  if (pool.length === 0) return '';
  return rng.weightedPick(pool, (variant) => variant.weight ?? 1).text;
}

/** Begin a conversation with an NPC. */
export function startDialogue(
  txn: Transaction,
  actor: Entity,
  speaker: Entity,
  rng: Rng,
): boolean {
  const npc = txn.module.find<{ dialogue?: string }>('content.npcs', npcIdOf(speaker));
  const dialogueId = npc?.dialogue;
  if (!dialogueId) {
    txn.emit({ type: 'refused', action: 'talk', reason: message('refused.talk.nothingToSay', { who: speaker.name }) });
    return false;
  }

  const dialogue = txn.module.find<DialogueDef>('narrative.dialogues', dialogueId);
  if (!dialogue) {
    txn.emit({ type: 'refused', action: 'talk', reason: message('refused.talk.unknownDialogue', { dialogue: dialogueId }) });
    return false;
  }

  txn.set({
    ...txn.state,
    dialogue: { npc: speaker.id, dialogue: dialogueId, node: dialogue.start, taken: [] },
  });
  txn.emit({ type: 'dialogueStarted', npc: speaker.id, dialogue: dialogueId });

  enterNode(txn, dialogue.start, actor, speaker, rng);
  return true;
}

/** Move to a node, following any redirect whose requirement holds. */
function enterNode(
  txn: Transaction,
  nodeId: string,
  actor: Entity,
  speaker: Entity,
  rng: Rng,
): void {
  const conversation = txn.state.dialogue;
  if (!conversation) return;

  const dialogue = txn.module.find<DialogueDef>('narrative.dialogues', conversation.dialogue);
  const start: NodeDef | undefined = dialogue?.nodes.find((entry) => entry.id === nodeId);
  if (!dialogue || !start) return;

  const scope = conversationScope(txn, actor, speaker);

  // A redirect jumps past a node the party has outgrown. Bounded, so a pair of nodes redirecting at
  // each other cannot spin.
  let node: NodeDef = start;
  for (let hops = 0; hops < txn.module.source.narrative.maxDialogueHops; hops += 1) {
    const redirect = node.redirectWhen.find((entry) =>
      passes(entry.requires, undefined, scope, rng),
    );
    if (!redirect) break;
    const next: NodeDef | undefined = dialogue.nodes.find((entry) => entry.id === redirect.goto);
    if (!next) break;
    node = next;
  }

  txn.set({ ...txn.state, dialogue: { ...conversation, node: node.id } });

  if (node.onEnter.length > 0) {
    applyOps(txn, evalEffects(node.onEnter, { scope, rng, openNamespaces: OPEN_NAMESPACES }), actor.id);
  }

  const line = pickLine(node.says, scope, rng.derive(`line:${node.id}`));
  txn.emit({ type: 'dialogueNode', node: node.id, text: line });
  txn.emit({ type: 'say', text: line, speaker: speaker.id });

  // Reaching a node can itself be something the speaker remembers.
  if (node.remembers) {
    txn.emit({ type: 'custom', event: 'deed', data: { kind: node.remembers } });
  }

  // A node that offers nothing to say back ends the conversation, or the player is stranded with no
  // replies. Checked after `remembers`, so a parting word is still recorded.
  if (node.options.length === 0) endDialogue(txn);
}

/** The options a player can currently see. */
/**
 * The flag that makes `onceOnly` mean "selectable once, ever".
 *
 * `state.dialogue.taken` is cleared by `startDialogue`, so recording it there would mean once per
 * conversation and walking out and back in would reset it.
 *
 * Recorded as a flag rather than a new state field: it is the same kind of fact as `found:<poi>`,
 * `looted:<poi>` and `gate:<id>:open`, and it needs no migration.
 */
function saidKey(dialogue: string, node: string, option: string): string {
  return `said:${dialogue}:${node}:${option}`;
}

function takenBefore(
  txn: Transaction,
  conversation: { dialogue: string; node: string; taken: readonly string[] },
  optionId: string,
): boolean {
  if (conversation.taken.includes(optionId)) return true;
  return txn.state.flags[saidKey(conversation.dialogue, conversation.node, optionId)] === true;
}

export function visibleOptions(txn: Transaction, actor: Entity, rng: Rng): VisibleOption[] {
  const conversation = txn.state.dialogue;
  if (!conversation) return [];

  const speaker = txn.entity(conversation.npc);
  const dialogue = txn.module.find<DialogueDef>('narrative.dialogues', conversation.dialogue);
  const node = dialogue?.nodes.find((entry) => entry.id === conversation.node);
  if (!speaker || !node) return [];

  const scope = conversationScope(txn, actor, speaker);
  const out: VisibleOption[] = [];

  for (const option of node.options) {
    if (option.onceOnly && takenBefore(txn, conversation, option.id)) continue;

    const allowed = passes(option.requires, option.when, scope, rng);
    if (allowed) {
      out.push({ id: option.id, text: option.text, locked: false, hint: '' });
      continue;
    }
    // Showing a locked option is how content hints at what is possible.
    if (option.showWhenLocked) {
      out.push({ id: option.id, text: option.text, locked: true, hint: option.lockedHint });
    }
  }

  return out;
}

/** Choose an option and follow it. */
export function chooseOption(
  txn: Transaction,
  optionId: string,
  actor: Entity,
  rng: Rng,
): boolean {
  const conversation = txn.state.dialogue;
  if (!conversation) {
    txn.emit({ type: 'refused', action: 'choose', reason: message('refused.reply.noConversation') });
    return false;
  }

  const speaker = txn.entity(conversation.npc);
  const dialogue = txn.module.find<DialogueDef>('narrative.dialogues', conversation.dialogue);
  const node = dialogue?.nodes.find((entry) => entry.id === conversation.node);
  const option = node?.options.find((entry) => entry.id === optionId);

  if (!speaker || !node || !option) {
    txn.emit({ type: 'refused', action: 'choose', reason: message('refused.reply.unknown') });
    return false;
  }

  // `visibleOptions` hides a spent one-shot, but a front end that dispatches by id — or a player
  // typing the reply back — goes past that filter, so an option that hands over an item refuses the
  // second asking.
  if (option.onceOnly && takenBefore(txn, conversation, option.id)) {
    txn.emit({ type: 'refused', action: 'choose', reason: message('refused.reply.unknown') });
    return false;
  }

  const scope = conversationScope(txn, actor, speaker);
  if (!passes(option.requires, option.when, scope, rng)) {
    txn.emit({ type: 'refused', action: 'choose', reason: option.lockedHint ? literal(option.lockedHint) : message('refused.reply.locked') });
    return false;
  }

  txn.set({
    ...txn.state,
    dialogue: { ...conversation, taken: [...conversation.taken, option.id] },
    // Only `onceOnly` options are recorded: a flag for every reply would grow the save by the size
    // of the script the player has read.
    flags: option.onceOnly
      ? { ...txn.state.flags, [saidKey(conversation.dialogue, conversation.node, option.id)]: true }
      : txn.state.flags,
  });

  if (option.effects.length > 0) {
    applyOps(txn, evalEffects(option.effects, { scope, rng, openNamespaces: OPEN_NAMESPACES }), actor.id);
  }

  // — a persuasion attempt, which the NPC may resist ————————
  let destination = option.goto;
  if (option.check) {
    const roll = option.check.opposedBy
      ? check(txn.module, rng, {
          modifier: skillModifier(txn.module, actor, option.check.skill),
          difficulty: 10 + skillModifier(txn.module, speaker, option.check.opposedBy),
        })
      : skillCheck(
          txn.module, rng, actor, option.check.skill,
          // Evaluated against the speaker's scope, not the party's: the number is how hard this
          // person is to move, and the formula reads their faction's standing and their own
          // disposition.
          difficultyFrom(txn.module, txn.state, speaker, option.check.difficulty, rng.derive('talkDc')),
        );

    txn.emit({ type: 'checked', entity: actor.id, skill: option.check.skill, attribute: null, roll });
    destination = succeeded(roll) ? option.check.onSuccess : option.check.onFailure;
  }

  if (!destination) {
    endDialogue(txn);
    return true;
  }

  enterNode(txn, destination, actor, speaker, rng);
  return true;
}

export function endDialogue(txn: Transaction): void {
  if (!txn.state.dialogue) return;
  txn.set({ ...txn.state, dialogue: null });
  txn.emit({ type: 'dialogueEnded' });
}

/** Whether an entity is close enough to talk to. */
export function canTalkTo(actor: Entity, speaker: EntityId, txn: Transaction): boolean {
  const other = txn.entity(speaker);
  if (!other || !other.alive) return false;
  if (other.map !== actor.map) return false;
  return Math.max(
    Math.abs(other.position.x - actor.position.x),
    Math.abs(other.position.y - actor.position.y),
  ) <= txn.module.source.rules.interactionRange.talk;
}
