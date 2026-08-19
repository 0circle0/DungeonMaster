# Rules Provenance

Where this engine agrees with the tabletop rules it is shaped by, where it
departs from them, and which of those departures were decisions rather than
accidents.

> **Status: first pass, 2026-08-19.** The defects in *[Defects](#defects)* are
> fixed, and so is G1, which was the largest gap. The rest of *[Gaps](#gaps)*
> are recorded, not built; each says what it would cost. The entries under
> *[Choices](#choices)* are settled and need no further action.

**Why this document exists.** The header of `../packages/module/src/schema/rules.ts`
promises that "the engine has no idea what Might is, that hit points exist, that
armour class is `10 + agility`, or that checks roll a d20". The only real test of
that promise is to put a published ruleset beside the schema and ask, field by
field, **could a module express this?** A system that can express neither D&D nor
anything else is not neutral; it is incomplete. This is that comparison.

It is also the answer to "why doesn't this work like the game I know?", which is
a question every author of a d20-shaped world eventually asks.

**What this is not.** It is not a plan to become fifth edition. No SRD text,
names, or statblocks ship in this repository, and none should. The official
rules are used here as a **yardstick**, in the same spirit as the audit in
`hardcoded-audit.md`: a deviation is a feature unless it is a bug.

---

## Sources

The yardstick column is the **System Reference Document 5.2**, published by
Wizards of the Coast on 2025-04-22 under CC-BY-4.0 and available at
<https://www.dndbeyond.com/srd>. It is cited because it is the current official
text and the only one that may legally be quoted. Where the 2014 and 2024
rules differ, the 2024 reading is used and the difference is noted.

Cross-checked against the 2024 Free Rules on D&D Beyond, the Roll20 compendium's
Combat, Actions and Conditions chapters, and `dnd5e.wikidot.com` for the 2014
surface. Two systems are cited as contrast rather than authority:

- **Pathfinder 2e** (Archives of Nethys) — a three-action economy, four degrees
  of success on a beat-by-10 / miss-by-10 threshold, and a natural 20 that
  shifts the degree by one step instead of auto-succeeding.
- **Old-School Essentials / B/X** — the ten-minute *dungeon turn*, with
  exploration movement, light, and wandering-monster checks all on one clock.
  The closest published precedent for a room-and-corridor engine.

---

## How to read this

| Bucket | Meaning |
| --- | --- |
| **Defect** | The code contradicts a contract this repository itself wrote down. Fixed regardless of how close to D&D we want to be. |
| **Gap** | The schema *cannot express* a rule that any d20 ruleset needs. This is a failure of the genre-neutral claim, and the interesting category. |
| **Inert** | Declared in the schema and never read by the engine. Tracked in `../apps/editor/lib/inertFields.ts`, which has a drift test. |
| **Choice** | A real divergence, defensible, deliberate. Written down so it stays a decision. |

The D&D-ness of this project lives in **schema defaults** and in the
`core_fantasy` content module, not in the engine. `core_fantasy` is a
serial-numbers-filed fifth edition: six attributes renamed, the identical
`floor((value - 10) / 2)` curve, `guard = 10 + mod(agility)`, cover at +2/+5,
proficiency `2 + floor((level - 1) / 4)`, and the same 27-point buy table.

---

## Defects

### 1. `damageRounding` governed one of the three cases it named — **fixed**

`rules.resolution.damageRounding` documents itself as covering "resistance, a
save for half, a critical". Only resistance used it
(`../packages/engine/src/rules/apply.ts`). Criticals and saves-for-half both
went through `scaleDamage` in `../packages/engine/src/rules/combat/attack.ts`,
which rounded with a hardcoded `Math.floor`.

At the **default** setting of `round`, seven damage halved by a successful save
was three rather than four. A module that set the field got the behaviour it
asked for on one path in three, silently.

**What it became.** `scaleDamage` now takes the module's rounder, through a new
`roundDamageOf` helper in `../packages/engine/src/rules/config.ts` that follows
the existing `saveMultiplier` / `passiveBase` shape.
`../packages/engine/src/rounding.test.ts` asserts 4 / 3 / 4 for round / floor /
ceil on a save for half, and 11 / 10 on a critical; both assertions fail against
the old code.

### 2. A critical multiplied the modifier, and the schema said otherwise — **fixed, as documentation**

`criticalDamageMultiplier` said it "multiplies damage **dice**". It multiplies
the whole amount: `weaponDamage` has already rolled the dice and added the
attribute modifier by the time `scaleDamage` sees a flat number.

The tabletop convention is to double the dice and add the modifier once, so a
Might 16 warden critting with a `1d8` blade deals an average of 15 here against
12 there — around 25% high, and worse as modifiers grow.

**What it became.** The wording, not the behaviour. A damage op is
`{op, target, amount, damageType, tags?}` and `../packages/module/src/dsl/eval.ts`
builds it that way for content-authored damage too, so doubling the dice alone
would mean carrying the dice expression separately from the modifier through a
shared DSL type. That is a large change for a rule the generic posture does not
oblige us to match. The schema now says what the engine does, and says why.

### 3. Character-creation limits bypassable outside the front ends — **already fixed**

Recorded because `hardcoded-audit.md` still lists it. The point budget, cost
table, and allowed ancestries and classes are enforced by `creationProblem` in
`../packages/engine/src/creation.ts`, which `createCharacter` calls before
building anything. The audit predates that move.

---

## Gaps

### G1. Advantage and disadvantage were built and unreachable — **closed**

**The headline finding, and now fixed.** Every part of the mechanism existed:
`Swing` was a type in `../packages/engine/src/rules/check.ts`, `check()` selected
`advantageDice` or `disadvantageDice` when handed one, the roll event carried
`swing`, the `roll.swing` fragment narrated it, and `core_fantasy` declared
`2d20kh1` and `2d20kl1`. **No call site ever passed one, and no schema field
anywhere produced one.**

This matters more than any other entry here. In the official rules,
advantage is *the* universal situational modifier: Dodge, Help, attacking an
unseen target, being unseen, prone, restrained, blinded, poisoned, frightened
and paralysed all route through it. Lacking it is why every `core_fantasy`
condition is a flat penalty to `guard` (-1 / -2 / -3 / -4). That is not a
stylistic difference; the schema has no way to say the thing.

The two idioms are also not interchangeable. A `guard` penalty is a uniform
shift in the mean that leaves the critical rate alone. Advantage is a change in
variance that also lifts the critical rate from 5% to about 9.75%, because with
`2d20kh1` the kept die is the natural roll.

**What it became.** `rules.conditions[].swings` names four scopes — the attacks
its bearer makes, the attacks made against them, their ability checks, their
saving throws — and `content.abilities[].swing` and `.savingThrow.swing` cover
what is inherent to an ability rather than to the moment. `resolveSwing` inside
`check()` owns the reconciling, so no call site can forget it, and
`rules.resolution.swingStacking` makes the policy the ruleset's: `cancel` is the
common table reading, `net` goes by the sign of the count. There is deliberately
no `stack`, because `advantageDice` is a single notation and two levels of
advantage cannot be named.

Four call sites reach almost everything: `skillCheck` covers traps, dialogue,
gates, loot and discovery at once, `savingThrow` covers condition and
concentration saves, and the attack roll asks both sides.

A predicate-driven rule list was considered and rejected. Every predicate needs
`buildScope`, which re-runs `statsOf` and `skillRanksOf` on paths that build no
scope at all today — and a `when` may contain `{"chance": …}`, which would make
swing *selection* consume randomness. That is a far worse determinism story than
applying one.

**Determinism.** `2d20kh1` consumes two draws where `1d20` consumed one, and
`../packages/engine/src/reduce.ts` threads one generator per action, so a swing
shifts every later draw in that reduce. Each slice landed with nothing declaring
a swing, so each was verifiably inert until the content commit that used it.

**In the shipped ruleset.** Poisoned, frightened and blinded keep their `guard`
penalties and gain disadvantage on the attacks their bearer makes — not a double
penalty, because a defence penalty never said anything about aiming. Two
conditions are new because neither was expressible before: `dodging` and
`helped`, applied by `dodge` and `assist`, granted to every class at level 1.

### G2. The proficiency bonus applies to one of the three d20 tests

`proficiencyOf` is used mechanically only for saving throws. Attack rolls use
the bare attribute modifier, and a skill check is attribute plus rank. Whether
that is right is a real question — this engine uses a **rank ladder** where the
official rules use binary proficiency, and the two do not obviously compose —
but at present the bonus exists and reaches a third of what it names.

**Resolved in part.** The shipped consequence is fixed. `core_fantasy` had
`saveDifficulty: 8 + castingMod` and `attackBonus: 2 + castingMod`, where the
literal `2` was a level-1 proficiency bonus frozen in place: a level-20 caster
threw spells exactly as easy to dodge as a level-1 one. Both now name
`actor.proficiency`, which required adding it to the caster scope in
`../packages/engine/src/rules/casting.ts` — that scope is built there by hand
rather than by `buildScope`, so it holds only what is listed in it.

Aurendel's casters now read DC 11 / +3 at level 1 rising to DC 15 / +7 at level
17, against a flat DC 9 / +3 before. Note the level-1 save DC moved by 2: the
old formula omitted the bonus entirely rather than hardcoding it, so this is a
real if small difficulty increase at low level.

### G3. A natural 20 or 1 resolves every roll, not just attacks

The critical branch in `check()` runs before the difficulty comparison, and
`check()` is the single door for attacks, saves, skill checks and opposed
checks. A level-1 character therefore auto-succeeds a DC 30 check 5% of the
time. The official rules confine criticals to attack rolls; Pathfinder 2e
shifts the degree of success instead of overriding it.

`criticalSuccessAt: null` disables criticals entirely, so the knob is
all-or-nothing — there is no way to say "attacks only". Worth a decision rather
than a shrug, and cheap to make one: a third enum value beside the existing
field.

### G4. Every creature occupies exactly one tile

`sizes[].space` derives the global tile scale, and it does so from the
**minimum** declared size. Nothing gives a Large creature a 2x2 footprint. A
dragon and a rat block the same corridor, nothing can be flanked or squeezed
past, and `space` is a unit-conversion constant with a misleading name.

**Cost.** A project in itself: occupancy, pathfinding, targeting and reach all
assume one tile per creature.

### G5. Finesse cannot be expressed

`itemProperties[].modifiers` maps a property to derived-stat modifiers, but
finesse is a *choice of attack attribute*, not a stat modifier. All six
properties `core_fantasy` ships (silvered, two_handed, finesse, thrown, heavy,
reach) carry empty `modifiers`; only `silvered` does anything at all, and only
because it matches a resistance's `unless` tag. `reach` on an item is unrelated
to `reachOf`, which reads creature size alone.

### G6. No experience from combat

`content.monsters[].xp` is stored on a spawned entity and never converted into
party experience. `grantXp` has one caller: quest rewards. Either wire it or
make the field honest.

### G7. The named tactical actions are absent

**Partly closed with G1.** Dodge and Help were the two that could not be
written at all, and both now exist in `core_fantasy` as `dodge` and `assist`.
Dash exists as a stance multiplier of 1.5 against the official 2. Disengage is
independently expressible as an opportunity suppression and is not built. Hide
would mean something different here, because stealth is stance emission rather
than a roll — see Choices. Ready has no equivalent.

---

## Inert

Declared and never read. `../apps/editor/lib/inertFields.ts` is the registry and
its drift test fails if a listed field turns out to be read, so each of these
needs a decision rather than a shrug.

| Field | Note |
| --- | --- |
| `rules.conditions[].implies` | The schema cites "unconscious implies prone". `impliedConditions` has no non-test caller, so it grants nothing. |
| `rules.senses[].ignores` | "Blindsight ignores blinded" does not work. |
| `content.items[].requiresAttunement`, `.attunementRequires` | Typed on the engine's `ItemDef` and never read. No three-item limit. |
| `rules.sizes[].carryMultiplier` | No encumbrance model, by decision — see Choices. |
| `rules.movementModes[].fallsWhenDisabled` | Nothing takes a movement mode away. |
| `rules.languages[].exotic` | Dialogue and readable content are not language-gated. |
| `content.items[].stackable`, `.rarity` | Carried, never interpreted. |

**One contradiction rather than an absence.** `rules.movementModes[].terrainMultiplier`
is documented in `../packages/module/src/schema/space.ts` as combining
multiplicatively with a tile's `moveCost`, but `TerrainIndex.costOf` returns the
raw cost and `findPath` never applies the multiplier. The schema and the engine
disagree; one of the two readings should go.

---

## Choices

Settled divergences. Listed so they stay decisions.

**Vocabulary.** `guard` rather than armour class, `attributes` rather than
ability scores, three saving throws rather than six, and a skill **rank ladder**
rather than binary proficiency. The renaming is deliberate and load-bearing: the
engine is not a fifth-edition implementation and should not read as one.

**Perception is a continuous signal model**, not a darkvision radius and a
passive score. Senses have propagation, falloff, lingering, spread and memory,
with `detect` / `investigate` / `aggro` thresholds. This is a substantial
original system and is richer than what it replaces. Stealth follows from it:
a stance *emits*, and concealment is a skill applied to that emission, so hiding
is not a roll.

**Resistance is an arbitrary multiplier** with `unless` tags, composing
multiplicatively across statblock, ancestry and equipment. The official rules
cap at a single halving; this expresses immunity, vulnerability, healing from a
damage type, and "immune to slashing except silvered" in one field.

**Conditions carry more than a name** — `stacking`, `magnitude`, `onTick`,
`onExpire`, a saving throw with timing, and `swings`. Save-ends is a first-class
concept here and a per-effect footnote there. A condition can express itself as
a modifier to a derived stat or as a swing, and those are different mechanics
rather than two spellings of one: choose between them, and do not write both for
the same reason.

**Legendary and lair actions are first-class** `specialTurns`, running outside
initiative.

**Rest recovery is a fraction of a maximum**, not hit-dice spending. There is no
hit-dice pool, no 16-hour cooldown, and rests are interruptible on a declared
chance when something hostile is already alerted.

**Deliberately absent:** encumbrance (`../packages/engine/src/stats.ts` states
the intent — the engine owns only a `carried` number, and a module builds a rule
from a derived stat and a condition), currency denominations, feats, subclasses,
multiclassing, and ability-score improvements.

**Death is a resource reaching its floor.** There are no death saving throws and
no unconscious state in the engine; `onDepleted` runs before death is declared,
which is what lets a module write `[heal 1, applyCondition downed]` and get the
"dropped to 0 and stabilised" shape without the engine knowing what dying is.
`core_fantasy` does not use this, so a character at 0 hit points is simply dead.

**Combat is entered by perception**, not declared, and ends when neither side
can perceive the other — which is how fleeing works. There is no surprise round.
Initiative ties break by entity id, for replay determinism rather than realism.

**Reactions refresh at the start of the round**, where the official rules
refresh them at the start of your own turn. Recorded here as the decision it
should be.

**Chebyshev distance** — every diagonal costs the same as an orthogonal step.
This *matches* the Player's Handbook and departs only from the Dungeon Master's
Guide's optional variant.

**Ability cooldowns measured in rounds** have no tabletop equivalent at all.

**The generator is seeded, serialized and stream-split**, so a session replays
exactly and `Math.random()` is banned from the engine. No tabletop ruleset
offers this, and several decisions above exist to protect it.
