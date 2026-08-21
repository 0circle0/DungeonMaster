/** Building an entity from module content. */

import { Rng, roll, parseDice } from '@dm/core';
import type { CompiledModule } from '@dm/module';
import { evalExpr } from '@dm/module';
import { defaultMovementModeOf } from './rules/config.js';
import { creationProblem } from './creation.js';
import type { Entity, ItemStack } from './state.js';
import { modifiersOf, initialOf, OPEN_NAMESPACES } from './stats.js';

interface AncestryDef {
  id: string;
  name: string;
  attributeBonuses: Record<string, number>;
  grantedAbilities: string[];
  skillBonuses: Record<string, number>;
  /** How this ancestry moves. */
  speeds?: Record<string, number>;
  senses?: Record<string, number>;
  size?: string;
  creatureType?: string;
  languages?: string[];
}

export interface ClassDef {
  id: string;
  name: string;
  hitDie: string;
  attributeBonuses: Record<string, number>;
  skillProficiencies: (string | { skill: string; rank: number })[];
  startingItems: { item: string; quantity: number }[];
  abilitiesByLevel: Record<string, string[]>;
  spellcasting?: { knownByLevel?: Record<string, number> };
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
  /** Trained skills. */
  skillBonuses?: Record<string, number>;
  size?: string;
  creatureType?: string;
  alignment?: string;
  languages?: string[];
  extra?: Record<string, never>;
}

/** Movement modes an entity has. */
function movementModesFor(module: CompiledModule, declared: Record<string, number> | undefined): string[] {
  const declaredModes = Object.keys(declared ?? {});
  if (declaredModes.length > 0) return declaredModes;
  const fallback = defaultMovementModeOf(module);
  return fallback === null ? [] : [fallback];
}

/** Which stance a signed disposition lands in. */
export function dispositionFor(module: CompiledModule, disposition: number): Entity['disposition'] {
  const bands = module.source.rules.dispositionBands;
  const floor = bands.find((band) => band.atLeast === undefined);

  let best: (typeof bands)[number] | undefined;
  for (const band of bands) {
    if (band.atLeast === undefined || disposition < band.atLeast) continue;
    if (best?.atLeast === undefined || band.atLeast > best.atLeast) best = band;
  }
  return (best ?? floor)?.stance ?? 'neutral';
}

/** What levels beyond the first add to the vital resource. */
function levelVitality(
  module: CompiledModule,
  characterClass: ClassDef,
  ancestry: AncestryDef,
  attributes: Record<string, number>,
  level: number,
  rng: Rng,
): number {
  const policy = module.source.rules.progression.levelVitality;
  if (level <= 1) return 0;

  const sizeId = ancestry.size ?? module.source.rules.defaultSize;
  const die = policy.die === 'size'
    ? module.find<{ hitDie?: string }>('rules.sizes', sizeId ?? '')?.hitDie
    : characterClass.hitDie;

  const perLevel = Number(
    evalExpr(policy.bonus, {
      scope: { level, attr: attributes, mod: modifiersOf(module, attributes) },
      rng,
      openNamespaces: OPEN_NAMESPACES,
    }),
  );

  // A fixed policy needs the die's value once; `roll` draws per level, which is why creation takes an RNG.
  const fixed = policy.policy === 'roll' || policy.policy === 'none' || !die
    ? 0
    : dieValue(die, policy.policy);

  let total = 0;
  for (let l = 2; l <= level; l += 1) {
    total += perLevel;
    if (policy.policy === 'none' || !die) continue;
    total += policy.policy === 'roll' ? roll(die, rng).total : fixed;
  }
  return total;
}

