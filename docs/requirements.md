# Requirements

One gating vocabulary, used everywhere.

Loot limited by level and mastery, doors that need a key or a spell, dialogue that appears once a faction trusts you, quests that unlock when another finishes, creatures that react to what they remember — all of it is the same question: *does this actor, right now, meet these conditions?*

So it is defined once. Learn it once, use it in every context.

## Where it appears

`lootEntry.requires` · `gate.requires` · `dialogueOption.requires` · `quest.requires` · `reaction.requires` · `trigger.requires` · `ability.requires` · `encounterGroup.requires` · `area.requires` · `textVariant.requires`

## Shape

Every clause is optional. Those present must **all** hold.

```jsonc
{
  "description": "Why this gate exists — shown in the editor.",

  "minLevel": 3,
  "maxLevel": 8,

  "classes":    ["warden", "stalker"],     // any of these
  "ancestries": ["dwarf"],
  "abilities":  ["read_runes"],            // must know all listed
  "attributes": [{ "attribute": "might", "min": 14 }],
  "skills":     [{ "skill": "lore", "minRank": 2, "minTier": "adept" }],

  "items":    [{ "item": "brass_key", "quantity": 1, "equipped": false, "consume": false }],
  "quests":   [{ "quest": "the_mill_door", "status": "complete" }],
  "factions": [{ "faction": "wardens", "minStanding": 10 }],
  "memories": [{ "deedKind": "theft", "who": "speaker", "known": false }],
  "flags":    [{ "flag": "mill_clear", "equals": true }],

  "without": {                              // "lack of" is as common as "has"
    "items":      ["cursed_idol"],
    "abilities":  [],
    "classes":    [],
    "conditions": ["frightened"],
    "quests":     [{ "quest": "betrayed_vess", "status": "complete" }],
    "flags":      [{ "flag": "banished" }]
  },

  "anyOf": [                                // alternatives — any one satisfies
    { "items": [{ "item": "brass_key" }] },
    { "skills": [{ "skill": "lockpicking", "minRank": 5 }] }
  ],

  "custom": { "gte": [{ "ref": "actor.extra.morale" }, 5] }   // escape hatch
}
```

## Quest status

`complete` · `active` · `available` · `failed` · `unstarted`

`unstarted` is how a dialogue option offers a quest only when it has never been taken:

```jsonc
{ "quests": [{ "quest": "the_mill_door", "status": "unstarted" }] }
```

Or require a specific objective rather than the whole quest:

```jsonc
{ "quests": [{ "quest": "find_the_mill", "objective": "burn_it" }] }
```

## Absence

`without` is not decoration. A quest that appears only *before* you have met someone, a shrine that admits only the unarmed, a merchant who deals with you only while you are not carrying stolen goods — these are as common as their positive counterparts, and awkward to express any other way.

## Alternatives

`anyOf` is one level deep, deliberately. Arbitrary nesting makes the generated form unbounded and the type circular, and `custom` covers the rare gate that needs more.

## How it runs

A requirement is compiled to a DSL predicate by `compileRequirement`, so the engine evaluates gates through the same path as everything else — no separate evaluator, no special cases. `{ "minLevel": 3 }` becomes:

```jsonc
{ "gte": [{ "ref": "actor.level" }, 3] }
```

An empty requirement compiles to `true` and is skipped entirely, so an unconditional gate costs nothing.

## Reading it back

The editor's **Events** view renders every requirement in the module as a plain-language "why" column. If a gate reads wrong there, it is wrong.
