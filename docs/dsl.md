# The DSL

Data cannot express behaviour, so one small JSON language covers everything that needs logic: ability effects, spell payloads, item procs, trap triggers, dialogue gates, loot rules, quest objectives.

One evaluator serves all of them.

Three properties are non-negotiable:

- **Sandboxed.** No `eval`, no host access. A module you downloaded cannot run code.
- **Deterministic.** Chance flows through the seeded RNG, so a replay reproduces exactly.
- **Inspectable.** It is plain JSON. The editor renders, validates, and diffs it without executing anything.

## Reading values

Everything readable goes through one mechanism:

```jsonc
{ "ref": "actor.attr.might" }
{ "ref": "actor.inventory.rope", "else": 0 }   // fall back when missing
```

There is deliberately **no** `hasFlag`, `hasItem`, or `hasCondition` operator, because those are ordinary paths:

| Question | Path |
| --- | --- |
| Is a flag set? | `flags.met_vess` |
| How many ropes? | `actor.inventory.rope` |
| Is it burning? | `actor.conditions.burning` |
| Faction standing? | `reputation.wardens` |
| What day is it? | `world.day` |

A missing path **throws** rather than defaulting to zero. Silently returning 0 is the worst failure mode for a data-driven game — the ability just quietly stops working. Add `else` when a path is genuinely optional.

## Expressions

`ref` `add` `sub` `mul` `div` `mod` `neg` `min` `max` `floor` `ceil` `round` `abs` `clamp` `roll` `cond` `concat` `length` `list`

```jsonc
// floor((might - 10) / 2) — the attribute modifier, defined by content
{ "floor": { "div": [{ "sub": [{ "ref": "actor.attr.might" }, 10] }, 2] } }

{ "roll": "2d6+3" }
{ "cond": { "gte": [{ "ref": "actor.hp" }, 10] }, "then": "steady", "else": "failing" }
```

## Predicates

`all` `any` `not` `eq` `ne` `gt` `gte` `lt` `lte` `in` `chance` `exists` `test`

```jsonc
{ "all": [
    { "gte": [{ "ref": "actor.attr.might" }, 14] },
    { "test": { "ref": "flags.met_vess" } },
    { "not": { "exists": "actor.conditions.frightened" } }
] }
```

`all` on an empty list is `true` and `any` is `false`, following the usual identities — so an absent condition list permits by default.

## Effects

`damage` `heal` `applyCondition` `removeCondition` `adjustResource` `setFlag` `grantItem` `removeItem` `adjustReputation` `move` `emit` — plus control flow: `if` `repeat` `forEach` `let`

Effects do not mutate anything. They evaluate to a list of intents the engine validates and applies, which keeps evaluation pure and lets the engine veto an illegal op in one place.

```jsonc
[
  { "damage": {
      "target": { "ref": "target.id" },
      "amount": { "add": [{ "roll": "2d6" }, { "ref": "actor.mod.might" }] },
      "damageType": "fire" } },
  { "applyCondition": { "target": { "ref": "target.id" }, "condition": "burning", "duration": 3 } }
]
```

### Control flow

```jsonc
{ "forEach": {
    "in": { "ref": "enemies" },
    "as": "foe",
    "do": [{ "damage": { "target": { "ref": "foe.id" }, "amount": { "roll": "1d6" } } }]
} }

// `let` binds once, so a single roll applies to both targets
{ "let": {
    "name": "dmg",
    "value": { "roll": "1d6" },
    "in": [
      { "damage": { "target": "a", "amount": { "ref": "dmg" } } },
      { "damage": { "target": "b", "amount": { "ref": "dmg" } } }
    ]
} }
```

`repeat` and `forEach` expose `index`. Bindings do not leak out of the loop body. `repeat` is capped at 10,000 iterations so a malformed module cannot hang the game.

## Dice notation

`1d20` · `2d6+3` · `4d6kh3` (keep highest 3) · `2d20kh1` (advantage) · `2d20kl1` (disadvantage) · `1d8+1d4-1`

Notation is validated at load, so a typo is a load error rather than an exception thrown mid-combat.

## Errors

Every failure carries a path trace, because these messages are read by content authors, not engine developers:

```
"fgte" is not a valid predicate operator (at content.abilities.2.when.fgte)
  → did you mean "gte"?
```

See [validation](validation.md).
