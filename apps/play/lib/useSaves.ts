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

const keyOf = (moduleId: string, slot: string): string => `dm.save.${moduleId}.${slot}`;

function readSlots(moduleId: string): SaveSlot[] {
  const out: SaveSlot[] = [];
  const prefix = `dm.save.${moduleId}.`;
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const text = localStorage.getItem(key);
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as { savedAt?: number };
      out.push({ slot: key.slice(prefix.length), savedAt: parsed.savedAt ?? 0, text });
    } catch {
      // A corrupt slot is skipped, not fatal.
    }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export function useSaves(
  module: CompiledModule,
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
  const [slots, setSlots] = useState<readonly SaveSlot[]>(
    () => (typeof localStorage === 'undefined' ? [] : readSlots(moduleId)),
  );

  const refresh = useCallback(() => setSlots(readSlots(moduleId)), [moduleId]);

  const store = useCallback((slot: string) => {
    localStorage.setItem(keyOf(moduleId, slot), serialize(Date.now()));
    setSlots(readSlots(moduleId));
  }, [moduleId, serialize]);

  const remove = useCallback((slot: string) => {
    localStorage.removeItem(keyOf(moduleId, slot));
    setSlots(readSlots(moduleId));
  }, [moduleId]);

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
