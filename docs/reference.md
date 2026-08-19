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

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `format` | number |  | `1` | Version of the module format itself, so a later reader knows how to migrate. |
| `id` | id | **yes** |  | Id of the module. Saves record it and refuse to load against a different one. |
| `version` | string | **yes** |  | Semantic version of this module, as 1.0.0. |
| `engine` | string |  | `"^1.0.0"` | Engine version range this module expects. |
| `extends` | string |  | `null` | Base module to layer on, as id@version. Loaded first, this document merged over it. |
| `mods` | [object](#module-mods)[] |  |  | Mods this game expects, pinned by id and content hash. |
| `meta` | [object](#module-meta) | **yes** |  | Title, author, and the rest of the shelf entry. |
| `rules` | [object](#module-rules) | **yes** |  | The system. Attributes, resources, conditions, dice, progression. |
| `content` | [object](#module-content) |  | `{}` | The things. Abilities, items, monsters, NPCs, factions. |
| `world` | [object](#module-world) |  | `{}` | The places. Biomes, areas, points of interest, dungeons, maps. |
| `narrative` | [object](#module-narrative) |  | `{}` | The story. Text, dialogue, quests, lore, memory. |
| `start` | [object](#module-start) |  | `{}` | Party size, character creation, and where play begins. |

## Mods

### Module → `mods`

<a id="module-mods"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the mod, matching its folder under mods/. |
| `hash` | string | **yes** |  | Content hash of the mod as pinned. A drifted mod is reported, not run silently. |
| `target` | `engine` \| `editor` |  | `"engine"` | Whether the mod attaches to the engine at play time or to the editor. |
| `required` | boolean |  | `false` | True when the game does not run without it. False lets play continue unmodded. |
| `note` | string |  | `""` | What to say if the mod is missing or drifted. The author's own words. |

## Meta

### Module → `meta`

<a id="module-meta"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `title` | string | **yes** |  | Display name of the game. |
| `author` | string |  | `""` | Who wrote it. |
| `description` | string |  | `""` | A sentence or two for the shelf. |
| `tags` | id[] |  | `[]` | Free labels for filtering and search. |
| `license` | string |  | `""` | License string. Carried, never interpreted. |

## Rules

### Module → `rules`

<a id="module-rules"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `attributes` | [object](#module-rules-attributes)[] | **yes** |  | What a character is made of. At least one is required. |
| `resources` | [object](#module-rules-resources)[] | **yes** |  | Pools that go up and down. Hit points and focus are both just resources. |
| `derivedStats` | [object](#module-rules-derivedStats)[] |  | `[]` | Numbers computed from attributes, gear, and conditions. |
| `damageTypes` | [object](#module-rules-damageTypes)[] |  | `[]` | The kinds of damage that exist. Resistance and immunity are written against these. |
| `conditions` | [object](#module-rules-conditions)[] |  | `[]` | States a creature can be in, with what they do while they last. |
| `actionTypes` | [object](#module-rules-actionTypes)[] |  | `[]` | The action economy. Each type declares how many a creature gets per turn. |
| `equipmentSlots` | [object](#module-rules-equipmentSlots)[] |  | `[]` | Where gear goes, and how many items each place holds. |
| `itemProperties` | [object](#module-rules-itemProperties)[] |  | `[]` | Reusable tags on items that carry stat modifiers. |
| `masteryTiers` | [object](#module-rules-masteryTiers)[] |  | `[]` | Named skill bands, so a requirement can ask for adept rather than rank 5. |
| `rests` | [object](#module-rules-rests)[] |  | `[]` | The ways a party recovers, and what each costs in time. |
| `resolution` | [object](#module-rules-resolution) |  | `{}` | The dice convention. What a check rolls, what crits, how results round. |
| `progression` | [object](#module-rules-progression) | **yes** |  | The level curve and what each level grants. Required. |
| `savingThrows` | [object](#module-rules-savingThrows)[] |  | `[]` | The saves that exist, each governed by an attribute. |
| `sizes` | [object](#module-rules-sizes)[] |  | `[]` | Creature sizes, with the space they take and how far they reach. |
| `creatureTypes` | [object](#module-rules-creatureTypes)[] |  | `[]` | Broad kinds of creature, for gating and description. |
| `senses` | [object](#module-rules-senses)[] |  | `[]` | How creatures notice each other. Sight, scent, hearing, or anything you invent. |
| `stances` | [object](#module-rules-stances)[] |  | `[]` | Postures a creature can take, trading speed for concealment or the reverse. |
| `movementModes` | [object](#module-rules-movementModes)[] |  | `[]` | Ways of moving, each with a base speed and a terrain multiplier. |
| `languages` | [object](#module-rules-languages)[] |  | `[]` | Languages that exist. Creatures list which they speak. |
| `alignments` | [object](#module-rules-alignments)[] |  | `[]` | Moral or factional labels. Carried and gateable, never enforced. |
| `opportunities` | [object](#module-rules-opportunities)[] |  | `[]` | Reactions the rules grant everyone, such as a parting blow. |
| `coverTypes` | [object](#module-rules-coverTypes)[] |  | `[]` | Degrees of cover and what each is worth on defence. |
| `spellcasting` | [object](#module-rules-spellcasting) |  | `{}` | Slots or points, concentration, components, and rituals. |
| `perception` | [object](#module-rules-perception) |  | `{}` | Which sense counts as sight, and the defaults perception runs on. |
| `currency` | [object](#module-rules-currency) |  | `{}` | What money is called and whether it can go negative. |
| `vitalResource` | [→ rules.resources](#module-rules-resources) | **yes** |  | The resource whose floor means death. Required. |
| `initiativeStat` | [→ rules.derivedStats](#module-rules-derivedStats) |  |  | Derived stat rolled for turn order. Without one, order is by id. |
| `defaultSize` | [→ rules.sizes](#module-rules-sizes) |  |  | Size given to a creature that names none. |
| `defaultMovementMode` | [→ rules.movementModes](#module-rules-movementModes) |  |  | Movement mode used when a creature names none. |
| `interactionRange` | [object](#module-rules-interactionRange) |  | `{}` | How close you must be to talk to someone or reach a thing. |
| `search` | [object](#module-rules-search) |  | `{}` | How far a search finds traps and how close disarming needs you. |
| `dispositionBands` | [object](#module-rules-dispositionBands)[] |  | `[{"id":"neutral","atLeast":0,"stance":"neutral"},{"id":"hostile","stance":"hostile"}]` | Disposition numbers to stances. A band above 0 is the only way to get allies. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on the ruleset. Read it back with a ref path. |

### Module → `rules` → `attributes`

<a id="module-rules-attributes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the attribute, used as actor.attr.<id>. |
| `name` | string | **yes** |  | Display name. |
| `abbrev` | string | **yes** |  | Short form for tight displays, one to six characters. |
| `description` | string |  | `""` | What this attribute covers. Author and player facing. |
| `min` | number |  | `1` | Lowest value character creation and effects may take it to. |
| `max` | number |  | `20` | Highest value it may reach. |
| `default` | number |  | `10` | Starting value before creation spends any points. |
| `modifier` | [expression](#the-dsl) | **yes** |  | Formula turning the raw value into a modifier. Sees only value. |

### Module → `rules` → `resources`

<a id="module-rules-resources"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the resource, used as actor.res.<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What the pool represents. |
| `max` | [expression](#the-dsl) | **yes** |  | Formula for the ceiling. May read attributes, modifiers, and level. |
| `min` | [expression](#the-dsl) |  | `0` | Formula for the floor. Reaching it runs onDepleted. |
| `initial` | [expression](#the-dsl) |  |  | Formula for the starting value. Defaults to the maximum. |
| `restoreOnShortRest` | number |  | `0` | Fraction of the maximum a short rest returns, 0 to 1. |
| `restoreOnLongRest` | number |  | `1` | Fraction of the maximum a long rest returns, 0 to 1. |
| `onDepleted` | [effect](#the-dsl)[] |  | `[]` | What happens at the floor. Death is these effects on the vital resource. |

### Module → `rules` → `derivedStats`

<a id="module-rules-derivedStats"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the stat, used as actor.derived.<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What the number means. |
| `formula` | [expression](#the-dsl) | **yes** |  | Expression over attributes, modifiers, level, and resources. |

### Module → `rules` → `damageTypes`

<a id="module-rules-damageTypes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the damage type. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this kind of harm is. |
| `tags` | id[] |  | `[]` | Labels a damage interaction can except on, such as silvered. |

### Module → `rules` → `conditions`

<a id="module-rules-conditions"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the condition, used as actor.conditions.<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What being in this state means. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `stacking` | `refresh` \| `extend` \| `stack` \| `ignore` |  | `"refresh"` | What a second application does. Refresh, extend, stack, or ignore. |
| `defaultDuration` | [expression](#the-dsl) |  |  | Rounds it lasts when the applying effect names no duration. |
| `onApply` | [effect](#the-dsl)[] |  | `[]` | Effects run once, when it lands. |
| `onTick` | [effect](#the-dsl)[] |  | `[]` | Effects run at the start of each of the sufferer's turns. |
| `onExpire` | [effect](#the-dsl)[] |  | `[]` | Effects run once, when it ends. |
| `modifiers` | { id: [expression](#the-dsl) } |  | `{}` | Derived stat adjustments while it holds. Magnitude is in scope. |
| `prevents` | id[] |  | `[]` | Action type ids this forbids. A bare id, not a checked reference. |
| `concealsIdentity` | boolean |  | `false` | Makes a witness less able to name who did the deed. |
| `savingThrow` | [object](#module-rules-conditions-savingThrow) |  |  | A save to shrug it off, and when that save is offered. |
| `implies` | id[] |  | `[]` | Condition ids that come with this one. A bare id, not a checked reference. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this condition. |

### Module → `rules` → `conditions` → `savingThrow`

<a id="module-rules-conditions-savingThrow"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `save` | [→ rules.savingThrows](#module-rules-savingThrows) | **yes** |  | Which saving throw resists it. |
| `difficulty` | [expression](#the-dsl) | **yes** |  | Difficulty of that save, as an expression. |
| `timing` | `onApply` \| `endOfTurn` \| `startOfTurn` \| `both` |  | `"endOfTurn"` | When the save is offered. On landing, on turn ends, or both. |

### Module → `rules` → `actionTypes`

<a id="module-rules-actionTypes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the action type, such as action or bonus. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this slice of a turn is for. |
| `perTurn` | number |  | `1` | How many a creature gets each turn. |

### Module → `rules` → `equipmentSlots`

<a id="module-rules-equipmentSlots"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the slot, named by an item's slot field. |
| `name` | string | **yes** |  | Display name. |
| `capacity` | number |  | `1` | How many items fit here at once. |

### Module → `rules` → `itemProperties`

<a id="module-rules-itemProperties"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the property, named by an item's properties list. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What carrying this property means. |
| `modifiers` | { id: [expression](#the-dsl) } |  | `{}` | Derived stat adjustments an item with this property grants. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this property. |

### Module → `rules` → `masteryTiers`

<a id="module-rules-masteryTiers"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the tier, asked for by a requirement as minTier. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this level of skill means. |
| `atRank` | number | **yes** |  | Skill rank at which the tier is reached. |

### Module → `rules` → `rests`

<a id="module-rules-rests"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the rest, named by a rest action and by spellcasting recovery. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this kind of rest is. |
| `duration` | number |  | `60` | Minutes of world time it consumes. |
| `kind` | `short` \| `long` |  | `"short"` | Whether resources use their short rest or long rest fraction. |
| `effects` | [effect](#the-dsl)[] |  | `[]` | Extra effects run on finishing, beyond resource restoration. |
| `interruptChance` | number |  | `0` | Chance per rest that something interrupts it, 0 to 1. |

### Module → `rules` → `resolution`

<a id="module-rules-resolution"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `checkDice` | [dice](#dice-notation) |  | `"1d20"` | The notation every check rolls. |
| `advantageDice` | [dice](#dice-notation) |  | `"2d20kh1"` | Notation rolled instead when a check has advantage. |
| `disadvantageDice` | [dice](#dice-notation) |  | `"2d20kl1"` | Notation rolled instead when a check has disadvantage. |
| `criticalSuccessAt` | number |  | `20` | Natural roll at or above which a check crits. Null for no crits. |
| `criticalFailureAt` | number |  | `1` | Natural roll at or below which a check fumbles. Null for no fumbles. |
| `criticalDamageMultiplier` | number |  | `2` | What a critical hit multiplies damage by. |
| `saveSuccessMultiplier` | number |  | `0.5` | Damage kept on a successful save when the ability says half. |
| `passiveBase` | number |  | `10` | Number a passive score adds its modifier to instead of rolling. |
| `opposedMode` | `passive` \| `contested` |  | `"passive"` | Whether an opposed check rolls both sides or rolls against a passive score. |
| `damageRounding` | `floor` \| `round` \| `ceil` |  | `"round"` | How fractional damage resolves to a whole number. |
| `reputationRounding` | `floor` \| `round` \| `ceil` \| `trunc` |  | `"trunc"` | How fractional reputation change resolves to a whole number. |
| `defaultDifficulty` | number |  | `12` | Difficulty used when a check names none. |
| `difficulties` | { id: number } |  | `{}` | Named difficulties, so content can ask for hard rather than 18. |

### Module → `rules` → `progression`

<a id="module-rules-progression"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `maxLevel` | number |  | `20` | Level the curve stops at. Experience past it is kept but grants nothing. |
| `levels` | [object](#module-rules-progression-levels)[] | **yes** |  | One entry per level, in order, with its cost and what it gives. |
| `proficiency` | [expression](#the-dsl) |  |  | Formula for the proficiency bonus over actor.level. |
| `proficiencyRank` | number |  | `1` | Skill rank a proficiency counts as when a requirement asks. |
| `levelVitality` | [object](#module-rules-progression-levelVitality) |  | `{}` | How the vital resource grows on gaining a level. |

### Module → `rules` → `progression` → `levels`

<a id="module-rules-progression-levels"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `level` | number | **yes** |  | Which level this entry describes. |
| `xpRequired` | number | **yes** |  | Total experience needed to reach it. |
| `grants` | [effect](#the-dsl)[] |  | `[]` | Effects run on each character crossing this level. |

### Module → `rules` → `progression` → `levelVitality`

<a id="module-rules-progression-levelVitality"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `policy` | `roll` \| `average` \| `max` \| `none` |  | `"roll"` | Roll the die, take its average, take its maximum, or grant nothing. |
| `die` | `class` \| `size` |  | `"class"` | Whether the die comes from the character's class or their size. |
| `bonus` | [expression](#the-dsl) |  | `0` | Expression added on top of the die, per level. |

### Module → `rules` → `savingThrows`

<a id="module-rules-savingThrows"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the save, named by abilities and conditions. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this save resists. |
| `attribute` | [→ rules.attributes](#module-rules-attributes) | **yes** |  | Attribute whose modifier the save adds. |
| `defaultDifficulty` | [expression](#the-dsl) |  |  | Difficulty used when the thing calling for the save names none. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this save. |

### Module → `rules` → `sizes`

<a id="module-rules-sizes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the size. |
| `name` | string | **yes** |  | Display name. |
| `space` | number |  | `5` | Distance units the creature occupies. Converted to tiles by the engine. |
| `reach` | number |  | `5` | Distance units the creature can reach to strike. |
| `carryMultiplier` | number |  | `1` | Not read by the engine. Build encumbrance from actor.carried and a derived stat. |
| `hitDie` | [dice](#dice-notation) |  |  | Vitality die for creatures of this size, when levelVitality takes its die from size. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this size. |

### Module → `rules` → `creatureTypes`

<a id="module-rules-creatureTypes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the creature type. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this kind of creature is. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this creature type. |

### Module → `rules` → `senses`

<a id="module-rules-senses"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the sense, used as a key in emits and in a creature's senses. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this sense picks up. |
| `defaultRange` | number |  | `60` | Distance units a creature perceives with it unless it says otherwise. |
| `ignores` | id[] |  | `[]` | Not read by the engine yet. No condition currently suppresses a sense. |
| `propagation` | `line` \| `field` |  | `"line"` | Whether the signal travels in a straight line or fills the space. |
| `blockedBy` | `opaque` \| `impassable` \| `nothing` |  | `"opaque"` | What stops it. Opaque terrain, anything impassable, or nothing. |
| `falloff` | `cliff` \| `linear` |  | `"cliff"` | Whether strength drops off a cliff at range or fades with distance. |
| `lingerMinutes` | number |  | `0` | How long a trace stays after whatever left it has gone. Scent, not sight. |
| `spreadPerMinute` | number |  | `0` | How far a trace creeps outward each minute. |
| `spreadRetention` | number |  | `0.5` | Strength kept as a trace spreads, 0 to 1. |
| `rememberMinutes` | number |  | `0` | How long a creature holds on to something it noticed with this sense. |
| `impressionTextKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool for a clear impression. |
| `faintImpressionTextKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool for a weak impression. |
| `emptyTextKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool for sensing and finding nothing. |
| `thresholds` | [object](#module-rules-senses-thresholds) |  | `{}` | Signal strengths at which noticing turns into investigating and then attacking. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this sense. |

### Module → `rules` → `senses` → `thresholds`

<a id="module-rules-senses-thresholds"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `detect` | number |  | `0` | Strength at which the creature knows something is there, 0 to 1. |
| `investigate` | number |  | `0` | Strength at which it goes to look, 0 to 1. |
| `aggro` | number |  | `0` | Strength at which it treats the source as a target, 0 to 1. |

### Module → `rules` → `stances`

<a id="module-rules-stances"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the stance. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What moving this way means. |
| `speedMultiplier` | number |  | `1` | What it does to movement speed. |
| `emits` | { [→ rules.senses](#module-rules-senses): number } |  | `{}` | Signal strength this stance gives off, per sense. |
| `concealedBy` | [→ content.skills](#module-content-skills) |  |  | Skill whose rank makes this stance quieter. |
| `concealmentPerPoint` | number |  | `0` | Signal removed per rank of that skill. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this stance. |

### Module → `rules` → `movementModes`

<a id="module-rules-movementModes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the mode, such as walk, swim, or fly. |
| `name` | string | **yes** |  | Display name. |
| `defaultSpeed` | number |  | `30` | Distance units per turn for a creature that names no speed of its own. |
| `terrainMultiplier` | number |  | `1` | What this mode does to terrain movement costs. |
| `fallsWhenDisabled` | boolean |  | `false` | Not read by the engine yet. Nothing takes a movement mode away. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this mode. |

### Module → `rules` → `languages`

<a id="module-rules-languages"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the language. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | Who speaks it and where. |
| `script` | string |  | `""` | Not read by the engine. The writing system, for flavour. |
| `exotic` | boolean |  | `false` | Not read by the engine. Dialogue and readable content are not language gated. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this language. |

### Module → `rules` → `alignments`

<a id="module-rules-alignments"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the alignment. |
| `name` | string | **yes** |  | Display name. |
| `abbrev` | string |  | `""` | Short form for tight displays. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this alignment. |

### Module → `rules` → `opportunities`

<a id="module-rules-opportunities"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the opportunity. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this reaction is and why everyone has it. |
| `on` | `moveAway` \| `castSpell` \| `rangedAttack` \| `standUp` \| `beHit` \| `allyHit` \| `custom` |  | `"moveAway"` | What provokes it. Leaving reach, casting, shooting, standing, being hit, or custom. |
| `event` | string |  |  | Event name to watch, when on is custom. |
| `actionType` | [→ rules.actionTypes](#module-rules-actionTypes) |  |  | Action type it spends. Without one it is free. |
| `use` | [→ content.abilities](#module-content-abilities) |  |  | Ability the reacting creature uses. Without one, only effects run. |
| `requires` | [predicate](#the-dsl) |  |  | Predicate that must hold for it to trigger. Not the requirement object. |
| `effects` | [effect](#the-dsl)[] |  | `[]` | Effects run when it triggers. |
| `usesPerRound` | number |  | `1` | How many times one creature may take it each round. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this opportunity. |

### Module → `rules` → `coverTypes`

<a id="module-rules-coverTypes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the cover type. |
| `name` | string | **yes** |  | Display name. |
| `defenceBonus` | number |  | `0` | Added to the defended stat when the target has this cover. |
| `blocksTargeting` | boolean |  | `false` | True when the target cannot be picked at all, not merely harder to hit. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this cover type. |

### Module → `rules` → `spellcasting`

<a id="module-rules-spellcasting"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `mode` | `none` \| `slots` \| `points` \| `both` |  | `"none"` | Whether casting spends slots, spends points, both, or is off. |
| `maxSpellLevel` | number |  | `9` | Highest spell level the game has. |
| `slotTable` | { string: number[] } |  | `{}` | Slots per spell level, keyed by caster level. |
| `pointResource` | [→ rules.resources](#module-rules-resources) |  |  | Resource points are drawn from, when the mode uses points. |
| `pointCosts` | { string: number } |  | `{}` | Point cost per spell level. |
| `saveDifficulty` | [expression](#the-dsl) |  |  | Formula for the difficulty of a save against a caster's spell. |
| `attackBonus` | [expression](#the-dsl) |  |  | Formula for a spell attack bonus, overriding the ordinary attack stat. |
| `concentration` | [object](#module-rules-spellcasting-concentration) |  | `{}` | Whether holding a spell can be broken, and by what. |
| `recoverOn` | [→ rules.rests](#module-rules-rests)[] |  | `[]` | Which rests give slots back. |
| `ritualCasting` | boolean |  | `false` | Whether spells marked ritual can be cast without spending a slot. |
| `componentActionTypes` | [object](#module-rules-spellcasting-componentActionTypes) |  | `{}` | Action types verbal and somatic components need free. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on spellcasting. |

### Module → `rules` → `spellcasting` → `concentration`

<a id="module-rules-spellcasting-concentration"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `enabled` | boolean |  | `true` | Whether concentration exists at all. |
| `savingThrow` | [→ rules.savingThrows](#module-rules-savingThrows) |  |  | Save rolled to keep concentration on taking damage. |
| `difficulty` | [expression](#the-dsl) |  |  | Difficulty of that save, as an expression. |
| `maxConcurrent` | number |  | `1` | How many concentration spells one caster may hold. |

### Module → `rules` → `spellcasting` → `componentActionTypes`

<a id="module-rules-spellcasting-componentActionTypes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `verbal` | [→ rules.actionTypes](#module-rules-actionTypes) |  |  | Action type a verbal component occupies. |
| `somatic` | [→ rules.actionTypes](#module-rules-actionTypes) |  |  | Action type a somatic component occupies. |

### Module → `rules` → `perception`

<a id="module-rules-perception"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `sightSense` | [→ rules.senses](#module-rules-senses) |  |  | Which sense counts as sight, and so decides what the map shows as explored. |
| `curiosityMinutes` | number |  | `10` | How long a creature keeps walking toward something it noticed. |
| `defaultStance` | [→ rules.stances](#module-rules-stances) |  |  | Stance a creature is in when it names none. |
| `minimumEmission` | number |  | `0.01` | Signal below this is treated as nothing, 0 to 1. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on perception. |

### Module → `rules` → `currency`

<a id="module-rules-currency"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `name` | string |  | `"coins"` | What money is called in the plural. |
| `abbrev` | string |  | `"c"` | Short form for tight displays. |
| `allowNegative` | boolean |  | `false` | Whether the purse may go into debt. |

### Module → `rules` → `interactionRange`

<a id="module-rules-interactionRange"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `talk` | number |  | `2` | How many tiles away you can start a conversation. |
| `reach` | number |  | `1` | How many tiles away you can take, open, or otherwise handle a thing. |

### Module → `rules` → `search`

<a id="module-rules-search"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `trapRadius` | number |  | `2` | How many tiles a search sweeps for traps. |
| `disarmReach` | number |  | `1` | How many tiles away a trap can be disarmed from. |

### Module → `rules` → `dispositionBands`

<a id="module-rules-dispositionBands"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the band. |
| `atLeast` | number |  |  | Lowest disposition in this band. The highest matching band wins. |
| `stance` | `ally` \| `neutral` \| `hostile` | **yes** |  | How a creature in this band treats the party. |

## Content

### Module → `content`

<a id="module-content"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `abilities` | [object](#module-content-abilities)[] |  | `[]` | Anything a creature can actively do. Attacks, spells, shouts, tricks. |
| `skills` | [object](#module-content-skills)[] |  | `[]` | Trained proficiencies, each governed by an attribute. |
| `ancestries` | [object](#module-content-ancestries)[] |  | `[]` | What a character is born as, and what that gives them. |
| `classes` | [object](#module-content-classes)[] |  | `[]` | What a character trained as, and what each level of it grants. |
| `items` | [object](#module-content-items)[] |  | `[]` | Everything carryable, wearable, usable, or sellable. |
| `lootTables` | [object](#module-content-lootTables)[] |  | `[]` | Weighted tables drawn for spoils, containers, and shop stock. |
| `monsters` | [object](#module-content-monsters)[] |  | `[]` | Statblocks. NPCs point at one when they can fight. |
| `traps` | [object](#module-content-traps)[] |  | `[]` | Hazards placed in rooms, with how they are spotted and defused. |
| `factions` | [object](#module-content-factions)[] |  | `[]` | Groups that hold an opinion of the party. |
| `npcs` | [object](#module-content-npcs)[] |  | `[]` | People. Who they are, where they live, and what they will talk about. |

### Module → `content` → `abilities`

<a id="module-content-abilities"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the ability. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What using it looks like. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `actionType` | [→ rules.actionTypes](#module-rules-actionTypes) |  |  | Action type it spends. Without one it costs nothing from the turn. |
| `costs` | { [→ rules.resources](#module-rules-resources): [expression](#the-dsl) } |  | `{}` | Resources spent per use, each as an expression. |
| `range` | number |  | `0` | Distance units it reaches. 0 means touch. |
| `cooldown` | number |  | `0` | Rounds before the same creature may use it again. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Who may use it at all. The gating vocabulary. |
| `when` | [predicate](#the-dsl) |  |  | Predicate checked at the moment of use, on top of requires. |
| `targeting` | `self` \| `single` \| `allEnemies` \| `allAllies` \| `all` \| `none` |  | `"single"` | How many and which side it picks. |
| `attack` | [object](#module-content-abilities-attack) |  |  | Makes it an attack roll, and says what it rolls against. |
| `savingThrow` | [object](#module-content-abilities-savingThrow) |  |  | Makes it a save instead, and says what a success is worth. |
| `spellLevel` | number |  |  | Slot level it is cast at. Absent means it is not a spell. |
| `concentration` | boolean |  | `false` | Whether holding it occupies the caster's concentration. |
| `ritual` | boolean |  | `false` | Whether it can be cast slowly without spending a slot. |
| `castingTime` | string |  | `""` | Free text for the sheet. Timing in play comes from actionType. |
| `duration` | string |  | `""` | Free text for the sheet. Timing in play comes from the conditions it applies. |
| `components` | `verbal` \| `somatic` \| `material` \| `focus`[] |  | `[]` | What casting it needs. Verbal, somatic, material, or a focus. |
| `materialComponent` | [→ content.items](#module-content-items) |  |  | Item consumed or held as the material component. |
| `areaOfEffect` | [object](#module-content-abilities-areaOfEffect) |  |  | Shape and size when it covers ground rather than a target. |
| `upcast` | [effect](#the-dsl)[] |  | `[]` | Extra effects per slot level above its own. |
| `onUse` | [effect](#the-dsl)[] |  | `[]` | Effects run on a hit, a failed save, or unconditionally. |
| `onMiss` | [effect](#the-dsl)[] |  | `[]` | Effects run when the attack roll misses. |
| `onCritical` | [effect](#the-dsl)[] |  | `[]` | Effects run on a critical, in addition to the multiplied damage. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this ability. |

### Module → `content` → `abilities` → `requires`

<a id="module-content-abilities-requires"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `description` | string |  | `""` | Why this gate exists. Shown in the editor and in refusals. |
| `minLevel` | number |  |  | Lowest character level that passes. |
| `maxLevel` | number |  |  | Highest character level that passes. |
| `classes` | [→ content.classes](#module-content-classes)[] |  | `[]` | Passes if the actor is any one of these classes. |
| `ancestries` | [→ content.ancestries](#module-content-ancestries)[] |  | `[]` | Passes if the actor is any one of these ancestries. |
| `abilities` | [→ content.abilities](#module-content-abilities)[] |  | `[]` | The actor must know all of these. |
| `attributes` | [object](#module-content-abilities-requires-attributes)[] |  | `[]` | Attribute floors and ceilings the actor must sit inside. |
| `skills` | [object](#module-content-abilities-requires-skills)[] |  | `[]` | Skill ranks or mastery tiers the actor must have reached. |
| `creatureTypes` | [→ rules.creatureTypes](#module-rules-creatureTypes)[] |  | `[]` | Passes if the actor is any one of these creature types. |
| `alignments` | [→ rules.alignments](#module-rules-alignments)[] |  | `[]` | Passes if the actor is any one of these alignments. |
| `languages` | [→ rules.languages](#module-rules-languages)[] |  | `[]` | The actor must speak all of these. |
| `currency` | number |  |  | Money the actor must be carrying. |
| `items` | [object](#module-content-abilities-requires-items)[] |  | `[]` | Items the actor must hold, optionally equipped or spent. |
| `quests` | [object](#module-content-abilities-requires-quests)[] |  | `[]` | Quests that must stand at a given status. |
| `factions` | [object](#module-content-abilities-requires-factions)[] |  | `[]` | Standing or rank the actor must hold with a faction. |
| `memories` | [object](#module-content-abilities-requires-memories)[] |  | `[]` | What someone must, or must not, know about a deed. |
| `flags` | [object](#module-content-abilities-requires-flags)[] |  | `[]` | World flags that must be set, or set to a value. |
| `lore` | [object](#module-content-abilities-requires-lore)[] |  |  | Lore entries the actor must know. |
| `without` | [object](#module-content-abilities-requires-without) |  | `{}` | What the actor must lack. As common as what they must have. |
| `custom` | [predicate](#the-dsl) |  |  | Raw predicate for a gate the clauses cannot say. |
| `anyOf` | [object](#module-content-abilities-requires-anyOf)[] |  | `[]` | Alternatives. Any one branch passing satisfies the whole gate. |

### Module → `content` → `abilities` → `requires` → `attributes`

<a id="module-content-abilities-requires-attributes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `attribute` | [→ rules.attributes](#module-rules-attributes) | **yes** |  | Which attribute is being checked. |
| `min` | number |  |  | Lowest value that passes. |
| `max` | number |  |  | Highest value that passes. |

### Module → `content` → `abilities` → `requires` → `skills`

<a id="module-content-abilities-requires-skills"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `skill` | [→ content.skills](#module-content-skills) | **yes** |  | Which skill is being checked. |
| `minRank` | number |  | `1` | Lowest trained rank that passes. |
| `minTier` | [→ rules.masteryTiers](#module-rules-masteryTiers) |  |  | Lowest mastery tier that passes, instead of naming a rank. |

### Module → `content` → `abilities` → `requires` → `items`

<a id="module-content-abilities-requires-items"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `item` | [→ content.items](#module-content-items) | **yes** |  | Which item is being checked. |
| `quantity` | number |  | `1` | How many are needed. |
| `consume` | boolean |  | `false` | True to spend them on passing. This is how a key is used up. |
| `equipped` | boolean |  | `false` | True when carrying is not enough and it must be worn or wielded. |

### Module → `content` → `abilities` → `requires` → `quests`

<a id="module-content-abilities-requires-quests"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `quest` | [→ narrative.quests](#module-narrative-quests) | **yes** |  | Which quest is being checked. |
| `status` | `available` \| `active` \| `complete` \| `failed` \| `unstarted` |  | `"complete"` | The status it must stand at. Unstarted means never taken. |
| `objective` | id |  |  | Ask for one finished objective instead of the whole quest. |

### Module → `content` → `abilities` → `requires` → `factions`

<a id="module-content-abilities-requires-factions"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `faction` | [→ content.factions](#module-content-factions) | **yes** |  | Which faction is being checked. |
| `minStanding` | number |  |  | Lowest standing that passes. |
| `maxStanding` | number |  |  | Highest standing that passes. |
| `minRank` | id |  |  | Lowest rank that passes, instead of naming a number. |

### Module → `content` → `abilities` → `requires` → `memories`

<a id="module-content-abilities-requires-memories"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `deedKind` | [→ narrative.deedKinds](#module-narrative-deedKinds) | **yes** |  | Which kind of deed is being asked about. |
| `who` | `speaker` \| `party` \| `anyone` \| `faction` |  | `"speaker"` | Whose memory is consulted. The speaker, the party, anyone, or the faction. |
| `known` | boolean |  | `true` | True to require they know it, false to require they do not. |
| `withinDays` | number |  |  | Only count the memory if it is fresher than this. |

### Module → `content` → `abilities` → `requires` → `flags`

<a id="module-content-abilities-requires-flags"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `flag` | string | **yes** |  | Flag name. A free string, not a checked reference. |
| `equals` | string \| number \| boolean |  |  | Value it must hold. Omit to require only that it is set. |

### Module → `content` → `abilities` → `requires` → `lore`

<a id="module-content-abilities-requires-lore"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `entry` | [→ narrative.lore](#module-narrative-lore) | **yes** |  | Which lore entry is being checked. |
| `known` | boolean |  | `true` | True to require it is known, false to require it is not. |

### Module → `content` → `abilities` → `requires` → `without`

<a id="module-content-abilities-requires-without"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `classes` | [→ content.classes](#module-content-classes)[] |  | `[]` | Fails if the actor is any of these classes. |
| `abilities` | [→ content.abilities](#module-content-abilities)[] |  | `[]` | Fails if the actor knows any of these. |
| `items` | [→ content.items](#module-content-items)[] |  | `[]` | Fails if the actor is carrying any of these. |
| `quests` | [object](#module-content-abilities-requires-quests)[] |  | `[]` | Fails if any of these quests stands at the named status. |
| `flags` | [object](#module-content-abilities-requires-flags)[] |  | `[]` | Fails if any of these flags is set. |
| `conditions` | [→ rules.conditions](#module-rules-conditions)[] |  | `[]` | Fails if the actor is under any of these conditions. |
| `lore` | [→ narrative.lore](#module-narrative-lore)[] |  |  | Fails if the actor knows any of these lore entries. |

### Module → `content` → `abilities` → `requires` → `anyOf`

<a id="module-content-abilities-requires-anyOf"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `description` | string |  | `""` | Why this branch exists. Shown in the editor. |
| `minLevel` | number |  |  | Lowest character level that passes this branch. |
| `maxLevel` | number |  |  | Highest character level that passes this branch. |
| `classes` | [→ content.classes](#module-content-classes)[] |  | `[]` | Branch passes if the actor is any one of these classes. |
| `ancestries` | [→ content.ancestries](#module-content-ancestries)[] |  | `[]` | Branch passes if the actor is any one of these ancestries. |
| `abilities` | [→ content.abilities](#module-content-abilities)[] |  | `[]` | The actor must know all of these for this branch. |
| `attributes` | [object](#module-content-abilities-requires-attributes)[] |  | `[]` | Attribute bounds this branch checks. |
| `skills` | [object](#module-content-abilities-requires-skills)[] |  | `[]` | Skill ranks or tiers this branch checks. |
| `creatureTypes` | [→ rules.creatureTypes](#module-rules-creatureTypes)[] |  | `[]` | Branch passes if the actor is any one of these creature types. |
| `alignments` | [→ rules.alignments](#module-rules-alignments)[] |  | `[]` | Branch passes if the actor is any one of these alignments. |
| `languages` | [→ rules.languages](#module-rules-languages)[] |  | `[]` | The actor must speak all of these for this branch. |
| `currency` | number |  |  | Money this branch needs the actor to be carrying. |
| `items` | [object](#module-content-abilities-requires-items)[] |  | `[]` | Items this branch needs. |
| `quests` | [object](#module-content-abilities-requires-quests)[] |  | `[]` | Quest statuses this branch checks. |
| `factions` | [object](#module-content-abilities-requires-factions)[] |  | `[]` | Faction standing this branch checks. |
| `memories` | [object](#module-content-abilities-requires-memories)[] |  | `[]` | Memory this branch checks. |
| `flags` | [object](#module-content-abilities-requires-flags)[] |  | `[]` | Flags this branch checks. |
| `lore` | [object](#module-content-abilities-requires-lore)[] |  |  | Lore this branch checks. |
| `without` | [object](#module-content-abilities-requires-without) |  | `{}` | What this branch needs the actor to lack. |
| `custom` | [predicate](#the-dsl) |  |  | Raw predicate for this branch. Branches do not nest further. |

### Module → `content` → `abilities` → `attack`

<a id="module-content-abilities-attack"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `stat` | [→ rules.attributes](#module-rules-attributes) | **yes** |  | Attribute whose modifier is added to the attack roll. |
| `against` | [→ rules.derivedStats](#module-rules-derivedStats) | **yes** |  | Derived stat on the target the roll must meet or beat. |

### Module → `content` → `abilities` → `savingThrow`

<a id="module-content-abilities-savingThrow"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `save` | [→ rules.savingThrows](#module-rules-savingThrows) | **yes** |  | Which save the target rolls. |
| `difficulty` | [expression](#the-dsl) |  |  | Difficulty of that save. Falls back to the save's own default. |
| `onSuccess` | `none` \| `half` \| `negates` \| `partial` |  | `"negates"` | What a success is worth. Nothing, half damage, negated, or partial. |
| `onSuccessEffects` | [effect](#the-dsl)[] |  | `[]` | Effects run on a successful save, used with partial. |

### Module → `content` → `abilities` → `areaOfEffect`

<a id="module-content-abilities-areaOfEffect"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `shape` | `sphere` \| `cube` \| `cone` \| `line` \| `cylinder` \| `aura` | **yes** |  | The volume it covers. |
| `size` | number | **yes** |  | Distance units across, measured by shape. |
| `affects` | `all` \| `enemies` \| `allies` \| `others` |  | `"all"` | Who inside it is caught. Everyone, one side, or everyone but the caster. |
| `angle` | number |  | `45` | Spread in degrees, for a cone. |

### Module → `content` → `skills`

<a id="module-content-skills"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the skill, used as actor.skills.<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What the skill covers. |
| `attribute` | [→ rules.attributes](#module-rules-attributes) | **yes** |  | Attribute whose modifier is added to checks with it. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this skill. |

### Module → `content` → `ancestries`

<a id="module-content-ancestries"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the ancestry. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | Who these people are. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `attributeBonuses` | { [→ rules.attributes](#module-rules-attributes): number } |  | `{}` | Attribute adjustments applied at creation. |
| `grantedAbilities` | [→ content.abilities](#module-content-abilities)[] |  | `[]` | Abilities every member knows from the start. |
| `skillBonuses` | { [→ content.skills](#module-content-skills): number } |  | `{}` | Skill rank adjustments applied at creation. |
| `traits` | [rule](#the-dsl)[] |  | `[]` | Conditional rules that run for members. A predicate and the effects it gates. |
| `size` | [→ rules.sizes](#module-rules-sizes) |  |  | Size members are, overriding the ruleset default. |
| `creatureType` | [→ rules.creatureTypes](#module-rules-creatureTypes) |  |  | Creature type members count as. |
| `speeds` | { [→ rules.movementModes](#module-rules-movementModes): number } |  | `{}` | Speed per movement mode, overriding each mode's default. |
| `senses` | { [→ rules.senses](#module-rules-senses): number } |  | `{}` | Range per sense, overriding each sense's default. |
| `languages` | [→ rules.languages](#module-rules-languages)[] |  | `[]` | Languages members speak from the start. |
| `damageInteractions` | [object](#module-content-ancestries-damageInteractions)[] |  | `[]` | Resistance, vulnerability, and immunity members are born with. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this ancestry. |

### Module → `content` → `ancestries` → `damageInteractions`

<a id="module-content-ancestries-damageInteractions"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `damageType` | [→ rules.damageTypes](#module-rules-damageTypes) | **yes** |  | Which damage type this changes. |
| `multiplier` | number |  | `1` | What incoming damage is multiplied by. 0 is immunity. |
| `unless` | id[] |  | `[]` | Damage tags that cancel it, so immunity can have an exception. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this interaction. |

### Module → `content` → `classes`

<a id="module-content-classes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the class. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this training is. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `hitDie` | [dice](#dice-notation) | **yes** |  | Die rolled for vitality per level, when levelVitality takes its die from class. |
| `attributeBonuses` | { [→ rules.attributes](#module-rules-attributes): number } |  | `{}` | Attribute adjustments applied at creation. |
| `primaryAttribute` | [→ rules.attributes](#module-rules-attributes) | **yes** |  | The attribute the class runs on. Read as actor.primaryAttribute. |
| `skillProficiencies` | [→ content.skills](#module-content-skills) \| [object](#module-content-classes-skillProficiencies)[] |  | `[]` | Skills it trains. A bare skill id, or an object naming a rank. |
| `startingItems` | [object](#module-content-classes-startingItems)[] |  | `[]` | Gear a new member of the class begins with. |
| `abilitiesByLevel` | { string: [→ content.abilities](#module-content-abilities)[] } |  | `{}` | Abilities granted, keyed by the level string they arrive at. |
| `saveProficiencies` | [→ rules.savingThrows](#module-rules-savingThrows)[] |  | `[]` | Saves the class is proficient in. |
| `spellcasting` | [object](#module-content-classes-spellcasting) |  |  | How this class casts, when it casts at all. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this class. |

### Module → `content` → `classes` → `skillProficiencies`

<a id="module-content-classes-skillProficiencies"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `skill` | [→ content.skills](#module-content-skills) | **yes** |  | Which skill is trained. |
| `rank` | number | **yes** |  | The rank it is trained to. |

### Module → `content` → `classes` → `startingItems`

<a id="module-content-classes-startingItems"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `item` | [→ content.items](#module-content-items) | **yes** |  | Which item. |
| `quantity` | number |  | `1` | How many. |

### Module → `content` → `classes` → `spellcasting`

<a id="module-content-classes-spellcasting"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `castingAttribute` | [→ rules.attributes](#module-rules-attributes) | **yes** |  | Attribute that sets save difficulty and attack bonus. |
| `spellList` | [→ content.abilities](#module-content-abilities)[] |  | `[]` | Abilities this class may ever learn as spells. |
| `progression` | number |  | `1` | Multiplier on caster level, for half casters and third casters. |
| `knownByLevel` | { string: number } |  | `{}` | How many spells are known, keyed by the level string. |

### Module → `content` → `items`

<a id="module-content-items"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the item, used as actor.inventory.<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What it looks like and what it is for. |
| `kind` | `weapon` \| `armor` \| `shield` \| `consumable` \| `trinket` \| `tool` \| `key` \| `treasure` \| `material` | **yes** |  | What sort of thing it is. Decides how the interface treats it. |
| `tags` | id[] |  | `[]` | Free labels. Shops buy by these. |
| `value` | number |  | `0` | Base price in currency. Shops scale it. |
| `weight` | number |  | `0` | Weight carried, summed into actor.carried. |
| `stackable` | boolean |  | `false` | Not read by the engine. Inventory merges by item id regardless. |
| `slot` | [→ rules.equipmentSlots](#module-rules-equipmentSlots) |  |  | Equipment slot it occupies when worn or wielded. |
| `damage` | [object](#module-content-items-damage) |  |  | What it deals when used as a weapon. |
| `modifiers` | { [→ rules.derivedStats](#module-rules-derivedStats): [expression](#the-dsl) } |  | `{}` | Derived stat adjustments while it is equipped. |
| `skillBonuses` | { [→ content.skills](#module-content-skills): number } |  |  | Skill rank added while equipped. Counts for rolls and for minRank gates. |
| `onUse` | [effect](#the-dsl)[] |  | `[]` | Effects run when it is used. |
| `consumedOnUse` | boolean |  | `false` | Whether using it destroys one. |
| `procs` | [rule](#the-dsl)[] |  | `[]` | Conditional rules that fire while it is carried. A predicate and its effects. |
| `grantedAbilities` | [→ content.abilities](#module-content-abilities)[] |  | `[]` | Abilities the holder can use while carrying it. |
| `rarity` | `common` \| `uncommon` \| `rare` \| `very_rare` \| `legendary` \| `artifact` |  |  | Not read by the engine. For display and filtering. |
| `requiresAttunement` | boolean |  | `false` | Not read by the engine yet, and neither is attunementRequires. |
| `attunementRequires` | id[] |  | `[]` | Ids of what attunement needs. Bare ids, not checked references. |
| `charges` | [object](#module-content-items-charges) |  |  | Limited uses, how they come back, and what happens when they run out. |
| `properties` | [→ rules.itemProperties](#module-rules-itemProperties)[] |  | `[]` | Item properties it carries, each bringing its own modifiers. |
| `damageInteractions` | [object](#module-content-ancestries-damageInteractions)[] |  | `[]` | Resistance or vulnerability granted while it is equipped. |
| `usableBy` | [→ content.classes](#module-content-classes)[] |  | `[]` | Classes allowed to use it. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this item. |

### Module → `content` → `items` → `damage`

<a id="module-content-items-damage"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `dice` | [dice](#dice-notation) | **yes** |  | Damage notation. |
| `damageType` | [→ rules.damageTypes](#module-rules-damageTypes) | **yes** |  | What kind of damage it deals. |
| `stat` | [→ rules.attributes](#module-rules-attributes) |  |  | Attribute whose modifier is added to the damage. |

### Module → `content` → `items` → `charges`

<a id="module-content-items-charges"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `max` | number | **yes** |  | How many charges it holds when full. |
| `rechargeOn` | [→ rules.rests](#module-rules-rests) |  |  | Which rest refills it. |
| `rechargeAmount` | [dice](#dice-notation) |  |  | How many come back per recharge. Absent means all of them. |
| `destroyOnEmpty` | boolean |  | `false` | Whether spending the last charge destroys the item. |

### Module → `content` → `lootTables`

<a id="module-content-lootTables"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the table. |
| `name` | string |  |  | Display name. |
| `description` | string |  | `""` | What this table is for. |
| `rolls` | [dice](#dice-notation) |  | `"1"` | How many times the table is drawn. |
| `entries` | [object](#module-content-lootTables-entries)[] | **yes** |  | The weighted rows. At least one is required. |
| `emptyChance` | number |  | `0` | Chance a draw yields nothing, 0 to 1. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on the whole table. Failing it means no draw at all. |
| `bonusRollSkill` | [→ content.skills](#module-content-skills) |  |  | Skill checked on searching, to earn extra draws. |
| `bonusRolls` | [object](#module-content-lootTables-bonusRolls) |  | `{}` | Extra draws earned by that check. |

### Module → `content` → `lootTables` → `entries`

<a id="module-content-lootTables-entries"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `weight` | number |  | `1` | Relative likelihood against the other rows. |
| `value` | [object](#module-content-lootTables-entries-value) | **yes** |  | What this row yields. |

### Module → `content` → `lootTables` → `entries` → `value`

<a id="module-content-lootTables-entries-value"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `item` | [→ content.items](#module-content-items) | **yes** |  | Which item is found. |
| `quantity` | [dice](#dice-notation) |  | `"1"` | How many, as dice notation. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on this row. Failing removes it before the draw, not after. |
| `requirementScope` | `finder` \| `party` \| `anyMember` |  | `"anyMember"` | Who the gate is measured against. The searcher, the whole party, or any member. |
| `unique` | boolean |  | `false` | Whether the row is removed once it has been found. |

### Module → `content` → `lootTables` → `bonusRolls`

<a id="module-content-lootTables-bonusRolls"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `onSuccess` | number |  | `1` | Extra draws for passing the bonus roll skill check. |
| `onCritical` | number |  | `2` | Extra draws for a critical on that check. |

### Module → `content` → `monsters`

<a id="module-content-monsters"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the statblock. Kill objectives match on it. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What it looks like. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `level` | number |  | `1` | Its level, used for scaling and for encounter budgeting. |
| `xp` | number |  | `0` | Experience the party gains for killing it. Awarded to everyone. |
| `attributes` | { [→ rules.attributes](#module-rules-attributes): number } | **yes** |  | Its attribute values. Required. Everything else derives from them. |
| `resourceOverrides` | { [→ rules.resources](#module-rules-resources): [expression](#the-dsl) } |  | `{}` | Formulas replacing the ruleset maximum for named resources. |
| `derivedOverrides` | { [→ rules.derivedStats](#module-rules-derivedStats): [expression](#the-dsl) } |  | `{}` | Formulas replacing the ruleset formula for named derived stats. |
| `abilities` | [→ content.abilities](#module-content-abilities)[] |  | `[]` | What it can do. |
| `behaviour` | [object](#module-content-monsters-behaviour)[] |  | `[]` | What it chooses to do, in priority order. Its combat brain. |
| `reactions` | [object](#module-content-monsters-reactions)[] |  | `[]` | What it does off its own turn, gated on what it sees and remembers. |
| `loot` | [→ content.lootTables](#module-content-lootTables) |  |  | Table drawn on its death. |
| `conditionalLoot` | [→ content.lootTables](#module-content-lootTables)[] |  | `[]` | Tables drawn as well as loot, and only when the finder qualifies. |
| `faction` | [→ content.factions](#module-content-factions) |  |  | Whose side it is on. Decides who it treats as an enemy. |
| `descriptors` | string[] |  | `[]` | Adjectives the narrator may reach for. |
| `size` | [→ rules.sizes](#module-rules-sizes) |  |  | Its size, overriding the ruleset default. |
| `creatureType` | [→ rules.creatureTypes](#module-rules-creatureTypes) |  |  | What kind of creature it is. |
| `alignment` | [→ rules.alignments](#module-rules-alignments) |  |  | Its alignment. |
| `damageInteractions` | [object](#module-content-ancestries-damageInteractions)[] |  | `[]` | Resistance, vulnerability, and immunity. |
| `conditionImmunities` | [→ rules.conditions](#module-rules-conditions)[] |  | `[]` | Conditions that never land on it. |
| `saveBonuses` | { [→ rules.savingThrows](#module-rules-savingThrows): number } |  | `{}` | Flat bonus per saving throw. |
| `skillBonuses` | { [→ content.skills](#module-content-skills): number } |  | `{}` | Skill rank per skill. |
| `senses` | { [→ rules.senses](#module-rules-senses): number } |  | `{}` | Range per sense, overriding each sense's default. |
| `speeds` | { [→ rules.movementModes](#module-rules-movementModes): number } |  | `{}` | Speed per movement mode, overriding each mode's default. |
| `languages` | [→ rules.languages](#module-rules-languages)[] |  | `[]` | Languages it speaks. |
| `challenge` | number |  |  | Not read by the engine. A budgeting number for the editor. |
| `specialTurns` | [object](#module-content-monsters-specialTurns)[] |  | `[]` | Extra turns it takes outside the order. Legendary and lair actions. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this monster. |

### Module → `content` → `monsters` → `behaviour`

<a id="module-content-monsters-behaviour"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `priority` | number |  | `0` | Higher is considered first. Ties keep declaration order. |
| `when` | [predicate](#the-dsl) |  |  | Predicate that must hold for this line to be chosen. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on this line, in the requirement vocabulary. |
| `use` | [→ content.abilities](#module-content-abilities) | **yes** |  | Ability used when this line is chosen. |

### Module → `content` → `monsters` → `reactions`

<a id="module-content-monsters-reactions"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the reaction. |
| `description` | string |  | `""` | What it does and why. |
| `on` | `seePlayer` \| `allyHurt` \| `allyKilled` \| `selfHurt` \| `lowHealth` \| `combatStart` \| `combatEnd` \| `turnStart` \| `witnessDeed` \| `questComplete` \| `itemShown` \| `custom` |  | `"turnStart"` | What sets it off. |
| `event` | string |  |  | Event name to watch, when on is custom. |
| `priority` | number |  | `0` | Higher is considered first among reactions to the same thing. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate measured against the reacting creature, not the party. |
| `when` | [predicate](#the-dsl) |  |  | Predicate checked on top of requires. |
| `chance` | number |  | `1` | Chance it fires once everything else passes, 0 to 1. |
| `roll` | [object](#module-content-monsters-reactions-roll) |  |  | A check that decides between onSuccess and onFailure. |
| `onSuccess` | [effect](#the-dsl)[] |  | `[]` | Effects run when the roll succeeds. |
| `onFailure` | [effect](#the-dsl)[] |  | `[]` | Effects run when the roll fails. |
| `effects` | [effect](#the-dsl)[] |  | `[]` | Effects run either way, or when there is no roll. |
| `use` | [→ content.abilities](#module-content-abilities) |  |  | Ability the creature uses as its reaction. |
| `textKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool narrating it. |
| `oncePerEncounter` | boolean |  | `false` | Whether it may fire only once per fight. |

### Module → `content` → `monsters` → `reactions` → `roll`

<a id="module-content-monsters-reactions-roll"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `skill` | [→ content.skills](#module-content-skills) |  |  | Skill rolled. |
| `attribute` | [→ rules.attributes](#module-rules-attributes) |  |  | Attribute rolled, when no skill fits. |
| `difficulty` | [expression](#the-dsl) |  | `12` | Difficulty of the roll. |
| `opposedBy` | [→ content.skills](#module-content-skills) |  |  | Skill the other side rolls instead of a fixed difficulty. |

### Module → `content` → `monsters` → `specialTurns`

<a id="module-content-monsters-specialTurns"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the special turn. |
| `name` | string | **yes** |  | Display name. |
| `use` | [→ content.abilities](#module-content-abilities) | **yes** |  | Ability used when it comes round. |
| `uses` | number |  | `1` | How many times per round it is available. |
| `when` | [predicate](#the-dsl) |  |  | Predicate that must hold for it to be taken. |

### Module → `content` → `traps`

<a id="module-content-traps"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the trap. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What it is once seen. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `detect` | [object](#module-content-traps-detect) | **yes** |  | The check that spots it before it fires. |
| `disarm` | [object](#module-content-traps-disarm) | **yes** |  | The check that defuses it. |
| `onTrigger` | [effect](#the-dsl)[] |  | `[]` | Effects run on whoever set it off. |
| `onDisarm` | [effect](#the-dsl)[] |  | `[]` | Effects run on a successful disarm. |
| `reusable` | boolean |  | `false` | Whether it arms itself again after firing. |

### Module → `content` → `traps` → `detect`

<a id="module-content-traps-detect"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `skill` | [→ content.skills](#module-content-skills) | **yes** |  | Skill rolled to spot it. |
| `difficulty` | [expression](#the-dsl) | **yes** |  | Difficulty of that roll. |

### Module → `content` → `traps` → `disarm`

<a id="module-content-traps-disarm"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `skill` | [→ content.skills](#module-content-skills) | **yes** |  | Skill rolled to defuse it. |
| `difficulty` | [expression](#the-dsl) | **yes** |  | Difficulty of that roll. |

### Module → `content` → `factions`

<a id="module-content-factions"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the faction, used as reputation.<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | Who they are and what they want. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `initialStanding` | number |  | `0` | Standing the party begins with. |
| `relations` | { [→ content.factions](#module-content-factions): number } |  | `{}` | How this faction feels about others, from minus one to one. |
| `ranks` | [object](#module-content-factions-ranks)[] |  | `[]` | Named standing bands, so a gate can ask for a rank rather than a number. |
| `decayPerDay` | number |  | `0` | Standing pulled back toward zero each day. |

### Module → `content` → `factions` → `ranks`

<a id="module-content-factions-ranks"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the rank, asked for by a requirement as minRank. |
| `name` | string | **yes** |  | Display name. |
| `atLeast` | number | **yes** |  | Standing at which the rank is held. |

### Module → `content` → `npcs`

<a id="module-content-npcs"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the person. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | Who they are. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `faction` | [→ content.factions](#module-content-factions) |  |  | Who they belong to. Deeds against others can reach them through it. |
| `statblock` | [→ content.monsters](#module-content-monsters) |  |  | Monster used if they ever have to fight. Without one they cannot. |
| `dialogue` | [→ narrative.dialogues](#module-narrative-dialogues) |  |  | What they say. Without one, talking to them does nothing. |
| `home` | [→ world.pointsOfInterest](#module-world-pointsOfInterest) |  |  | Where they stand. The engine gathers everyone whose home is here on arrival. |
| `gullibility` | number |  | `0.5` | How readily they believe a rumour they did not witness, 0 to 1. |
| `memorySpan` | number |  | `90` | Days a deed stays in their memory. |
| `disposition` | number |  | `0` | How they feel about the party, from minus one hundred to one hundred. |
| `reactions` | [object](#module-content-monsters-reactions)[] |  | `[]` | What they do off their own turn, gated on what they know. |
| `offersQuests` | [→ narrative.quests](#module-narrative-quests)[] |  | `[]` | The quests they actually put in front of a player. This is what offers work. |
| `shop` | [object](#module-content-npcs-shop) |  |  | What they will trade, and on what terms. |
| `caresAbout` | [→ narrative.deedKinds](#module-narrative-deedKinds)[] |  | `[]` | Deed kinds they take personally. Weighted heavier in their memory. |

### Module → `content` → `npcs` → `shop`

<a id="module-content-npcs-shop"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `lootTable` | [→ content.lootTables](#module-content-lootTables) |  |  | Table their stock is drawn from, refreshed daily. |
| `buysTags` | id[] |  | `[]` | Item tags they will buy. Anything else they refuse. |
| `priceMultiplier` | number |  | `1` | What they scale the base value by. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on trading with them at all. |

## World

### Module → `world`

<a id="module-world"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `terrains` | [object](#module-world-terrains)[] |  | `[]` | What a tile can be. Passability and cost are read from here, not baked in. |
| `palettes` | [object](#module-world-palettes)[] |  | `[]` | Which terrains a generator builds with. One generator, many looks. |
| `biomes` | [object](#module-world-biomes)[] |  | `[]` | A theme. Room templates, encounter tables, ambience, and a palette. |
| `areas` | [object](#module-world-areas)[] |  | `[]` | A named place on the map, belonging to a biome and joined to others. |
| `pointsOfInterest` | [object](#module-world-pointsOfInterest)[] |  | `[]` | Somewhere you go inside an area. A shrine, a camp, a dungeon mouth. |
| `gates` | [object](#module-world-gates)[] |  | `[]` | Something in the way, and what gets you past it. |
| `roomTemplates` | [object](#module-world-roomTemplates)[] |  | `[]` | The kinds of room a generated dungeon draws from. |
| `encounterTables` | [object](#module-world-encounterTables)[] |  | `[]` | Weighted groups of monsters, drawn on arrival and in rooms. |
| `dungeons` | [object](#module-world-dungeons)[] |  | `[]` | A generated interior. Hangs off a point of interest rather than replacing it. |
| `maps` | [object](#module-world-maps)[] |  | `[]` | Hand authored grids, identical on every seed. No randomness is consulted. |
| `time` | [object](#module-world-time) |  | `{}` | The clock. Day length, phases, and what each action costs in minutes. |
| `generationDefaults` | [object](#module-world-generationDefaults) |  | `{}` | Fallback chances for rooms that name none. |

### Module → `world` → `terrains`

<a id="module-world-terrains"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the terrain, named by palettes, legends, and map cells. |
| `name` | string | **yes** |  | Display name. Used when something blocks you and has to say why. |
| `description` | string |  | `""` | What it looks like underfoot. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `glyph` | string |  | `"."` | One or two characters drawn for it on the map. |
| `color` | `red` \| `green` \| `yellow` \| `blue` \| `magenta` \| `cyan` \| `white` \| `gray` |  |  | Colour it is drawn in. |
| `passable` | boolean |  | `true` | Whether anything can walk onto it. |
| `opaque` | boolean |  | `false` | Whether it blocks sight and any sense stopped by opaque things. |
| `moveCost` | number |  | `1` | Movement spent entering it. |
| `requiresMode` | [→ rules.movementModes](#module-rules-movementModes)[] |  | `[]` | Movement modes that can cross it. Empty means any. |
| `providesCover` | [→ rules.coverTypes](#module-rules-coverTypes) |  |  | Cover a creature standing here gets. |
| `onEnter` | [effect](#the-dsl)[] |  | `[]` | Effects run on whoever steps onto it. |
| `onOccupy` | [effect](#the-dsl)[] |  | `[]` | Effects run on whoever ends their turn on it. |
| `lightRadius` | number |  | `0` | Indexed but unread. There is no light model; a sense carries its own reach. |
| `isDoor` | boolean |  | `false` | Indexed but unread. Doors live on the map's gate record, not on the terrain. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this terrain. |

### Module → `world` → `palettes`

<a id="module-world-palettes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the palette. |
| `name` | string |  |  | Display name. |
| `floor` | [→ world.terrains](#module-world-terrains) | **yes** |  | Terrain used for open ground. |
| `wall` | [→ world.terrains](#module-world-terrains) | **yes** |  | Terrain used for solid rock. |
| `door` | [→ world.terrains](#module-world-terrains) |  |  | Terrain used where a corridor meets a room. |
| `scatter` | [object](#module-world-palettes-scatter)[] |  | `[]` | Terrains sprinkled over the floor, and how they are spread. |
| `exterior` | [→ world.terrains](#module-world-terrains) |  |  | Terrain filling everything outside the built area. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this palette. |

### Module → `world` → `palettes` → `scatter`

<a id="module-world-palettes-scatter"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `terrain` | [→ world.terrains](#module-world-terrains) | **yes** |  | Which terrain is scattered. |
| `frequency` | number |  | `0.05` | Share of floor it covers, 0 to 1. |
| `distribution` | `speckle` \| `patch` |  | `"speckle"` | Speckle rolls each tile alone. Patch uses noise, so it comes out connected. |
| `scale` | number |  | `8` | Size of the noise features, for patch. |
| `octaves` | number |  | `2` | Layers of noise, for patch. More gives rougher edges. |
| `edgeTerrain` | [→ world.terrains](#module-world-terrains) |  |  | Terrain ringing each patch. |
| `edgeWidth` | number |  | `1` | How many tiles wide that ring is. |
| `priority` | number |  | `0` | Which scatter wins where two overlap. Higher wins. |

### Module → `world` → `biomes`

<a id="module-world-biomes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the biome. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this kind of place is like. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `layer` | `overworld` \| `underworld` \| `both` |  | `"underworld"` | Whether places here sit above ground, below it, or either. |
| `roomTemplates` | [→ world.roomTemplates](#module-world-roomTemplates)[] |  | `[]` | Rooms a dungeon in this biome may draw. |
| `encounterTables` | [→ world.encounterTables](#module-world-encounterTables)[] |  | `[]` | What may be met here. |
| `lootTables` | [→ content.lootTables](#module-content-lootTables)[] |  | `[]` | What may be found here. |
| `traps` | [→ content.traps](#module-content-traps)[] |  | `[]` | Traps that may be placed here. |
| `ambienceKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool for the background of the place. |
| `triggers` | [object](#module-world-biomes-triggers)[] |  | `[]` | Things that happen anywhere in this biome. |
| `palette` | [→ world.palettes](#module-world-palettes) |  |  | Terrains generators use here. Overrides a palette named on the map. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this biome. |

### Module → `world` → `biomes` → `triggers`

<a id="module-world-biomes-triggers"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the trigger. Also the key under which firing is remembered. |
| `description` | string |  | `""` | What happens and why. |
| `mode` | `once` \| `everyEntry` \| `untilComplete` \| `loop` \| `restart` |  | `"once"` | How often it may fire. Choosing this correctly is most of the work. |
| `on` | `enter` \| `exit` \| `rest` \| `search` \| `combatStart` \| `combatEnd` \| `timePass` \| `custom` |  | `"enter"` | The occasion it listens for. |
| `event` | string |  |  | Event name to watch, when on is custom. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on firing, in the requirement vocabulary. |
| `when` | [predicate](#the-dsl) |  |  | Predicate checked on top of requires. |
| `cooldownMinutes` | number |  | `0` | World minutes between firings, for loop mode. |
| `completeWhen` | [predicate](#the-dsl) |  |  | Predicate that ends untilComplete mode once it holds. |
| `remember` | boolean |  | `true` | Whether the world records that it happened. Off makes the event ambient. |
| `chance` | number |  | `1` | Chance it fires once the gates pass. Rolled last, so a failed gate costs no randomness. |
| `effects` | [effect](#the-dsl)[] |  | `[]` | What it does. |
| `textKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool narrating it. |

### Module → `world` → `areas`

<a id="module-world-areas"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the area. Its map is keyed area:<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What the place is. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `biome` | [→ world.biomes](#module-world-biomes) | **yes** |  | Theme it belongs to. Supplies rooms, encounters, ambience, and palette. |
| `layer` | `overworld` \| `underworld` |  | `"overworld"` | Whether it sits above ground or below. Decides whether the sky is visible. |
| `descriptionKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool read on arrival. |
| `connections` | [object](#module-world-areas-connections)[] |  | `[]` | Roads out. Travel is only possible along a declared connection. |
| `triggers` | [object](#module-world-biomes-triggers)[] |  | `[]` | Things that happen here. |
| `encounterTables` | [→ world.encounterTables](#module-world-encounterTables)[] |  | `[]` | What may be met here, on top of the biome's. |
| `controllingFaction` | [→ content.factions](#module-content-factions) |  |  | Who holds it. |
| `dangerLevel` | number |  | `1` | How dangerous it is. Feeds the default encounter chance. |
| `encounterChance` | [expression](#the-dsl) |  | `{"min":[0.75,{"mul":[{"ref":"dangerLevel"},0.15]}]}` | Formula for the chance of an encounter, overriding the danger based default. |
| `recommendedLevel` | number |  |  | Party level the area is written for. Advisory. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on entering at all. |
| `map` | [object](#module-world-areas-map) |  | `{}` | How the ground here is built. Size, palette, or a hand authored grid. |
| `entryPoint` | [object](#module-world-areas-entryPoint) |  |  | Tile the party arrives on. Without one the engine picks a free tile. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this area. |

### Module → `world` → `areas` → `connections`

<a id="module-world-areas-connections"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `to` | [→ world.areas](#module-world-areas) | **yes** |  | Area at the other end. |
| `travelMinutes` | number |  | `60` | World minutes the journey costs. |
| `gate` | [→ world.gates](#module-world-gates) |  |  | Something in the way on this road. |
| `oneWay` | boolean |  | `false` | Set on the destination's back link. A road listed both ways is two way. |
| `encounterTables` | [→ world.encounterTables](#module-world-encounterTables)[] |  | `[]` | What may be met on the road itself. |

### Module → `world` → `areas` → `map`

<a id="module-world-areas-map"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `width` | [dice](#dice-notation) |  | `"7"` | Tiles across, as dice notation so it can vary by seed. |
| `height` | [dice](#dice-notation) |  | `"7"` | Tiles down, as dice notation. |
| `palette` | [→ world.palettes](#module-world-palettes) |  |  | Terrains to build with. Dead whenever the biome names one, since the biome wins. |
| `static` | [→ world.maps](#module-world-maps) |  |  | A hand authored map to use instead. Beats layout and generation. |
| `layout` | string[] |  | `[]` | Rows of glyphs drawn by hand. Beats generation. All rows must be equal length. |
| `legend` | { string: [→ world.terrains](#module-world-terrains) } |  | `{}` | Which terrain each layout glyph means. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this map spec. |

### Module → `world` → `areas` → `entryPoint`

<a id="module-world-areas-entryPoint"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `x` | number | **yes** |  | Column, counting from zero. |
| `y` | number | **yes** |  | Row, counting from zero. |

### Module → `world` → `pointsOfInterest`

<a id="module-world-pointsOfInterest"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the place. Its map is keyed poi:<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What is here. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `area` | [→ world.areas](#module-world-areas) | **yes** |  | Area it sits in. A place whose area does not exist never appears. |
| `kind` | `settlement` \| `shrine` \| `ruin` \| `camp` \| `dungeonEntrance` \| `landmark` \| `crossing` \| `lair` \| `market` \| `wilds` |  | `"landmark"` | What sort of place it is. Decides the icon and some phrasing. |
| `descriptionKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool read on arrival. |
| `gate` | [→ world.gates](#module-world-gates) |  |  | Something in the way of going in. |
| `hidden` | boolean |  | `false` | Whether it must be found before it can be travelled to. |
| `discover` | [object](#module-world-pointsOfInterest-discover) |  |  | The check that finds it. Without one a hidden place stays hidden. |
| `triggers` | [object](#module-world-biomes-triggers)[] |  | `[]` | Things that happen here. |
| `encounterTables` | [→ world.encounterTables](#module-world-encounterTables)[] |  | `[]` | What may be met here. |
| `encounterChance` | number |  |  | Chance of an encounter here, overriding the area. |
| `residents` | [→ content.npcs](#module-content-npcs)[] |  | `[]` | Who lives here. The other way to place people, alongside an NPC's home. |
| `loot` | [→ content.lootTables](#module-content-lootTables)[] |  | `[]` | Tables drawn when the place is searched. |
| `dungeon` | [→ world.dungeons](#module-world-dungeons) |  |  | Interior reached from here. The dungeon hangs off the place, it does not replace it. |
| `services` | `inn` \| `market` \| `temple` \| `smith` \| `guild` \| `stable` \| `healer`[] |  | `[]` | What can be done here. Trade, rest, healing, training. |
| `rumourReach` | number |  | `1` | How many hops news of this place travels among its people. |
| `controllingFaction` | [→ content.factions](#module-content-factions) |  |  | Who holds it. |
| `travelMinutes` | number |  | `0` | World minutes to reach it from the area entrance. |
| `position` | [object](#module-world-areas-entryPoint) |  |  | Where it sits on the area map. |
| `map` | [object](#module-world-areas-map) |  |  | How the ground here is built, when the place has an interior of its own. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this place. |

### Module → `world` → `pointsOfInterest` → `discover`

<a id="module-world-pointsOfInterest-discover"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `skill` | [→ content.skills](#module-content-skills) | **yes** |  | Skill rolled to find it. |
| `difficulty` | [expression](#the-dsl) | **yes** |  | Difficulty of that roll. Often a formula over what the party has heard. |

### Module → `world` → `gates`

<a id="module-world-gates"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the gate. Its state is flagged gate:<id>:open. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What is in the way. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `kind` | `lock` \| `ward` \| `puzzle` \| `toll` \| `story` \| `hazard` |  | `"lock"` | What sort of obstacle it is. |
| `requires` | [object](#module-content-abilities-requires) |  |  | What opens it outright. Items marked consume are spent doing so. |
| `bypass` | [object](#module-world-gates-bypass) |  |  | A check that gets past it instead. |
| `opensWith` | [→ content.abilities](#module-content-abilities)[] |  | `[]` | Abilities that open it. |
| `onOpen` | [effect](#the-dsl)[] |  | `[]` | Effects run when it opens. |
| `onBlocked` | [effect](#the-dsl)[] |  | `[]` | Effects run when someone fails to open it. |
| `blockedTextKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool for being turned away. |
| `staysOpen` | boolean |  | `true` | Whether opening it is permanent. |

### Module → `world` → `gates` → `bypass`

<a id="module-world-gates-bypass"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `skill` | [→ content.skills](#module-content-skills) | **yes** |  | Skill rolled to get past. |
| `difficulty` | [expression](#the-dsl) | **yes** |  | Difficulty of that roll. |
| `onSuccess` | [effect](#the-dsl)[] |  | `[]` | Effects run on getting past. |
| `onFailure` | [effect](#the-dsl)[] |  | `[]` | Effects run on failing. |
| `retryable` | boolean |  | `true` | Whether a failure may be tried again. False records the attempt and refuses more. |

### Module → `world` → `roomTemplates`

<a id="module-world-roomTemplates"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the template. |
| `name` | string | **yes** |  | Display name. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `descriptionKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) | **yes** |  | Text pool read on first entering a room built from it. |
| `weight` | number |  | `1` | Relative likelihood of being drawn against other templates. |
| `role` | `entrance` \| `corridor` \| `chamber` \| `vault` \| `boss` \| `shrine` \| `lair` |  | `"chamber"` | What the room is for. Generation guarantees some roles exist. |
| `minExits` | number |  | `1` | Fewest doors the room may have. |
| `maxExits` | number |  | `4` | Most doors it may have. Connectivity wins over this cap. |
| `encounterChance` | number |  | `0.3` | Chance the room is occupied, 0 to 1. |
| `trapChance` | number |  | `0.1` | Chance the room is trapped, 0 to 1. |
| `lootChance` | number |  | `0.25` | Chance the room holds something, 0 to 1. |
| `alwaysEncounter` | boolean |  | `false` | Force an occupant regardless of the chance. |
| `neverEncounter` | boolean |  | `false` | Forbid an occupant regardless of the chance. |
| `neverTrap` | boolean |  | `false` | Forbid a trap regardless of the chance. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on the template being drawn at all. |
| `triggers` | [object](#module-world-biomes-triggers)[] |  | `[]` | Things that happen in a room built from it. |
| `map` | [object](#module-world-areas-map) |  | `{}` | How the room itself is built. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this template. |

### Module → `world` → `encounterTables`

<a id="module-world-encounterTables"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the table. |
| `name` | string |  |  | Display name. |
| `description` | string |  | `""` | What this table is for. |
| `minDepth` | number |  | `0` | Shallowest dungeon depth it may be drawn at. |
| `maxDepth` | number |  | `999` | Deepest dungeon depth it may be drawn at. |
| `chance` | number |  | `1` | Chance a draw yields anything at all, 0 to 1. |
| `emptyWeight` | number |  | `0` | Weight of the nothing row against the groups. |
| `scalePerLevels` | number |  | `2` | Party levels per step of scaling on entries that scale. |
| `groups` | [object](#module-world-encounterTables-groups)[] | **yes** |  | The weighted rows. Each is a whole encounter. |

### Module → `world` → `encounterTables` → `groups`

<a id="module-world-encounterTables-groups"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the group. |
| `name` | string |  |  | Display name. |
| `weight` | number |  | `1` | Relative likelihood against the other groups. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on the group. Failing removes it before the draw, not after. |
| `entries` | [object](#module-world-encounterTables-groups-entries)[] | **yes** |  | The creatures in it. At least one is required. |
| `onEncounter` | [effect](#the-dsl)[] |  | `[]` | Effects run when this group is drawn. |
| `textKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool narrating the meeting. |
| `hostile` | boolean |  | `true` | Whether they attack. False makes it a meeting rather than a fight. |

### Module → `world` → `encounterTables` → `groups` → `entries`

<a id="module-world-encounterTables-groups-entries"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `monster` | [→ content.monsters](#module-content-monsters) | **yes** |  | Which statblock appears. |
| `count` | [dice](#dice-notation) |  | `"1"` | How many, as dice notation. |
| `scaleWithLevel` | boolean |  | `false` | Whether the count grows with party level. |

### Module → `world` → `dungeons`

<a id="module-world-dungeons"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the dungeon. Its maps are keyed by it and the depth. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What is down there. |
| `biome` | [→ world.biomes](#module-world-biomes) | **yes** |  | Theme it is built from. Supplies room templates and encounters. |
| `roomCount` | [dice](#dice-notation) |  | `"8"` | Rooms requested per floor. A request, not a promise; packing may fit fewer. |
| `depth` | [dice](#dice-notation) |  | `"1"` | How many floors deep it goes. |
| `branchiness` | number |  | `0.35` | Extra loops added past the spanning tree, 0 to 1. 0 gives a pure tree. |
| `lockedDoorChance` | number |  | `0.15` | Chance a tree edge gets a lock. Keys are always placed before their lock. |
| `doorGates` | [→ world.gates](#module-world-gates)[] |  | `[]` | Gates that may be used as locks. |
| `guaranteedRoles` | string[] |  | `["entrance","boss"]` | Room roles that must exist. Bare strings, not checked references. |
| `safeEntrance` | boolean |  | `true` | Whether the entrance room is guaranteed empty. |
| `bossTable` | [→ world.encounterTables](#module-world-encounterTables) |  |  | Drawn in the boss room. Without one the deepest room generates like any other. |
| `completionTriggers` | [object](#module-world-biomes-triggers)[] |  | `[]` | Things that happen when the dungeon is finished. |
| `palette` | [→ world.palettes](#module-world-palettes) |  |  | Terrains to build with, overriding the biome. |
| `corridorLength` | [dice](#dice-notation) |  | `"3d3"` | Corridor length, which is what actually sets the spacing between rooms. |
| `winding` | [object](#module-world-dungeons-winding) |  | `{}` | How much corridors wander, when the corridor style is winding. |
| `roomSize` | [dice](#dice-notation) |  | `"2d3+3"` | How large a room is on a side. |
| `algorithm` | `rooms` \| `bsp` \| `caverns` |  | `"rooms"` | How the floor is carved. Placed rooms, split rectangles, or grown caves. |
| `bsp` | [object](#module-world-dungeons-bsp) |  | `{}` | Settings for the bsp algorithm. |
| `caverns` | [object](#module-world-dungeons-caverns) |  | `{}` | Settings for the caverns algorithm. |
| `staticMap` | [→ world.maps](#module-world-maps) |  |  | A hand authored map to use instead. Skips generation entirely. |
| `rollEncounters` | boolean |  | `false` | Whether rooms roll their own encounters as well as the placed ones. |
| `corridor` | [object](#module-world-dungeons-corridor) |  | `{}` | Shape and width of the corridors. |
| `width` | [dice](#dice-notation) |  |  | Floor width in tiles. Without one the engine sizes it from the room count. |
| `height` | [dice](#dice-notation) |  |  | Floor height in tiles. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this dungeon. |

### Module → `world` → `dungeons` → `winding`

<a id="module-world-dungeons-winding"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `continueChance` | number |  | `0.6` | Chance a corridor keeps going the way it was, 0 to 1. |
| `turnPenalty` | number |  | `0.4` | How much a turn is discouraged, 0 to 1. |

### Module → `world` → `dungeons` → `bsp`

<a id="module-world-dungeons-bsp"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `minLeaf` | number |  | `5` | Smallest rectangle the splitting stops at. |

### Module → `world` → `dungeons` → `caverns`

<a id="module-world-dungeons-caverns"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `fill` | number |  | `0.45` | Share of the floor filled with rock before smoothing, 0 to 1. |
| `smoothingPasses` | number |  | `4` | How many rounds of smoothing are run. |
| `birthThreshold` | number |  | `5` | Neighbours needed for a cell to become rock. |

### Module → `world` → `dungeons` → `corridor`

<a id="module-world-dungeons-corridor"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `style` | `l` \| `straight` \| `winding` |  | `"l"` | Whether corridors turn once, run straight, or wander. |
| `width` | number |  | `1` | Tiles across. Crossings are never widened, so a locked door stays one tile. |

### Module → `world` → `maps`

<a id="module-world-maps"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the map, named by an area, place, dungeon, or room template. |
| `name` | string |  |  | Display name. |
| `description` | string |  | `""` | What this map is. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `entry` | id |  | `"entry"` | Marker the party arrives at. |
| `layers` | [object, 7 variants](#module-world-maps-layers)[] | **yes** |  | Grids stacked in draw order. The layer kind decides what its cells mean. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this map. |

### Module → `world` → `maps` → `layers`

<a id="module-world-maps-layers"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `kind` | `terrain` | **yes** |  | What the cells name. Terrain, items, monsters, npcs, gates, traps, or free markers. |
| `name` | id |  |  | Names the layer in the editor and its file on disk. |
| `cells` | `` \| [→ world.terrains](#module-world-terrains)[][] | **yes** |  | Rows of ids, one per tile. An empty cell means nothing here. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this layer. |

### Module → `world` → `time`

<a id="module-world-time"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `minutesPerDay` | number |  | `1440` | How long a day is. |
| `minutesPerHour` | number |  | `60` | How long an hour is. |
| `daysPerMonth` | number |  | `30` | How long a month is. |
| `monthNames` | string[] |  | `[]` | Names of the months, in order. |
| `dayPhases` | [object](#module-world-time-dayPhases)[] |  | `[]` | Named parts of the day and when each begins. |
| `startMinute` | number |  | `480` | Minute of the first day play begins at. |
| `actionMinutes` | { string: number } |  | `{"search":10,"disarm":10,"sense":1,"wait":10}` | World minutes each action costs outside combat. |
| `minutesPerTile` | number |  | `0` | World minutes a step costs. Only charged outside combat. |

### Module → `world` → `time` → `dayPhases`

<a id="module-world-time-dayPhases"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the phase, read as world.phase. |
| `name` | string | **yes** |  | Display name. |
| `startMinute` | number | **yes** |  | Minute of the day it begins at. |

### Module → `world` → `generationDefaults`

<a id="module-world-generationDefaults"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `encounterChance` | number |  | `0.3` | Encounter chance for a room whose template names none. |
| `lootChance` | number |  | `0.25` | Loot chance for a room whose template names none. |
| `trapChance` | number |  | `0.1` | Trap chance for a room whose template names none. |

## Narrative

### Module → `narrative`

<a id="module-narrative"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `maxDialogueHops` | number |  | `8` | How many redirects a conversation may follow before it stops. |
| `textGrammar` | [object](#module-narrative-textGrammar)[] |  | `[]` | Weighted pools of phrasing. Where variety in the prose comes from. |
| `systemText` | [object](#module-narrative-systemText) |  | `{}` | Every sentence the engine itself produces. It holds no prose of its own. |
| `dialogues` | [object](#module-narrative-dialogues)[] |  | `[]` | Conversation graphs. An NPC points at one; the dialogue does not name its owner. |
| `quests` | [object](#module-narrative-quests)[] |  | `[]` | Jobs, their objectives, and what finishing them is worth. |
| `arcs` | [object](#module-narrative-arcs)[] |  | `[]` | Groups of quests read as one story. One of them may end the game. |
| `lore` | [object](#module-narrative-lore)[] |  |  | Things that can be known. Taught only by a learnLore effect. |
| `loreThreads` | [object](#module-narrative-loreThreads)[] |  |  | Lore grouped into a mystery, so a journal can say three of five. |
| `deedKinds` | [object](#module-narrative-deedKinds)[] |  | `[]` | The kinds of thing the party can be remembered for. |
| `memory` | [object](#module-narrative-memory) |  | `{}` | How people witness, forget, gossip, and learn. A settings block, not a collection. |

### Module → `narrative` → `textGrammar`

<a id="module-narrative-textGrammar"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the pool, named wherever prose is wanted. |
| `description` | string |  | `""` | What this pool is for. |
| `variants` | [object](#module-narrative-textGrammar-variants)[] | **yes** |  | The phrasings. At least one is required. |

### Module → `narrative` → `textGrammar` → `variants`

<a id="module-narrative-textGrammar-variants"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `text` | string | **yes** |  | The sentence. Placeholders in braces are filled from the facts in scope. |
| `when` | [predicate](#the-dsl) |  |  | Predicate gating this phrasing, so prose can react to world state. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on this phrasing, in the requirement vocabulary. |
| `weight` | number |  | `1` | Relative likelihood against the other phrasings. |
| `tags` | id[] |  | `[]` | Free labels for grouping. |

### Module → `narrative` → `systemText`

<a id="module-narrative-systemText"></a>

Every sentence the engine produces. The engine holds no prose of its own: it
emits a key and its facts, and these decide the words. A value may be a string
or `{ "pool": "<textGrammar id>" }` for weighted variation.

**Fragments** are pieces other messages are built from — the word `{outcome}`
in an attack line. A module must declare them, because nothing sensible can
stand in for a missing one and the sentence around it would render with a hole.
**Messages** stand alone and carry a default, so you write only what you want
to change. `npm run systemtext -- <module>` writes the whole set into a module.

Placeholders listed here are the ones a message cannot lose; `compileModule`
rejects a module that drops one.

| Key | Tier | Must keep | What it says | Default |
| --- | --- | --- | --- | --- |
| `grammar.and` | fragment | — | Joins the last two items of a list. | `"and"` |
| `grammar.or` | fragment | — | Joins alternatives, as in a gate's unmet requirements. | `"or"` |
| `grammar.list.separator` | fragment | — | Between all but the last two items of a list. | `", "` |
| `grammar.list.pair` | fragment | `{first}` `{last}` `{conjunction}` | A list of exactly two. | `"{first} {conjunction} {last}"` |
| `grammar.list.many` | fragment | `{head}` `{last}` `{conjunction}` | A list of three or more; `head` is already joined. | `"{head} {conjunction} {last}"` |
| `grammar.article.consonant` | fragment | `{noun}` | Indefinite article before a consonant. | `"a {noun}"` |
| `grammar.article.vowel` | fragment | `{noun}` | Indefinite article before a vowel. | `"an {noun}"` |
| `grammar.count` | fragment | `{number}` `{noun}` | A counted noun, as in "three hounds". | `"{number} {noun}"` |
| `grammar.plural` | fragment | `{noun}` | How a counted noun is made plural when the content declares no plural of its own. | `"{noun}s"` |
| `grammar.smallNumbers` | fragment | — | Number words from zero upward, space separated. Counts past the end of this ladder are written as digits. | `"no one two three four five six seven eight nine ten"` |
| `unit.round` | fragment | — | One round of combat, singular. | `"round"` |
| `unit.rounds` | fragment | — | Rounds of combat, plural. | `"rounds"` |
| `direction.north` | fragment | — | Bearing word, interpolated into `{direction}`. | `"north"` |
| `direction.south` | fragment | — | Bearing word. | `"south"` |
| `direction.east` | fragment | — | Bearing word. | `"east"` |
| `direction.west` | fragment | — | Bearing word. | `"west"` |
| `direction.northeast` | fragment | — | Bearing word. | `"northeast"` |
| `direction.northwest` | fragment | — | Bearing word. | `"northwest"` |
| `direction.southeast` | fragment | — | Bearing word. | `"southeast"` |
| `direction.southwest` | fragment | — | Bearing word. | `"southwest"` |
| `direction.here` | fragment | — | Bearing to the tile you are standing on. | `"right here"` |
| `direction.nearby` | fragment | — | Bearing too close or too diagonal to name. | `"nearby"` |
| `roll.line` | fragment | `{total}` `{parts}` | A roll shown as its arithmetic, so a player can learn the system. | `"{total} ({parts}){versus}{swing}"` |
| `roll.versus` | fragment | `{difficulty}` | The number a roll was measured against. | `" vs {difficulty}"` |
| `roll.swing` | fragment | `{swing}` | Advantage or disadvantage on a roll. | `" [{swing}]"` |
| `combat.outcome.critical` | fragment | — | How a critical reads in an attack line. | `"a critical hit"` |
| `combat.outcome.success` | fragment | — | How a success reads in an attack line. | `"a hit"` |
| `combat.outcome.failure` | fragment | — | How a failure reads in an attack line. | `"a miss"` |
| `combat.outcome.fumble` | fragment | — | How a fumble reads in an attack line. | `"a fumble"` |
| `combat.attack.unnamed` | fragment | — | Stands in when an attack names no ability. | `"attacks"` |
| `combat.check.unnamed` | fragment | — | Stands in when a check names neither skill nor attribute. | `"check"` |
| `combat.damaged.resisted` | fragment | `{raw}` | Appended when resistance or vulnerability changed the number. | `" ({raw} before resistance)"` |
| `combat.attacked` | message | `{attacker}` `{target}` `{roll}` `{outcome}` | One attack, with its arithmetic. | `"{attacker} — {ability} on {target}: {roll} — {outcome}."` |
| `combat.checked` | message | `{who}` `{roll}` | A skill or attribute check. | `"{who} — {what}: {roll}."` |
| `combat.saved` | message | `{who}` `{roll}` | A saving throw. | `"{who} — {save} save: {roll}."` |
| `combat.damaged` | message | `{who}` `{amount}` | Damage taken. | `"{who} takes {amount}{type} damage{resisted}."` |
| `combat.healed` | message | `{who}` `{amount}` | A resource restored. | `"{who} recovers {amount}."` |
| `combat.died` | message | `{who}` | A creature dies. | `"{who} falls."` |
| `combat.conditionApplied` | message | `{who}` `{condition}` | A condition takes hold. | `"{who} is {condition}."` |
| `combat.conditionExpired` | message | `{who}` `{condition}` | A condition runs out. | `"{who} is no longer {condition}."` |
| `combat.conditionResisted` | message | `{who}` `{condition}` | A condition is saved against. | `"{who} shrugs off {condition}."` |
| `combat.reacted` | message | `{who}` | A reaction fires. | `"{who} reacts."` |
| `combat.started` | message | `{who}` | A fight starts, listing who is in it. | `"Combat begins — {who}."` |
| `combat.ended.victory` | message | — | The party won. | `"The fight is over."` |
| `combat.ended.fled` | message | — | The party escaped. | `"You are not followed."` |
| `combat.ended.defeat` | message | — | The party lost. | `"The party falls."` |
| `combat.round` | message | `{round}` | A new round begins. | `"— round {round} —"` |
| `combat.turn` | message | `{who}` | Whose turn it is. | `"{who}'s turn."` |
| `move.blocked` | message | `{what}` | Something stopped a step: a wall, or somebody standing there. | `"Blocked by {what}."` |
| `move.blocked.edge` | fragment | — | What stopped a step when it was the end of the map rather than any terrain. | `"the edge of the world"` |
| `item.taken` | message | `{items}` | Picked up. | `"Taken: {items}."` |
| `item.lost` | message | `{items}` | Gone from the party's hands. | `"Lost: {items}."` |
| `item.dropped` | message | `{who}` `{items}` | A body's spoils, named so they get picked up. | `"{who} leaves {items} behind."` |
| `trade.bought` | message | `{items}` `{who}` `{price}` | A purchase. | `"Bought {items} from {who} for {price}."` |
| `trade.sold` | message | `{items}` `{who}` `{price}` | A sale. | `"Sold {items} to {who} for {price}."` |
| `currency.gained` | message | `{amount}` | Coin arriving any way other than a sale. | `"You are {amount} the richer."` |
| `currency.lost` | message | `{amount}` | Coin leaving any way other than a purchase. | `"You are {amount} the poorer."` |
| `trap.sprung` | message | `{who}` `{trap}` | A trap fires. | `"{who} sets off {trap}!"` |
| `trap.disarmed` | message | `{who}` `{trap}` | A trap is made safe. | `"{who} disarms the {trap}."` |
| `discovered.trap` | message | `{what}` | A trap is noticed before it fires. | `"You spot {what}."` |
| `discovered.place` | message | `{what}` | A hidden place is found. | `"You find {what}."` |
| `progress.xp` | message | `{who}` `{amount}` | Experience awarded. | `"{who} gains {amount} experience."` |
| `progress.level` | message | `{who}` `{level}` | A level gained. | `"{who} reaches level {level}."` |
| `gate.opened.bypass` | fragment | — | Appended when a gate was forced rather than opened. | `" — forced"` |
| `gate.opened.ability` | fragment | — | Appended when an ability opened a gate. | `" — by power"` |
| `gate.blocked.missing` | fragment | `{what}` | Appended to a blocked gate, listing what would open it. | `" You would need {what}."` |
| `gate.opened` | message | `{gate}` | A gate gives way. | `"{gate} opens{how}."` |
| `gate.blocked` | message | `{gate}` | A gate holds. | `"{gate} will not open.{missing}"` |
| `requirement.item` | fragment | `{item}` | An item a requirement asks for. | `"the {item}"` |
| `requirement.skill` | fragment | `{skill}` `{rank}` | A skill rank a requirement asks for. | `"{skill} {rank}"` |
| `requirement.quest` | fragment | `{quest}` `{status}` | A quest state a requirement asks for. | `"{quest} {status}"` |
| `requirement.faction` | fragment | `{faction}` | Reputation a requirement asks for. | `"standing with the {faction}"` |
| `requirement.level` | fragment | `{level}` | A level a requirement asks for. | `"level {level}"` |
| `requirement.ability` | fragment | `{ability}` | An ability a requirement asks for. | `"the {ability} ability"` |
| `lore.learned` | message | `{lore}` | The party works something out. Nobody asked them to, so it is a note, not a quest. | `"You note it down: {lore}"` |
| `lore.learned.sourced` | message | `{lore}` `{source}` | The same, when the entry records where it came from. | `"You note it down: {lore} ({source})"` |
| `quest.offered` | message | `{who}` `{quest}` | Somebody offers a job. | `"{who} has work for you: {quest}."` |
| `quest.started` | message | `{quest}` `{description}` | A job taken, with what it asks of you. | `"New quest: {quest} — {description}"` |
| `quest.started.plain` | message | `{quest}` | A job taken that has no description. | `"New quest: {quest}."` |
| `quest.stage` | message | `{stage}` | A quest moves on, when the stage wrote no journal prose. | `"{stage}"` |
| `quest.stage.journal` | message | `{stage}` `{journal}` | A quest moves on, with the stage's own journal line. | `"{stage} — {journal}"` |
| `quest.objective` | message | `{objective}` | One objective done. | `"Objective complete: {objective}"` |
| `quest.completed` | message | `{quest}` | A job finished. | `"Quest complete: {quest}."` |
| `quest.failed` | message | `{quest}` `{reason}` | A job lost. | `"Quest failed: {quest} — {reason}."` |
| `quest.failed.abandoned` | fragment | — | Why a quest was lost: the party walked away from it. | `"abandoned"` |
| `quest.failed.conditions` | fragment | — | Why a quest was lost: its `failWhen` became true. | `"conditions changed"` |
| `quest.failed.timedOut` | fragment | — | Why a quest was lost: its deadline ran out. | `"too much time passed"` |
| `quest.failed.expired` | fragment | — | Why a quest was lost: its time ran out while you were elsewhere. | `"time ran out"` |
| `party.stance` | message | `{stance}` | The party changes how carefully it moves. | `"You move at a {stance}."` |
| `party.following` | message | — | The party closes up. | `"The others fall in behind you."` |
| `party.spread` | message | — | The party stops following. | `"The party spreads out."` |
| `time.dayBroke` | message | `{day}` | A new day. | `"Day {day} breaks."` |
| `reputation.improved` | fragment | — | Which way standing moved. | `"improved"` |
| `reputation.worsened` | fragment | — | Which way standing moved. | `"worsened"` |
| `reputation.changed` | message | `{faction}` `{direction}` `{delta}` | Standing with a faction moved. | `"{faction}: {direction} ({delta})."` |
| `deed.witness` | fragment | — | One witness. | `"witness"` |
| `deed.witnesses` | fragment | — | Several witnesses. | `"witnesses"` |
| `deed.unseen` | message | — | A deed nobody witnessed. | `"Nobody saw that."` |
| `deed.witnessed` | message | `{witnesses}` | A deed that was seen. | `"{witnesses} to that."` |
| `game.victory` | message | — | The game is won. | `"You have won."` |
| `game.defeat` | message | — | The game is lost. | `"Your party is dead."` |
| `sense.nearness.faint` | fragment | — | How a weak or stale impression is introduced. | `"Faintly"` |
| `sense.nearness.close` | fragment | — | How a strong impression is introduced. | `"Close by"` |
| `sense.nearness.far` | fragment | — | How a middling impression is introduced. | `"Somewhere"` |
| `sense.unnamed` | fragment | — | Stands in when a sense declares no name. | `"sense"` |
| `perception.investigating` | message | `{who}` | A creature goes to look at what it noticed. | `"{who} casts about, and starts toward something."` |
| `perception.lostInterest` | message | `{who}` | A creature gives up looking. | `"{who} loses the thread of it."` |
| `sense.empty` | message | — | Using a sense that turns nothing up, when the sense has no name. | `"You stop. Nothing reaches you."` |
| `sense.empty.named` | message | `{sense}` | Using a sense that turns nothing up. Always says something. | `"You stop. Nothing reaches you by {sense}."` |
| `sense.impression` | message | `{nearness}` `{sense}` | Noticing something, when the sense wrote no phrasing of its own. | `"{nearness}, something you can {sense}."` |
| `look.creatures` | message | `{what}` | Who else is here. | `"You see {what}."` |
| `look.creature.plain` | message | `{name}` | Looking at a creature whose statblock wrote no description. | `"{name}, and nothing more to be told from here."` |
| `look.item.plain` | message | `{name}` | Looking at an item that wrote no description. | `"{name}. Nothing remarkable."` |
| `look.place.plain` | message | `{name}` | Looking at a place that wrote no description. | `"{name}, from here."` |
| `look.unseen` | message | `{what}` | Looking at something that is not here. | `"You cannot see {what} from here."` |
| `refused.actor.missing` | message | — | The action named somebody who is not in the game. | `"no such character"` |
| `refused.action.unknown` | message | `{action}` | An action this version does not recognise. | `"\"{action}\" is not something you can do"` |
| `refused.turn.other` | message | `{who}` | Acting out of turn. | `"it is {who}'s turn"` |
| `refused.select.notParty` | message | — | Selecting somebody who is not yours to command. | `"not in the party"` |
| `refused.move.noMap` | message | — | Moving while not on a tactical map. | `"not on a map"` |
| `refused.move.tooFar` | message | — | Moving further than one tile at a time. | `"that is not one step away"` |
| `refused.move.noMovement` | message | — | Out of movement in combat. | `"no movement left this turn"` |
| `refused.travel.noMap` | message | — | Walking with no map underfoot. | `"nowhere to walk"` |
| `refused.travel.noRoute` | message | — | No path to the destination. | `"no way through"` |
| `refused.travel.noRoad` | message | — | No connection between these two areas. | `"there is no road that way"` |
| `refused.travel.noWayUp` | message | — | No route out of a dungeon by that door. | `"there is no way back up"` |
| `refused.travel.notYet` | message | `{missing}` | The way on is gated, and this is what is missing. | `"not yet — {missing}"` |
| `refused.travel.notYet.plain` | message | — | The way on is gated, with nothing to say about why. | `"not yet"` |
| `refused.travel.unknownArea` | message | `{area}` | The module names no such area. | `"no area \"{area}\""` |
| `refused.leave.noExitFound` | message | — | Leaving a dungeon before the exit is known. | `"find the way out first"` |
| `refused.leave.nowhere` | message | — | Leaving with nowhere to go. | `"there is nowhere to go back to"` |
| `refused.enter.noSuchPlace` | message | `{target}` | Entering something that is not here. | `"there is no \"{target}\" here"` |
| `refused.enter.unknownPlace` | message | — | The place exists in no collection. | `"no such place"` |
| `refused.enter.unknownDungeon` | message | `{dungeon}` | The module names no such dungeon. | `"no dungeon \"{dungeon}\""` |
| `refused.attack.noWeapon` | message | `{who}` | Attacking with no ability and no weapon. | `"{who} has nothing to attack with"` |
| `refused.ability.unknown` | message | `{ability}` | The module names no such ability. | `"no ability \"{ability}\""` |
| `refused.ability.notKnown` | message | `{who}` `{ability}` | Using an ability this creature has not got. | `"{who} does not know {ability}"` |
| `refused.ability.prevented` | message | `{who}` | A condition forbids the action type. | `"{who} cannot take that action right now"` |
| `refused.ability.requirements` | message | `{who}` `{ability}` | An ability is gated and the gate is shut. | `"{who} does not meet the requirements for {ability}"` |
| `refused.ability.unavailable` | message | `{ability}` | An ability's own condition says no. | `"{ability} cannot be used now"` |
| `refused.ability.cooldown` | message | `{ability}` `{rounds}` | An ability is still cooling down. | `"{ability} is not ready for another {rounds}"` |
| `refused.ability.noAction` | message | — | Out of actions in combat. | `"no action left this turn"` |
| `refused.cost.shortfall` | message | `{resource}` | An ability costs more than is left. | `"not enough {resource}"` |
| `refused.target.none` | message | — | An ability that needs a target found none. | `"nothing to target"` |
| `refused.target.missing` | message | — | No target was named. | `"no target"` |
| `refused.target.empty` | message | — | The named target is gone. | `"nothing there"` |
| `refused.target.elsewhere` | message | — | The target is on another map. | `"not here"` |
| `refused.target.outOfRange` | message | — | Beyond the ability's reach. | `"out of range"` |
| `refused.target.outOfReach` | message | — | Beyond arm's length. | `"out of reach"` |
| `refused.target.noSight` | message | — | Something solid is in the way. | `"no line of sight"` |
| `refused.target.covered` | message | — | Cover blocks the shot entirely. | `"they are behind full cover"` |
| `refused.flee.noCombat` | message | — | Fleeing outside a fight. | `"nothing to flee from"` |
| `refused.flee.noExit` | message | — | Fleeing with no way out. | `"there is nowhere to run"` |
| `refused.cast.silenced` | message | `{who}` | A verbal component with speech prevented. | `"{who} cannot speak the words"` |
| `refused.cast.bound` | message | `{who}` | A somatic component with gesture prevented. | `"{who} cannot make the signs"` |
| `refused.cast.noComponent` | message | `{who}` `{component}` | A material component the caster is not carrying. | `"{who} has no {component}"` |
| `refused.cast.notRitual` | message | `{spell}` | Casting as a ritual something that is not one. | `"{spell} cannot be cast as a ritual"` |
| `refused.cast.noSlot` | message | `{spell}` | Out of spell slots at that level. | `"no slot left for {spell}"` |
| `refused.item.unknown` | message | `{item}` | The module names no such item. | `"no item \"{item}\""` |
| `refused.item.notCarried` | message | — | Acting on an item nobody holds. | `"you are not carrying that"` |
| `refused.take.nothingHere` | message | — | Nothing within reach to pick up. | `"there is nothing here to take"` |
| `refused.take.noSuchItem` | message | `{item}` | That particular thing is not here. | `"there is no {item} here"` |
| `refused.equip.notWearable` | message | `{item}` | Equipping something with no slot. | `"{item} is not something you wear"` |
| `refused.equip.notAllowed` | message | `{item}` | Equipping something this character may not use. | `"{item} is not for you"` |
| `refused.unequip.notWorn` | message | — | Taking off something not worn. | `"you are not wearing that"` |
| `refused.use.nothingHappens` | message | `{item}` | Using an item that declares no effect. | `"nothing happens with the {item}"` |
| `refused.use.spent` | message | `{item}` | Using an item whose charges are gone. | `"the {item} is spent"` |
| `refused.give.tooFar` | message | — | Handing something over from too far away. | `"they are not close enough"` |
| `refused.search.nothing` | message | — | A search that turned nothing up. | `"you find nothing here"` |
| `refused.disarm.nothingHere` | message | — | Disarming with no trap in reach. | `"there is nothing here to disarm"` |
| `refused.open.noSuchThing` | message | `{target}` | Opening something that is not here. | `"nothing here called \"{target}\""` |
| `refused.open.unknownGate` | message | `{gate}` | The module names no such gate. | `"no gate \"{gate}\""` |
| `refused.sense.unknown` | message | — | Using a sense the module does not declare. | `"nothing here works like that"` |
| `refused.stance.unknown` | message | `{stance}` | Setting a stance the module does not declare. | `"there is no way of moving called \"{stance}\""` |
| `refused.follow.inCombat` | message | — | Setting follow while fighting. | `"in a fight everyone acts on their own initiative"` |
| `refused.rest.notHere` | message | — | This place does not allow that kind of rest. | `"cannot rest like that here"` |
| `refused.rest.inCombat` | message | — | Resting during a fight. | `"not while fighting"` |
| `refused.rest.interrupted` | message | — | A rest broken into. | `"something came looking before you could settle"` |
| `refused.talk.tooFar` | message | — | Talking from across the room. | `"too far away to talk"` |
| `refused.talk.nothingToSay` | message | `{who}` | This character has no dialogue. | `"{who} has nothing to say"` |
| `refused.talk.unknownDialogue` | message | `{dialogue}` | The module names no such dialogue. | `"no dialogue \"{dialogue}\""` |
| `refused.reply.noConversation` | message | — | Replying with no conversation open. | `"nobody is talking"` |
| `refused.reply.unknown` | message | — | Choosing a reply that is not on offer. | `"no such reply"` |
| `refused.reply.locked` | message | — | A reply that is shown but not available, and wrote no hint of its own. | `"you cannot say that"` |
| `refused.buy.noStock` | message | — | This character keeps no shop. | `"they have nothing to sell"` |
| `refused.buy.noSuchItem` | message | — | Not in stock. | `"they do not have that"` |
| `refused.buy.tooExpensive` | message | — | Not enough coin. | `"you cannot afford that"` |
| `refused.sell.notBuying` | message | — | This shop does not buy. | `"they are not buying"` |
| `refused.sell.unwanted` | message | — | This shop will not take that. | `"they have no use for that"` |
| `refused.trade.barred` | message | `{missing}` | The shop is gated, and this is why. | `"they will not deal with you — {missing}"` |
| `refused.trade.barred.plain` | message | — | The shop is gated, with nothing to say about why. | `"they will not deal with you"` |
| `affordance.barred` | message | `{what}` | A way that is shut, and what would open it. | `"barred — needs {what}"` |
| `affordance.needs` | message | `{what}` | A shop that will not deal, and what would change that. | `"needs {what}"` |
| `refused.quest.unknown` | message | `{quest}` | The module names no such quest. | `"no quest \"{quest}\""` |
| `refused.quest.unavailable` | message | `{quest}` | A quest whose requirements are unmet. | `"{quest} is not available yet"` |
| `refused.quest.notTaken` | message | — | Abandoning a quest nobody took. | `"you are not on that job"` |
| `refused.internal.unknownResource` | message | `{resource}` | Content named a resource the ruleset does not declare. | `"no resource \"{resource}\""` |
| `refused.internal.unknownCondition` | message | `{condition}` | Content named a condition the ruleset does not declare. | `"no condition \"{condition}\""` |
| `refused.internal.unknownFaction` | message | `{faction}` | Content named a faction the module does not declare. | `"no faction \"{faction}\""` |
| `refused.internal.unknownOp` | message | `{op}` | An effect this build does not know. | `"this engine does not implement \"{op}\""` |

### Module → `narrative` → `dialogues`

<a id="module-narrative-dialogues"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the dialogue. An NPC names it to own it. |
| `start` | id | **yes** |  | Node the conversation opens on. Must be one of the nodes below. |
| `nodes` | [object](#module-narrative-dialogues-nodes)[] | **yes** |  | The nodes. Navigation between them is by node id inside this dialogue only. |

### Module → `narrative` → `dialogues` → `nodes`

<a id="module-narrative-dialogues-nodes"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the node, unique inside this dialogue. |
| `says` | [object](#module-narrative-textGrammar-variants)[] | **yes** |  | What the speaker says. Weighted phrasings, picked on entering. |
| `onEnter` | [effect](#the-dsl)[] |  | `[]` | Effects run on entering. Where a checked payoff belongs. |
| `remembers` | [→ narrative.deedKinds](#module-narrative-deedKinds) |  |  | Deed kind recorded when this node is reached. |
| `redirectWhen` | [object](#module-narrative-dialogues-nodes-redirectWhen)[] |  | `[]` | Send the player elsewhere before speaking. First match wins. |
| `options` | [object](#module-narrative-dialogues-nodes-options)[] |  | `[]` | Replies offered. A node with none ends the conversation. |

### Module → `narrative` → `dialogues` → `nodes` → `redirectWhen`

<a id="module-narrative-dialogues-nodes-redirectWhen"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `requires` | [object](#module-content-abilities-requires) | **yes** |  | Gate on taking this redirect. |
| `goto` | id | **yes** |  | Node to jump to instead. |

### Module → `narrative` → `dialogues` → `nodes` → `options`

<a id="module-narrative-dialogues-nodes-options"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the option. Also the key under which taking it is remembered. |
| `text` | string | **yes** |  | What the player says. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on the option, measured against what the speaker knows. |
| `when` | [predicate](#the-dsl) |  |  | Predicate checked on top of requires. |
| `showWhenLocked` | boolean |  | `false` | Show it greyed out when gated, rather than hiding it. |
| `lockedHint` | string |  | `""` | What to say about why it is closed. |
| `check` | object |  |  | A roll that decides where the option leads. |
| `effects` | [effect](#the-dsl)[] |  | `[]` | Effects run on choosing it, before and regardless of any check. |
| `onceOnly` | boolean |  | `false` | Whether it may be taken only once, remembered across conversations. |
| `goto` | id |  |  | Node it leads to. Omit to end the conversation. |

### Module → `narrative` → `quests`

<a id="module-narrative-quests"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the quest, used as quests.<id>.status. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What the job is. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `available` | [predicate](#the-dsl) |  |  | Predicate deciding whether it can be offered yet. |
| `autoStart` | boolean |  | `false` | Whether it begins on its own when play starts. |
| `giver` | [→ content.npcs](#module-content-npcs) |  |  | A label. What actually puts the job in front of a player is that NPC's offersQuests. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on taking it. |
| `stages` | [object](#module-narrative-quests-stages)[] |  | `[]` | Ordered chapters, each holding its own objectives. The current one is derived. |
| `objectives` | [object](#module-narrative-quests-objectives)[] |  | `[]` | Objectives held directly on the quest rather than in a stage. |
| `ordered` | boolean |  | `true` | Whether objectives must be finished in order. |
| `onStart` | [effect](#the-dsl)[] |  | `[]` | Effects run when it begins. |
| `onComplete` | [effect](#the-dsl)[] |  | `[]` | Effects run when it is finished. |
| `onFail` | [effect](#the-dsl)[] |  | `[]` | Effects run when it fails. |
| `failWhen` | [predicate](#the-dsl) |  |  | Predicate that fails the quest once it holds. |
| `rewards` | [object](#module-narrative-quests-rewards) |  | `{}` | Experience, items, and standing paid on completion. |
| `unlocks` | [→ narrative.quests](#module-narrative-quests)[] |  | `[]` | Quests marked available when this one finishes. How a chain is wired. |
| `remembersAs` | [→ narrative.deedKinds](#module-narrative-deedKinds) |  |  | Deed kind recorded when it is finished, so people can hear about it. |
| `repeatable` | boolean |  | `false` | Whether it can be taken again after finishing. |
| `timeLimitDays` | number |  |  | Days before it fails on its own. |

### Module → `narrative` → `quests` → `stages`

<a id="module-narrative-quests-stages"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the stage. |
| `name` | string |  |  | Display name. |
| `description` | string |  | `""` | What this chapter is. |
| `objectives` | [object](#module-narrative-quests-objectives)[] |  | `[]` | What must be done to move past it. |
| `onStart` | [effect](#the-dsl)[] |  | `[]` | Effects run when the stage becomes current. |
| `onComplete` | [effect](#the-dsl)[] |  | `[]` | Effects run when the stage is finished. |
| `journalKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool for the journal entry while this stage is current. |

### Module → `narrative` → `quests` → `objectives`

<a id="module-narrative-quests-objectives"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the objective, used as quests.<quest>.objectives.<id>. |
| `description` | string |  | `""` | What to do, as the journal puts it. |
| `kind` | `custom` \| `kill` \| `collect` \| `reach` \| `talk` |  | `"custom"` | What kind of event finishes it. Custom watches your own predicate. |
| `target` | id |  |  | What to kill, collect, reach, or talk to. A bare id, not a checked reference. |
| `count` | number |  | `1` | How many times it must happen. |
| `when` | [predicate](#the-dsl) |  |  | Required for custom. On other kinds, an extra gate the event must also pass. |
| `requires` | [object](#module-content-abilities-requires) |  |  | Gate on the objective accepting progress at all. |
| `hidden` | boolean |  | `false` | Whether it is kept out of the journal until finished. |
| `optional` | boolean |  | `false` | Whether the quest can finish without it. |
| `onComplete` | [effect](#the-dsl)[] |  | `[]` | Effects run when it is finished. |

### Module → `narrative` → `quests` → `rewards`

<a id="module-narrative-quests-rewards"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `xp` | [expression](#the-dsl) |  | `0` | Experience paid, as an expression. Awarded to the whole party. |
| `items` | [object](#module-narrative-quests-rewards-items)[] |  | `[]` | Items handed over. |
| `reputation` | { [→ content.factions](#module-content-factions): [expression](#the-dsl) } |  | `{}` | Standing change per faction, each as an expression. |

### Module → `narrative` → `quests` → `rewards` → `items`

<a id="module-narrative-quests-rewards-items"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `item` | [→ content.items](#module-content-items) | **yes** |  | Which item. |
| `quantity` | [expression](#the-dsl) |  | `1` | How many, as an expression. |

### Module → `narrative` → `arcs`

<a id="module-narrative-arcs"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the arc, read as arcs.<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What this story is. |
| `quests` | [→ narrative.quests](#module-narrative-quests)[] | **yes** |  | The quests it is made of. At least one is required. |
| `isEnding` | boolean |  | `false` | Finishing it ends the run, unless start.postVictory says continue. |

### Module → `narrative` → `lore`

<a id="module-narrative-lore"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the entry, read as lore.<id>. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What is known. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `textKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool for how it reads when learned. |
| `source` | string |  | `""` | Where it came from, for the journal. |

### Module → `narrative` → `loreThreads`

<a id="module-narrative-loreThreads"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the thread, read as threads.<id>.known. |
| `name` | string | **yes** |  | Display name. |
| `description` | string |  | `""` | What the mystery is. |
| `entries` | [→ narrative.lore](#module-narrative-lore)[] | **yes** |  | The lore that makes it up. At least one is required. |

### Module → `narrative` → `deedKinds`

<a id="module-narrative-deedKinds"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the deed kind, read as memory.<who>.<id>. |
| `name` | string | **yes** |  | Display name. |
| `tags` | id[] |  | `[]` | Free labels for grouping and gating. |
| `severity` | number |  | `0` | How bad it is. Gossip below the minimum severity never travels. |
| `faction` | [→ content.factions](#module-content-factions) |  |  | Who takes it personally. Without one, derived from the victim. |
| `memorability` | number |  | `1` | How strongly it lodges. Multiplies against the forgetting curve. |
| `distortion` | number |  | `0.2` | How much the story changes as it is retold, 0 to 1. |

### Module → `narrative` → `memory`

<a id="module-narrative-memory"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `mode` | `simulated` \| `manual` \| `hybrid` |  | `"hybrid"` | Whether the engine drives memory, your content drives it, or both. |
| `forgetting` | [object](#module-narrative-memory-forgetting) |  | `{}` | How a memory fades. |
| `gossip` | [object](#module-narrative-memory-gossip) |  | `{}` | How news travels between people. |
| `witness` | [object](#module-narrative-memory-witness) |  | `{}` | Who sees a deed and whether they can name who did it. |
| `learning` | [object](#module-narrative-memory-learning) |  | `{}` | Whether creatures adapt to how the party fights. |
| `rules` | [object](#module-narrative-memory-rules)[] |  | `[]` | Per deed kind overrides and hand placed knowledge. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on the memory model. |

### Module → `narrative` → `memory` → `forgetting`

<a id="module-narrative-memory-forgetting"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `curve` | `none` \| `linear` \| `exponential` \| `threshold` |  | `"exponential"` | Shape of the fade. None keeps a memory forever. |
| `halfLifeDays` | number |  | `30` | Days for a memory to lose half its strength. |
| `floor` | number |  | `0.05` | Strength it never fades below, 0 to 1. |
| `reinforceOnRecall` | number |  | `0.25` | Strength returned each time the memory comes up. |
| `memorabilityWeight` | number |  | `1` | How much a deed kind's memorability slows the fade. |
| `caresAboutMultiplier` | number |  | `2` | How much slower it fades for someone who cares about it. |
| `linearSpanMultiplier` | number |  | `2` | Half lives a linear curve takes to reach nothing. |
| `neverForget` | [→ narrative.deedKinds](#module-narrative-deedKinds)[] |  | `[]` | Deed kinds that never fade at all. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on forgetting. |

### Module → `narrative` → `memory` → `gossip`

<a id="module-narrative-memory-gossip"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `enabled` | boolean |  | `true` | Whether news travels at all. |
| `spreadPerDay` | number |  | `0.25` | Chance per day that a knower tells someone, 0 to 1. |
| `maxHops` | number |  | `4` | How far from the witness a story can travel. |
| `hopRetention` | number |  | `0.75` | Strength kept per hop, 0 to 1. |
| `distortionPerHop` | number |  | `0.15` | How much the story changes per hop, 0 to 1. |
| `requiresTravel` | boolean |  | `true` | Whether news needs someone to actually go there. |
| `crossFactionRate` | number |  | `0.4` | How readily it crosses between factions, 0 to 1. |
| `minimumSeverity` | number |  | `1` | Deeds below this are not worth repeating. |
| `gullibilityScale` | number |  | `2` | How much a listener's gullibility decides whether they believe it. |
| `garbledRetention` | number |  | `0.5` | Strength kept once a story has become distorted, 0 to 1. |
| `spreadsWithoutWitness` | boolean |  | `false` | Whether a deed nobody saw can still become a rumour. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on gossip. |

### Module → `narrative` → `memory` → `witness`

<a id="module-narrative-memory-witness"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `radius` | number |  | `0` | Tiles within which a deed is seen. 0 uses the perception model instead. |
| `requiresLineOfSight` | boolean |  | `true` | Whether a witness must be able to see it. |
| `deadMenTellNoTales` | boolean |  | `true` | Whether killing the witnesses stops the news. |
| `identificationChance` | number |  | `0.8` | Chance a witness can name who did it, 0 to 1. |
| `disguiseReduction` | number |  | `0.5` | How much a concealing condition cuts that chance, 0 to 1. |
| `factionAlwaysLearns` | boolean |  | `false` | Whether the victim's faction hears regardless of witnesses. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on witnessing. |

### Module → `narrative` → `memory` → `learning`

<a id="module-narrative-memory-learning"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `enabled` | boolean |  | `true` | Whether creatures adapt to the party at all. |
| `encountersBeforeAdapting` | number |  | `3` | Fights needed before anything changes. |
| `adaptationStrength` | number |  | `0.5` | How far behaviour shifts once it does, 0 to 1. |
| `sharedWithinFaction` | boolean |  | `true` | Whether what one learns the rest know. |
| `minimumIntellect` | number |  |  | Attribute value below which a creature cannot learn. |
| `tracks` | `damageTypes` \| `abilities` \| `tactics` \| `partyComposition`[] |  | `["damageTypes","abilities"]` | What is noticed about the party. |
| `forgetAfterDays` | number |  | `90` | Days before what was learned is lost. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on learning. |

### Module → `narrative` → `memory` → `rules`

<a id="module-narrative-memory-rules"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `id` | id | **yes** |  | Id of the rule. |
| `name` | string |  |  | Display name. |
| `description` | string |  | `""` | What this rule is for. |
| `deedKinds` | [→ narrative.deedKinds](#module-narrative-deedKinds)[] |  | `[]` | Deed kinds it applies to. Empty means all of them. |
| `when` | [predicate](#the-dsl) |  |  | Predicate gating the rule. |
| `alwaysKnownBy` | [→ content.npcs](#module-content-npcs)[] |  | `[]` | People who know regardless of witnesses or gossip. |
| `neverKnownBy` | [→ content.npcs](#module-content-npcs)[] |  | `[]` | People who never find out. |
| `spreadPerDay` | number |  |  | Gossip rate for these deeds, overriding the global one. |
| `halfLifeDays` | number |  |  | Forgetting half life for these deeds, overriding the global one. |
| `distortionPerHop` | number |  |  | Distortion for these deeds, overriding the global one. |
| `manualOnly` | boolean |  | `false` | Whether the simulation leaves these deeds entirely to your content. |
| `extra` | { string: any } |  | `{}` | Open bag of your own data on this rule. |

## Start

### Module → `start`

<a id="module-start"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `partySize` | number |  | `4` | How many characters the player makes and runs. |
| `creation` | [object](#module-start-creation) |  | `{}` | How those characters are built. |
| `startingArea` | [→ world.areas](#module-world-areas) |  |  | Used only if no starting point of interest or dungeon is set. |
| `startingPoi` | [→ world.pointsOfInterest](#module-world-pointsOfInterest) |  |  | Place play begins at. Beats startingArea. |
| `startingDungeon` | [→ world.dungeons](#module-world-dungeons) |  |  | Dungeon play begins in. Beats both of the above. |
| `openingTextKey` | [→ narrative.textGrammar](#module-narrative-textGrammar) |  |  | Text pool read before anything else. |
| `partyFollow` | [object](#module-start-partyFollow) |  | `{}` | How characters you are not steering keep up with you. |
| `initialFlags` | { string: string \| number \| boolean } |  | `{}` | World flags set before play begins. |
| `victoryWhen` | [predicate](#the-dsl) |  |  | Predicate that ends the run in victory once it holds. |
| `defeatWhen` | [predicate](#the-dsl) |  |  | Predicate that ends the run in defeat once it holds. A dead party is always defeat. |
| `postVictory` | `end` \| `continue` |  |  | Whether reaching an ending stops play or lets it carry on. |

### Module → `start` → `creation`

<a id="module-start-creation"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `attributePoints` | number |  | `27` | Points available to spend on attributes. |
| `attributeCosts` | { string: number } |  | `{}` | Cost to reach each attribute value, keyed by the value. |
| `startingLevel` | number |  | `1` | Level characters begin at. |
| `skillRanks` | number |  | `4` | Skill ranks available to spend. |
| `allowedAncestries` | [→ content.ancestries](#module-content-ancestries)[] |  | `[]` | Ancestries offered. Empty offers all of them. |
| `allowedClasses` | [→ content.classes](#module-content-classes)[] |  | `[]` | Classes offered. Empty offers all of them. |
| `startingItems` | [object](#module-start-creation-startingItems)[] |  | `[]` | Gear every character begins with, on top of their class kit. |
| `startingCurrency` | number |  | `0` | Money the party begins with. |

### Module → `start` → `creation` → `startingItems`

<a id="module-start-creation-startingItems"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `item` | [→ content.items](#module-content-items) | **yes** |  | Which item. |
| `quantity` | number |  | `1` | How many. |

### Module → `start` → `partyFollow`

<a id="module-start-partyFollow"></a>

| Field | Type | Required | Default | What it does |
| --- | --- | --- | --- | --- |
| `catchUpDistance` | number |  | `3` | Tiles behind before a follower hurries. |
| `catchUpSteps` | number |  | `2` | Extra steps a hurrying follower takes. |

## The DSL

Behaviour is written as JSON. One evaluator serves ability effects, item procs,
trap triggers, dialogue gates, loot rules, and quest objectives.

**Expression operators** — `ref`, `add`, `sub`, `mul`, `div`, `mod`, `neg`, `min`, `max`, `floor`, `ceil`, `round`, `abs`, `clamp`, `roll`, `cond`, `concat`, `length`, `list`

**Predicate operators** — `all`, `any`, `not`, `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `chance`, `exists`, `test`

**Effect operators** — `damage`, `heal`, `applyCondition`, `removeCondition`, `adjustResource`, `setFlag`, `learnLore`, `grantItem`, `removeItem`, `adjustReputation`, `setDisposition`, `adjustCurrency`, `move`, `emit`, `noise`, `if`, `repeat`, `forEach`, `let`

Reads go through one mechanism: `{ "ref": "actor.attr.might" }` walks the scope
the engine supplies. There is deliberately no `hasFlag` or `hasItem` operator,
because those are ordinary paths — `flags.met_vess`, `actor.inventory.rope`.

One of each, shaped the way the editor expects them:

```jsonc
// expression — a number: the actor's level plus two
{ "add": [ { "ref": "actor.level" }, 2 ] }

// predicate — a yes or no: might of at least 14
{ "gte": [ { "ref": "actor.attr.might" }, 14 ] }

// effects — a list of things that happen: 1d6 damage to the target
[ { "damage": { "target": { "ref": "target.id" }, "amount": { "roll": "1d6" } } } ]

// rule — a predicate and the effects it gates, used by traits and procs
{ "when": { "test": { "ref": "flags.moonlit" } },
  "then": [ { "applyCondition": { "target": { "ref": "actor.id" },
                                  "condition": "emboldened" } } ] }
```

### Dice notation

<a id="dice-notation"></a>

`1d20` · `2d6+3` · `4d6kh3` (keep highest 3) · `2d20kh1` (advantage) ·
`2d20kl1` (disadvantage) · `1d8+1d4-1`. Notation is validated at load, so a typo
is a load error rather than an exception thrown mid-combat.

## Collections

Every addressable collection, each entry identified by its `id`:

- [`rules.attributes`](#module-rules-attributes)
- [`rules.resources`](#module-rules-resources)
- [`rules.derivedStats`](#module-rules-derivedStats)
- [`rules.damageTypes`](#module-rules-damageTypes)
- [`rules.conditions`](#module-rules-conditions)
- [`rules.actionTypes`](#module-rules-actionTypes)
- [`rules.equipmentSlots`](#module-rules-equipmentSlots)
- [`rules.itemProperties`](#module-rules-itemProperties)
- [`rules.masteryTiers`](#module-rules-masteryTiers)
- [`rules.rests`](#module-rules-rests)
- [`rules.savingThrows`](#module-rules-savingThrows)
- [`rules.sizes`](#module-rules-sizes)
- [`rules.creatureTypes`](#module-rules-creatureTypes)
- [`rules.senses`](#module-rules-senses)
- [`rules.stances`](#module-rules-stances)
- [`rules.movementModes`](#module-rules-movementModes)
- [`rules.languages`](#module-rules-languages)
- [`rules.alignments`](#module-rules-alignments)
- [`rules.opportunities`](#module-rules-opportunities)
- [`rules.coverTypes`](#module-rules-coverTypes)
- [`content.abilities`](#module-content-abilities)
- [`content.skills`](#module-content-skills)
- [`content.ancestries`](#module-content-ancestries)
- [`content.classes`](#module-content-classes)
- [`content.items`](#module-content-items)
- [`content.lootTables`](#module-content-lootTables)
- [`content.monsters`](#module-content-monsters)
- [`content.traps`](#module-content-traps)
- [`content.factions`](#module-content-factions)
- [`content.npcs`](#module-content-npcs)
- [`world.terrains`](#module-world-terrains)
- [`world.palettes`](#module-world-palettes)
- [`world.biomes`](#module-world-biomes)
- [`world.areas`](#module-world-areas)
- [`world.pointsOfInterest`](#module-world-pointsOfInterest)
- [`world.gates`](#module-world-gates)
- [`world.roomTemplates`](#module-world-roomTemplates)
- [`world.encounterTables`](#module-world-encounterTables)
- [`world.dungeons`](#module-world-dungeons)
- [`world.maps`](#module-world-maps)
- [`narrative.textGrammar`](#module-narrative-textGrammar)
- [`narrative.dialogues`](#module-narrative-dialogues)
- [`narrative.quests`](#module-narrative-quests)
- [`narrative.arcs`](#module-narrative-arcs)
- [`narrative.lore`](#module-narrative-lore)
- [`narrative.loreThreads`](#module-narrative-loreThreads)
- [`narrative.deedKinds`](#module-narrative-deedKinds)

