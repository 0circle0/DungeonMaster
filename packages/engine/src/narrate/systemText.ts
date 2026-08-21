/** The engine's own words, looked up rather than written. */

import type { CompiledModule, SystemTextKey, SystemTextValue } from '@dm/module';
import { SYSTEM_TEXT_BY_KEY } from '@dm/module';
import { narrateFrom, interpolate, list } from './grammar.js';
import type { Grammar } from './grammar.js';

/** Values for a message's `{placeholders}`. */
export type TextParams = Readonly<Record<string, string | number>>;

/** A sentence the engine wants said, carried as a key and its facts. */
export type Message =
  | { readonly key: SystemTextKey; readonly params?: TextParams }
  | { readonly text: string };

/** Build a message. */
export function message(key: SystemTextKey, params?: TextParams): Message {
  return params === undefined ? { key } : { key, params };
}

/** Carry authored content through as-is. */
export function literal(text: string): Message {
  return { text };
}

function valueOf(module: CompiledModule, key: SystemTextKey): SystemTextValue {
  const declared = (module.source.narrative.systemText as Record<string, SystemTextValue | undefined>)[key];
  if (declared !== undefined) return declared;

  // Only reachable if a module was assembled without compiling it, which the loaders make impossible.
  throw new Error(
    `narrative.systemText is missing ${JSON.stringify(key)}` +
      (SYSTEM_TEXT_BY_KEY.has(key) ? '' : ' — and no such message exists'),
  );
}

/** Render one message. */
export function text(
  module: CompiledModule,
  key: SystemTextKey,
  params: TextParams = {},
  seed = 0,
  sceneKey?: string,
): string {
  const value = valueOf(module, key);
  if (typeof value === 'string') return interpolate(value, params);
  return narrateFrom(module, value.pool, seed, {
    context: params,
    ...(sceneKey === undefined ? {} : { sceneKey }),
  });
}

/** Render a `Message` carried on an event. */
export function render(
  module: CompiledModule,
  msg: Message,
  seed = 0,
  sceneKey?: string,
): string {
  if ('text' in msg) return msg.text;
  return text(module, msg.key, msg.params ?? {}, seed, sceneKey);
}

/** Several messages as one readable phrase, for a refusal that has to name a list inside a sentence. */
export function joinMessages(
  module: CompiledModule,
  messages: readonly Message[],
  conjunction?: string,
): string {
  const grammar = grammarOf(module);
  return list(grammar, messages.map((msg) => render(module, msg)), conjunction ?? grammar.and);
}

/** The module's own words for joining, counting, and articles. */
const grammarCache = new WeakMap<CompiledModule, Grammar>();

export function grammarOf(module: CompiledModule): Grammar {
  let grammar = grammarCache.get(module);
  if (!grammar) {
    const word = (key: SystemTextKey): string => text(module, key);
    grammar = {
      and: word('grammar.and'),
      or: word('grammar.or'),
      separator: word('grammar.list.separator'),
      pair: word('grammar.list.pair'),
      many: word('grammar.list.many'),
      consonant: word('grammar.article.consonant'),
      vowel: word('grammar.article.vowel'),
      counted: word('grammar.count'),
      plural: word('grammar.plural'),
      numbers: word('grammar.smallNumbers').split(/\s+/).filter(Boolean),
    };
    grammarCache.set(module, grammar);
  }
  return grammar;
}