/** A die's mean (rounded up, as tables do) or its top face, without rolling. */
function dieValue(notation: string, policy: 'average' | 'max'): number {
  let total = 0;
  for (const term of parseDice(notation).terms) {
    if (term.kind === 'constant') { total += term.sign * term.value; continue; }
    const kept = term.keep ? Math.min(term.keep.count, term.count) : term.count;
    const per = policy === 'max' ? term.sides : (term.sides + 1) / 2;
    total += term.sign * kept * per;
  }
  return Math.ceil(total);
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

/** What a class actually knows at a level. */
function knownAtLevel(
  module: CompiledModule,
  characterClass: ClassDef,
  level: number,
): string[] {
  const granted = abilitiesUpTo(characterClass, level);
  const known = characterClass.spellcasting?.knownByLevel?.[String(level)];
  if (known === undefined) return granted;

  const spells: string[] = [];
  const rest: string[] = [];
  for (const id of granted) {
    const ability = module.find<{ spellLevel?: number }>('content.abilities', id);
    (typeof ability?.spellLevel === 'number' ? spells : rest).push(id);
  }
  // The first `known` in declaration order.
  return [...rest, ...spells.slice(0, Math.max(0, known))];
}

/** The descriptive facts a statblock gives a creature. */
function monsterVocabulary(monster: MonsterDef): Record<string, never> {
  const out: Record<string, unknown> = {};
  if (monster.size) out['size'] = monster.size;
  if (monster.creatureType) out['creatureType'] = monster.creatureType;
  if (monster.alignment) out['alignment'] = monster.alignment;
  if (monster.languages && monster.languages.length > 0) out['languages'] = [...monster.languages];
  return out as Record<string, never>;
}

/** The descriptive facts an ancestry gives a character. */
function vocabularyOf(ancestry: AncestryDef): Record<string, never> {
  const out: Record<string, unknown> = {};
  if (ancestry.size) out['size'] = ancestry.size;
  if (ancestry.creatureType) out['creatureType'] = ancestry.creatureType;
  if (ancestry.languages && ancestry.languages.length > 0) out['languages'] = [...ancestry.languages];
  return out as Record<string, never>;
}

/** Put the gear a character starts with on them. */
function equipStartingGear(
  module: CompiledModule,
  inventory: readonly ItemStack[],
): Record<string, string[]> {
  const slots = new Map(
    module.all<{ id: string; capacity: number }>('rules.equipmentSlots')
      .map((slot) => [slot.id, slot.capacity ?? 1]),
  );

  const equipped: Record<string, string[]> = {};
  for (const stack of inventory) {
    const item = module.find<{ slot?: string }>('content.items', stack.item);
    const slotId = item?.slot;
    if (!slotId || !slots.has(slotId)) continue;

    const worn = equipped[slotId] ?? [];
    if (worn.length >= (slots.get(slotId) ?? 1)) continue;
    equipped[slotId] = [...worn, stack.item];
  }
  return equipped;
}

/** Abilities a class has unlocked by a given level. */
export function abilitiesUpTo(characterClass: ClassDef, level: number): string[] {
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

/** Assemble a player character. */
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

  // The campaign's own limits, enforced here rather than in whichever screen happens to be asking.
  const problem = creationProblem(module, choices);
  if (problem) throw new CreationError(problem);

  const level = choices.level ?? module.source.start.creation.startingLevel;

  // 1.
  const attributes: Record<string, number> = {};
  for (const attr of module.all<AttributeDef>('rules.attributes')) {
    const base = choices.attributes[attr.id] ?? attr.default;
    const total =
      base + (ancestry.attributeBonuses[attr.id] ?? 0) + (characterClass.attributeBonuses[attr.id] ?? 0);
    attributes[attr.id] = Math.min(attr.max, Math.max(attr.min, total));
  }

  // A bare id uses `rules.progression.proficiencyRank`; an entry names its own rank.
  const skills: Record<string, number> = {};
  const trained = module.source.rules.progression.proficiencyRank;
  for (const entry of characterClass.skillProficiencies) {
    if (typeof entry === 'string') skills[entry] = trained;
    else skills[entry.skill] = entry.rank;
  }
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

  const abilities = [...new Set([
    ...ancestry.grantedAbilities,
    ...knownAtLevel(module, characterClass, level),
  ])];

  // What a level beyond the first adds, per the ruleset's declared policy.
  const bonusVitality = levelVitality(module, characterClass, ancestry, attributes, level, rng);

  const draft: Entity = {
    // Position is assigned by `placeOn` when the party is placed; creation happens before any map exists.
    map: '',
    position: { x: 0, y: 0 },
    // Filled in by `placeOn`; creation happens before any map exists.
    anchor: null,
    since: 0,
    movementModes: movementModesFor(module, ancestry.speeds),
    disposition: 'ally',
    following: null,
    alerts: [],
    slotsUsed: [],
    concentrating: null,
    // Null resolves to the ruleset's default when read.
    stance: null,
    // Size, kind and tongues ride in the open `extra` bag.
    extra: vocabularyOf(ancestry),
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
    equipped: equipStartingGear(module, inventory),
    abilities,
    ancestry: ancestry.id,
    characterClass: characterClass.id,
    statblock: null,
    faction: null,
    alive: true,
  };

  // 2-3.
  const mods = modifiersOf(module, attributes);
  const starting = initialOf(module, draft, mods);
  const vital = module.source.rules.vitalResource;

  const resources: Record<string, number> = {};
  for (const [resourceId, value] of Object.entries(starting)) {
    resources[resourceId] = resourceId === vital ? value + bonusVitality : value;
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
    // Filled in by `placeOn`; creation happens before any map exists.
    anchor: null,
    since: 0,
    movementModes: movementModesFor(module, monster.speeds),
    disposition: 'hostile',
    following: null,
    alerts: [],
    slotsUsed: [],
    concentrating: null,
    // Null resolves to the ruleset's default when read.
    stance: null,
    extra: monsterVocabulary(monster),
    id,
    name: monster.name,
    kind: 'monster',
    level: monster.level,
    xp: monster.xp,
    attributes,
    resources: {},
    // A statblock's trained skills, so a creature the module describes as stealthy does not roll at rank 0.
    skills: { ...(monster.skillBonuses ?? {}) },
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

  return { ...draft, resources: initialOf(module, draft, mods) };
}

interface NpcDef {
  id: string;
  name: string;
  faction?: string;
  statblock?: string;
  disposition: number;
}

/** Put a named person on the map. */
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
    // Filled in by `placeOn`; creation happens before any map exists.
    anchor: null,
    since: 0,
    movementModes: base?.movementModes ?? movementModesFor(module, undefined),
    // Which band a signed disposition falls in is the ruleset's call, via `rules.dispositionBands`.
    disposition: dispositionFor(module, npc.disposition),
    following: null,
    alerts: [],
    slotsUsed: [],
    concentrating: null,
    stance: null,
    // What content this person came from, so dialogue and memory can find their definition.
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

  return { ...draft, resources: initialOf(module, draft, mods) };
}

/** Which npc definition an entity came from. */
export { npcIdOf } from './state.js';
