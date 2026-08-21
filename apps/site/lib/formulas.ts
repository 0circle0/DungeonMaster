/** Every formula shown on the site, as data. */

export type FormulaKind = 'expr' | 'predicate' | 'effects' | 'rule';

export interface Formula {
  /** Short label above the block. */
  readonly title: string;
  readonly kind: FormulaKind;
  /** JSON, exactly as it should appear. */
  readonly json: string;
  /** One line under the block. */
  readonly note?: string;
}

export const READING: readonly Formula[] = [
  { title: 'A number', kind: 'expr', json: `12` },
  { title: 'A value from the world', kind: 'expr', json: `{ "ref": "actor.level" }` },
  {
    title: 'A value that may be missing',
    kind: 'expr',
    json: `{ "ref": "actor.inventory.rope", "else": 0 }`,
    note: 'Without else, a path that is not there is an error.',
  },
];

export const ARITHMETIC: readonly Formula[] = [
  { title: 'Add', kind: 'expr', json: `{ "add": [ { "ref": "actor.level" }, 2 ] }` },
  {
    title: 'Divide and round down',
    kind: 'expr',
    json: `{ "floor": { "div": [ { "sub": [ { "ref": "value" }, 10 ] }, 2 ] } }`,
    note: 'The classic attribute modifier. In a modifier formula, value is the attribute score.',
  },
  { title: 'Roll dice', kind: 'expr', json: `{ "roll": "2d6+3" }` },
  {
    title: 'Keep inside a range',
    kind: 'expr',
    json: `{ "clamp": [ { "ref": "actor.level" }, 1, 10 ] }`,
  },
  {
    title: 'Largest of several',
    kind: 'expr',
    json: `{ "max": [ { "ref": "actor.mod.might" }, { "ref": "actor.mod.agility" }, 0 ] }`,
  },
  {
    title: 'Choose between two values',
    kind: 'expr',
    json: `{ "cond": { "gte": [ { "ref": "actor.res.hp" }, 10 ] },
  "then": 2,
  "else": 0 }`,
  },
];

export const TESTS: readonly Formula[] = [
  { title: 'Compare', kind: 'predicate', json: `{ "gte": [ { "ref": "actor.attr.might" }, 14 ] }` },
  {
    title: 'Is a flag set',
    kind: 'predicate',
    json: `{ "test": { "ref": "flags.met_vess" } }`,
    note: 'test is true for anything except false, 0, an empty string, and null.',
  },
  {
    title: 'Is something absent',
    kind: 'predicate',
    json: `{ "not": { "exists": "actor.conditions.frightened" } }`,
  },
  {
    title: 'All of these',
    kind: 'predicate',
    json: `{ "all": [
    { "gte": [ { "ref": "actor.level" }, 3 ] },
    { "test": { "ref": "flags.mill_clear" } }
] }`,
  },
  {
    title: 'Any of these',
    kind: 'predicate',
    json: `{ "any": [
    { "gte": [ { "ref": "reputation.wardens" }, 20 ] },
    { "exists": "actor.inventory.warden_token" }
] }`,
  },
  {
    title: 'One of a set',
    kind: 'predicate',
    json: `{ "in": [ { "ref": "world.phase" }, { "list": [ "dusk", "night" ] } ] }`,
    note: 'The second side is a list expression, not a bare JSON array.',
  },
  {
    title: 'A one in four chance',
    kind: 'predicate',
    json: `{ "chance": 0.25 }`,
    note: 'Rolled through the seeded dice, so it replays.',
  },
];

