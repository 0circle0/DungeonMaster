# DungeonMaster

A text RPG where **an entire game is a JSON document**. Rules, skills, classes, monsters, worlds, and quests are authored as JSON, shared as JSON, and gameplay is derived from it.

This is not a game with data files bolted on — it is a *runtime for a game module*. The reference fantasy campaign is simply the first module that ships.

## The three rules everything follows from

1. **Nothing is hardcoded.** The engine ships with no attributes, damage types, conditions, or level curve of its own. It reads them from the module. `modules/minimal` exists to prove this: its attributes are Vigor and Wits, its vital resource is Vitality, and if the engine has baked in a single assumption about what a character is made of, that module fails to run.
2. **The core is pure.** `reduce(state, action) → { state, events }` is the only path that mutates state. No I/O, no `Date.now()`, no `Math.random()`, no Node APIs — which is what keeps a browser play surface a later UI layer rather than a rewrite.
3. **The engine emits events, never prose.** A narrator turns `Event[]` into text, so swapping templates for an LLM, or one front end for another, touches no rules code.

State is fully serializable *including RNG state*, so `seed + action log` reproduces a run exactly.

## Packages

| Package | Role |
| --- | --- |
| `packages/core` | Seeded RNG, dice, ids. No game concepts. |
| `packages/module` | Schemas, the behaviour DSL, and the compiler. The source of truth for what a game *is*. |
| `packages/engine` | Rules, world, simulation, narration. Isomorphic — no Node APIs. |
| `packages/play` | The play surface every front end shares: session, parser, affordances, view models. Isomorphic — no Node APIs. |
| `packages/mods` | The mod format and its sandbox: manifests, content hashing, resolution, the QuickJS host. Isomorphic — no Node APIs. |
| `packages/tools` | Dev tooling: port-freeing and project-coverage checks. Imported by nothing; npm runs it. |
| `apps/play` | Browser play: click-first, command bar kept. |
| `apps/editor` | The authoring studio. |
| `apps/site` | The documentation site: the format field by field, the engine, and the studio. |
| `modules/` | Game modules. `minimal` is the no-hardcoding proof. |
| `modules/shared` | `dmkit`, the Python API a world of any size is authored against. Not a module — no `module.json` — see [modules/shared/README.md](modules/shared/README.md). |
| `pyrightconfig.json` | Editor/`npx pyright` search paths for the module generators. Type checking off; missing imports and undefined names are errors. |
| `mods/` | Installed mods, `engine/` and `editor/`. Not packaged with any game — see [mods/README.md](mods/README.md). |

## The DSL

Data cannot express behaviour, so one small JSON language covers everything that needs logic — ability effects, item procs, trap triggers, dialogue gates, loot rules, quest objectives:

```jsonc
{ "when": { "all": [ { "gte": ["actor.attr.might", 14] },
                     { "test": { "ref": "flags.met_vess" } } ] },
  "then": [ { "damage": { "target": { "ref": "target.id" },
                          "amount": { "roll": "2d6" }, "damageType": "fire" } },
            { "applyCondition": { "target": { "ref": "target.id" },
                                  "condition": "burning", "duration": 3 } } ] }
```

It is sandboxed (no `eval`), deterministic (chance flows through the injected RNG), and inspectable — the editor can render and validate it without executing anything.

Reads go through one mechanism: `{ "ref": "actor.attr.might" }` walks the scope the engine supplies. There is deliberately no `hasFlag` / `hasItem` primitive, because those are just paths.

## Playing it

```bash
npm run play          # http://localhost:4500
```

Click a tile to walk there, a creature to attack it, a person to talk; the
buttons under the map are what you can do right now, drawn from the engine's
own affordance list. The command bar stays for everything else, suggesting as you type from
the same tables the parser matches against — so it can never offer a line the
parser would reject. An ambiguous target ("two bog hounds") opens a picker with
positions instead of an unanswerable error.

The app reads the same `modules/` directory the editor writes, so a module
exported from the studio opens directly via **Open…**.

## The editor

```bash
npm run editor        # http://localhost:4400
```

