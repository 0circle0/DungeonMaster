'use client';

/** Which semantic rules are on. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_RULES, type Rule } from '@dm/module';

const STORAGE_KEY = 'dm.editor.rules.off';

export interface RulesApi {
  /** Every rule that exists, in report order. */
  readonly all: readonly Rule[];
  /** The ones to run, in the same order. */
  readonly enabled: readonly Rule[];
  // Properties, not methods: closures over the hook's state, never called with a receiver.
  readonly isOn: (code: string) => boolean;
  readonly toggle: (code: string) => void;
  readonly reset: () => void;
}

export function useRules(): RulesApi {
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());

  // After mount, so the server and the first client render agree.
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

  // Memoized because the studio runs the rules in an effect keyed on this list.
  const enabled = useMemo(() => DEFAULT_RULES.filter((rule) => !off.has(rule.code)), [off]);

  return {
    all: DEFAULT_RULES,
    enabled,
    isOn: (code) => !off.has(code),
    toggle,
    reset: () => persist(new Set()),
  };
}
