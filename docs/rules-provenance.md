# Rules Provenance

Where this engine agrees with the tabletop rules it is shaped by, where it
departs from them, and which of those departures were decisions rather than
accidents.

> **Status: first pass, 2026-08-19.** The defects in *[Defects](#defects)* are
> fixed, and so are G1, G2, G3, G5, G6 and G7. **G4, creature footprints, is
> deliberately held** — there are larger plans for that part of the engine, and
> G4a records something worth knowing before it is touched — and has since
> caught a second feature, which its entry now records. The one deliberate
> deferral inside a closed entry is Ready, which is blocked on a trigger
> vocabulary that is one-seventh implemented. The entries under
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

### G2. The proficiency bonus applied to one of the three d20 tests — **closed**

`proficiencyOf` is used mechanically only for saving throws. Attack rolls use
the bare attribute modifier, and a skill check is attribute plus rank. Whether
that is right is a real question — this engine uses a **rank ladder** where the
official rules use binary proficiency, and the two do not obviously compose —
but at present the bonus exists and reaches a third of what it names.

**What it became.** `rules.resolution.attackBonus` is an optional formula for
what a weapon attack adds, with `actor.attackMod` (the modifier for whichever
attribute the attack resolved to) and `actor.proficiency` in scope. Omitted, an
attack adds the bare attribute modifier, which is what the engine always did.

That "always did" was the whole problem. Nothing raises an attribute after
character creation — there are no ability-score improvements, and no effect op
can change one — so a weapon attack was **flat across all twenty levels**. In
Aurendel a warden hit at +0 at level 1 and +0 at level 20. Fixing the caster
side first had made this worse rather than better, which is the argument for
treating the two as one finding: a ruleset that scales one and not the other
should be choosing that. `core_fantasy` now scales both, and a warden's weapon
runs +2 to +6 beside an adept's spell at +2 to +7.

**Skills keep the rank ladder, and that is the decision.** Adding the
proficiency bonus on top of a skill's rank would count progression twice. The
ladder is the deliberate divergence recorded under Choices; the bonus reaching
saves, attacks and spells but not skills is now a choice rather than an
accident.

**The consequence for casters, fixed earlier.** `core_fantasy` had
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

### G3. A natural 20 or 1 resolved every roll, not just attacks — **closed**

The critical branch in `check()` runs before the difficulty comparison, and
`check()` is the single door for attacks, saves, skill checks and opposed
checks. A level-1 character therefore auto-succeeds a DC 30 check 5% of the
time. The official rules confine criticals to attack rolls; Pathfinder 2e
shifts the degree of success instead of overriding it.

**What it became.** `rules.resolution.criticalScope` lists which kinds of roll
may crit or fumble — `attack`, `save`, `check` — and `check()` now carries the
kind of test it is resolving. `criticalSuccessAt: null` remains the blunt
instrument that switches criticals off everywhere, including on attacks; this is
the narrower dial beside it.

The default lists all three, because that is what the engine has always done and
the change should not move a number silently. It is declared rather than
implied so an author can see the opinion they are holding: with `check` in the
list, a natural 20 picks a lock no amount of skill could open.

**The decision for this project** is that anything attacked with, cast with or
defended against may crit; an item is not expected to but has no reason it could
not. Note that using an item is not a d20 test at all, so an item "critting"
means its attack or its proc, which travels the attack path under any setting.

### G4a. The grid is as fine as the smallest creature declared

Found while testing Disengage, and worth knowing before G4 is touched.
`tileSize` is the **minimum** `sizes[].space` across the ruleset. `core_fantasy`
declares tiny at 2 feet, so the whole map is on 2-foot tiles: a 30-foot speed is
15 tiles, and a medium creature's 5-foot reach is 2 tiles.

The consequence is not obvious. Stepping one tile away from an adjacent enemy
moves you from distance 1 to distance 2 — still inside a reach of 2 — so it
provokes nothing. A parting blow needs two steps. That is internally consistent
and arguably correct at that resolution, but it makes opportunity attacks feel
much rarer than the rule reads, and it is entirely an artefact of `tiny` being
declared at all. Removing tiny would silently double every distance in the game.

**It has since caught a second feature, exactly as predicted.** `rules.temperament`
states a creature's territory and its leash in module units, and the first pass
wrote them as though a tile were five feet — so a leash of 400 came out as two
hundred tiles, larger than any dungeon the generator produces, and creatures
that were supposed to break off a chase were unleashed. Nothing failed: the
module validated, the tests passed, and the numbers looked reasonable in the
JSON. It was visible only by playing a dungeon and watching where things went.

The rule for anyone declaring a distance in a `core_fantasy`-derived module:
**halve it to read it in tiles**, and sanity-check the result against the size
of a map it will be used on.

### G4. Every creature occupies exactly one tile

`sizes[].space` derives the global tile scale, and it does so from the
**minimum** declared size. Nothing gives a Large creature a 2x2 footprint. A
dragon and a rat block the same corridor, nothing can be flanked or squeezed
past, and `space` is a unit-conversion constant with a misleading name.

**Cost.** A project in itself: occupancy, pathfinding, targeting and reach all
assume one tile per creature.

### G5. Finesse could not be expressed — **closed**

`itemProperties[].modifiers` maps a property to derived-stat modifiers, and
finesse is a *choice of attack attribute*, not a modifier: there is no number
you can add to a defence that means "use agility instead of might". So the
property shipped with an empty body, and Aurendel's one finesse weapon declared
agility damage while `strike` named might — aimed with one arm and hit with the
other.

**What it became.** `rules.itemProperties[].attackStats` lists attributes a
weapon carrying that property may *also* be swung with; the best of them wins,
and the chosen one governs the weapon's damage as well, so the two halves can
no longer disagree. Ties keep the ability's own attribute, so an offer that is
no improvement changes nothing.

It belongs to the property rather than the ability because the weapon in the
hand is what decides, and one authored `strike` still serves every class. The
weapon lookup moved above the attack roll to make that possible — it used to
happen afterwards, when only the damage needed it.

This was the tenth cross-reference in the ruleset composer, `equipment` →
`attributes`, and the first that cost nothing: `attributes` requires nothing,
so there was no cycle to route around.

**Still inert among the properties:** `two_handed`, `thrown`, `heavy` and
`reach` do nothing, and `reach` on an item is unrelated to `reachOf`, which
reads creature size alone. `silvered` works, by matching a resistance's
`unless` tag.

### G6. No experience from combat — **closed**

`content.monsters[].xp` was authored on 89 of Aurendel's 127 creatures, copied
onto every spawned one, and converted into party experience by nothing —
finishing a quest was the only way to gain a level. The numbers say plainly what
they were written for: a barrow rat is worth 15 and level 2 costs 100.

**What it became.** `awardKillXp` sweeps the events of an action for a `died`
whose killer is a party member, and pays the creature's authored worth. It runs
beside `dropDeathLoot`, which is the same shape of post-action sweep, and before
quests advance, so a level gained for a kill is in hand when the quest that
asked for it pays out.

There is no switch, because the module already had one: a ruleset that does not
want experience for killing gives its creatures none, which is the schema
default. The worth is read from the statblock rather than the corpse, because
`Entity.xp` holds what a character has earned *and* what a monster is worth —
one field carrying two meanings, and the authored number is the one to trust.

### G7. The named tactical actions were absent — **closed, three built and one deferred with reasons**

**Partly closed with G1.** Dodge and Help were the two that could not be
written at all, and both now exist in `core_fantasy` as `dodge` and `assist`,
applying the `dodging` and `helped` conditions. What remains is four separate
situations, not one gap.

**Dash is modelled differently, and deliberately.** It is a *stance*
(`speedMultiplier: 1.5`) rather than an action: it costs nothing, applies to
the whole party, and persists until changed, where the official Dash costs your
action and lasts a turn. The stance also raises what you emit — hearing 2.2,
smell 1.4 — which feeds the perception model, so moving fast is a trade here
rather than a free option. That is a better fit for this engine than the
original, and the only genuinely open question is the multiplier: 1.5 against
an effective 2.

**Disengage is built.** It could not be expressed, and this entry once claimed
otherwise: `provokeOpportunity` handed the gate the mover as `{ id }` alone, so
`opportunities[].requires` could learn who was leaving and nothing else. There
was no way to write "unless the one leaving is disengaging", and
`conditions[].prevents` did not reach either — it blocks its *bearer's* action
types, while a parting blow is spent from the reactor's budget.

The gate now receives the same `targetScope` an attack builds, which moved from
`attack.ts` to sit beside `buildScope` and gained implied conditions on the way:
a creature that is unconscious *is* prone, and content asking should be told so.
After that, disengaging is ordinary content — a `disengaging` condition, an
ability applying it, and `requires: not(exists target.conditions.disengaging)`
on the opportunity.

**Hide means something else here, by design.** Stealth is not a roll: a stance
*emits*, and `concealedBy` with `concealmentPerPoint` reduces that emission
continuously. There is no moment to spend an action on. See Choices.

**Ready is deferred, and blocked on two things rather than one.** `CombatState`
has no slot for a held trigger and the action waiting on it, so it is a
save-format migration, the same class of work as attunement.

The second blocker is larger and was found while scoping the first.
`rules.opportunities[].on` declares seven triggers — `moveAway`, `castSpell`,
`rangedAttack`, `standUp`, `beHit`, `allyHit`, `custom` — and
`provokeOpportunity` filters for `moveAway`. **Nothing dispatches the other
six.** A readied action can only wait on a trigger the engine can detect, so
today it could only wait on someone leaving your reach, which is an opportunity
attack by another name. Ready is worth building after the trigger vocabulary is
real, not before.

Note this is a *second* trigger system: `content.monsters[].reactions[].on`
declares twelve triggers of its own and those *are* dispatched, by
`dispatchReactions`. Two overlapping vocabularies, one working.

---

## Inert

Declared and never read. `../apps/editor/lib/inertFields.ts` is the registry and
its drift test fails if a listed field turns out to be read, so each of these
needs a decision rather than a shrug.

**Two were wired**, and left the registry:

- `rules.conditions[].implies` — the schema cites "unconscious implies prone",
  and now all three places a condition's static properties are read consult the
  implied set. An implied condition is a derived view with no lifecycle of its
  own, and never one the creature already holds directly.
- `rules.senses[].ignores` — it was the exception clause to a rule nobody had
  written, since no condition could shut a sense off. `rules.conditions[].suppressesSenses`
  is the other half; `blinded` now names `sight`.

**Two are deferred, and the note says why rather than "yet":**

| Field | What it is waiting on |
| --- | --- |
| `content.items[].requiresAttunement`, `.attunementRequires` | Enforcing a limit needs an attuned list on the entity — persisted state, and therefore a save-format migration. |
| `rules.movementModes[].fallsWhenDisabled` | Two missing pieces, not one: nothing takes a movement mode away, and there is no falling model for what would happen next. |

**The rest are settled**, and the registry note is the decision:
`world.areas[].map` (a biome's palette wins), `world.terrains[].lightRadius`
(there is no light model; a sense carries its own reach),
`world.terrains[].isDoor` (doors live on the map's gate record),
`content.items[].stackable` (inventory merges by id; there is no item instance
to keep apart), `content.items[].rarity` (display and filtering),
`rules.sizes[].carryMultiplier` (encumbrance is deliberately absent — see
Choices), `rules.languages[].exotic` (content is not language-gated).

**The contradiction that was not one.** `rules.movementModes[].terrainMultiplier`
was recorded here as a case of the schema and the engine disagreeing. It was
not: `costOf` applies it and `findPath` passes modes through. It was two
narrower faults instead. The running minimum started at 1, so a multiplier
*above* 1 could never win and a mode declared as worse over some ground was
quietly free. And `PathOptions.terrainMultiplier` was a second knob nobody
passed that would have double-applied on top of `costOf` if anyone had. Both
fixed; the dead option is gone.

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

**And a sense can have a speed.** `spreadPerMinute` is how many tiles a signal
travels per minute, so a smell has to *get* to you: walking into a dungeon
starts filling it rather than filling it, and the far end has a while yet. Sight
and sound leave it at zero and arrive at once, bounded by range and geometry
instead. Nothing in a tabletop ruleset needs this — a table adjudicates it — but
a computer that skips it produces the thing this replaced, where every creature
on a level smelled the party on the tick they stepped through the door.

The nicest consequence is emergent rather than designed: because a trace has
been spreading since it was left, an *older* one has reached further than the
fresh one beside its owner. A hound picks up the trail behind you before it
picks up you, which is what the smell sense's own description always claimed and
what the instantaneous model could never actually do.

**Creatures have territory, and a fight outlasts a corner.** Nothing in a
tabletop ruleset says where a monster stands when nobody is looking at it, or
how long it keeps hunting after it loses you — those are the table's job, and a
computer has to hold an opinion. `rules.temperament` is that opinion made
declarable: a roam radius around where a creature was placed, a leash past which
it stops being towed, a per-reason movement speed, an ordered list of which
senses it acts on, and a count of rounds it keeps looking before it gives up.

Two consequences worth naming. **Entry and persistence use different bars** —
combat starts at the `aggro` threshold and ends at the lower `investigate` one,
because committing to a charge and refusing to give up are not the same
judgement. And a creature that wanders lays a trail while it does, which is what
finally makes `world.terrains[].marks` worth declaring: ground that takes no
print is somewhere you can genuinely lose a thing that hunts by tracks.

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
