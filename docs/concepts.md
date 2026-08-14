# Concepts

## The engine knows nothing

It ships with no attributes, no hit points, no damage types, no level curve, no dice convention. It reads all of it from your module.

That is not an aesthetic choice — it is what makes the format able to hold a game it was not designed for. `modules/minimal` proves it: attributes named Vigor and Wits, a vital resource called Vitality, a modifier curve of `floor((v-6)/3)`. It runs. If a single fantasy assumption were baked in, it could not.

Practically, this means:

- **Attributes** declare their own modifier formula.
- **Resources** are generalised — hit points and focus are both just resources, and death is `onDepleted` effects on whichever one you nominate as `vitalResource`.
- **Derived stats** (Guard, Initiative) are formulas over attributes and gear.
- **Advantage** is the dice string `2d20kh1`, not an engine special case.

## Everything is addressed by id

Content cross-references by id, and every reference is proven to resolve at load. A typo is a load error, not a crash three rooms into a dungeon. The editor turns these into dropdowns, so most are unauthorable in the first place.

## The world is a hierarchy

**Biome → Area → Point of Interest.**

- A **biome** is a theme: room templates, encounter tables, ambience.
- An **area** is a named place on the map, belonging to a biome, connected to other areas.
- A **point of interest** is somewhere you go: a shrine, a locked door, a camp, a dungeon mouth, a market.

Procedural dungeons hang off a point of interest rather than replacing it, so an authored world and a generated one compose instead of competing.

## Things happen through triggers

A trigger has a repetition mode, and choosing it correctly is most of the work:

| Mode | Behaviour |
| --- | --- |
| `once` | Ever, for this save. |
| `everyEntry` | Fires each time the party arrives. |
| `untilComplete` | Repeats until its completion condition holds, then stops. |
| `loop` | Repeats on a cooldown, forever. |
| `restart` | Resets the location's own state, then fires. |

`remember` decides whether the world records that it happened. With it on, a ransacked shrine stays ransacked across visits. With it off, the event is ambient — mist on the water, a sound across the fen.

## Everyone acts

Player characters are not the only ones who roll dice. Monsters and NPCs carry **reactions** — gated on *their* memory, *their* faction standing, *their* condition:

```jsonc
{ "id": "pack_fury", "on": "allyKilled",
  "effects": [{ "applyCondition": { "target": { "ref": "actor.id" }, "condition": "emboldened" } }] }
```

A hound goes berserk when its packmate dies. A wight recognises whoever robbed its barrow. A miller stops trading because she *heard about* a theft — not because it happened, but because she knows.

## Gating is one vocabulary

See [requirements](requirements.md). Loot by mastery, doors by keys, dialogue by memory, quests by items — the same object everywhere.

## Emergence is a set of dials

See [memory](memory.md). Witnessing, forgetting, gossip, and learning each have knobs, and `mode` decides whether the engine drives, your content drives, or both.

## Determinism

State is fully serializable, RNG included, so `seed + action log` reproduces a run exactly. Sub-streams are derived per purpose — `dungeon:<id>`, `combat:<id>`, `loot:<id>` — so a longer fight can never reshape the dungeon that seed would have generated.

## Modules layer

`extends` plus a merge-by-id layer means a pack can ship twelve monsters instead of forking a game:

```jsonc
{ "id": "more_husks", "extends": "greenmarch@0.1.0",
  "content": { "monsters": [{ "id": "husk", "xp": 25 }] } }
```

Entries merge by id, not position — an id that exists is overridden field by field, a new one is appended. Saves record the module id, version, and content hash they were made against.
