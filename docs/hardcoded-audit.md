# Hardcoded & Opinionated Values in the Engine

An audit of every constant, threshold, string, and behavioural assumption that
lives in engine code rather than in the GM's module JSON.

> **Status: addressed, 2026-08-15.** Every P0 and P1 finding, and the whole of
> the P2 table, has been moved into module JSON. P3 stays hardcoded by
> decision. What each finding became is recorded inline below; the section at
> the end, *[What was done](#what-was-done)*, has the summary and the two
> mechanisms the work introduced.

**Scope:** `../packages/engine/src` primarily, with `../packages/module/src` (schema),
`../packages/play/src`, and the front ends noted where relevant. Version audited:
working tree at `ec3e9db` + uncommitted changes, 2026-08-15.

**Context:** this codebase already holds itself to "nothing is hardcoded" — see
the header of `../packages/module/src/schema/rules.ts`. The findings below are the
places where that promise is not yet kept, plus the places where an engine
default is defensible but should be a *conscious* decision rather than an
accident.

---

## How to read this

Each finding carries a priority:

| Tier | Meaning |
| --- | --- |
| **P0** | Changes play, a GM would reasonably want to change it, and there is **no way to** today. Should become module JSON. |
| **P1** | Should be module JSON, but the impact is narrower or a workaround exists. |
| **P2** | Reasonable engine default, but the *fallback* is invented rather than declared — promote to a schema default so authors can see it. |
| **P3** | Genuine engine invariant (determinism, safety, geometry). Leave hardcoded; listed so the decision is on record. |

A separate axis: **inert** means the schema already declares the field and the
engine never reads it. `apps/editor/lib/inertFields.ts` is the existing curated
registry for these, with a drift test (`inertFields.test.ts`). Anything I found
inert that is *not* in that registry is flagged as a registry gap.

---

## Executive summary

The tactical layer (`rules.*`) is genuinely data-driven — dice, criticals,
attributes, resources, conditions, saves, spellcasting, action economy, sizes,
senses, stances, and cover are all read from the module. The gaps cluster in
four places:

1. **Player-facing prose.** 73 refusal strings and roughly 60 narration
   templates are hardcoded English inside the engine, despite
   `narrative.textGrammar` existing precisely for this. This is the single
   largest hardcoded surface and the one most visible to a player. (P0)
2. **The social simulation's magic numbers.** Gossip, deed memory, and witness
   identification apply undeclared multipliers (`gullibility × 2`,
   `caresAbout ⇒ ×2`, `garbled ⇒ ×0.5`) on top of the declared config. (P0/P1)
3. **Encounter, loot, and trap density fallbacks.** `0.3 / 0.25 / 0.1` per room,
   `danger × 0.15` capped at `0.75` for areas — invented in code, not schema
   defaults. (P0)
4. **Character-creation and progression D&D-isms.** Skill proficiency = rank 1,
   `'walk'` as the assumed default movement mode, hit-die-per-level as the only
   HP progression, half damage on a successful save. (P0/P1)

The most defensible large decisions — Chebyshev distance, Bresenham lines,
save-based determinism, the tick order inside `tickConditions` — are correctly
hardcoded and well documented in place.

---

## P0 — Should move to module JSON

### 1. All player-facing refusal and narration text

**Where:** 73 `type: 'refused'` sites and the whole of `narrate/narrate.ts`.

| File | Refusals |
| --- | --- |
| [reduce.ts](../packages/engine/src/reduce.ts) | 32 |
| [sim/items.ts](../packages/engine/src/sim/items.ts) | 14 |
| [sim/trade.ts](../packages/engine/src/sim/trade.ts) | 7 |
| [sim/dialogue.ts](../packages/engine/src/sim/dialogue.ts) | 5 |
| [rules/apply.ts](../packages/engine/src/rules/apply.ts) | 5 |
| others | 10 |

Examples, verbatim from the engine:

- `'you find nothing here'` — [reduce.ts:434](../packages/engine/src/reduce.ts#L434)
- `'in a fight everyone acts on their own initiative'` — [reduce.ts:379](../packages/engine/src/reduce.ts#L379)
- `'find the way out first'` — [reduce.ts:598](../packages/engine/src/reduce.ts#L598)
- `'they will not deal with you'` — [sim/trade.ts:190](../packages/engine/src/sim/trade.ts#L190)
- `'you are not on that job'` — [sim/quests.ts:213](../packages/engine/src/sim/quests.ts#L213)
- `` `${actor.name} cannot speak the words` `` — [rules/casting.ts:193](../packages/engine/src/rules/casting.ts#L193)

And narration templates in [narrate/narrate.ts](../packages/engine/src/narrate/narrate.ts):

- `OUTCOME_WORD = { critical: 'a critical hit', success: 'a hit', failure: 'a miss', fumble: 'a fumble' }` — [narrate.ts:81-86](../packages/engine/src/narrate/narrate.ts#L81-L86)
- `` `${name} falls.` `` for death — [narrate.ts:213](../packages/engine/src/narrate/narrate.ts#L213)
- `` `${name} takes ${n} damage (${raw} before resistance).` `` — [narrate.ts:200-206](../packages/engine/src/narrate/narrate.ts#L200-L206)
- `'The others fall in behind you.'` / `'The party spreads out.'` — [narrate.ts:141-145](../packages/engine/src/narrate/narrate.ts#L141-L145)
- `` `${who} casts about, and starts toward something.` `` — [narrate.ts:119](../packages/engine/src/narrate/narrate.ts#L119)
- `` `Faintly, something you can ${sense}.` `` — [narrate.ts:744-746](../packages/engine/src/narrate/narrate.ts#L744-L746)

**Why it matters:** the engine has a whole templating system —
`narrative.textGrammar` with weighted variants, predicates, scene-seeded
expansion, and `{placeholder}` interpolation — and none of the engine's own
output goes through it. A module set in space still says "a critical hit" and
"the party spreads out". A non-English module is impossible.

**Proposal:** add a `narrative.systemText` block: a record from a stable engine
message key (`refused.search.nothing`, `combat.outcome.critical`,
`combat.died`, …) to a `textGrammar` pool id, with the current English as the
built-in fallback when the module declares none. The engine already emits
structured events with all the data; only the rendering is hardcoded. Publish
the key list from `../packages/module/src/bin/emit-docs.ts` so authors can
enumerate what is overridable.

---

### 2. Half damage on a successful saving throw is hardcoded at 0.5

**Where:** [rules/combat/attack.ts:381](../packages/engine/src/rules/combat/attack.ts#L381)

```ts
case 'half':
  applyOps(txn, scaleDamage(ops, 0.5), actor.id);
```

**Why it matters:** `rules.resolution.criticalDamageMultiplier` is data — a GM
can make a crit ×3. Its mirror image, the save-for-half multiplier, is not.
A system where a successful save takes a quarter, or two-thirds, cannot be
expressed. Note the asymmetry is visible three lines apart in the same file:
criticals call `criticalMultiplier(module)`, saves use a literal.

**Proposal:** `rules.resolution.saveSuccessMultiplier: number = 0.5`.
Optionally per-ability via `savingThrow.multiplier` for finer control.

---

### 3. Opposed-check difficulty baseline of 10

**Where:** [rules/combat/turn.ts:531](../packages/engine/src/rules/combat/turn.ts#L531)

```ts
difficulty: 10 + skillModifier(txn.module, subject, reaction.roll.opposedBy),
```

**Why it matters:** this is D&D's passive-score convention (`10 + modifier`)
baked into the reaction system. A module with `1d20` but a different passive
baseline, or a `3d6` module where 10 is the *mean* rather than a floor, gets a
silently wrong number. `rules.resolution` already owns every other resolution
constant.

**Proposal:** `rules.resolution.passiveBase: number = 10`. Note
`opposedCheck()` in [check.ts:147-160](../packages/engine/src/rules/check.ts#L147-L160)
does a real contested roll instead, so the two paths disagree about what
"opposed" means — worth reconciling in the same change.

---

### 4. Room encounter / loot / trap density fallbacks

**Where:** [world/populate.ts:356,375,388](../packages/engine/src/world/populate.ts#L356-L388)

```ts
roomRng.chance(template?.encounterChance ?? 0.3)
roomRng.chance(template?.lootChance    ?? 0.25)
roomRng.chance(template?.trapChance    ?? 0.1)
```

**Why it matters:** these govern how dangerous and how rewarding every
generated dungeon is, and they only apply when a room has no template — which
is exactly the case for a module that hasn't authored templates yet, i.e. the
new-author case. The numbers are invented in the engine, not declared in
`world.roomTemplates`' schema defaults, so an author reading the schema cannot
discover them.

**Proposal:** move to `world.dungeons[].defaults` (or module-level
`world.generationDefaults`) as declared, documented fields. At minimum, promote
them to `roomTemplateSchema` defaults so the schema is the single source.

---

### 5. Area wandering-encounter odds: `min(0.75, danger × 0.15)`

**Where:** [sim/enter.ts:715](../packages/engine/src/sim/enter.ts#L715)

```ts
Math.min(0.75, danger * 0.15),
```

**Why it matters:** `world.areas[].dangerLevel` is data, but the curve from
danger to probability, and the ceiling, are not. A GM who sets
`dangerLevel: 5` cannot know they have asked for a 75% encounter chance, and
cannot express "danger 5 means near-certain ambush" at all. The comment in
place ("a place you can never cross in peace is a wall, not a wilderness")
argues for the ceiling — that argument belongs to the GM, not the engine.

**Proposal:** `world.time`-adjacent block or per-area:
`encounterChancePerDanger: number = 0.15`, `maxEncounterChance: number = 0.75`,
or better, let the area declare `encounterChance` as an `ExprSchema` over
`dangerLevel` so the curve itself is authorable.

---

### 6. `'walk'` is the assumed default movement mode

**Where:** [character.ts:76](../packages/engine/src/character.ts#L76)

```ts
return available.includes('walk') ? ['walk'] : available.slice(0, 1);
```

**Why it matters:** the engine names a game concept. A module whose modes are
`glide` / `phase` / `burrow` silently gets whichever happens to be declared
first — an ordering dependency masquerading as a default. This is the same
class of bug `rules.defaultSize` and `perception.defaultStance` were added to
fix; movement modes were missed.

**Proposal:** `rules.defaultMovementMode: ref('rules.movementModes')`, matching
the existing `defaultSize` / `defaultStance` pattern. Same issue at
[world/mapgen.ts:329](../packages/engine/src/world/mapgen.ts#L329) —
`const WALK = ['walk']` used for the connectivity check.

---

### 7. Class skill proficiency grants exactly rank 1

**Where:** [character.ts:223](../packages/engine/src/character.ts#L223)

```ts
for (const skillId of characterClass.skillProficiencies) skills[skillId] = 1;
```

**Why it matters:** `content.classes[].skillProficiencies` is a bare id list, so
"trained" always means "+1". Ancestry bonuses add on top with real values
(`ancestry.skillBonuses`), so the two sources of skill are asymmetric. A module
with a 0–5 rank ladder and `rules.masteryTiers` cannot say a class starts at
journeyman. Note `start.creation.skillRanks` exists in the schema and is only
consulted by `../packages/play/src/creation.ts`, not by `createCharacter`.

**Proposal:** make `skillProficiencies` accept `{ skill, rank }` (with a bare
id defaulting to rank 1 for compatibility), or add
`rules.progression.proficiencyRank: number = 1`.

---

### 8. Level-up HP is hit-die-per-level, with no alternative

**Where:** [character.ts:243-247](../packages/engine/src/character.ts#L243-L247),
[character.ts:294](../packages/engine/src/character.ts#L294)

```ts
for (let l = 2; l <= level; l++) bonusVitality += roll(characterClass.hitDie, rng).total;
…
resources[resourceId] = resourceId === vital ? value + bonusVitality : value;
```

**Why it matters:** this is the D&D HP model hardcoded into the one place a
character is built. `rules.resources[].max` is a full DSL expression that
already sees `actor.level` — so a module *can* express level-scaled HP there —
but this path adds a second, rolled, un-modelled contribution on top of it that
only applies to `vitalResource` and only at creation. Consequences:

- No "take the average" option (the common table variant).
- No constitution-modifier-per-level (the actual D&D rule) — only the raw die.
- `rules.sizes[].hitDie` exists in the schema and is **inert**; the class die
  always wins.
- A module with no `hitDie` on its class gets a throw or a zero depending on
  `roll()`'s behaviour.

**Proposal:** replace with a declared
`rules.progression.perLevelGrants: Effect[]` (the `levels[].grants` mechanism
already exists and is run by `applyLevel`) and delete the special case — or, if
retained, add `rules.progression.hitDiePolicy: 'roll' | 'average' | 'max'`.

---

### 9. NPC disposition threshold at zero, and the three-value disposition enum

**Where:** [character.ts:388](../packages/engine/src/character.ts#L388)

```ts
disposition: npc.disposition >= 0 ? 'neutral' : 'hostile',
```

**Why it matters:** `content.npcs[].disposition` is a signed number, and the
engine picks the cut at exactly 0 and offers only two of three buckets — an NPC
can never spawn as `ally` however positive their disposition. Separately, the
`'ally' | 'neutral' | 'hostile'` vocabulary itself is an engine enum
(`state.ts`), consulted by `isHostileTo()` in
[targeting.ts:95-98](../packages/engine/src/rules/combat/targeting.ts#L95-L98),
so factions cannot define their own stance ladder.

**Proposal (short):** `content.npcs[].dispositionThresholds` or a module-level
`rules.dispositionBands: [{ id, atLeast }]`.
**Proposal (long):** derive hostility from `content.factions[].relations` plus
`state.reputation` rather than a per-entity enum, and keep the enum as a
computed view.

---

### 10. Gossip's undeclared multipliers

Three multipliers modify the declared `narrative.memory` config without being
declared anywhere:

| Multiplier | Where | Effect |
| --- | --- | --- |
| `listener.gullibility * 2` | [gossip.ts:170](../packages/engine/src/sim/gossip.ts#L170) | Makes `gullibility: 0.5` the neutral point. Undocumented; an author reading `gullibility` as 0–1 will halve every spread rate by accident. |
| `caresAbout ⇒ ×2` half-life | [gossip.ts:279](../packages/engine/src/sim/gossip.ts#L279) | Doubling is invented; `memorabilityWeight` is the declared knob and this bypasses it. |
| garbled ⇒ `strength × 0.5` | [gossip.ts:194](../packages/engine/src/sim/gossip.ts#L194) | `distortionPerHop` decides *whether*; the engine decides *how much*. |

Plus the linear forgetting curve's shape:
[gossip.ts:95](../packages/engine/src/sim/gossip.ts#L95) reads
`1 - days / (halfLife * 2)`, i.e. "half-life" for a linear curve means
something different from the exponential curve's half-life. Defensible, but
it should be stated in the schema doc.

And `npc.gullibility ?? 0.5` at [gossip.ts:104](../packages/engine/src/sim/gossip.ts#L104)
duplicates a default that should live in `content.npcs`' schema.

**Proposal:** `narrative.memory.gossip.gullibilityScale: number = 2`,
`narrative.memory.forgetting.caresAboutMultiplier: number = 2`,
`narrative.memory.gossip.garbledRetention: number = 0.5`.

---

### 11. Witness fallback radius of 12 tiles

**Where:** [sim/deeds.ts:93](../packages/engine/src/sim/deeds.ts#L93)

```ts
const radius = radiusOverride ?? Math.max(config.radius, 12);
```

**Why it matters:** fires when `requiresLineOfSight: false`. A GM who turns off
line of sight *and* leaves `radius` at its schema default of 0 (meaning "same
location") silently gets a 12-tile radius instead of "everyone present". 12 is
the legacy sight constant from before senses were declarable — it has no
meaning in a module that never had it.

**Proposal:** honour `radius: 0` as "same map" and drop the floor, or declare
`narrative.memory.witness.presenceRadius: number = 12`.

---

### 12. The `'disguised'` condition tag is an engine-known word

**Where:** [sim/deeds.ts:120](../packages/engine/src/sim/deeds.ts#L120)

```ts
if (condition?.tags?.includes('disguised')) return true;
```

**Why it matters:** the file's own comment claims "the engine still knows
nothing about hoods" — but it knows the string `disguised`. A module using
`hooded`, `veiled`, or `enmascarado` gets no disguise reduction and no error.

**Proposal:** `narrative.memory.witness.disguiseTag: string = 'disguised'`, or
better, a `rules.conditions[].concealsIdentity: boolean` flag so the
relationship is typed rather than stringly.

---

### 13. Spell components map to the action-type ids `'speak'` and `'gesture'`

**Where:** [rules/casting.ts:192-196](../packages/engine/src/rules/casting.ts#L192-L196)

```ts
if (component === 'verbal'  && preventsAction(txn, actor, 'speak'))   …
if (component === 'somatic' && preventsAction(txn, actor, 'gesture')) …
```

**Why it matters:** a module must name two action types exactly `speak` and
`gesture` for silence and manacles to work. Nothing validates this;
`../packages/module/src/diagnostics/lint.ts` will not warn. A module using
`vocalize` / `somatic` gets components that can never be blocked — silently.

**Proposal:** `rules.spellcasting.componentActionTypes: { verbal?: ref, somatic?: ref }`.
This is a lint-rule candidate too, since the failure is invisible in play.

---

## P1 — Should be JSON, narrower impact

### 14. Trap search radius of 2 tiles

[sim/traps.ts:43](../packages/engine/src/sim/traps.ts#L43) — `const SEARCH_RADIUS = 2`.
Disarm reach is separately hardcoded at `<= 1`
([traps.ts:139](../packages/engine/src/sim/traps.ts#L139)). Both govern how a
dungeon crawl feels; neither is declarable. **Proposal:**
`rules.search: { trapRadius: 2, disarmReach: 1 }`.

### 15. Fixed time costs for actions

[reduce.ts](../packages/engine/src/reduce.ts): `search` costs 10 minutes (L423),
`disarm` costs 10 (L445), `sense` costs 1 (L357), `wait` defaults to 10 (L163).
`world.time.minutesPerTile` and `rests[].duration` are data, so time *is*
modelled as a GM decision everywhere else. **Proposal:**
`world.time.actionMinutes: Record<ActionType, number>`.

### 16. Talk range of 2, take/give range of 1

[sim/dialogue.ts:301-309](../packages/engine/src/sim/dialogue.ts#L301-L309) —
Chebyshev `<= 2`. [sim/items.ts:58,354](../packages/engine/src/sim/items.ts#L58) —
`> 1`. Reach is otherwise derived from `rules.sizes[].reach`; these three are
not. **Proposal:** `rules.interactionRange: { talk: 2, reach: 1 }`, or derive
from the actor's reach.

### 17. Follower catch-up: 2 steps beyond 3 tiles, else 1

[reduce.ts:1097](../packages/engine/src/reduce.ts#L1097) —
`distance > 3 ? 2 : 1`. Party cohesion behaviour with two invented constants.
**Proposal:** `start.partyFollow: { catchUpDistance: 3, catchUpSteps: 2 }`.

### 18. Loot scavenging bonus: success = +1 draw, critical = +2

[sim/spoils.ts:61](../packages/engine/src/sim/spoils.ts#L61) —
`roll.outcome === 'critical' ? 2 : 1`. `content.lootTables[].bonusRollSkill`
is data; what the skill is *worth* is not. **Proposal:**
`bonusRolls: { onSuccess: 1, onCritical: 2 }` on the loot table.

### 19. Encounter level-scaling curve

[world/populate.ts:234](../packages/engine/src/world/populate.ts#L234) —
`Math.floor((level - 1) / 2)` extra creatures. The "+1 per two levels" curve is
a design decision, and `scaleWithLevel` is only a boolean. **Proposal:** make
the scaling an `ExprSchema` on the encounter group, or
`encounterTables[].scalePerLevels: number = 2`.

### 20. Boss rooms and entrance rooms are special-cased

[world/populate.ts:355-356,388](../packages/engine/src/world/populate.ts#L355-L388):
`room.role === 'boss'` always gets an encounter and uses `bossTable`;
`isEntrance` never gets an encounter or a trap. The role vocabulary is engine
knowledge, and "the entrance is safe" is a design opinion (a defensible one —
the comment argues it well) that a horror module might want to reverse.
**Proposal:** `world.roomTemplates[].alwaysEncounter` / `neverEncounter`
booleans, so the role names stop being load-bearing.

### 21. Perception's sense-fallback constants

[sim/senses.ts:96](../packages/engine/src/sim/senses.ts#L96) —
`IMPLICIT_RANGE_UNITS = 60` for a module that declares no senses.
[senses.ts:402](../packages/engine/src/sim/senses.ts#L402) —
`Math.max(0.01, emission)` floors emission so nothing is ever perfectly silent.
[senses.ts:764](../packages/engine/src/sim/senses.ts#L764) — a spread trace signal
is halved. [senses.ts:486](../packages/engine/src/sim/senses.ts#L486) — the default
stance is "the first declared one" when `perception.defaultStance` is absent,
which is an ordering dependency.
The 60 is documented as deliberate back-compat and is fine; the emission floor
and the spread halving are undeclared game knobs. **Proposal:**
`rules.perception.minimumEmission: 0.01`, `rules.senses[].spreadRetention: 0.5`.

### 21a. Idle movement and disengagement had no knobs at all — **closed**

Two constants that were not so much hardcoded as *absent*, found while making
the world move on its own.

`runIdleTurns` paced everything at one tile per elapsed minute regardless of
why it was moving, so ambling around a den and running somebody down were the
same speed. And `maybeEndCombat` ended a fight after a single round in which
nobody could perceive anybody, which made stepping around a corner a complete
escape and pulling something into open ground impossible.

Both are now declared: `rules.temperament.speeds` gives a separate multiplier
per reason a creature moves, and `rules.temperament.disengageTurns` says how
long it keeps looking. Zero on both reproduces the old behaviour exactly, which
is what `modules/minimal` is the witness for.

One thing deliberately **not** made declarable: which threshold the end-of-fight
test uses. It asks at `investigate` where combat entry asks at `aggro`, and that
ordering is guaranteed by the schema — so a fight can never end and immediately
restart. Exposing it would let a module invert the two and build exactly that
loop.

### 22. Concentration and speed defaults duplicated in engine

[sim/agenda.ts:44-56](../packages/engine/src/sim/agenda.ts#L44-L56) and
[sim/deeds.ts:38-46](../packages/engine/src/sim/deeds.ts#L38-L46) re-declare
defaults (`?? 3`, `?? 0.5`, `?? 0.8`, `?? true`, `?? 90`,
`?? ['damageTypes','abilities']`) that Zod has **already applied** in
`memory.ts`. Harmless today because the values agree, but they are two sources
of truth and will drift. **Proposal:** trust the compiled module; delete the
`??` chains. This is a mechanical, low-risk cleanup.

### 23. Damage rounding and the no-debt purse

[rules/apply.ts:487](../packages/engine/src/rules/apply.ts#L487) —
`Math.round(op.amount * multiplier)`. D&D rounds resistance *down*; this rounds
to nearest, so 7 damage halved is 4, not 3. Small but systematic.
[apply.ts:555](../packages/engine/src/rules/apply.ts#L555) — the purse clamps at 0
so a module cannot express debt. **Proposal:**
`rules.resolution.damageRounding: 'floor' | 'round' | 'ceil' = 'round'`;
`rules.currency.allowNegative: boolean = false`.

### 24. Reputation spill uses `Math.trunc`

[rules/apply.ts:427](../packages/engine/src/rules/apply.ts#L427) —
`Math.trunc(delta * weight)` means a relation weight of 0.4 on a ±2 deed spills
0, silently. Rounding direction is a balance decision.

---

## P2 — Reasonable engine default, but the fallback is invented

These are cases where the engine invents a number that should be a **schema
default** instead, so it appears in generated docs and the studio's forms.

| Value | Where | Note |
| --- | --- | --- |
| `DEFAULT_TILE_SIZE = 5` | [targeting.ts:24](../packages/engine/src/rules/combat/targeting.ts#L24) | D&D's 5-foot square. Fine as a default — but `rules.sizes[].space` already defaults to 5, so this only fires when a module declares *no sizes at all*. Documented in place; leave. |
| 60 minutes per hour | [sim/clock.ts:83](../packages/engine/src/sim/clock.ts#L83) | `minutesPerDay` and `daysPerMonth` are data; hours are not. A 100-minute-hour calendar cannot be expressed. Add `world.time.minutesPerHour: 60`. |
| BSP `MIN_LEAF = 5` | [world/dungeon/bsp.ts:37](../packages/engine/src/world/dungeon/bsp.ts#L37) | Generator tuning. Expose as `world.dungeons[].bsp.minLeaf` if authors ask; otherwise leave. |
| Caverns `FILL = 0.45`, `SMOOTHING_PASSES = 4`, birth rule `>= 5` | [caverns.ts:27-64](../packages/engine/src/world/dungeon/caverns.ts#L27-L64) | Classic cellular-automaton constants. Strongly shape cavern feel; worth exposing as `world.dungeons[].caverns`. |
| Room size `'2d3+3'`, floor of 3 | [rooms.ts:129-130](../packages/engine/src/world/dungeon/rooms.ts#L129-L130) | Fallback when the dungeon declares no room spec. |
| Map size fallback `7` | [world/mapgen.ts:177-178](../packages/engine/src/world/mapgen.ts#L177-L178) | Matches `mapSpecObject`'s `'7'` default — consistent, but duplicated. |
| Winding-corridor `0.6` continue / `0.4` turn penalty | [corridors.ts:190,280](../packages/engine/src/world/dungeon/corridors.ts#L190) | Aesthetic tuning for the `winding` style. |
| Cone half-angle `dot >= 0.7` | [grid/geometry.ts:183](../packages/engine/src/grid/geometry.ts#L183) | 45° each side — the standard cone. Would need `AreaSpec.angle` to change. |
| Spiral placement radius `< 12` | [sim/enter.ts:57](../packages/engine/src/sim/enter.ts#L57) | Search bound for a free tile; a safety limit, not a game rule. |
| Dialogue auto-advance guard `hops < 8` | [sim/dialogue.ts:172](../packages/engine/src/sim/dialogue.ts#L172) | Loop guard; caps how deep an auto-chain can go, which *is* mildly game-visible. |

---

## P3 — Genuine engine invariants (leave hardcoded)

Listed so the decisions are on record, not because they need changing.

- **Chebyshev distance for the grid** —
  [geometry.ts:20-23](../packages/engine/src/grid/geometry.ts#L20-L23). Documented
  at length in the file header. `euclidean` and `manhattan` are exported for
  content that wants them. A module-selectable metric would ripple through
  every reach, range, and area calculation for little gain.
- **Bresenham lines shared by LOS, line spells, and throws** —
  [geometry.ts:41-46](../packages/engine/src/grid/geometry.ts#L41-L46). Sharing one
  implementation is the point.
- **Eight compass directions and their offsets** —
  [actions.ts:100-126](../packages/engine/src/actions.ts#L100-L126),
  [geometry.ts:203-211](../packages/engine/src/grid/geometry.ts#L203-L211). Square
  grid; a hex module would need a different grid module entirely, not a config
  flag. Note the direction *words* (`'north'`, …) leak into narration at
  [senses.ts:1069-1070](../packages/engine/src/sim/senses.ts#L1069-L1070) — that
  part is P1 localization, filed under finding #1.
- **Determinism tie-breaks** — initiative ties on `id.localeCompare`
  ([turn.ts:82](../packages/engine/src/rules/combat/turn.ts#L82)), sorted
  `cooldowns` / `usedOnce` / `alerts` / `marks`, `Rng.fromSeed(0)` as the
  forbidden RNG in stat formulas
  ([stats.ts:29](../packages/engine/src/stats.ts#L29)). Load-bearing for save
  equality; do not touch. See the determinism notes in `docs/reference.md`.
- **Condition tick order** — `onTick` → age → `onExpire`
  ([conditions.ts:137-227](../packages/engine/src/rules/conditions.ts#L137-L227)).
  Documented; making it configurable would be a trap.
- **Stat evaluation order** — attributes → mods → maxima → derived
  ([stats.ts](../packages/engine/src/stats.ts) header). The forbidden reverse
  dependency prevents un-catchable cycles.
- **Loop guards** — `runAiTurns` 200 iterations
  ([ai.ts:290](../packages/engine/src/rules/combat/ai.ts#L300)), `reduce.ts:787`
  32 iterations, `enter.ts` 12-radius spiral, `mapgen.ts:363` 32 attempts,
  `depleting` recursion mark in
  [apply.ts:37](../packages/engine/src/rules/apply.ts#L37). Safety, not balance.
- **`SAVE_VERSION = 7` and the migration ladder** —
  [state.ts:20](../packages/engine/src/state.ts#L20),
  [save.ts](../packages/engine/src/save.ts). Engine-owned by definition.
- **`OPEN_NAMESPACES = ['flags','quests','memory','reputation']`** —
  [stats.ts:308](../packages/engine/src/stats.ts#L308). The DSL's namespace
  contract.
- **Ties go to the defender in `opposedCheck`** —
  [check.ts:159](../packages/engine/src/rules/check.ts#L159). A convention, but a
  near-universal one; the comment states it.
- **The dead take no damage; healing does not raise** —
  [apply.ts:481,499](../packages/engine/src/rules/apply.ts#L481). Guards against
  duplicate `died` events, which quest objectives count.

---

## Inert schema fields — the registry and its gaps

`apps/editor/lib/inertFields.ts` already tracks fields the engine never reads,
with a drift test. It currently lists:

`world.areas.map` (palette shadowed) · `world.terrains.lightRadius` ·
`world.terrains.isDoor` · `content.items.stackable` · `content.items.rarity` ·
`content.items.requiresAttunement` · `rules.movementModes.terrainMultiplier` ·
`rules.movementModes.fallsWhenDisabled` · `rules.sizes.carryMultiplier` ·
`rules.sizes.hitDie` · `rules.senses.ignores`

**Gaps I found that are not in the registry:**

| Field | Evidence |
| --- | --- |
| `rules.spellcasting.maxSpellLevel` | Declared in the `Spellcasting` interface at [casting.ts:31](../packages/engine/src/rules/casting.ts#L31) and never referenced. Nothing caps a spell level. |
| `rules.opportunities[].actionType` | Not read anywhere. `provokeOpportunity` counts against `reactionsUsed` / `usesPerRound` and never touches the action-type budget, so an opportunity attack is free of the declared reaction economy. |
| `rules.languages[].exotic` | No reader outside the schema. Dialogue and readable content are not language-gated. |
| `start.creation.attributePoints`, `attributeCosts`, `skillRanks`, `allowedAncestries`, `allowedClasses` | Read only by [../packages/play/src/creation.ts](../packages/play/src/creation.ts), never by `newGame`/`createCharacter`. So the CLI/web creation flow enforces them and any programmatic party (tests, `defaultChoices`, a third-party front end) bypasses them entirely. Not strictly inert, but the enforcement lives in the wrong layer. |

`terrainMultiplier`'s registry note says "path costs are per-path" — worth
re-checking: `TerrainIndex.costOf`
([tiles.ts:197-200](../packages/engine/src/grid/tiles.ts#L197-L200)) returns raw
`moveCost` and `findPath` ([path.ts:148](../packages/engine/src/grid/path.ts#L148))
passes `modes` through without applying any multiplier, while
`space.ts`'s doc for `moveCost` says it is "combined multiplicatively with the
mover's `movementMode.terrainMultiplier`". **The schema documentation and the
engine disagree** — one of the two should change.

---

## Recommended order of work

1. **`narrative.systemText`** (finding #1). Largest surface, highest player
   visibility, and it unblocks non-English and non-fantasy modules. Do it as one
   sweep with a generated key list.
2. **The five one-line resolution constants** — save-for-half (#2), passive base
   (#3), damage rounding (#23), `minutesPerHour` (#25/P2), default movement mode
   (#6). Cheap, self-contained, each one a schema field plus a read site.
3. **Generation density** (#4, #5, #19, #20). One `world.generationDefaults`
   block covers most of it.
4. **Social-sim multipliers** (#10, #11, #12). These change emergent behaviour,
   so land them with a play transcript check, not just unit tests.
5. **Creation and progression** (#7, #8, #9). Largest blast radius —
   `bonusVitality` in particular touches save compatibility for existing
   characters. Plan a migration.
6. **De-duplicate the Zod defaults** (#22) any time; it is a pure cleanup.
7. **Extend `inertFields.ts`** with the four gaps above, so the drift test
   covers them.

---

## Verification notes

Findings were located by pattern-scanning `../packages/engine/src` for numeric and
string literals outside comments, then reading each hit in context; and by
cross-checking every `rules.*` / `narrative.memory.*` / `world.time.*` schema
field against its readers in the engine. Line numbers are from the working tree
at the time of writing and will drift — the symbol names in each snippet are the
durable anchor.

---

## What was done

Every P0 and P1 finding and the whole P2 table were moved into module JSON. Two
mechanisms carry most of it.

### `narrative.systemText` — the engine's own words

Finding #1, and the largest change. The registry lives in
[systemText.ts](../packages/module/src/schema/systemText.ts): one stable key per
sentence, its canonical wording, and the placeholders it cannot lose. The engine
reads them through `text()` / `render()`
([narrate/systemText.ts](../packages/engine/src/narrate/systemText.ts)) and holds
**no English of its own** — `refused` events carry a key and its facts rather
than a finished sentence, and `roughBearing` and `bearing` return
`direction.*` keys rather than words.

Two tiers decide what is mandatory, and the rule is the one a player would
recognise: **a value is only required when something else is relying on it to
convey a message.**

- **fragment** — a piece another message interpolates (`combat.outcome.failure`
  is the `{outcome}` in an attack line). Required in the document; omitting one
  is a load error, because the sentence around it would render with a hole.
- **message** — a sentence that stands alone. Carries a schema default, so an
  author writes only what they want to change.

`compileModule` rejects a missing fragment, a blank message, and a template that
has lost a required placeholder. `npm run systemtext -- <module>` writes the
whole set into a module; `blankModule()` seeds the fragments so a new module
compiles. `spine.test.ts` gained a guard that fails on prose in engine code.

### `rules/config.ts` — the resolution knobs

[config.ts](../packages/engine/src/rules/config.ts) resolves and memoizes the
one-line constants, in the style of the existing `criticalMultiplier`.

### Finding by finding

| # | Became |
| --- | --- |
| 1 | `narrative.systemText`, above |
| 2 | `rules.resolution.saveSuccessMultiplier` |
| 3 | `rules.resolution.passiveBase` + `opposedMode`; `opposedCheck` now reports a meaningful outcome instead of always `success` |
| 4 | `world.generationDefaults` |
| 5 | `world.areas[].encounterChance`, an expression over `dangerLevel` |
| 6 | `rules.defaultMovementMode` |
| 7 | `skillProficiencies` accepts `{ skill, rank }`; `rules.progression.proficiencyRank` |
| 8 | `rules.progression.levelVitality` — `roll` / `average` / `max` / `none`, class or size die, plus a per-level expression. Un-inerts `sizes[].hitDie` |
| 9 | `rules.dispositionBands`, with an explicit catch-all band |
| 10 | `gossip.gullibilityScale`, `gossip.garbledRetention`, `forgetting.caresAboutMultiplier`, `forgetting.linearSpanMultiplier` |
| 11 | The 12-tile floor is gone; `radius: 0` means everyone present, as the schema always said |
| 12 | `rules.conditions[].concealsIdentity` — typed, so a wrong id cannot fail silently |
| 13 | `rules.spellcasting.componentActionTypes`, as refs |
| 14 | `rules.search.{trapRadius, disarmReach}` |
| 15 | `world.time.actionMinutes` |
| 16 | `rules.interactionRange.{talk, reach}` |
| 17 | `start.partyFollow.{catchUpDistance, catchUpSteps}` |
| 18 | `lootTables[].bonusRolls.{onSuccess, onCritical}` |
| 19 | `encounterTables[].scalePerLevels` |
| 20 | `roomTemplates[].{alwaysEncounter, neverEncounter, neverTrap}` and `dungeons[].safeEntrance`; `role` is no longer load-bearing |
| 21 | `rules.perception.minimumEmission`, `rules.senses[].spreadRetention` |
| 21a | `rules.temperament` (roam, investigate and leash radii, wander odds, per-reason speeds, sense preference, who it registers) and `rules.perception.maxMarksPerTile`. Per creature via `content.monsters[].temperament` and `content.npcs[].temperament`; per ground via `world.terrains[].marks` |
| 22 | Deleted. `MemoryModel` and `Spellcasting` are the schema's inferred types now, not hand-written copies behind an `as unknown as` |
| 23 | `rules.resolution.damageRounding`, `rules.currency.allowNegative` |
| 24 | `rules.resolution.reputationRounding` |
| P2 | `world.time.minutesPerHour`, `dungeons[].bsp.minLeaf`, `dungeons[].caverns`, `dungeons[].winding`, `dungeons[].roomSize`, `narrative.maxDialogueHops`, `areaOfEffect.angle`. `DEFAULT_TILE_SIZE` and the spiral bound stay, as the table recommended |

### The registry gaps

`maxSpellLevel`, `opportunities[].actionType` and `movementModes[].terrainMultiplier`
were **wired up** rather than registered — the last of these because
`space.ts`'s documentation and the engine disagreed, and the documentation was
right. `sizes[].hitDie` became live through #8. `languages[].exotic` is now
listed in `apps/editor/lib/inertFields.ts`. `start.creation`'s constraints moved
out of `packages/play` into
[creation.ts](../packages/engine/src/creation.ts), so a party built any other way
obeys them too.

### How it was checked

`npm run check` (985 tests), `validate` and `smoke` on both modules, both Next
apps built, and — the part a test suite cannot do — a played transcript read
side by side with one captured before the work: **identical**. Then the same
transcript run against a module that overrides the new fields, to prove they are
connected rather than merely accepted.