Loads a JSON module, gives full control over the system and the story, and exports a module. The layout is game-engine-style: a world tree and collection tabs on the left, a tabbed viewport in the centre whose map previews are **seed-faithful** — they call the real engine generators with the same rng derivations a new game uses, so what the viewport draws for seed N is what a player starting with seed N walks into — an inspector on the right, and a problems console below.

Its navigation, forms, and validation are **generated from the Zod schemas** rather than hand-written per content type. Add a field to `packages/module` and it appears in the editor, correctly typed and validated, with no UI change — the editor cannot drift out of sync with what the engine accepts.

Three things worth knowing:

- **`ref:` fields become dropdowns** of the ids that actually exist. Dangling references are the failure the compiler works hardest to catch, and this makes them close to unauthorable.
- **Validation is the real compiler.** The problems panel runs the same diagnostics as `npm run validate` — so "valid here" means "will load at play time". Errors carry a line, a column, and a suggestion.
- **Export is what you authored.** Validation runs on a copy, so the exported file never gains the schema defaults compilation fills in. A 200-line module stays 200 lines. Formatting is normalized by re-serialization; content is preserved exactly.

### Views

| View | What it answers |
| --- | --- |
| **World map** | Biome → area → place, with gates and triggers in context |
| **Events** | When, where, who, what, why — everything that can fire, in one table |
| **Balance** | What a table can produce, and what it will produce for a given party |
| **Dialogue graph** | Which lines are reachable, which branches loop, which endings are dead |
| **Timeline** | Who knows what, on which day, and how garbled |
| **Used by** | What points at this entry — shown beside every one |

The DSL is edited as JSON rather than through generated widgets, since effects and predicates are recursive unions that a generic form renders badly.

## Mods

A mod extends, fixes, or replaces what the engine or the studio does — added by
someone who is not editing this repository, and shared with other players. Mods
live in `mods/`, never inside a game: a game *names* the ones it needs, and the
mods are installed separately.

```json
"mods": [
  { "id": "thorns", "hash": "914d347738948991", "required": true,
    "note": "The barrow rules depend on it." }
]
```

A mod ships real JavaScript, run inside QuickJS (WebAssembly) — a separate heap,
no DOM, no `fetch`, no filesystem. That is a **security** boundary, not a
gameplay one: mods are downloaded from strangers, and the sandbox is the only
thing protecting the player's browser. What a mod may do to the *game* is
unrestricted — invincibility, one-hit kills, rewriting combat, adding effect ops
the engine has never heard of. The engine is not a rules referee.

Two properties are enforced, and neither is a game rule. **Determinism**:
`Date` and `Math.random` do not exist inside a mod, and `dm.random()` draws from
a generator derived off game state, so rule 2 above still holds with mods
loaded. **Containment**: a mod that throws, hangs, or returns nonsense becomes a
`modError` event and the turn continues.

Identity is `<id>-<hash>`, which is also the folder name, so several versions of
one mod coexist. A game pins the hash it was authored against: a **missing
required** mod blocks play, while a **hash mismatch warns and plays anyway** —
the hash sits in a file anyone can edit, so blocking would only teach people to
edit the hash. Saves record their module-hash lineage and the active mod set, so
a broken save can say which version broke it.

[mods/README.md](mods/README.md) is the authoring guide: the hook table, the
`dm` API, directives, and the editor-side widget model with its limits.

## Commands

```bash
npm run check                       # projects + typecheck + lint + tests, the one to run
npm test                            # unit + replay tests
npm run typecheck                   # strict TypeScript across every file, tests included
npm run lint                        # type-aware ESLint  (--fix on `npm run lint:fix`)
npm run validate -- modules/minimal # schema, reference integrity, content lints
npm run schema                      # emit JSON Schema for the editor and VS Code
npm run editor                      # the authoring UI   (build: editor:build)
npm run play                        # the browser game   (build: play:build)
npm run mod -- check                # validate every installed mod
npm run mod -- hash mods/engine/x   # re-stamp a mod's content hash and folder
```

`validate` exits non-zero on failure, so it works as a CI gate:

```
✗ modules/broken — 2 error(s)
  content.classes[0].startingItems[0].item: "ghost_item" does not exist in content.items [dangling_ref]
  content.monsters[0].loot: "no_such_table" does not exist in content.lootTables [dangling_ref]
```

