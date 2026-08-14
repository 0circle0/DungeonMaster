/**
 * Building an entity from module content.
 *
 * Three entry points, one shape out: {@link createCharacter} assembles a player
 * character from ancestry, class, and attribute choices, {@link spawnMonster}
 * instantiates a statblock, and {@link spawnNpc} puts a named person on the map.
 * All produce an {@link Entity}, so nothing downstream branches on who is here.
 */

import { Rng, roll } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import type { Entity, ItemStack } from './state.js';
import { modifiersOf, maximaOf } from './stats.js';

interface AncestryDef {
  id: string;
  name: string;
  attributeBonuses: Record<string, number>;
  grantedAbilities: string[];
  skillBonuses: Record<string, number>;
}

interface ClassDef {
  id: string;
  name: string;
  hitDie: string;
  attributeBonuses: Record<string, number>;
  skillProficiencies: string[];
  startingItems: { item: string; quantity: number }[];
  abilitiesByLevel: Record<string, string[]>;
}

interface AttributeDef {
  id: string;
  default: number;
  min: number;
  max: number;
}

interface MonsterDef {
  id: string;
  name: string;
  level: number;
  xp: number;
  attributes: Record<string, number>;
  resourceOverrides: Record<string, unknown>;
  abilities: string[];
  faction?: string;
  speeds?: Record<string, number>;
  extra?: Record<string, never>;
}

/**
 * Movement modes an entity has.
 *
 * Everything walks unless the module says otherwise; a creature with declared
 * `speeds` uses exactly those, which is how a fish gets `swim` and no `walk`.
 */
function movementModesFor(module: CompiledModule, declared: Record<string, number> | undefined): string[] {
  const declaredModes = Object.keys(declared ?? {});
  if (declaredModes.length > 0) return declaredModes;
  const available = module.ids('rules.movementModes');
  return available.includes('walk') ? ['walk'] : available.slice(0, 1);
}

export interface CharacterChoices {
  readonly name: string;
  readonly ancestry: string;
  readonly characterClass: string;
  /** Point-buy results, before ancestry and class bonuses. */
  readonly attributes: Readonly<Record<string, number>>;
  readonly level?: number;
}

export class CreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreationError';
  }
}

/** Abilities a class has unlocked by a given level. */
function abilitiesUpTo(characterClass: ClassDef, level: number): string[] {
  const out: string[] = [];
  for (const [levelKey, abilities] of Object.entries(characterClass.abilitiesByLevel)) {
    if (Number(levelKey) <= level) out.push(...abilities);
  }
  return out;
}

function mergeStacks(stacks: readonly ItemStack[]): ItemStack[] {
  const totals = new Map<string, number>();
  for (const stack of stacks) {
    totals.set(stack.item, (totals.get(stack.item) ?? 0) + stack.quantity);
  }
  return [...totals].map(([item, quantity]) => ({ item, quantity }));
}

/**
 * Assemble a player character.
 *
 * Attribute scores are the sum of the player's allocation and the bonuses from
 * ancestry and class, clamped to the range the module declares. Resources start
 * full, which requires the maxima to be computed first — the dependency order
 * documented in `stats.ts`.
 */
export function createCharacter(
  module: CompiledModule,
  id: string,
  choices: CharacterChoices,
  rng: Rng,
): Entity {
  const ancestry = module.find<AncestryDef>('content.ancestries', choices.ancestry);
  if (!ancestry) throw new CreationError(`unknown ancestry ${JSON.stringify(choices.ancestry)}`);

  const characterClass = module.find<ClassDef>('content.classes', choices.characterClass);
  if (!characterClass) {
    throw new CreationError(`unknown class ${JSON.stringify(choices.characterClass)}`);
  }

  const level = choices.level ?? module.source.start.creation.startingLevel;

  // 1. Attributes: allocation + ancestry + class, clamped to declared bounds.
  const attributes: Record<string, number> = {};
  for (const attr of module.all<AttributeDef>('rules.attributes')) {
    const base = choices.attributes[attr.id] ?? attr.default;
    const total =
      base + (ancestry.attributeBonuses[attr.id] ?? 0) + (characterClass.attributeBonuses[attr.id] ?? 0);
    attributes[attr.id] = Math.min(attr.max, Math.max(attr.min, total));
  }

  const skills: Record<string, number> = {};
  for (const skillId of characterClass.skillProficiencies) skills[skillId] = 1;
  for (const [skillId, bonus] of Object.entries(ancestry.skillBonuses)) {
    skills[skillId] = (skills[skillId] ?? 0) + bonus;
  }

  const inventory = mergeStacks([
    ...characterClass.startingItems.map((s) => ({ item: s.item, quantity: s.quantity })),
    ...module.source.start.creation.startingItems.map((s) => ({
      item: s.item,
      quantity: s.quantity,
    })),
  ]);

  const abilities = [...new Set([...ancestry.grantedAbilities, ...abilitiesUpTo(characterClass, level)])];

  // Levels beyond the first roll the class hit die, which is why creation takes
  // an RNG: a level-3 character is not deterministic from choices alone.
  let bonusVitality = 0;
  for (let l = 2; l <= level; l++) {
    bonusVitality += roll(characterClass.hitDie, rng).total;
  }

  const draft: Entity = {
    // Position is assigned when the party is placed on a map; character
    // creation happens before any map exists.
    map: '',
    position: { x: 0, y: 0 },
    movementModes: movementModesFor(module, undefined),
    disposition: 'ally',
    following: null,
    alerts: [],
    // Null means "however this ruleset says creatures move by default", which
    // is resolved when it is read. Baking it in here would copy the default
    // into every creature and quietly ignore a module that changed it.
    stance: null,
    extra: {},
    id,
    name: choices.name,
    kind: 'character',
    level,
    xp: 0,
    attributes,
    resources: {},
    skills,
    conditions: [],
    inventory,
    equipped: {},
    abilities,
    ancestry: ancestry.id,
    characterClass: characterClass.id,
    statblock: null,
    faction: null,
    alive: true,
  };

  // 2-3. Modifiers, then maxima, then fill each resource to full.
  const mods = modifiersOf(module, attributes);
  const maxima = maximaOf(module, draft, mods);
  const vital = module.source.rules.vitalResource;

  const resources: Record<string, number> = {};
  for (const [resourceId, max] of Object.entries(maxima)) {
    resources[resourceId] = resourceId === vital ? max + bonusVitality : max;
  }

  return { ...draft, resources };
}

