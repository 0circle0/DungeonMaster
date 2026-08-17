# Validation

A module is hand-edited JSON, so validation is the main tool you use. Every diagnostic answers three questions: **where**, **what**, and **why**.

```bash
npm run validate -- modules/greenmarch
```

Exits non-zero on error, so it works as a CI gate. The editor's problems panel runs the exact same checks.

## What it catches

### Syntax

A dedicated JSON parser, not `JSON.parse` — so errors carry a line, a column, and the offending line with a caret:

```
error 19:78  unexpected end of file: this object is never closed
   19 |       { "id": "endurance", "name": "Endurance", "modifier":
      |                                                             ^
   → add a matching }
```

It recognises the mistakes people actually make: missing braces and brackets, trailing commas, single quotes, missing commas, unquoted values, invalid escapes, and **comments** — which are not JSON, but which everyone writes anyway.

### Typos, with suggestions

```
error 467:11  "fgte" is not a valid predicate operator
      content.abilities.2.when.fgte
   → did you mean "gte"?
```

Suggestions use Damerau-Levenshtein distance (transposition counts as one edit, because `teh` → `the` is the typo people make). They cover DSL operators, property names, enum values, and dangling references:

```
error 807:9  "fen_scavange" does not exist in content.lootTables
   → did you mean "fen_scavenge"?
```

When nothing is close enough, it declines to guess and lists the valid options instead. A confident wrong suggestion sends you to the wrong place.

### Structure

Missing required fields, wrong types, unknown properties, duplicate ids, and every cross-reference — a monster's loot table, a class's starting weapon, a quest's giver. Reference integrity is proven before play begins, so a typo is a load error rather than a crash three rooms into a dungeon.

### Semantics — warnings

Problems a schema cannot catch:

| Code | Meaning |
| --- | --- |
| `unreachable_area` | No path of connections reaches it from the start |
| `impassable_gate` | No requirement, bypass, or opening ability — nothing behind it is reachable |
| `unobtainable_quest` | No giver, not offered by an NPC, not unlocked, not auto-starting, and no `emit: startQuest` for it |
| `unlearnable_lore` | No `learnLore` effect anywhere teaches it, so it can never be known |
| `orphan_poi` | Its area does not exist, so it never appears |
| `thin_text_pool` | Too few phrasings; players will notice the repetition |

These are warnings, not errors — half-connected content is normal while building.

## How to read the output

Diagnostics are ordered errors first, then by line. Each has a stable `code` you can filter on.

Passes stop where continuing would be noise. A document that does not parse cannot be schema-checked; a document that fails the schema will produce meaningless reference results. Fix the top error first and re-run — later problems often disappear with it.

## In the editor

The problems panel shows the same diagnostics with the same line numbers. Line numbers refer to the document **as it would be exported**, which is exactly what the Raw JSON view shows — so a reported line is somewhere you can actually go and look.
