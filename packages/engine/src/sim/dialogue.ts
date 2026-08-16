/**
 * Conversation.
 *
 * A dialogue is a graph whose edges are gated by the same requirement
 * vocabulary as everything else — so a line can appear only for a certain
 * class, only while carrying proof, only once a faction trusts you, or only if
 * this NPC has *not* heard what you did.
 *
 * The last of those is the point. Options are evaluated against what the
 * speaker knows, not against what is true, which is what lets the same NPC
 * greet one party warmly and turn another away.
 */

import { Rng } from '@dm/core';
import { evalEffects, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Effect, Predicate, Requirement } from '@dm/module';
import type { Entity, EntityId } from '../state.js';
import { buildScope, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, applyOps } from '../rules/apply.js';
import { skillCheck, check, succeeded, skillModifier } from '../rules/check.js';
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
    difficulty: number;
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
 * The scope a conversation is judged in.
 *
 * `memory.speaker.<deedKind>` is filled from what *this* NPC knows, which is
 * how `memories` requirements in dialogue work at all.
 */
function conversationScope(txn: Transaction, actor: Entity, speaker: Entity) {
  return buildScope(txn.module, txn.state, actor, {
    speaker: { id: speaker.id, name: speaker.name } as never,
    // `buildScope` already supplies `memory`, but keyed on the *actor*. In a
    // conversation `speaker` has to mean the person being talked to, so this
    // rebuilds it around them. It also replaces a hand-rolled version in which
    // `anyone` was aliased to the speaker and `party` and `faction` were empty
    // objects — so "word has got around" was indistinguishable from "this one
    // person saw you", and two of the four `who` values never answered yes.
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

  // A redirect jumps straight past a node the party has outgrown — or, in
  // greenmarch's case, straight to the cold shoulder. Bounded so a pair of
  // nodes redirecting at each other cannot spin.
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

  // A node that offers nothing to say back is the end of the conversation.
  // Left open, it stranded the player in a dialogue with no replies and no way
  // out of it. Checked after `remembers`, so a parting word is still recorded.
  if (node.options.length === 0) endDialogue(txn);
}

/** The options a player can currently see. */
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
    if (option.onceOnly && conversation.taken.includes(option.id)) continue;

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

  const scope = conversationScope(txn, actor, speaker);
  if (!passes(option.requires, option.when, scope, rng)) {
    txn.emit({ type: 'refused', action: 'choose', reason: option.lockedHint ? literal(option.lockedHint) : message('refused.reply.locked') });
    return false;
  }

  txn.set({
    ...txn.state,
    dialogue: { ...conversation, taken: [...conversation.taken, option.id] },
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
      : skillCheck(txn.module, rng, actor, option.check.skill, option.check.difficulty);

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
