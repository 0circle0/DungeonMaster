/** Editor state. */

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

/** Immutable set. */
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

/** Many edits, one new document, and object identity preserved everywhere else. */
export function setAtMany(
  doc: unknown,
  edits: readonly { readonly path: Path; readonly value: unknown }[],
): unknown {
  let out = doc;
  for (const edit of edits) out = setAt(out, edit.path, edit.value);
  return out;
}

/** Delete several things at once, without the indices moving under each other. */
export function deleteAtMany(doc: unknown, paths: readonly Path[]): unknown {
  const ordered = [...paths].sort((a, b) => {
    if (a.length !== b.length) return b.length - a.length;
    for (let i = 0; i < a.length; i += 1) {
      const x = a[i];
      const y = b[i];
      if (x === y) continue;
      if (typeof x === 'number' && typeof y === 'number') return y - x;
      return String(y).localeCompare(String(x));
    }
    return 0;
  });

  let out = doc;
  for (const path of ordered) out = deleteAt(out, path);
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
  /** Notes, kept apart from warnings because they are not the same claim. */
  readonly infos: readonly Diagnostic[];
  readonly identity: string;
  readonly hash: string;
  /** The document as it would be exported — line numbers refer to this. */
  readonly text: string;
  /** True while the idle-tier work is pending: diagnostics have no line, `hash` lags. */
  readonly settling: boolean;
  /** The compiled module, when it compiles. */
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
  | { type: 'removeMany'; paths: readonly Path[] }
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

    // One history entry for the whole batch: a bulk edit is one thing the author did.
    case 'setMany':
      return pushHistory(state, setAtMany(state.doc, action.edits) as ModuleDoc);

    case 'removeMany':
      return pushHistory(state, deleteAtMany(state.doc, action.paths) as ModuleDoc);

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

  /** A parse cache that lives as long as the editing session. */
  const index = useMemo(() => new ValidationIndex(), []);

  /** Lints the live document, not its text, so `setAt` identity survives and the cache holds. */
  const fresh = useMemo(() => {
    const text = `${JSON.stringify(state.doc, null, 2)}\n`;
    const lint = lintModule(state.doc, { index });

    // Identity comes off the lint's compile; `hash` is not read, since it serializes the document.
    return {
      diagnostics: lint.diagnostics,
      identity: lint.compiled?.identity ?? '',
      text,
      compiled: lint.compiled ?? null,
    };
    // `index` is created once and mutates internally, so it is deliberately not a dependency: it
    // never changes identity, and rebuilding it per edit would throw away the cache.
  }, [state.doc]);

  /** The two things that wait for a pause in typing: line numbers, and the hash. */
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
    const warnings = diagnostics.filter((d) => d.severity === 'warning');
    const infos = diagnostics.filter((d) => d.severity === 'info');
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      infos,
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
    /** Apply many edits as one undo step, preserving identity for everything untouched. */
    setMany: useCallback(
      (edits: readonly { path: Path; value: unknown }[]) => dispatch({ type: 'setMany', edits }),
      [],
    ),
    /** Delete several entries as one undo step, last-first so indices hold. */
    removeMany: useCallback((paths: readonly Path[]) => dispatch({ type: 'removeMany', paths }), []),
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