export const ACTIONS: readonly Formula[] = [
  {
    title: 'Deal damage',
    kind: 'effects',
    json: `[ { "damage": { "target": { "ref": "target.id" },
              "amount": { "roll": "2d6" },
              "damageType": "fire" } } ]`,
  },
  {
    title: 'Heal, scaled by the caster',
    kind: 'effects',
    json: `[ { "heal": { "target": { "ref": "target.id" },
            "amount": { "add": [ { "roll": "1d8" }, { "ref": "actor.primaryMod" } ] } } } ]`,
  },
  {
    title: 'Apply a condition for three rounds',
    kind: 'effects',
    json: `[ { "applyCondition": { "target": { "ref": "target.id" },
                      "condition": "burning",
                      "duration": 3 } } ]`,
  },
  {
    title: 'Remember something happened',
    kind: 'effects',
    json: `[ { "setFlag": { "flag": "rang_the_bell", "value": true } } ]`,
  },
  { title: 'Hand something over', kind: 'effects', json: `[ { "grantItem": { "target": { "ref": "actor.id" },
                 "item": "brass_key", "quantity": 1 } } ]` },
  {
    title: 'Change standing',
    kind: 'effects',
    json: `[ { "adjustReputation": { "faction": "wardens", "amount": -5 } } ]`,
  },
  {
    title: 'Teach a piece of lore',
    kind: 'effects',
    json: `[ { "learnLore": { "entry": "the_drowned_bell" } } ]`,
  },
  {
    title: 'Only sometimes',
    kind: 'effects',
    json: `[ { "if": { "when": { "lt": [ { "ref": "actor.res.hp" }, 5 ] },
          "then": [ { "applyCondition": { "target": { "ref": "actor.id" },
                                          "condition": "desperate" } } ] } } ]`,
  },
  {
    title: 'To everyone at once',
    kind: 'effects',
    json: `[ { "forEach": { "in": { "ref": "party" }, "as": "member",
               "do": [ { "heal": { "target": { "ref": "member.id" }, "amount": 5 } } ] } } ]`,
  },
  {
    title: 'Roll once, use twice',
    kind: 'effects',
    json: `[ { "let": { "name": "burst", "value": { "roll": "3d6" },
           "in": [ { "damage": { "target": { "ref": "target.id" },
                                 "amount": { "ref": "burst" }, "damageType": "fire" } },
                   { "damage": { "target": { "ref": "actor.id" },
                                 "amount": { "div": [ { "ref": "burst" }, 2 ] },
                                 "damageType": "fire" } } ] } } ]`,
    note: 'Without let, each roll would be rolled separately and the two numbers would differ.',
  },
];