/** Instantiate a monster from its statblock. */
export function spawnMonster(module: CompiledModule, id: string, monsterId: string): Entity {
  const monster = module.find<MonsterDef>('content.monsters', monsterId);
  if (!monster) throw new CreationError(`unknown monster ${JSON.stringify(monsterId)}`);

  const attributes: Record<string, number> = {};
  for (const attr of module.all<AttributeDef>('rules.attributes')) {
    attributes[attr.id] = monster.attributes[attr.id] ?? attr.default;
  }

  const draft: Entity = {
    map: '',
    position: { x: 0, y: 0 },
    movementModes: movementModesFor(module, monster.speeds),
    disposition: 'hostile',
    following: null,
    alerts: [],
    // Null means "however this ruleset says creatures move by default", which
    // is resolved when it is read. Baking it in here would copy the default
    // into every creature and quietly ignore a module that changed it.
    stance: null,
    extra: {},
    id,
    name: monster.name,
    kind: 'monster',
    level: monster.level,
    xp: monster.xp,
    attributes,
    resources: {},
    skills: {},
    conditions: [],
    inventory: [],
    equipped: {},
    abilities: [...monster.abilities],
    ancestry: null,
    characterClass: null,
    statblock: monster.id,
    faction: monster.faction ?? null,
    alive: true,
  };

  const mods = modifiersOf(module, attributes);
  const maxima = maximaOf(module, draft, mods);

  return { ...draft, resources: { ...maxima } };
}

interface NpcDef {
  id: string;
  name: string;
  faction?: string;
  statblock?: string;
  disposition: number;
}

/**
 * Put a named person on the map.
 *
 * The entity id *is* the npc's content id. That is not a shortcut — reactions
 * (`turn.ts`), deed memory (`gossip.ts`) and `talk` objectives all look the
 * speaker up by id already, so any other scheme would need each of them
 * changed and would break the module's own `target: "vess"`.
 *
 * A person who can fight reuses a monster statblock for their numbers; one who
 * cannot gets the module's default attributes, because a miller still has to
 * have a value for Might when someone swings at her.
 */
export function spawnNpc(module: CompiledModule, npcId: string): Entity {
  const npc = module.find<NpcDef>('content.npcs', npcId);
  if (!npc) throw new CreationError(`unknown npc ${JSON.stringify(npcId)}`);

  const base = npc.statblock ? spawnMonster(module, npcId, npc.statblock) : null;

  const attributes: Record<string, number> = {};
  for (const attr of module.all<AttributeDef>('rules.attributes')) {
    attributes[attr.id] = base?.attributes[attr.id] ?? attr.default;
  }

  const draft: Entity = {
    map: '',
    position: { x: 0, y: 0 },
    movementModes: base?.movementModes ?? movementModesFor(module, undefined),
    // Never `ally`: an ally is a party member for targeting, and a friendly
    // villager standing in a doorway is not somebody you heal by accident.
    disposition: npc.disposition >= 0 ? 'neutral' : 'hostile',
    following: null,
    alerts: [],
    stance: null,
    // What content this person came from, so dialogue and memory can find their
    // definition back from the entity even when a statblock renamed them.
    extra: { npc: npcId },
    id: npcId,
    name: npc.name,
    kind: 'npc',
    level: base?.level ?? 1,
    xp: base?.xp ?? 0,
    attributes,
    resources: {},
    skills: {},
    conditions: [],
    inventory: [],
    equipped: {},
    abilities: base ? [...base.abilities] : [],
    ancestry: null,
    characterClass: null,
    statblock: npc.statblock ?? null,
    faction: npc.faction ?? null,
    alive: true,
  };

  const mods = modifiersOf(module, attributes);
  const maxima = maximaOf(module, draft, mods);

  return { ...draft, resources: { ...maxima } };
}

/**
 * Which npc definition an entity came from.
 *
 * Prefers the recorded content id over the entity id, and never the statblock —
 * looking a person up by the monster they fight like finds nothing.
 */
export function npcIdOf(entity: Entity): string {
  const recorded = entity.extra['npc'];
  return typeof recorded === 'string' && recorded ? recorded : entity.id;
}
