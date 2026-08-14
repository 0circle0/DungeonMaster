# Module format reference

> Generated from the Zod schemas by `npm run docs`. Do not edit by hand —
> this is the format the validator actually enforces.

A module is one JSON document. Every field below is real; anything not listed
is rejected, so a misspelled property is a load error rather than a field that
silently does nothing.

## Extending the format

Every substantial entity carries an `extra` object: an open bag of your own
data that the engine passes through untouched and content can read with
`{ "ref": "…" }`. Put house rules, custom stats, and anything the format does
not anticipate there. It is the supported way to exceed what ships.

## Top level


<a id="module"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `format` | number |  | `1` |
| `id` | string | **yes** |  |
| `version` | string | **yes** |  |
| `engine` | string |  | `"^1.0.0"` |
| `extends` | string |  | `null` |
| `meta` | [object](#module-meta) | **yes** |  |
| `rules` | [object](#module-rules) | **yes** |  |
| `content` | [object](#module-content) |  | `{}` |
| `world` | [object](#module-world) |  | `{}` |
| `narrative` | [object](#module-narrative) |  | `{}` |
| `start` | [object](#module-start) |  | `{}` |

### Module → `meta`

<a id="module-meta"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `title` | string | **yes** |  |
| `author` | string |  | `""` |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `license` | string |  | `""` |

### Module → `rules`

<a id="module-rules"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `attributes` | [object](#module-rules-attributes)[] | **yes** |  |
| `resources` | [object](#module-rules-resources)[] | **yes** |  |
| `derivedStats` | [object](#module-rules-derivedStats)[] |  | `[]` |
| `damageTypes` | [object](#module-rules-damageTypes)[] |  | `[]` |
| `conditions` | [object](#module-rules-conditions)[] |  | `[]` |
| `actionTypes` | [object](#module-rules-actionTypes)[] |  | `[]` |
| `equipmentSlots` | [object](#module-rules-equipmentSlots)[] |  | `[]` |
| `masteryTiers` | [object](#module-rules-masteryTiers)[] |  | `[]` |
| `rests` | [object](#module-rules-rests)[] |  | `[]` |
| `resolution` | [object](#module-rules-resolution) |  | `{}` |
| `progression` | [object](#module-rules-progression) | **yes** |  |
| `savingThrows` | [object](#module-rules-savingThrows)[] |  | `[]` |
| `sizes` | [object](#module-rules-sizes)[] |  | `[]` |
| `creatureTypes` | [object](#module-rules-creatureTypes)[] |  | `[]` |
| `senses` | [object](#module-rules-senses)[] |  | `[]` |
| `stances` | [object](#module-rules-stances)[] |  | `[]` |
| `movementModes` | [object](#module-rules-movementModes)[] |  | `[]` |
| `languages` | [object](#module-rules-languages)[] |  | `[]` |
| `alignments` | [object](#module-rules-alignments)[] |  | `[]` |
| `opportunities` | [object](#module-rules-opportunities)[] |  | `[]` |
| `coverTypes` | [object](#module-rules-coverTypes)[] |  | `[]` |
| `spellcasting` | [object](#module-rules-spellcasting) |  | `{}` |
| `perception` | [object](#module-rules-perception) |  | `{}` |
| `vitalResource` | [→ rules.resources](#rulesresources) | **yes** |  |
| `initiativeStat` | [→ rules.derivedStats](#rulesderivedStats) |  |  |
| `defaultSize` | [→ rules.sizes](#rulessizes) |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `attributes`

<a id="module-rules-attributes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `abbrev` | string | **yes** |  |
| `description` | string |  | `""` |
| `min` | number |  | `1` |
| `max` | number |  | `20` |
| `default` | number |  | `10` |
| `modifier` | [DSL](#the-dsl) | **yes** |  |

### Module → `rules` → `resources`

<a id="module-rules-resources"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `max` | [DSL](#the-dsl) | **yes** |  |
| `min` | [DSL](#the-dsl) |  | `0` |
| `initial` | [DSL](#the-dsl) |  |  |
| `restoreOnShortRest` | number |  | `0` |
| `restoreOnLongRest` | number |  | `1` |
| `onDepleted` | [DSL](#the-dsl)[] |  | `[]` |

### Module → `rules` → `derivedStats`

<a id="module-rules-derivedStats"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `formula` | [DSL](#the-dsl) | **yes** |  |

### Module → `rules` → `damageTypes`

<a id="module-rules-damageTypes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |

### Module → `rules` → `conditions`

<a id="module-rules-conditions"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `stacking` | `refresh` \| `extend` \| `stack` \| `ignore` |  | `"refresh"` |
| `defaultDuration` | [DSL](#the-dsl) |  |  |
| `onApply` | [DSL](#the-dsl)[] |  | `[]` |
| `onTick` | [DSL](#the-dsl)[] |  | `[]` |
| `onExpire` | [DSL](#the-dsl)[] |  | `[]` |
| `modifiers` | { string: [DSL](#the-dsl) } |  | `{}` |
| `prevents` | string[] |  | `[]` |
| `savingThrow` | [object](#module-rules-conditions-savingThrow) |  |  |
| `implies` | string[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `conditions` → `savingThrow`

<a id="module-rules-conditions-savingThrow"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `save` | [→ rules.savingThrows](#rulessavingThrows) | **yes** |  |
| `difficulty` | [DSL](#the-dsl) | **yes** |  |
| `timing` | `onApply` \| `endOfTurn` \| `startOfTurn` \| `both` |  | `"endOfTurn"` |

### Module → `rules` → `actionTypes`

<a id="module-rules-actionTypes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `perTurn` | number |  | `1` |

### Module → `rules` → `equipmentSlots`

<a id="module-rules-equipmentSlots"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `capacity` | number |  | `1` |

### Module → `rules` → `masteryTiers`

<a id="module-rules-masteryTiers"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `atRank` | number | **yes** |  |

### Module → `rules` → `rests`

<a id="module-rules-rests"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `duration` | number |  | `60` |
| `kind` | `short` \| `long` |  | `"short"` |
| `effects` | [DSL](#the-dsl)[] |  | `[]` |
| `interruptChance` | number |  | `0` |

### Module → `rules` → `resolution`

<a id="module-rules-resolution"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `checkDice` | string |  | `"1d20"` |
| `advantageDice` | string |  | `"2d20kh1"` |
| `disadvantageDice` | string |  | `"2d20kl1"` |
| `criticalSuccessAt` | number |  | `20` |
| `criticalFailureAt` | number |  | `1` |
| `criticalDamageMultiplier` | number |  | `2` |
| `defaultDifficulty` | number |  | `12` |
| `difficulties` | { string: number } |  | `{}` |

### Module → `rules` → `progression`

<a id="module-rules-progression"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `maxLevel` | number |  | `20` |
| `levels` | [object](#module-rules-progression-levels)[] | **yes** |  |
| `proficiency` | [DSL](#the-dsl) |  |  |

### Module → `rules` → `progression` → `levels`

<a id="module-rules-progression-levels"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `level` | number | **yes** |  |
| `xpRequired` | number | **yes** |  |
| `grants` | [DSL](#the-dsl)[] |  | `[]` |

### Module → `rules` → `savingThrows`

<a id="module-rules-savingThrows"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `attribute` | [→ rules.attributes](#rulesattributes) | **yes** |  |
| `defaultDifficulty` | [DSL](#the-dsl) |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `sizes`

<a id="module-rules-sizes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `space` | number |  | `5` |
| `reach` | number |  | `5` |
| `carryMultiplier` | number |  | `1` |
| `hitDie` | string |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `creatureTypes`

<a id="module-rules-creatureTypes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `senses`

<a id="module-rules-senses"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `defaultRange` | number |  | `60` |
| `ignores` | string[] |  | `[]` |
| `propagation` | `line` \| `field` |  | `"line"` |
| `blockedBy` | `opaque` \| `impassable` \| `nothing` |  | `"opaque"` |
| `falloff` | `cliff` \| `linear` |  | `"cliff"` |
| `lingerMinutes` | number |  | `0` |
| `spreadPerMinute` | number |  | `0` |
| `rememberMinutes` | number |  | `0` |
| `impressionTextKey` | string |  |  |
| `faintImpressionTextKey` | string |  |  |
| `emptyTextKey` | string |  |  |
| `thresholds` | [object](#module-rules-senses-thresholds) |  | `{}` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `senses` → `thresholds`

<a id="module-rules-senses-thresholds"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `detect` | number |  | `0` |
| `investigate` | number |  | `0` |
| `aggro` | number |  | `0` |

### Module → `rules` → `stances`

<a id="module-rules-stances"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `speedMultiplier` | number |  | `1` |
| `emits` | { [→ rules.senses](#rulessenses): number } |  | `{}` |
| `concealedBy` | [→ content.skills](#contentskills) |  |  |
| `concealmentPerPoint` | number |  | `0` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `movementModes`

<a id="module-rules-movementModes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `defaultSpeed` | number |  | `30` |
| `terrainMultiplier` | number |  | `1` |
| `fallsWhenDisabled` | boolean |  | `false` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `languages`

<a id="module-rules-languages"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `script` | string |  | `""` |
| `exotic` | boolean |  | `false` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `alignments`

<a id="module-rules-alignments"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `abbrev` | string |  | `""` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `opportunities`

<a id="module-rules-opportunities"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `on` | `moveAway` \| `castSpell` \| `rangedAttack` \| `standUp` \| `beHit` \| `allyHit` \| `custom` |  | `"moveAway"` |
| `event` | string |  |  |
| `actionType` | [→ rules.actionTypes](#rulesactionTypes) |  |  |
| `use` | [→ content.abilities](#contentabilities) |  |  |
| `requires` | [DSL](#the-dsl) |  |  |
| `effects` | [DSL](#the-dsl)[] |  | `[]` |
| `usesPerRound` | number |  | `1` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `coverTypes`

<a id="module-rules-coverTypes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `defenceBonus` | number |  | `0` |
| `blocksTargeting` | boolean |  | `false` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `spellcasting`

<a id="module-rules-spellcasting"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `mode` | `none` \| `slots` \| `points` \| `both` |  | `"none"` |
| `maxSpellLevel` | number |  | `9` |
| `slotTable` | { string: number[] } |  | `{}` |
| `pointResource` | [→ rules.resources](#rulesresources) |  |  |
| `pointCosts` | { string: number } |  | `{}` |
| `saveDifficulty` | [DSL](#the-dsl) |  |  |
| `attackBonus` | [DSL](#the-dsl) |  |  |
| `concentration` | [object](#module-rules-spellcasting-concentration) |  | `{}` |
| `recoverOn` | [→ rules.rests](#rulesrests)[] |  | `[]` |
| `ritualCasting` | boolean |  | `false` |
| `extra` | { string: any } |  | `{}` |

### Module → `rules` → `spellcasting` → `concentration`

<a id="module-rules-spellcasting-concentration"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `enabled` | boolean |  | `true` |
| `savingThrow` | [→ rules.savingThrows](#rulessavingThrows) |  |  |
| `difficulty` | [DSL](#the-dsl) |  |  |
| `maxConcurrent` | number |  | `1` |

### Module → `rules` → `perception`

<a id="module-rules-perception"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `sightSense` | [→ rules.senses](#rulessenses) |  |  |
| `curiosityMinutes` | number |  | `10` |
| `defaultStance` | [→ rules.stances](#rulesstances) |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `content`

<a id="module-content"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `abilities` | [object](#module-content-abilities)[] |  | `[]` |
| `skills` | [object](#module-content-skills)[] |  | `[]` |
| `ancestries` | [object](#module-content-ancestries)[] |  | `[]` |
| `classes` | [object](#module-content-classes)[] |  | `[]` |
| `items` | [object](#module-content-items)[] |  | `[]` |
| `lootTables` | [object](#module-content-lootTables)[] |  | `[]` |
| `monsters` | [object](#module-content-monsters)[] |  | `[]` |
| `traps` | [object](#module-content-traps)[] |  | `[]` |
| `factions` | [object](#module-content-factions)[] |  | `[]` |
| `npcs` | [object](#module-content-npcs)[] |  | `[]` |

### Module → `content` → `abilities`

<a id="module-content-abilities"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `actionType` | [→ rules.actionTypes](#rulesactionTypes) |  |  |
| `costs` | { [→ rules.resources](#rulesresources): [DSL](#the-dsl) } |  | `{}` |
| `range` | number |  | `0` |
| `cooldown` | number |  | `0` |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `when` | [DSL](#the-dsl) |  |  |
| `targeting` | `self` \| `single` \| `allEnemies` \| `allAllies` \| `all` \| `none` |  | `"single"` |
| `attack` | [object](#module-content-abilities-attack) |  |  |
| `savingThrow` | [object](#module-content-abilities-savingThrow) |  |  |
| `spellLevel` | number |  |  |
| `concentration` | boolean |  | `false` |
| `ritual` | boolean |  | `false` |
| `castingTime` | string |  | `""` |
| `duration` | string |  | `""` |
| `components` | `verbal` \| `somatic` \| `material` \| `focus`[] |  | `[]` |
| `materialComponent` | [→ content.items](#contentitems) |  |  |
| `areaOfEffect` | [object](#module-content-abilities-areaOfEffect) |  |  |
| `upcast` | [DSL](#the-dsl)[] |  | `[]` |
| `onUse` | [DSL](#the-dsl)[] |  | `[]` |
| `onMiss` | [DSL](#the-dsl)[] |  | `[]` |
| `onCritical` | [DSL](#the-dsl)[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `content` → `abilities` → `requires`

<a id="module-content-abilities-requires"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `description` | string |  | `""` |
| `minLevel` | number |  |  |
| `maxLevel` | number |  |  |
| `classes` | [→ content.classes](#contentclasses)[] |  | `[]` |
| `ancestries` | [→ content.ancestries](#contentancestries)[] |  | `[]` |
| `abilities` | [→ content.abilities](#contentabilities)[] |  | `[]` |
| `attributes` | [object](#module-content-abilities-requires-attributes)[] |  | `[]` |
| `skills` | [object](#module-content-abilities-requires-skills)[] |  | `[]` |
| `items` | [object](#module-content-abilities-requires-items)[] |  | `[]` |
| `quests` | [object](#module-content-abilities-requires-quests)[] |  | `[]` |
| `factions` | [object](#module-content-abilities-requires-factions)[] |  | `[]` |
| `memories` | [object](#module-content-abilities-requires-memories)[] |  | `[]` |
| `flags` | [object](#module-content-abilities-requires-flags)[] |  | `[]` |
| `without` | [object](#module-content-abilities-requires-without) |  | `{}` |
| `custom` | [DSL](#the-dsl) |  |  |
| `anyOf` | [object](#module-content-abilities-requires-anyOf)[] |  | `[]` |

### Module → `content` → `abilities` → `requires` → `attributes`

<a id="module-content-abilities-requires-attributes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `attribute` | [→ rules.attributes](#rulesattributes) | **yes** |  |
| `min` | number |  |  |
| `max` | number |  |  |

### Module → `content` → `abilities` → `requires` → `skills`

<a id="module-content-abilities-requires-skills"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `skill` | [→ content.skills](#contentskills) | **yes** |  |
| `minRank` | number |  | `1` |
| `minTier` | [→ rules.masteryTiers](#rulesmasteryTiers) |  |  |

### Module → `content` → `abilities` → `requires` → `items`

<a id="module-content-abilities-requires-items"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `item` | [→ content.items](#contentitems) | **yes** |  |
| `quantity` | number |  | `1` |
| `consume` | boolean |  | `false` |
| `equipped` | boolean |  | `false` |

### Module → `content` → `abilities` → `requires` → `quests`

<a id="module-content-abilities-requires-quests"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `quest` | [→ narrative.quests](#narrativequests) | **yes** |  |
| `status` | `available` \| `active` \| `complete` \| `failed` \| `unstarted` |  | `"complete"` |
| `objective` | string |  |  |

### Module → `content` → `abilities` → `requires` → `factions`

<a id="module-content-abilities-requires-factions"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `faction` | [→ content.factions](#contentfactions) | **yes** |  |
| `minStanding` | number |  |  |
| `maxStanding` | number |  |  |
| `minRank` | string |  |  |

### Module → `content` → `abilities` → `requires` → `memories`

<a id="module-content-abilities-requires-memories"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `deedKind` | [→ narrative.deedKinds](#narrativedeedKinds) | **yes** |  |
| `who` | `speaker` \| `party` \| `anyone` \| `faction` |  | `"speaker"` |
| `known` | boolean |  | `true` |
| `withinDays` | number |  |  |

### Module → `content` → `abilities` → `requires` → `flags`

<a id="module-content-abilities-requires-flags"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `flag` | string | **yes** |  |
| `equals` | [DSL](#the-dsl) |  |  |

### Module → `content` → `abilities` → `requires` → `without`

<a id="module-content-abilities-requires-without"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `classes` | [→ content.classes](#contentclasses)[] |  | `[]` |
| `abilities` | [→ content.abilities](#contentabilities)[] |  | `[]` |
| `items` | [→ content.items](#contentitems)[] |  | `[]` |
| `quests` | [object](#module-content-abilities-requires-quests)[] |  | `[]` |
| `flags` | [object](#module-content-abilities-requires-flags)[] |  | `[]` |
| `conditions` | [→ rules.conditions](#rulesconditions)[] |  | `[]` |

### Module → `content` → `abilities` → `requires` → `anyOf`

<a id="module-content-abilities-requires-anyOf"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `description` | string |  | `""` |
| `minLevel` | number |  |  |
| `maxLevel` | number |  |  |
| `classes` | [→ content.classes](#contentclasses)[] |  | `[]` |
| `ancestries` | [→ content.ancestries](#contentancestries)[] |  | `[]` |
| `abilities` | [→ content.abilities](#contentabilities)[] |  | `[]` |
| `attributes` | [object](#module-content-abilities-requires-attributes)[] |  | `[]` |
| `skills` | [object](#module-content-abilities-requires-skills)[] |  | `[]` |
| `items` | [object](#module-content-abilities-requires-items)[] |  | `[]` |
| `quests` | [object](#module-content-abilities-requires-quests)[] |  | `[]` |
| `factions` | [object](#module-content-abilities-requires-factions)[] |  | `[]` |
| `memories` | [object](#module-content-abilities-requires-memories)[] |  | `[]` |
| `flags` | [object](#module-content-abilities-requires-flags)[] |  | `[]` |
| `without` | [object](#module-content-abilities-requires-without) |  | `{}` |
| `custom` | [DSL](#the-dsl) |  |  |

### Module → `content` → `abilities` → `attack`

<a id="module-content-abilities-attack"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `stat` | [→ rules.attributes](#rulesattributes) | **yes** |  |
| `against` | [→ rules.derivedStats](#rulesderivedStats) | **yes** |  |

### Module → `content` → `abilities` → `savingThrow`

<a id="module-content-abilities-savingThrow"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `save` | [→ rules.savingThrows](#rulessavingThrows) | **yes** |  |
| `difficulty` | [DSL](#the-dsl) |  |  |
| `onSuccess` | `none` \| `half` \| `negates` \| `partial` |  | `"negates"` |
| `onSuccessEffects` | [DSL](#the-dsl)[] |  | `[]` |

### Module → `content` → `abilities` → `areaOfEffect`

<a id="module-content-abilities-areaOfEffect"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `shape` | `sphere` \| `cube` \| `cone` \| `line` \| `cylinder` \| `aura` | **yes** |  |
| `size` | number | **yes** |  |
| `affects` | `all` \| `enemies` \| `allies` \| `others` |  | `"all"` |

### Module → `content` → `skills`

<a id="module-content-skills"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `attribute` | [→ rules.attributes](#rulesattributes) | **yes** |  |
| `tags` | string[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `content` → `ancestries`

<a id="module-content-ancestries"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `attributeBonuses` | { [→ rules.attributes](#rulesattributes): number } |  | `{}` |
| `grantedAbilities` | [→ content.abilities](#contentabilities)[] |  | `[]` |
| `skillBonuses` | { [→ content.skills](#contentskills): number } |  | `{}` |
| `traits` | [object](#module-content-ancestries-traits)[] |  | `[]` |
| `size` | [→ rules.sizes](#rulessizes) |  |  |
| `creatureType` | [→ rules.creatureTypes](#rulescreatureTypes) |  |  |
| `speeds` | { [→ rules.movementModes](#rulesmovementModes): number } |  | `{}` |
| `senses` | { [→ rules.senses](#rulessenses): number } |  | `{}` |
| `languages` | [→ rules.languages](#ruleslanguages)[] |  | `[]` |
| `damageInteractions` | [object](#module-content-ancestries-damageInteractions)[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `content` → `ancestries` → `traits`

<a id="module-content-ancestries-traits"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `when` | [DSL](#the-dsl) |  |  |
| `then` | [DSL](#the-dsl)[] | **yes** |  |

### Module → `content` → `ancestries` → `damageInteractions`

<a id="module-content-ancestries-damageInteractions"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `damageType` | [→ rules.damageTypes](#rulesdamageTypes) | **yes** |  |
| `multiplier` | number |  | `1` |
| `unless` | string[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `content` → `classes`

<a id="module-content-classes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `hitDie` | string | **yes** |  |
| `attributeBonuses` | { [→ rules.attributes](#rulesattributes): number } |  | `{}` |
| `primaryAttribute` | [→ rules.attributes](#rulesattributes) | **yes** |  |
| `skillProficiencies` | [→ content.skills](#contentskills)[] |  | `[]` |
| `startingItems` | [object](#module-content-classes-startingItems)[] |  | `[]` |
| `abilitiesByLevel` | { string: [→ content.abilities](#contentabilities)[] } |  | `{}` |
| `saveProficiencies` | [→ rules.savingThrows](#rulessavingThrows)[] |  | `[]` |
| `spellcasting` | [object](#module-content-classes-spellcasting) |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `content` → `classes` → `startingItems`

<a id="module-content-classes-startingItems"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `item` | [→ content.items](#contentitems) | **yes** |  |
| `quantity` | number |  | `1` |

### Module → `content` → `classes` → `spellcasting`

<a id="module-content-classes-spellcasting"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `castingAttribute` | [→ rules.attributes](#rulesattributes) | **yes** |  |
| `spellList` | [→ content.abilities](#contentabilities)[] |  | `[]` |
| `progression` | number |  | `1` |
| `knownByLevel` | { string: number } |  | `{}` |

### Module → `content` → `items`

<a id="module-content-items"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `kind` | `weapon` \| `armor` \| `shield` \| `consumable` \| `trinket` \| `tool` \| `key` \| `treasure` \| `material` | **yes** |  |
| `tags` | string[] |  | `[]` |
| `value` | number |  | `0` |
| `weight` | number |  | `0` |
| `stackable` | boolean |  | `false` |
| `slot` | [→ rules.equipmentSlots](#rulesequipmentSlots) |  |  |
| `damage` | [object](#module-content-items-damage) |  |  |
| `modifiers` | { [→ rules.derivedStats](#rulesderivedStats): [DSL](#the-dsl) } |  | `{}` |
| `onUse` | [DSL](#the-dsl)[] |  | `[]` |
| `consumedOnUse` | boolean |  | `false` |
| `procs` | [object](#module-content-ancestries-traits)[] |  | `[]` |
| `grantedAbilities` | [→ content.abilities](#contentabilities)[] |  | `[]` |
| `rarity` | `common` \| `uncommon` \| `rare` \| `very_rare` \| `legendary` \| `artifact` |  |  |
| `requiresAttunement` | boolean |  | `false` |
| `attunementRequires` | string[] |  | `[]` |
| `charges` | [object](#module-content-items-charges) |  |  |
| `properties` | string[] |  | `[]` |
| `damageInteractions` | [object](#module-content-ancestries-damageInteractions)[] |  | `[]` |
| `usableBy` | [→ content.classes](#contentclasses)[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `content` → `items` → `damage`

<a id="module-content-items-damage"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `dice` | string | **yes** |  |
| `damageType` | [→ rules.damageTypes](#rulesdamageTypes) | **yes** |  |
| `stat` | [→ rules.attributes](#rulesattributes) |  |  |

### Module → `content` → `items` → `charges`

<a id="module-content-items-charges"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `max` | number | **yes** |  |
| `rechargeOn` | [→ rules.rests](#rulesrests) |  |  |
| `rechargeAmount` | string |  |  |
| `destroyOnEmpty` | boolean |  | `false` |

### Module → `content` → `lootTables`

<a id="module-content-lootTables"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string |  |  |
| `description` | string |  | `""` |
| `rolls` | string |  | `"1"` |
| `entries` | [object](#module-content-lootTables-entries)[] | **yes** |  |
| `emptyChance` | number |  | `0` |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `bonusRollSkill` | [→ content.skills](#contentskills) |  |  |

### Module → `content` → `lootTables` → `entries`

<a id="module-content-lootTables-entries"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `weight` | number |  | `1` |
| `value` | [object](#module-content-lootTables-entries-value) | **yes** |  |

### Module → `content` → `lootTables` → `entries` → `value`

<a id="module-content-lootTables-entries-value"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `item` | [→ content.items](#contentitems) | **yes** |  |
| `quantity` | string |  | `"1"` |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `requirementScope` | `finder` \| `party` \| `anyMember` |  | `"anyMember"` |
| `unique` | boolean |  | `false` |

### Module → `content` → `monsters`

<a id="module-content-monsters"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `level` | number |  | `1` |
| `xp` | number |  | `0` |
| `attributes` | { [→ rules.attributes](#rulesattributes): number } | **yes** |  |
| `resourceOverrides` | { [→ rules.resources](#rulesresources): [DSL](#the-dsl) } |  | `{}` |
| `derivedOverrides` | { [→ rules.derivedStats](#rulesderivedStats): [DSL](#the-dsl) } |  | `{}` |
| `abilities` | [→ content.abilities](#contentabilities)[] |  | `[]` |
| `behaviour` | [object](#module-content-monsters-behaviour)[] |  | `[]` |
| `reactions` | [object](#module-content-monsters-reactions)[] |  | `[]` |
| `loot` | [→ content.lootTables](#contentlootTables) |  |  |
| `conditionalLoot` | [→ content.lootTables](#contentlootTables)[] |  | `[]` |
| `faction` | [→ content.factions](#contentfactions) |  |  |
| `descriptors` | string[] |  | `[]` |
| `size` | [→ rules.sizes](#rulessizes) |  |  |
| `creatureType` | [→ rules.creatureTypes](#rulescreatureTypes) |  |  |
| `alignment` | [→ rules.alignments](#rulesalignments) |  |  |
| `damageInteractions` | [object](#module-content-ancestries-damageInteractions)[] |  | `[]` |
| `conditionImmunities` | [→ rules.conditions](#rulesconditions)[] |  | `[]` |
| `saveBonuses` | { [→ rules.savingThrows](#rulessavingThrows): number } |  | `{}` |
| `skillBonuses` | { [→ content.skills](#contentskills): number } |  | `{}` |
| `senses` | { [→ rules.senses](#rulessenses): number } |  | `{}` |
| `speeds` | { [→ rules.movementModes](#rulesmovementModes): number } |  | `{}` |
| `languages` | [→ rules.languages](#ruleslanguages)[] |  | `[]` |
| `challenge` | number |  |  |
| `specialTurns` | [object](#module-content-monsters-specialTurns)[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `content` → `monsters` → `behaviour`

<a id="module-content-monsters-behaviour"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `priority` | number |  | `0` |
| `when` | [DSL](#the-dsl) |  |  |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `use` | [→ content.abilities](#contentabilities) | **yes** |  |

### Module → `content` → `monsters` → `reactions`

<a id="module-content-monsters-reactions"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `description` | string |  | `""` |
| `on` | `seePlayer` \| `allyHurt` \| `allyKilled` \| `selfHurt` \| `lowHealth` \| `combatStart` \| `combatEnd` \| `turnStart` \| `witnessDeed` \| `questComplete` \| `itemShown` \| `custom` |  | `"turnStart"` |
| `event` | string |  |  |
| `priority` | number |  | `0` |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `when` | [DSL](#the-dsl) |  |  |
| `chance` | number |  | `1` |
| `roll` | [object](#module-content-monsters-reactions-roll) |  |  |
| `onSuccess` | [DSL](#the-dsl)[] |  | `[]` |
| `onFailure` | [DSL](#the-dsl)[] |  | `[]` |
| `effects` | [DSL](#the-dsl)[] |  | `[]` |
| `use` | [→ content.abilities](#contentabilities) |  |  |
| `textKey` | [→ narrative.textGrammar](#narrativetextGrammar) |  |  |
| `oncePerEncounter` | boolean |  | `false` |

### Module → `content` → `monsters` → `reactions` → `roll`

<a id="module-content-monsters-reactions-roll"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `skill` | [→ content.skills](#contentskills) |  |  |
| `attribute` | [→ rules.attributes](#rulesattributes) |  |  |
| `difficulty` | number |  | `12` |
| `opposedBy` | [→ content.skills](#contentskills) |  |  |

### Module → `content` → `monsters` → `specialTurns`

<a id="module-content-monsters-specialTurns"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `use` | [→ content.abilities](#contentabilities) | **yes** |  |
| `uses` | number |  | `1` |
| `when` | [DSL](#the-dsl) |  |  |

### Module → `content` → `traps`

<a id="module-content-traps"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `detect` | [object](#module-content-traps-detect) | **yes** |  |
| `disarm` | [object](#module-content-traps-disarm) | **yes** |  |
| `onTrigger` | [DSL](#the-dsl)[] |  | `[]` |
| `onDisarm` | [DSL](#the-dsl)[] |  | `[]` |
| `reusable` | boolean |  | `false` |

### Module → `content` → `traps` → `detect`

<a id="module-content-traps-detect"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `skill` | [→ content.skills](#contentskills) | **yes** |  |
| `difficulty` | number | **yes** |  |

### Module → `content` → `traps` → `disarm`

<a id="module-content-traps-disarm"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `skill` | [→ content.skills](#contentskills) | **yes** |  |
| `difficulty` | number | **yes** |  |

### Module → `content` → `factions`

<a id="module-content-factions"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `initialStanding` | number |  | `0` |
| `relations` | { [→ content.factions](#contentfactions): number } |  | `{}` |
| `ranks` | [object](#module-content-factions-ranks)[] |  | `[]` |
| `decayPerDay` | number |  | `0` |

### Module → `content` → `factions` → `ranks`

<a id="module-content-factions-ranks"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `atLeast` | number | **yes** |  |

### Module → `content` → `npcs`

<a id="module-content-npcs"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `faction` | [→ content.factions](#contentfactions) |  |  |
| `statblock` | [→ content.monsters](#contentmonsters) |  |  |
| `dialogue` | [→ narrative.dialogues](#narrativedialogues) |  |  |
| `home` | string |  |  |
| `gullibility` | number |  | `0.5` |
| `memorySpan` | number |  | `90` |
| `disposition` | number |  | `0` |
| `reactions` | [object](#module-content-monsters-reactions)[] |  | `[]` |
| `offersQuests` | [→ narrative.quests](#narrativequests)[] |  | `[]` |
| `shop` | [object](#module-content-npcs-shop) |  |  |
| `caresAbout` | [→ narrative.deedKinds](#narrativedeedKinds)[] |  | `[]` |

### Module → `content` → `npcs` → `shop`

<a id="module-content-npcs-shop"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `lootTable` | [→ content.lootTables](#contentlootTables) |  |  |
| `buysTags` | string[] |  | `[]` |
| `priceMultiplier` | number |  | `1` |
| `requires` | [object](#module-content-abilities-requires) |  |  |

### Module → `world`

<a id="module-world"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `terrains` | [object](#module-world-terrains)[] |  | `[]` |
| `palettes` | [object](#module-world-palettes)[] |  | `[]` |
| `biomes` | [object](#module-world-biomes)[] |  | `[]` |
| `areas` | [object](#module-world-areas)[] |  | `[]` |
| `pointsOfInterest` | [object](#module-world-pointsOfInterest)[] |  | `[]` |
| `gates` | [object](#module-world-gates)[] |  | `[]` |
| `roomTemplates` | [object](#module-world-roomTemplates)[] |  | `[]` |
| `encounterTables` | [object](#module-world-encounterTables)[] |  | `[]` |
| `dungeons` | [object](#module-world-dungeons)[] |  | `[]` |
| `time` | [object](#module-world-time) |  | `{}` |

### Module → `world` → `terrains`

<a id="module-world-terrains"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `glyph` | string |  | `"."` |
| `color` | `red` \| `green` \| `yellow` \| `blue` \| `magenta` \| `cyan` \| `white` \| `gray` |  |  |
| `passable` | boolean |  | `true` |
| `opaque` | boolean |  | `false` |
| `moveCost` | number |  | `1` |
| `requiresMode` | [→ rules.movementModes](#rulesmovementModes)[] |  | `[]` |
| `providesCover` | [→ rules.coverTypes](#rulescoverTypes) |  |  |
| `onEnter` | [DSL](#the-dsl)[] |  | `[]` |
| `onOccupy` | [DSL](#the-dsl)[] |  | `[]` |
| `lightRadius` | number |  | `0` |
| `isDoor` | boolean |  | `false` |
| `extra` | { string: any } |  | `{}` |

### Module → `world` → `palettes`

<a id="module-world-palettes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string |  |  |
| `floor` | [→ world.terrains](#worldterrains) | **yes** |  |
| `wall` | [→ world.terrains](#worldterrains) | **yes** |  |
| `door` | [→ world.terrains](#worldterrains) |  |  |
| `scatter` | [object](#module-world-palettes-scatter)[] |  | `[]` |
| `exterior` | [→ world.terrains](#worldterrains) |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `world` → `palettes` → `scatter`

<a id="module-world-palettes-scatter"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `terrain` | [→ world.terrains](#worldterrains) | **yes** |  |
| `frequency` | number |  | `0.05` |
| `distribution` | `speckle` \| `patch` |  | `"speckle"` |
| `scale` | number |  | `8` |
| `octaves` | number |  | `2` |
| `edgeTerrain` | [→ world.terrains](#worldterrains) |  |  |
| `edgeWidth` | number |  | `1` |
| `priority` | number |  | `0` |

### Module → `world` → `biomes`

<a id="module-world-biomes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `layer` | `overworld` \| `underworld` \| `both` |  | `"underworld"` |
| `roomTemplates` | [→ world.roomTemplates](#worldroomTemplates)[] |  | `[]` |
| `encounterTables` | [→ world.encounterTables](#worldencounterTables)[] |  | `[]` |
| `lootTables` | [→ content.lootTables](#contentlootTables)[] |  | `[]` |
| `traps` | [→ content.traps](#contenttraps)[] |  | `[]` |
| `ambienceKey` | [→ narrative.textGrammar](#narrativetextGrammar) |  |  |
| `triggers` | [object](#module-world-biomes-triggers)[] |  | `[]` |
| `palette` | [→ world.palettes](#worldpalettes) |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `world` → `biomes` → `triggers`

<a id="module-world-biomes-triggers"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `description` | string |  | `""` |
| `mode` | `once` \| `everyEntry` \| `untilComplete` \| `loop` \| `restart` |  | `"once"` |
| `on` | `enter` \| `exit` \| `rest` \| `search` \| `combatStart` \| `combatEnd` \| `timePass` \| `custom` |  | `"enter"` |
| `event` | string |  |  |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `when` | [DSL](#the-dsl) |  |  |
| `cooldownMinutes` | number |  | `0` |
| `completeWhen` | [DSL](#the-dsl) |  |  |
| `remember` | boolean |  | `true` |
| `chance` | number |  | `1` |
| `effects` | [DSL](#the-dsl)[] |  | `[]` |
| `textKey` | [→ narrative.textGrammar](#narrativetextGrammar) |  |  |

### Module → `world` → `areas`

<a id="module-world-areas"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `biome` | [→ world.biomes](#worldbiomes) | **yes** |  |
| `layer` | `overworld` \| `underworld` |  | `"overworld"` |
| `descriptionKey` | [→ narrative.textGrammar](#narrativetextGrammar) |  |  |
| `connections` | [object](#module-world-areas-connections)[] |  | `[]` |
| `triggers` | [object](#module-world-biomes-triggers)[] |  | `[]` |
| `encounterTables` | [→ world.encounterTables](#worldencounterTables)[] |  | `[]` |
| `controllingFaction` | [→ content.factions](#contentfactions) |  |  |
| `dangerLevel` | number |  | `1` |
| `recommendedLevel` | number |  |  |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `map` | [object](#module-world-areas-map) |  | `{}` |
| `entryPoint` | [object](#module-world-areas-entryPoint) |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `world` → `areas` → `connections`

<a id="module-world-areas-connections"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `to` | [→ world.areas](#worldareas) | **yes** |  |
| `travelMinutes` | number |  | `60` |
| `gate` | [→ world.gates](#worldgates) |  |  |
| `oneWay` | boolean |  | `false` |
| `encounterTables` | [→ world.encounterTables](#worldencounterTables)[] |  | `[]` |

### Module → `world` → `areas` → `map`

<a id="module-world-areas-map"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `width` | string |  | `"7"` |
| `height` | string |  | `"7"` |
| `palette` | [→ world.palettes](#worldpalettes) |  |  |
| `layout` | string[] |  | `[]` |
| `legend` | { string: [→ world.terrains](#worldterrains) } |  | `{}` |
| `extra` | { string: any } |  | `{}` |

### Module → `world` → `areas` → `entryPoint`

<a id="module-world-areas-entryPoint"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `x` | number | **yes** |  |
| `y` | number | **yes** |  |

### Module → `world` → `pointsOfInterest`

<a id="module-world-pointsOfInterest"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `area` | [→ world.areas](#worldareas) | **yes** |  |
| `kind` | `settlement` \| `shrine` \| `ruin` \| `camp` \| `dungeonEntrance` \| `landmark` \| `crossing` \| `lair` \| `market` \| `wilds` |  | `"landmark"` |
| `descriptionKey` | [→ narrative.textGrammar](#narrativetextGrammar) |  |  |
| `gate` | [→ world.gates](#worldgates) |  |  |
| `hidden` | boolean |  | `false` |
| `discover` | [object](#module-world-pointsOfInterest-discover) |  |  |
| `triggers` | [object](#module-world-biomes-triggers)[] |  | `[]` |
| `encounterTables` | [→ world.encounterTables](#worldencounterTables)[] |  | `[]` |
| `encounterChance` | number |  |  |
| `residents` | [→ content.npcs](#contentnpcs)[] |  | `[]` |
| `loot` | [→ content.lootTables](#contentlootTables)[] |  | `[]` |
| `dungeon` | [→ world.dungeons](#worlddungeons) |  |  |
| `services` | `inn` \| `market` \| `temple` \| `smith` \| `guild` \| `stable` \| `healer`[] |  | `[]` |
| `rumourReach` | number |  | `1` |
| `controllingFaction` | [→ content.factions](#contentfactions) |  |  |
| `travelMinutes` | number |  | `0` |
| `position` | [object](#module-world-areas-entryPoint) |  |  |
| `map` | [object](#module-world-areas-map) |  |  |
| `extra` | { string: any } |  | `{}` |

### Module → `world` → `pointsOfInterest` → `discover`

<a id="module-world-pointsOfInterest-discover"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `skill` | [→ content.skills](#contentskills) | **yes** |  |
| `difficulty` | number | **yes** |  |

### Module → `world` → `gates`

<a id="module-world-gates"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `kind` | `lock` \| `ward` \| `puzzle` \| `toll` \| `story` \| `hazard` |  | `"lock"` |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `bypass` | [object](#module-world-gates-bypass) |  |  |
| `opensWith` | [→ content.abilities](#contentabilities)[] |  | `[]` |
| `onOpen` | [DSL](#the-dsl)[] |  | `[]` |
| `onBlocked` | [DSL](#the-dsl)[] |  | `[]` |
| `blockedTextKey` | [→ narrative.textGrammar](#narrativetextGrammar) |  |  |
| `staysOpen` | boolean |  | `true` |

### Module → `world` → `gates` → `bypass`

<a id="module-world-gates-bypass"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `skill` | [→ content.skills](#contentskills) | **yes** |  |
| `difficulty` | number | **yes** |  |
| `onSuccess` | [DSL](#the-dsl)[] |  | `[]` |
| `onFailure` | [DSL](#the-dsl)[] |  | `[]` |
| `retryable` | boolean |  | `true` |

### Module → `world` → `roomTemplates`

<a id="module-world-roomTemplates"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `tags` | string[] |  | `[]` |
| `descriptionKey` | [→ narrative.textGrammar](#narrativetextGrammar) | **yes** |  |
| `weight` | number |  | `1` |
| `role` | `entrance` \| `corridor` \| `chamber` \| `vault` \| `boss` \| `shrine` \| `lair` |  | `"chamber"` |
| `minExits` | number |  | `1` |
| `maxExits` | number |  | `4` |
| `encounterChance` | number |  | `0.3` |
| `trapChance` | number |  | `0.1` |
| `lootChance` | number |  | `0.25` |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `triggers` | [object](#module-world-biomes-triggers)[] |  | `[]` |
| `map` | [object](#module-world-areas-map) |  | `{}` |
| `extra` | { string: any } |  | `{}` |

### Module → `world` → `encounterTables`

<a id="module-world-encounterTables"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string |  |  |
| `description` | string |  | `""` |
| `minDepth` | number |  | `0` |
| `maxDepth` | number |  | `999` |
| `chance` | number |  | `1` |
| `emptyWeight` | number |  | `0` |
| `groups` | [object](#module-world-encounterTables-groups)[] | **yes** |  |

### Module → `world` → `encounterTables` → `groups`

<a id="module-world-encounterTables-groups"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string |  |  |
| `weight` | number |  | `1` |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `entries` | [object](#module-world-encounterTables-groups-entries)[] | **yes** |  |
| `onEncounter` | [DSL](#the-dsl)[] |  | `[]` |
| `textKey` | [→ narrative.textGrammar](#narrativetextGrammar) |  |  |
| `hostile` | boolean |  | `true` |

### Module → `world` → `encounterTables` → `groups` → `entries`

<a id="module-world-encounterTables-groups-entries"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `monster` | [→ content.monsters](#contentmonsters) | **yes** |  |
| `count` | string |  | `"1"` |
| `scaleWithLevel` | boolean |  | `false` |

### Module → `world` → `dungeons`

<a id="module-world-dungeons"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `biome` | [→ world.biomes](#worldbiomes) | **yes** |  |
| `roomCount` | string |  | `"8"` |
| `depth` | string |  | `"1"` |
| `branchiness` | number |  | `0.35` |
| `lockedDoorChance` | number |  | `0.15` |
| `doorGates` | [→ world.gates](#worldgates)[] |  | `[]` |
| `guaranteedRoles` | string[] |  | `["entrance","boss"]` |
| `bossTable` | [→ world.encounterTables](#worldencounterTables) |  |  |
| `completionTriggers` | [object](#module-world-biomes-triggers)[] |  | `[]` |
| `palette` | [→ world.palettes](#worldpalettes) |  |  |
| `corridorLength` | string |  | `"3d3"` |
| `extra` | { string: any } |  | `{}` |

### Module → `world` → `time`

<a id="module-world-time"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `minutesPerDay` | number |  | `1440` |
| `daysPerMonth` | number |  | `30` |
| `monthNames` | string[] |  | `[]` |
| `dayPhases` | [object](#module-world-time-dayPhases)[] |  | `[]` |
| `startMinute` | number |  | `480` |
| `minutesPerTile` | number |  | `0` |

### Module → `world` → `time` → `dayPhases`

<a id="module-world-time-dayPhases"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `startMinute` | number | **yes** |  |

### Module → `narrative`

<a id="module-narrative"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `textGrammar` | [object](#module-narrative-textGrammar)[] |  | `[]` |
| `dialogues` | [object](#module-narrative-dialogues)[] |  | `[]` |
| `quests` | [object](#module-narrative-quests)[] |  | `[]` |
| `arcs` | [object](#module-narrative-arcs)[] |  | `[]` |
| `deedKinds` | [object](#module-narrative-deedKinds)[] |  | `[]` |
| `memory` | [object](#module-narrative-memory) |  | `{}` |

### Module → `narrative` → `textGrammar`

<a id="module-narrative-textGrammar"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `description` | string |  | `""` |
| `variants` | [object](#module-narrative-textGrammar-variants)[] | **yes** |  |

### Module → `narrative` → `textGrammar` → `variants`

<a id="module-narrative-textGrammar-variants"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `text` | string | **yes** |  |
| `when` | [DSL](#the-dsl) |  |  |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `weight` | number |  | `1` |
| `tags` | string[] |  | `[]` |

### Module → `narrative` → `dialogues`

<a id="module-narrative-dialogues"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `start` | string | **yes** |  |
| `nodes` | [object](#module-narrative-dialogues-nodes)[] | **yes** |  |

### Module → `narrative` → `dialogues` → `nodes`

<a id="module-narrative-dialogues-nodes"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `says` | [object](#module-narrative-textGrammar-variants)[] | **yes** |  |
| `onEnter` | [DSL](#the-dsl)[] |  | `[]` |
| `remembers` | [→ narrative.deedKinds](#narrativedeedKinds) |  |  |
| `redirectWhen` | [object](#module-narrative-dialogues-nodes-redirectWhen)[] |  | `[]` |
| `options` | [object](#module-narrative-dialogues-nodes-options)[] |  | `[]` |

### Module → `narrative` → `dialogues` → `nodes` → `redirectWhen`

<a id="module-narrative-dialogues-nodes-redirectWhen"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `requires` | [object](#module-content-abilities-requires) | **yes** |  |
| `goto` | string | **yes** |  |

### Module → `narrative` → `dialogues` → `nodes` → `options`

<a id="module-narrative-dialogues-nodes-options"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `text` | string | **yes** |  |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `when` | [DSL](#the-dsl) |  |  |
| `showWhenLocked` | boolean |  | `false` |
| `lockedHint` | string |  | `""` |
| `check` | [object](#module-narrative-dialogues-nodes-options-check) |  |  |
| `effects` | [DSL](#the-dsl)[] |  | `[]` |
| `onceOnly` | boolean |  | `false` |
| `goto` | string |  |  |

### Module → `narrative` → `quests`

<a id="module-narrative-quests"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `tags` | string[] |  | `[]` |
| `available` | [DSL](#the-dsl) |  |  |
| `autoStart` | boolean |  | `false` |
| `giver` | [→ content.npcs](#contentnpcs) |  |  |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `stages` | [object](#module-narrative-quests-stages)[] |  | `[]` |
| `objectives` | [object](#module-narrative-quests-objectives)[] |  | `[]` |
| `ordered` | boolean |  | `true` |
| `onStart` | [DSL](#the-dsl)[] |  | `[]` |
| `onComplete` | [DSL](#the-dsl)[] |  | `[]` |
| `onFail` | [DSL](#the-dsl)[] |  | `[]` |
| `failWhen` | [DSL](#the-dsl) |  |  |
| `rewards` | [object](#module-narrative-quests-rewards) |  | `{}` |
| `unlocks` | [→ narrative.quests](#narrativequests)[] |  | `[]` |
| `remembersAs` | [→ narrative.deedKinds](#narrativedeedKinds) |  |  |
| `repeatable` | boolean |  | `false` |
| `timeLimitDays` | number |  |  |

### Module → `narrative` → `quests` → `stages`

<a id="module-narrative-quests-stages"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string |  |  |
| `description` | string |  | `""` |
| `objectives` | [object](#module-narrative-quests-stages-objectives)[] |  | `[]` |
| `onStart` | [DSL](#the-dsl)[] |  | `[]` |
| `onComplete` | [DSL](#the-dsl)[] |  | `[]` |
| `journalKey` | [→ narrative.textGrammar](#narrativetextGrammar) |  |  |

### Module → `narrative` → `quests` → `stages` → `objectives`

<a id="module-narrative-quests-stages-objectives"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `description` | string |  | `""` |
| `kind` | `custom` \| `kill` \| `collect` \| `reach` \| `talk` \| `deliver` \| `survive` \| `escort` |  | `"custom"` |
| `target` | string |  |  |
| `count` | number |  | `1` |
| `when` | [DSL](#the-dsl) |  |  |
| `requires` | [object](#module-content-abilities-requires) |  |  |
| `hidden` | boolean |  | `false` |
| `optional` | boolean |  | `false` |
| `onComplete` | [DSL](#the-dsl)[] |  | `[]` |

### Module → `narrative` → `quests` → `rewards`

<a id="module-narrative-quests-rewards"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `xp` | [DSL](#the-dsl) |  | `0` |
| `items` | [object](#module-narrative-quests-rewards-items)[] |  | `[]` |
| `reputation` | { [→ content.factions](#contentfactions): [DSL](#the-dsl) } |  | `{}` |

### Module → `narrative` → `quests` → `rewards` → `items`

<a id="module-narrative-quests-rewards-items"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `item` | [→ content.items](#contentitems) | **yes** |  |
| `quantity` | [DSL](#the-dsl) |  | `1` |

### Module → `narrative` → `arcs`

<a id="module-narrative-arcs"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string |  | `""` |
| `quests` | [→ narrative.quests](#narrativequests)[] | **yes** |  |
| `isEnding` | boolean |  | `false` |

### Module → `narrative` → `deedKinds`

<a id="module-narrative-deedKinds"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string | **yes** |  |
| `tags` | string[] |  | `[]` |
| `severity` | number |  | `0` |
| `faction` | [→ content.factions](#contentfactions) |  |  |
| `memorability` | number |  | `1` |
| `distortion` | number |  | `0.2` |

### Module → `narrative` → `memory`

<a id="module-narrative-memory"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `mode` | `simulated` \| `manual` \| `hybrid` |  | `"hybrid"` |
| `forgetting` | [object](#module-narrative-memory-forgetting) |  | `{}` |
| `gossip` | [object](#module-narrative-memory-gossip) |  | `{}` |
| `witness` | [object](#module-narrative-memory-witness) |  | `{}` |
| `learning` | [object](#module-narrative-memory-learning) |  | `{}` |
| `rules` | [object](#module-narrative-memory-rules)[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `narrative` → `memory` → `forgetting`

<a id="module-narrative-memory-forgetting"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `curve` | `none` \| `linear` \| `exponential` \| `threshold` |  | `"exponential"` |
| `halfLifeDays` | number |  | `30` |
| `floor` | number |  | `0.05` |
| `reinforceOnRecall` | number |  | `0.25` |
| `memorabilityWeight` | number |  | `1` |
| `neverForget` | [→ narrative.deedKinds](#narrativedeedKinds)[] |  | `[]` |
| `extra` | { string: any } |  | `{}` |

### Module → `narrative` → `memory` → `gossip`

<a id="module-narrative-memory-gossip"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `enabled` | boolean |  | `true` |
| `spreadPerDay` | number |  | `0.25` |
| `maxHops` | number |  | `4` |
| `hopRetention` | number |  | `0.75` |
| `distortionPerHop` | number |  | `0.15` |
| `requiresTravel` | boolean |  | `true` |
| `crossFactionRate` | number |  | `0.4` |
| `minimumSeverity` | number |  | `1` |
| `spreadsWithoutWitness` | boolean |  | `false` |
| `extra` | { string: any } |  | `{}` |

### Module → `narrative` → `memory` → `witness`

<a id="module-narrative-memory-witness"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `radius` | number |  | `0` |
| `requiresLineOfSight` | boolean |  | `true` |
| `deadMenTellNoTales` | boolean |  | `true` |
| `identificationChance` | number |  | `0.8` |
| `disguiseReduction` | number |  | `0.5` |
| `factionAlwaysLearns` | boolean |  | `false` |
| `extra` | { string: any } |  | `{}` |

### Module → `narrative` → `memory` → `learning`

<a id="module-narrative-memory-learning"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `enabled` | boolean |  | `true` |
| `encountersBeforeAdapting` | number |  | `3` |
| `adaptationStrength` | number |  | `0.5` |
| `sharedWithinFaction` | boolean |  | `true` |
| `minimumIntellect` | number |  |  |
| `tracks` | `damageTypes` \| `abilities` \| `tactics` \| `partyComposition`[] |  | `["damageTypes","abilities"]` |
| `forgetAfterDays` | number |  | `90` |
| `extra` | { string: any } |  | `{}` |

### Module → `narrative` → `memory` → `rules`

<a id="module-narrative-memory-rules"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `id` | string | **yes** |  |
| `name` | string |  |  |
| `description` | string |  | `""` |
| `deedKinds` | [→ narrative.deedKinds](#narrativedeedKinds)[] |  | `[]` |
| `when` | [DSL](#the-dsl) |  |  |
| `alwaysKnownBy` | [→ content.npcs](#contentnpcs)[] |  | `[]` |
| `neverKnownBy` | [→ content.npcs](#contentnpcs)[] |  | `[]` |
| `spreadPerDay` | number |  |  |
| `halfLifeDays` | number |  |  |
| `distortionPerHop` | number |  |  |
| `manualOnly` | boolean |  | `false` |
| `extra` | { string: any } |  | `{}` |

### Module → `start`

<a id="module-start"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `partySize` | number |  | `4` |
| `creation` | [object](#module-start-creation) |  | `{}` |
| `startingArea` | [→ world.areas](#worldareas) |  |  |
| `startingPoi` | [→ world.pointsOfInterest](#worldpointsOfInterest) |  |  |
| `startingDungeon` | [→ world.dungeons](#worlddungeons) |  |  |
| `openingTextKey` | string |  |  |
| `initialFlags` | { string: [DSL](#the-dsl) } |  | `{}` |
| `victoryWhen` | [DSL](#the-dsl) |  |  |
| `defeatWhen` | [DSL](#the-dsl) |  |  |

### Module → `start` → `creation`

<a id="module-start-creation"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `attributePoints` | number |  | `27` |
| `attributeCosts` | { string: number } |  | `{}` |
| `startingLevel` | number |  | `1` |
| `skillRanks` | number |  | `4` |
| `allowedAncestries` | [→ content.ancestries](#contentancestries)[] |  | `[]` |
| `allowedClasses` | [→ content.classes](#contentclasses)[] |  | `[]` |
| `startingItems` | [object](#module-start-creation-startingItems)[] |  | `[]` |
| `startingCurrency` | number |  | `0` |

### Module → `start` → `creation` → `startingItems`

<a id="module-start-creation-startingItems"></a>

| Field | Type | Required | Default |
| --- | --- | --- | --- |
| `item` | [→ content.items](#contentitems) | **yes** |  |
| `quantity` | number |  | `1` |


## The DSL

Behaviour is written as JSON. One evaluator serves ability effects, item procs,
trap triggers, dialogue gates, loot rules, and quest objectives.

**Expression operators** — `ref`, `add`, `sub`, `mul`, `div`, `mod`, `neg`, `min`, `max`, `floor`, `ceil`, `round`, `abs`, `clamp`, `roll`, `cond`, `concat`, `length`, `list`

**Predicate operators** — `all`, `any`, `not`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `chance`, `exists`, `test`

**Effect operators** — `damage`, `heal`, `applyCondition`, `removeCondition`, `adjustResource`, `setFlag`, `grantItem`, `removeItem`, `adjustReputation`, `move`, `emit`, `noise`, `if`, `repeat`, `forEach`, `let`

Reads go through one mechanism: `{ "ref": "actor.attr.might" }` walks the scope
the engine supplies. There is deliberately no `hasFlag` or `hasItem` operator,
because those are ordinary paths — `flags.met_vess`, `actor.inventory.rope`.

## Collections

Every addressable collection, each entry identified by its `id`:

- `rules.attributes`
- `rules.resources`
- `rules.derivedStats`
- `rules.damageTypes`
- `rules.conditions`
- `rules.actionTypes`
- `rules.equipmentSlots`
- `rules.masteryTiers`
- `rules.rests`
- `rules.savingThrows`
- `rules.sizes`
- `rules.creatureTypes`
- `rules.senses`
- `rules.stances`
- `rules.movementModes`
- `rules.languages`
- `rules.alignments`
- `rules.opportunities`
- `rules.coverTypes`
- `content.abilities`
- `content.skills`
- `content.ancestries`
- `content.classes`
- `content.items`
- `content.lootTables`
- `content.monsters`
- `content.traps`
- `content.factions`
- `content.npcs`
- `world.terrains`
- `world.palettes`
- `world.biomes`
- `world.areas`
- `world.pointsOfInterest`
- `world.gates`
- `world.roomTemplates`
- `world.encounterTables`
- `world.dungeons`
- `narrative.textGrammar`
- `narrative.dialogues`
- `narrative.quests`
- `narrative.arcs`
- `narrative.deedKinds`

## Rules


## Content


## World


## Narrative


## Start


## Meta


