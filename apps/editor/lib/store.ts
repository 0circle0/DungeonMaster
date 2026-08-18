/**
 * Editor state.
 *
 * Two decisions shape this file:
 *
 * 1. **The raw authored document is the source of truth.** Validation runs on a
 *    copy, so the file the user exports stays exactly what they wrote —
 *    compilation would otherwise bake every schema default into their module
 *    and turn a 200-line file into a 2000-line one.
 *
 * 2. **Edits are immutable and addressed by path.** `setAt(doc, ['content',
 *    'monsters', 3, 'xp'], 40)` returns a new document, which makes undo a
 *    stack of snapshots rather than a system of inverse operations.
 */

'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { attachPositions, lintModule, ValidationIndex } from '@dm/module';
import type { CompiledModule, Diagnostic } from '@dm/module';

export type Path = readonly (string | number)[];

export function getAt(doc: unknown, path: Path): unknown {
  let current: unknown = doc;
  for (const segment of path) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

/** Immutable set. Missing containers are created as objects or arrays to match the next segment. */
export function setAt(doc: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value;

  const [head, ...rest] = path as [string | number, ...Path];

  if (typeof head === 'number') {
    const list = Array.isArray(doc) ? [...(doc as unknown[])] : [];
    list[head] = setAt(list[head], rest, value);
    return list;
  }

  const object = { ...((doc as Record<string, unknown> | undefined) ?? {}) };
  object[head] = setAt(object[head], rest, value);
  return object;
}

/**
 * Many edits, one new document, and object identity preserved everywhere else.
 *
 * This is the contract bulk editing has to honour, and it is easy to break by
 * accident: the obvious way to write "add a tag to these 40 monsters" is to
 * clone the document and mutate it, which gives every one of the other 557
 * points of interest a fresh identity. Validation keys its cache on identity,
 * so that one convenience turns a 60 ms edit back into a 700 ms one — with no
 * failing test and nothing visibly wrong.
 *
 * Folding the edits through `setAt` instead touches only the spines that
 * actually change. Applying 40 edits this way costs 40 spine copies, not one
 * document copy.
 */
export function setAtMany(
  doc: unknown,
  edits: readonly { readonly path: Path; readonly value: unknown }[],
): unknown {
  let out = doc;
  for (const edit of edits) out = setAt(out, edit.path, edit.value);
  return out;
}

/** Immutable delete, used when an optional field is cleared. */
export function deleteAt(doc: unknown, path: Path): unknown {
  if (path.length === 0) return undefined;
  const [head, ...rest] = path as [string | number, ...Path];

  if (rest.length === 0) {
    if (typeof head === 'number') {
      const list = Array.isArray(doc) ? [...(doc as unknown[])] : [];
      list.splice(head, 1);
      return list;
    }
    const object = { ...((doc as Record<string, unknown> | undefined) ?? {}) };
    delete object[head];
    return object;
  }

  if (typeof head === 'number') {
    const list = Array.isArray(doc) ? [...(doc as unknown[])] : [];
    list[head] = deleteAt(list[head], rest);
    return list;
  }
  const object = { ...((doc as Record<string, unknown> | undefined) ?? {}) };
  object[head] = deleteAt(object[head], rest);
  return object;
}

export type ModuleDoc = Record<string, unknown>;

export interface Validation {
  readonly ok: boolean;
  readonly errors: readonly Diagnostic[];
  readonly warnings: readonly Diagnostic[];
  readonly identity: string;
  readonly hash: string;
  /** The document as it would be exported — line numbers refer to this. */
  readonly text: string;
  /**
   * True while the idle-tier work is still pending: diagnostics carry a path
   * but not yet a line, and `hash` is the previous document's.
   */
  readonly settling: boolean;
  /**
   * The compiled module, when it compiles.
   *
   * Shared deliberately. Validation already pays for the schema parse, and
   * anything else in the editor that wants a `CompiledModule` — the seed-faithful
   * map preview above all — used to compile the document again for itself, at
   * roughly the cost of everything else on the keystroke put together.
   */
  readonly compiled: CompiledModule | null;
}

const HISTORY_LIMIT = 100;

/** How long typing has to stop before diagnostics are given their line numbers. */
const IDLE_DELAY_MS = 300;

interface State {
  readonly doc: ModuleDoc;
  readonly past: readonly ModuleDoc[];
  readonly future: readonly ModuleDoc[];
  readonly dirty: boolean;
  readonly filename: string;
}

type Action =
  | { type: 'load'; doc: ModuleDoc; filename: string }
  | { type: 'set'; path: Path; value: unknown }
  | { type: 'delete'; path: Path }
  | { type: 'replace'; doc: ModuleDoc }
  | { type: 'setMany'; edits: readonly { path: Path; value: unknown }[] }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved' };

function pushHistory(state: State, doc: ModuleDoc): State {
  return {
    ...state,
    doc,
    past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return { doc: action.doc, past: [], future: [], dirty: false, filename: action.filename };

    case 'set':
      return pushHistory(state, setAt(state.doc, action.path, action.value) as ModuleDoc);

    case 'delete':
      return pushHistory(state, deleteAt(state.doc, action.path) as ModuleDoc);

    case 'replace':
      return pushHistory(state, action.doc);

    // One history entry for the whole batch: a bulk edit is one thing the
    // author did, so one press of undo should put it back.
    case 'setMany':
      return pushHistory(state, setAtMany(state.doc, action.edits) as ModuleDoc);

    case 'undo': {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        ...state,
        doc: previous,
        past: state.past.slice(0, -1),
        future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
        dirty: true,
      };
    }

    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        doc: next,
        past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        dirty: true,
      };
    }

    case 'saved':
      return { ...state, dirty: false };

    default:
      return state;
  }
}

