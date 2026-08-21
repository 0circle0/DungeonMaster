/** Which optional fields deserve to be visible without a click. */

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
  // What the map is made of, in the order it is laid down.
  'world.palettes': ['floor', 'wall', 'door', 'scatter', 'exterior'],
  'world.gates': ['requires', 'opensWith', 'bypass'],
  'content.npcs': ['dialogue', 'statblock', 'faction', 'disposition', 'offersQuests'],
  // Not `statblock`: that is an NPC's pointer *at* a monster.
  'content.monsters': ['attributes', 'abilities', 'behaviour', 'loot', 'level', 'xp'],
  'narrative.quests': ['autoStart', 'giver', 'objectives', 'rewards', 'unlocks'],
  // A clue is its wording and where it came from.
  'narrative.lore': ['source', 'textKey'],
  'narrative.loreThreads': ['entries'],
  // Not `npc`: the pointer runs the other way, from `content.npcs.dialogue`.
  'narrative.dialogues': ['start', 'nodes'],
};

export function importantFieldsFor(path: string): ReadonlySet<string> {
  return new Set(IMPORTANT[path] ?? []);
}
