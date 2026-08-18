/**
 * How content gets reached when nothing points at it.
 *
 * "What references this?" is answered exactly by the schema — `ref()` marks
 * every declared reference. "Is this reachable?" is a different question, and
 * the difference is where a naive unreferenced-content report goes wrong. Run
 * against `modules/aurendel` before this file existed, it reported 137 entries,
 * of which 124 were fine: every one of the 105 NPCs, because an NPC is placed
 * by naming its own home rather than by a place naming it, and every one of the
 * 38 lore threads, because a thread is read through a DSL path the schema
 * cannot see.
 *
 * A report that is 90% wrong is worse than no report. It trains an author to
 * scroll past it, and then the thirteen real findings underneath go with it.
 *
 * So the exceptions are written down, each with the reason, and
 * `reachability.test.ts` greps the engine to keep the claims from rotting the
 * way `inertFields.ts` once did.
 */

/**
 * Collections whose entries are reached without any static reference.
 *
 * Shared with the used-by panel, which has to stay quiet about the same things
 * for the same reasons.
 */
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

/**
 * Entries that place themselves by naming something else.
 *
 * The reference points the other way: an NPC says where it lives, and the
 * engine gathers everyone whose `home` matches when the party arrives
 * (`sim/enter.ts`, `residentsOf`). Nothing points at the NPC, and it is on the
 * map regardless — so "unreferenced" is simply the wrong question for it.
 *
 * `poi.residents` says the same thing from the other end and *is* a declared
 * reference, which is why only the self-declaring direction needs a note here.
 */
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
