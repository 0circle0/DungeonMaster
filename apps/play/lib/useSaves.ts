'use client';

/**
 * Saved games: localStorage slots plus file download and upload.
 *
 * The engine has no clock — `save` takes `savedAt` as a parameter — so
 * `Date.now()` appears here, at the UI edge, and nowhere below it.
 */

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

/**
 * Every slot for this world, plus the ones written before worlds had keys.
 *
 * Slots used to hang off the module id, which was fine while a module id named
 * exactly one thing. It no longer does: adding the Aurendel example and then
 * importing a copy of it gives two worlds that both say `aurendel`, and sharing
 * save slots between them means loading a save written against the other and
 * failing the module-hash check for reasons nobody can see. So slots hang off
 * the world key now — and the old id-keyed ones are still read, because they
 * are somebody's saved game and this is the only chance to find them.
 */
function readSlots(scope: string, legacy: string | null): SaveSlot[] {
  const out: SaveSlot[] = [];
  const seen = new Set<string>();
  slotsUnder(scope, out, seen);
  if (legacy && legacy !== scope) slotsUnder(legacy, out, seen);
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function useSaves(
  module: CompiledModule,
  /**
   * The library row this run belongs to. Null only where the browser cannot
   * store anything, in which case the module id is all there is to key on.
   */
  worldKey: string | null,
  /**
   * How to serialize the run.
   *
   * Passed in rather than done here: a save has to carry the module-hash
   * lineage of the file it came from and the mods that were active, and only
   * the session knows either. Calling `save(state, now)` from here would
   * silently start every lineage over.
   */
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
    // A slot may have been found under the old id-keyed prefix; remove both
    // rather than leaving one behind to reappear on the next refresh.
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
