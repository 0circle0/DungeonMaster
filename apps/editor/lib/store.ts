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

import { useCallback, useMemo, useReducer } from 'react';
import { compileModule, lintModule } from '@dm/module';
import type { Diagnostic } from '@dm/module';

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
}

const HISTORY_LIMIT = 100;

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
   * Validation runs the same diagnostics as the CLI, so what the editor calls
   * valid is exactly what will load at play time.
   *
   * The document is serialized first and *the text* is linted, which is what
   * gives every problem a line number. Those numbers line up with the Raw JSON
   * view and with the file the user exports, so a reported line is somewhere
   * they can actually go and look.
   */
  const validation: Validation = useMemo(() => {
    const text = `${JSON.stringify(state.doc, null, 2)}\n`;
    const lint = lintModule(text);

    const errors = lint.diagnostics.filter((d) => d.severity === 'error');
    const warnings = lint.diagnostics.filter((d) => d.severity !== 'error');

    let identity = '';
    let hash = '';
    if (errors.length === 0) {
      const compiled = compileModule(state.doc);
      if (compiled.ok) {
        identity = compiled.module.identity;
        hash = compiled.module.hash;
      }
    }

    return { ok: errors.length === 0, errors, warnings, identity, hash, text };
  }, [state.doc]);

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
