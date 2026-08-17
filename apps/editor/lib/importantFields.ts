/**
 * Which optional fields deserve to be visible without a click.
 *
 * The schema marks almost everything optional-or-defaulted, so a generic form
 * collapses a POI's `position`, `residents` and `map` — the fields that decide
 * what the place *is* — behind the same "Optional (20)" toggle as `tags`. This
 * registry promotes the fields an author actually reaches for; everything
 * unlisted stays tucked away. Unknown keys are ignored, so schema changes
 * cannot break it, and unlisted collections keep the plain generated form.
 */

const IMPORTANT: Record<string, readonly string[]> = {
  'world.pointsOfInterest': [
    'area',
    'kind',
    'position',
    'residents',
    'map',
    'dungeon',
    'gate',
    'descriptionKey',
    'encounterTables',
  ],
  'world.areas': ['biome', 'entryPoint', 'map', 'connections', 'descriptionKey', 'encounterTables'],
  'world.dungeons': [
    'biome',
    'roomCount',
    'branchiness',
    'lockedDoorChance',
    'doorGates',
    'guaranteedRoles',
    'bossTable',
    'palette',
  ],
  'world.biomes': ['palette', 'roomTemplates', 'encounterTables', 'lootTables', 'traps'],
  // What the map is made of, in the order it is laid down: ground, then walls
  // and doors, then whatever is strewn across it.
  'world.palettes': ['floor', 'wall', 'door', 'scatter', 'exterior'],
  'world.gates': ['requires', 'opensWith', 'bypass'],
  'content.npcs': ['dialogue', 'statblock', 'faction', 'disposition', 'offersQuests'],
  // Not `statblock`: that is an NPC's pointer *at* a monster. A monster is the
  // statblock, so what leads here is what it can do and what it drops.
  'content.monsters': ['attributes', 'abilities', 'behaviour', 'loot', 'level', 'xp'],
  'narrative.quests': ['autoStart', 'giver', 'objectives', 'rewards', 'unlocks'],
  // A clue is its wording and where it came from; `tags` and the pool are not
  // what an author is reaching for when they open one.
  'narrative.lore': ['source', 'textKey'],
  'narrative.loreThreads': ['entries'],
  // Not `npc`: the pointer runs the other way, from `content.npcs.dialogue`.
  'narrative.dialogues': ['start', 'nodes'],
};

export function importantFieldsFor(path: string): ReadonlySet<string> {
  return new Set(IMPORTANT[path] ?? []);
}