export function useModuleStore(initial: ModuleDoc, initialName = 'module.json') {
  const [state, dispatch] = useReducer(reducer, {
    doc: initial,
    past: [],
    future: [],
    dirty: false,
    filename: initialName,
  });

  /**
   * A parse cache that lives as long as the editing session.
   *
   * Validation is dominated by the schema parse, and re-checking 597 points of
   * interest because one of them was renamed is most of what made a large
   * module unusable here. The index keys on entry identity, and `setAt` shares
   * every subtree it did not touch — so an edit costs one entry, not the
   * document. See `packages/module/src/diagnostics/incremental.ts`.
   */
  const index = useMemo(() => new ValidationIndex(), []);

  /**
   * Validation runs the same diagnostics as the CLI, so what the editor calls
   * valid is exactly what will load at play time.
   *
   * **The document is linted, not its text.** Linting the serialized form is
   * what used to give every diagnostic a line number, and it is also what made
   * the cache above worthless: re-parsing the text builds a whole new object
   * graph every keystroke, so nothing is ever recognised as unchanged and all
   * 597 points of interest are checked again to rename one. Passing the live
   * document keeps the identity `setAt` was careful to preserve.
   *
   * The cost is that a diagnostic comes back with a path and no line number.
   * `attachPositions` below puts those back once typing stops.
   */
  const fresh = useMemo(() => {
    const text = `${JSON.stringify(state.doc, null, 2)}\n`;
    const lint = lintModule(state.doc, { index });

    // The lint already compiled the document to prove its references resolve,
    // so identity comes off that rather than being paid for again. This used to
    // be a third `gameModuleSchema.safeParse` per keystroke, which on a large
    // module is most of a second on its own.
    //
    // `hash` is deliberately *not* read here. `CompiledModule.hash` computes on
    // first access, and computing it means serializing the whole document —
    // reading it on this line would put that back on every keystroke.
    return {
      diagnostics: lint.diagnostics,
      identity: lint.compiled?.identity ?? '',
      text,
      compiled: lint.compiled ?? null,
    };
    // `index` is created once and mutates internally, so it is deliberately
    // not a dependency: listing it would be honest and useless, since it never
    // changes identity, and rebuilding it per edit would throw away the cache
    // that makes this fast.
  }, [state.doc]);

  /**
   * The two things that wait for a pause in typing: line numbers, and the hash.
   *
   * Both mean walking the whole serialized document — locating a diagnostic
   * parses it for spans, hashing serializes it — and between them they cost
   * about as much again as everything else a keystroke does. Neither is
   * something anybody reads mid-word. Until they settle, the problems console
   * shows a path instead of a line, which is still somewhere you can go, and
   * the toolbar keeps showing the last hash, marked as settling.
   */
  const [settled, setSettled] = useState<{
    diagnostics: readonly Diagnostic[];
    hash: string;
  } | null>(null);
  const lastHash = useRef('');

  useEffect(() => {
    setSettled(null);
    const timer = setTimeout(() => {
      const hash = fresh.compiled?.hash ?? '';
      lastHash.current = hash;
      setSettled({ diagnostics: attachPositions(fresh.diagnostics, fresh.text), hash });
    }, IDLE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [fresh]);

  const validation: Validation = useMemo(() => {
    const diagnostics = settled?.diagnostics ?? fresh.diagnostics;
    const errors = diagnostics.filter((d) => d.severity === 'error');
    const warnings = diagnostics.filter((d) => d.severity !== 'error');
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      identity: fresh.identity,
      hash: settled?.hash ?? lastHash.current,
      settling: settled === null,
      text: fresh.text,
      compiled: fresh.compiled,
    };
  }, [fresh, settled]);

  /** Ids per collection, so `ref` fields can offer a dropdown of real targets. */
  const idsByCollection = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const [sectionName, section] of Object.entries(state.doc)) {
      if (typeof section !== 'object' || section === null || Array.isArray(section)) continue;
      for (const [collectionName, entries] of Object.entries(section as Record<string, unknown>)) {
        if (!Array.isArray(entries)) continue;
        const ids = entries
          .map((e) => (typeof e === 'object' && e !== null ? (e as { id?: unknown }).id : null))
          .filter((id): id is string => typeof id === 'string');
        if (ids.length > 0) out[`${sectionName}.${collectionName}`] = ids;
      }
    }
    return out;
  }, [state.doc]);

  return {
    doc: state.doc,
    filename: state.filename,
    dirty: state.dirty,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    validation,
    idsByCollection,
    load: useCallback((doc: ModuleDoc, filename: string) => dispatch({ type: 'load', doc, filename }), []),
    set: useCallback((path: Path, value: unknown) => dispatch({ type: 'set', path, value }), []),
    remove: useCallback((path: Path) => dispatch({ type: 'delete', path }), []),
    replace: useCallback((doc: ModuleDoc) => dispatch({ type: 'replace', doc }), []),
    /**
     * Apply many edits as one undo step, preserving identity for everything
     * untouched. The path bulk editing must take — see `setAtMany`.
     */
    setMany: useCallback(
      (edits: readonly { path: Path; value: unknown }[]) => dispatch({ type: 'setMany', edits }),
      [],
    ),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    markSaved: useCallback(() => dispatch({ type: 'saved' }), []),
  };
}

export type ModuleStore = ReturnType<typeof useModuleStore>;

/** Download the authored document, unchanged. */
export function exportModule(doc: ModuleDoc, filename: string): void {
  const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
