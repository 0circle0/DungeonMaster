/** Fields the engine does not read (yet). */

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