Every reference is proven to resolve before play begins, so a typo is a load error rather than a crash three rooms into a dungeon.

## Status

| # | Milestone | State |
| --- | --- | --- |
| Foundation | DSL, schemas, compiler, diagnostics, RNG | **done** |
| Editor | Schema-generated forms, validation, world map, events, balance, timeline | **done** |
| E1–E2 | Space in the schema; grid, FOV, pathfinding | **done** |
| E3 | Engine spine — events, actions, `reduce`, effects, conditions, save | **done** |
| E4 | Resolution & combat — checks, attacks, initiative, reactions, AI | **done** |
| E5 | World generation — dungeons, locks and keys, population | **done** |
| E6 | Exploration & narrative — gates, triggers, quests, dialogue, deeds | **done** |
| E7 | Living world — gossip, forgetting, faction drift, learning | **done** |
| E8 | Narrator & parser — prose, verb parser, save/load | **done** |

| Items | Floor loot, take/drop, equipment slots, consumables | **done** |
| Parity | Editor previews call the engine's own draws | **done** |
| Creation | Point-buy screen driven by the module's own costs | **done** |
| Retreat | `flee` and `leave`, with parting blows and escape | **done** |
| Perception | Sight, hearing and smell as declared senses; scent trails, stances, investigation | **done** |
| Play surface | `@dm/play` — shared session, affordances, view models; isomorphic and enforced | **done** |
| Browser UI | `apps/play` — click-first map, context bar, autocomplete, journal, saves | **done** |

The game is playable: `npm run play`, then open `modules/greenmarch`. The party
can be rolled by hand — the ancestries, classes, budget, and price of each
score all come from the module, so a different ruleset gets a different screen
with no code change.

Creatures perceive rather than simply know. Senses are declared in the module —
greenmarch gives its creatures sight, hearing and smell — and each one carries a
signal that fades with distance, stops at whatever the module says stops it, and
in the case of smell lingers on the ground as a trail that can be followed to
where you *went*. Noticing something, walking over to look at it, and attacking
it are three separate thresholds, so a bog hound can catch your scent across the
fen and come to investigate without a fight starting. How you move decides what
hears you: `sneak`, `walk`, `dash`.

Running away is movement rather than an exit: `flee` spends the whole movement
allowance backing away, adjacent enemies take their parting blow, and the fight
ends only once neither side can see the other — judged at the top of a round, so
pursuers get their chance to give chase.

## Tooling

Every `.ts` and `.tsx` file in the repo belongs to a TypeScript project, tests
and `vitest.config.ts` included. This matters more than it sounds: files outside
every project land in the editor's *inferred* project, which has no path
mappings and no Node types, so they light up red while `npm run typecheck`
passes — twenty-one files were in that state, and bringing them in immediately
surfaced a test calling `enterPoi` with four arguments where it takes six.

| Config | What it is for |
| --- | --- |
| `tsconfig.base.json` | The strict options every project shares |
| `tsconfig.json` | Everything — the editor's default and what `typecheck` runs |
| `packages/*/tsconfig.json` | Per package, so the editor resolves each file locally |
| `packages/engine/tsconfig.isomorphic.json` | Engine source with **no Node types**, which is what keeps the engine browser-ready |

`npm run check:projects` enforces it: a file that drifts out of every project
fails the build instead of only showing up as red underlining on someone's
screen. `.vscode/settings.json` points the editor at the TypeScript in
`node_modules`, because the workspace packages export TypeScript source rather
than built output and older compilers resolve that differently — an editor
running its own bundled TypeScript can report a module as having no exports
while `tsc` resolves it perfectly.

`eslint.config.js` is type-aware and deliberately small. Rules are there because
they caught something real or because they guard a decision already made — the
engine's isomorphism is enforced by a lint rule as well as by a compiler flag,
so the reason appears at the line rather than in a config file. Rules that fired
mostly on correct code were measured and removed, with the count and the reason
written down beside them.

## Local note

`node` here is the snap build, which points its stdout at `/dev/null` when not attached to a terminal. It works normally in an interactive shell; scripted runs need a pty (`script -qc "npm test" /dev/null`).
