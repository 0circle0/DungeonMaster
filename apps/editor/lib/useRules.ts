'use client';

/**
 * Which semantic rules are on.
 *
 * The rule list is caller-owned by design — `dmkit/lint.py` ships no default
 * selection because the order of the list is the order of the report — so the
 * studio has to own a selection, and an author has to be able to change it.
 *
 * Turning a rule off is a legitimate thing to want, not a way of hiding a bug.
 * `flag_never_set` on a module mid-authoring is nothing but noise: half the
 * dialogue that will set those flags has not been written yet. The alternative
 * to an off switch is an author who stops reading the console, which costs
 * every other rule too.
 *
 * Persisted in localStorage rather than in the module, deliberately. What one
 * author wants to be told about while working is not a property of the world,
 * and putting it in the document would change the content hash of every module
 * that expressed a preference. A project-wide selection belongs in the
 * contract, which is a separate thing and out-of-band already.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_RULES, type Rule } from '@dm/module';

const STORAGE_KEY = 'dm.editor.rules.off';

export interface RulesApi {
  /** Every rule that exists, in report order. */
  readonly all: readonly Rule[];
  /** The ones to run, in the same order. */
  readonly enabled: readonly Rule[];
  // Properties rather than methods: these are closures over the hook's state,
  // never called with a receiver, and declaring them as methods invites a
  // `this` that does not exist.
  readonly isOn: (code: string) => boolean;
  readonly toggle: (code: string) => void;
  readonly reset: () => void;
}

export function useRules(): RulesApi {
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());

  // After mount, so the server and the first client render agree. A rule the
  // author switched off still runs once; the alternative is a hydration
  // mismatch on every load.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setOff(new Set(JSON.parse(raw) as string[]));
    } catch {
      // A corrupt or unavailable store means the default selection, which is
      // every rule. Failing loud here would block the editor over a preference.
    }
  }, []);

  const persist = useCallback((next: ReadonlySet<string>) => {
    setOff(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Private browsing, a full quota. The session still honours the choice.
    }
  }, []);

  const toggle = useCallback(
    (code: string) => {
      const next = new Set(off);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      persist(next);
    },
    [off, persist],
  );

  // Memoized because the studio runs the rules in an effect keyed on this
  // list. A fresh array every render would restart that timer every render, and a
  // component that renders steadily would never let the rules finish.
  const enabled = useMemo(() => DEFAULT_RULES.filter((rule) => !off.has(rule.code)), [off]);

  return {
    all: DEFAULT_RULES,
    enabled,
    isOn: (code) => !off.has(code),
    toggle,
    reset: () => persist(new Set()),
  };
}
