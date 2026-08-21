'use client';

/** Saved games: localStorage slots plus file download and upload. */

import { useCallback, useState } from 'react';
import type { CompiledModule } from '@dm/module';


export interface SaveSlot {
  readonly slot: string;
  readonly savedAt: number;
  readonly text: string;
}

const keyOf = (scope: string, slot: string): string => `dm.save.${scope}.${slot}`;

function slotsUnder(scope: string, out: SaveSlot[], seen: Set<string>): void {
  const prefix = `dm.save.${scope}.`;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const slot = key.slice(prefix.length);
    if (seen.has(slot)) continue;
    const text = localStorage.getItem(key);
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as { savedAt?: number };
      seen.add(slot);
      out.push({ slot, savedAt: parsed.savedAt ?? 0, text });
    } catch {
      // A corrupt slot is skipped, not fatal.
    }
  }
}

/** Every slot for this world, plus the ones written before worlds had keys. */
function readSlots(scope: string, legacy: string | null): SaveSlot[] {
  const out: SaveSlot[] = [];
  const seen = new Set<string>();
  slotsUnder(scope, out, seen);
  if (legacy && legacy !== scope) slotsUnder(legacy, out, seen);
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function useSaves(
  module: CompiledModule,
  /** The library row this run belongs to. */
  worldKey: string | null,
  /** How to serialize the run. */
  serialize: (savedAt: number) => string,
) {
  const moduleId = module.source.id;
  const scope = worldKey ?? moduleId;
  const legacy = worldKey ? moduleId : null;

  const [slots, setSlots] = useState<readonly SaveSlot[]>(
    () => (typeof localStorage === 'undefined' ? [] : readSlots(scope, legacy)),
  );

  const refresh = useCallback(() => setSlots(readSlots(scope, legacy)), [scope, legacy]);

  const store = useCallback((slot: string) => {
    localStorage.setItem(keyOf(scope, slot), serialize(Date.now()));
    setSlots(readSlots(scope, legacy));
  }, [scope, legacy, serialize]);

  const remove = useCallback((slot: string) => {
    // A slot may sit under the old id-keyed prefix; remove both.
    localStorage.removeItem(keyOf(scope, slot));
    if (legacy) localStorage.removeItem(keyOf(legacy, slot));
    setSlots(readSlots(scope, legacy));
  }, [scope, legacy]);

  const download = useCallback(() => {
    const blob = new Blob([serialize(Date.now())], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${moduleId}-save.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [moduleId, serialize]);

  return { slots, refresh, store, remove, download };
}
