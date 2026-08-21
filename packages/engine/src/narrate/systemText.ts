/**
 * The engine's own words, looked up rather than written.
 *
 * Every sentence the engine produces lives in `narrative.systemText` and is reached through here.
 * There is no English fallback: a key that resolves to nothing throws, because a silent empty
 * string is the failure this mechanism exists to prevent. Nothing reaches that throw through a
 * normal load — `compileModule` proves every fragment is present and every message keeps its
 * placeholders.
 *
 * A message may be a plain string or `{ pool }`, which hands it to `narrative.textGrammar` for
 * weighted, condition-gated variation.
 */

import type { CompiledModule, SystemTextKey, SystemTextValue } from '@dm/module';
import { SYSTEM_TEXT_BY_KEY } from '@dm/module';
import { narrateFrom, interpolate, list } from './grammar.js';
import type { Grammar } from './grammar.js';

/** Values for a message's `{placeholders}`. */
export type TextParams = Readonly<Record<string, string | number>>;

/**
 * A sentence the engine wants said, carried as a key and its facts.
 *
 * Events hold one of these rather than finished prose, so what the player reads is decided by the
 * module at render time and the same event can render into a terminal, a browser, or a different
 * language.
 *
 * The `text` form is for prose the module already wrote — a dialogue option's `lockedHint`, say —
 * which is authored content passing through and needs no key.
 */
export type Message =
  | { readonly key: SystemTextKey; readonly params?: TextParams }
  | { readonly text: string };

/** Build a message. Shorter than the object literal at ninety-odd call sites. */
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

  // Only reachable if a module was assembled without compiling it, which the loaders make
  // impossible. Naming the key beats rendering a blank.
  throw new Error(
    `narrative.systemText is missing ${JSON.stringify(key)}` +
      (SYSTEM_TEXT_BY_KEY.has(key) ? '' : ' — and no such message exists'),
  );
}

/**
 * Render one message. `sceneKey` gives a pool-backed message a stable identity, so the same refusal
 * about the same door reads the same way each time within a run.
 */
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

/**
 * Several messages as one readable phrase, for a refusal that has to name a list inside a sentence.
 */
export function joinMessages(
  module: CompiledModule,
  messages: readonly Message[],
  conjunction?: string,
): string {
  const grammar = grammarOf(module);
  return list(grammar, messages.map((msg) => render(module, msg)), conjunction ?? grammar.and);
}

/**
 * The module's own words for joining, counting, and articles. Built once per module: the narrator
 * runs several times a turn and these never change.
 */
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
