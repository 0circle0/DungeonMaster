/**
 * Command completion, from the same tables the parser reads.
 *
 * The design principle in one line: **the dropdown can never offer a noun the
 * parser would then reject**, because both read the same candidate pools. A
 * completion is a full replacement line, so accepting one is just submitting.
 */

import { VERB_SPECS, visibleEntities, carried, carriedOrNearby, reachablePlaces } from './parser.js';
import type { ParseContext, Candidate, VerbTakes, VerbSpec } from './parser.js';

export interface Completion {
  /** The full replacement line — accept it and submit. */
  readonly text: string;
  readonly label: string;
  /** Grey right-hand text: what it is, or what the verb does. */
  readonly detail: string;
  readonly kind: 'verb' | 'noun';
}

/** The nouns a verb can take right now — the parser's own pools, exported. */
export function candidatesFor(takes: VerbTakes, context: ParseContext): readonly Candidate<string>[] {
  const { module, state } = context;
  switch (takes) {
    case 'entity':
      return visibleEntities(context);
    case 'item':
      return carriedOrNearby(context);
    case 'ability': {
      const actor = state.entities[state.selected];
      const abilities = (actor?.abilities ?? []).map((id) => ({
        value: id,
        name: module.find<{ name: string }>('content.abilities', id)?.name ?? id,
      }));
      return [...abilities, ...carried(context)];
    }
    case 'place':
      return reachablePlaces(context);
    case 'area':
      return module
        .all<{ id: string; name: string }>('world.areas')
        .map((area) => ({ value: area.id, name: area.name }));
    case 'quest':
      return module
        .all<{ id: string; name: string }>('narrative.quests')
        .map((quest) => ({ value: quest.id, name: quest.name }));
    case 'member':
      return state.party.flatMap((id) => {
        const member = state.entities[id];
        return member ? [{ value: id, name: member.name }] : [];
      });
    case 'rest':
      return module
        .all<{ id: string; name: string }>('rules.rests')
        .map((rest) => ({ value: rest.id, name: rest.name }));
    case 'gate':
      return module
        .all<{ id: string; name?: string }>('world.gates')
        .map((gate) => ({ value: gate.id, name: gate.name ?? gate.id.replace(/_/g, ' ') }));
    case 'direction':
      return ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest']
        .map((direction) => ({ value: direction, name: direction }));
    default:
      return [];
  }
}

const specFor = (word: string): VerbSpec | undefined =>
  VERB_SPECS.find((spec) => spec.spellings.includes(word));

/**
 * Completions for a partial input line.
 *
 * First word ⇒ verbs by prefix over every spelling, canonical spelling first.
 * Verb typed ⇒ the nouns that verb can take, filtered by what follows it.
 */
export function complete(input: string, context: ParseContext): readonly Completion[] {
  const trimmed = input.replace(/^\s+/, '');
  const words = trimmed.toLowerCase().split(/\s+/);
  const first = words[0] ?? '';

  // Still typing the verb.
  if (words.length <= 1 && !trimmed.endsWith(' ')) {
    const seen = new Set<string>();
    const out: Completion[] = [];
    for (const spec of VERB_SPECS) {
      for (const spelling of spec.spellings) {
        if (!spelling.startsWith(first)) continue;
        if (seen.has(spelling)) continue;
        seen.add(spelling);
        out.push({
          text: `${spelling} `,
          label: spelling,
          detail: spec.summary,
          kind: 'verb',
        });
      }
    }
    return out.slice(0, 12);
  }

  // A verb is down; offer its nouns.
  const spec = specFor(first);
  if (!spec) return [];

  const rest = words.slice(1).join(' ');
  return candidatesFor(spec.takes, context)
    .filter((candidate) => rest === '' || candidate.name.toLowerCase().includes(rest))
    .slice(0, 12)
    .map((candidate) => ({
      text: `${first} ${candidate.name.toLowerCase()}`,
      label: candidate.name,
      detail: spec.summary,
      kind: 'noun' as const,
    }));
}
