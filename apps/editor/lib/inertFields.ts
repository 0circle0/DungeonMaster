/**
 * Fields the engine does not read (yet).
 *
 * The schema-generated forms render every field with equal weight, which
 * quietly teaches authors that every field matters. Some don't: they are
 * accepted, validated, exported — and never dereferenced by the engine. This
 * registry is the studio's honesty layer: the inspector shows these notes
 * under the form so an author knows which knobs are connected to anything.
 *
 * Hand-maintained on purpose. Deriving it would mean grepping the engine at
 * build time; a curated list fails open (an unlisted field is simply shown as
 * live) and cannot drift the schema.
 *
 * **It is no longer only a promise.** `inertFields.test.ts` greps the engine
 * for every field named here and fails when one turns out to be read — which
 * is exactly the drift that let an earlier version of this file go stale,
 * undercounting the real inert surface several times over. Wiring a field up
 * now means deleting its line, and the build says so if you forget.
 */

export interface CoverageNote {
  /** Top-level field key on the entry, or '*' for the whole collection. */
  readonly field: string;
  readonly note: string;
}

const INERT: Record<string, readonly CoverageNote[]> = {
  'world.areas': [
    {
      field: 'map',
      note: 'map.palette is dead whenever the area\'s biome names one — the biome is passed as an override and wins',
    },
  ],
  'world.terrains': [
    { field: 'lightRadius', note: 'indexed but unread — there is no light model; a sense carries its own reach' },
    { field: 'isDoor', note: 'indexed but unread — doors live on the map\'s gate record, not on the terrain' },
  ],
  'content.items': [
    {
      field: 'stackable',
      note: 'inventory merges by item id regardless; there is no item instance to keep apart',
    },
    { field: 'rarity', note: 'not read by the engine — for display and filtering' },
    {
      field: 'requiresAttunement',
      note: 'not read, and neither is attunementRequires — enforcing a limit needs an attuned list on the entity, which is saved state and a save migration',
    },
  ],
  'rules.movementModes': [
    {
      field: 'fallsWhenDisabled',
      note: 'not read — two things are missing, not one: nothing takes a movement mode away, and there is no falling model for what would happen next',
    },
  ],
  'rules.sizes': [
    {
      field: 'carryMultiplier',
      note: 'not read by the engine — build encumbrance from actor.carried and a derived stat',
    },
  ],
  'rules.languages': [
    {
      field: 'exotic',
      note: 'not read by the engine — dialogue and readable content are not language-gated',
    },
  ],
};

export function coverageNotesFor(path: string): readonly CoverageNote[] {
  return INERT[path] ?? [];
}

/** Every field this registry claims is inert, for the drift check. */
export function inertEntries(): readonly { readonly path: string; readonly field: string }[] {
  return Object.entries(INERT).flatMap(([path, notes]) =>
    notes.map((note) => ({ path, field: note.field })));
}
