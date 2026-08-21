/** How content gets reached when nothing points at it. */

/** Collections whose entries are reached without any static reference. */
export const REACHED_INDIRECTLY: ReadonlyMap<string, string> = new Map([
  ['narrative.textGrammar', 'named by key from a prose field'],
  ['narrative.arcs', 'a top-level container; nothing contains it'],
  ['narrative.quests', 'started by dialogue effects and triggers, which name it in a DSL string'],
  ['narrative.deedKinds', 'emitted from the DSL'],
  ['narrative.loreThreads', 'read through `threads.<id>.known`, a DSL path rather than a field'],
  ['world.areas', 'reached by travel'],
  ['world.pointsOfInterest', 'reached from the area holding it'],
  ['rules.attributes', 'read through formula paths'],
  ['rules.resources', 'read through formula paths'],
  ['rules.derivedStats', 'read through formula paths'],
  ['rules.damageTypes', 'named inside damage effects'],
  ['rules.conditions', 'named inside applyCondition effects'],
  ['rules.equipmentSlots', 'matched by name when equipping'],
  ['rules.masteryTiers', 'compared by rank'],
  ['rules.rests', 'chosen by the player'],
  ['rules.actionTypes', 'spent by name during a turn'],
  ['rules.savingThrows', 'named inside effects'],
  ['rules.sizes', 'defaulted per creature'],
  ['rules.creatureTypes', 'read by gating predicates'],
  ['rules.senses', 'each is propagated by the perception model itself'],
  ['rules.stances', 'the player types `sneak`, `walk` or `dash`; nothing in the module names them'],
  ['rules.movementModes', 'chosen per creature and per terrain'],
  ['rules.languages', 'compared when someone speaks'],
  ['rules.alignments', 'read by gating predicates'],
  ['rules.opportunities', 'checked by the combat loop'],
  ['rules.coverTypes', 'computed from the map'],
  ['content.ancestries', 'chosen at character creation'],
  ['content.classes', 'chosen at character creation'],
  ['content.monsters', 'may be placed only by a generator'],
]);

/** Entries that place themselves by naming something else. */
export interface SelfPlacing {
  readonly collection: string;
  /** The field that does the placing. */
  readonly field: string;
  /** A fragment of engine source that proves the field is read. */
  readonly proof: string;
  readonly note: string;
}

export const SELF_PLACING: readonly SelfPlacing[] = [
  {
    collection: 'content.npcs',
    field: 'home',
    proof: 'npc.home === poiId',
    note: 'placed by naming its own home, which the engine gathers on arrival',
  },
];

/** Is this entry placed by something it declares itself? */
export function placesItself(collection: string, entry: Record<string, unknown>): boolean {
  return SELF_PLACING.some((rule) => {
    if (rule.collection !== collection) return false;
    const value = entry[rule.field];
    return typeof value === 'string' && value !== '';
  });
}