export const BIG: readonly (Formula & { readonly where: string; readonly what: string })[] = [
  {
    title: 'A whole attribute, defined in three lines',
    where: 'rules.attributes',
    what: 'A curve that gives nothing below 8, then a point every three above it, capped at +6.',
    kind: 'expr',
    json: `{ "clamp": [
    { "floor": { "div": [ { "sub": [ { "ref": "value" }, 8 ] }, 3 ] } },
    0,
    6
] }`,
  },
  {
    title: 'Encumbrance, which the engine does not have',
    where: 'rules.derivedStats, then an ancestry trait',
    what: 'A carrying capacity from Might, and a condition that lands when you exceed it. The engine ships no encumbrance rule. This is the whole of one.',
    kind: 'rule',
    json: `{ "when": { "gt": [ { "ref": "actor.carried" }, { "ref": "actor.derived.capacity" } ] },
  "then": [ { "applyCondition": { "target": { "ref": "actor.id" },
                                  "condition": "burdened",
                                  "duration": 1 } } ] }`,
    note: 'capacity is a derived stat: { "mul": [ { "ref": "actor.attr.might" }, 15 ] }. A rule like this runs every turn as a passive, from an ancestry trait or an item proc.',
  },
  {
    title: 'A spell that scales, and hurts less on a good save',
    where: 'content.abilities, onUse',
    what: 'Damage rising with caster level, a burn that only lands on a failed save, and a bigger burst at night.',
    kind: 'effects',
    json: `[ { "let": { "name": "blast",
           "value": { "add": [ { "roll": "4d6" },
                               { "mul": [ { "floor": { "div": [ { "ref": "actor.level" }, 4 ] } }, 3 ] },
                               { "cond": { "in": [ { "ref": "world.phase" },
                                                    { "list": [ "dusk", "night" ] } ] },
                                 "then": 4, "else": 0 } ] },
           "in": [ { "damage": { "target": { "ref": "target.id" },
                                 "amount": { "ref": "blast" },
                                 "damageType": "fire" } },
                   { "if": { "when": { "not": { "exists": "target.conditions.warded" } },
                             "then": [ { "applyCondition": { "target": { "ref": "target.id" },
                                                             "condition": "burning",
                                                             "duration": 3 } } ] } } ] } } ]`,
    note: 'Put this on an ability with a savingThrow whose onSuccess is half, and the engine halves the damage for you.',
  },
  {
    title: 'A boss that changes when its guards die',
    where: 'content.monsters, reactions',
    what: 'Below a third health it heals itself, calls for help, and turns hostile to a faction that abandoned it.',
    kind: 'effects',
    json: `[ { "if": { "when": { "lte": [ { "ref": "actor.res.hp" },
                          { "div": [ { "ref": "actor.max.hp" }, 3 ] } ] },
          "then": [ { "heal": { "target": { "ref": "actor.id" },
                                "amount": { "roll": "4d8" } } },
                    { "applyCondition": { "target": { "ref": "actor.id" },
                                          "condition": "enraged", "duration": 5 } },
                    { "emit": { "event": "warden_called_for_help",
                                "data": { "where": "the_mill" } } },
                    { "adjustReputation": { "faction": "wardens", "amount": -10 } } ],
          "else": [ { "applyCondition": { "target": { "ref": "target.id" },
                                          "condition": "frightened", "duration": 2 } } ] } } ]`,
    note: 'The emitted event is yours. A trigger or an objective elsewhere can wait on warden_called_for_help.',
  },
  {
    title: 'A door that gets easier as you learn about it',
    where: 'world.pointsOfInterest, discover.difficulty',
    what: 'Starts at 22. Every clue you find on the thread takes 4 off it, down to a floor of 10. Asking around also helps.',
    kind: 'expr',
    json: `{ "max": [
    10,
    { "sub": [ 22,
               { "add": [ { "mul": [ { "ref": "threads.the_drowned_bell.known" }, 4 ] },
                          { "cond": { "test": { "ref": "flags.asked_at_the_inn" } },
                            "then": 3, "else": 0 } ] } ] }
] }`,
    note: 'threads.<id>.known counts the lore entries on that thread the party has learned.',
  },
  {
    title: 'A merchant who prices by how much they like you',
    where: 'A gate on the good stock, npc.shop.requires custom',
    what: 'Trusted customers, or anyone carrying the guild token and above level five, or anyone who has never been caught stealing.',
    kind: 'predicate',
    json: `{ "any": [
    { "gte": [ { "ref": "reputation.merchants" }, { "ref": "ranks.merchants.trusted" } ] },
    { "all": [ { "exists": "actor.inventory.guild_token" },
               { "gte": [ { "ref": "actor.level" }, 5 ] } ] },
    { "not": { "test": { "ref": "memory.speaker.theft" } } }
] }`,
    note: 'memory.speaker is what this person knows, not what is true. A theft nobody saw does not count.',
  },
];

/** Control flow, shown on the DSL page as well as here. */
export const CONTROL: readonly Formula[] = [
  {
    title: 'Do something to every party member',
    kind: 'effects',
    json: `[ { "forEach": { "in": { "ref": "party" }, "as": "member",
               "do": [ { "heal": { "target": { "ref": "member.id" }, "amount": 5 } } ] } } ]`,
    note: 'party is the only list the engine puts in scope. To hit every enemy, set the ability\'s targeting to allEnemies and the engine loops for you, running your effects once per target.',
  },
  {
    title: 'Repeat a fixed number of times',
    kind: 'effects',
    json: `[ { "repeat": { "times": 3,
              "do": [ { "damage": { "target": { "ref": "target.id" },
                                    "amount": { "roll": "1d4" } } } ] } } ]`,
    note: 'index is bound inside the loop.',
  },
];

export const ALL_FORMULAS: readonly Formula[] = [
  ...READING, ...ARITHMETIC, ...TESTS, ...ACTIONS, ...CONTROL, ...BIG,
];
