# Mods

A mod extends, fixes, or replaces what the engine or the studio already does.
Mods are **not** packaged with a game: a game names the ones it needs, and the
mods themselves are shared and installed independently.

```
mods/
  engine/<id>-<hash>/     changes how a game plays
  editor/<id>-<hash>/     changes how a game is authored
```

The folder name is the mod's address, and `mod.json` must agree with it.
`npm run mod -- hash <dir>` recomputes the content tag, writes it into the
manifest, and renames the folder to match — run it after every change.

| Command | What it does |
|---|---|
| `npm run mod -- hash <dir>` | Re-stamp and rename a mod |
| `npm run mod -- check` | Validate every installed mod |
| `npm run mod -- pack <dir>` | Write a single-file bundle to share |

A packed bundle and the folder it came from hash **identically**, so a game
pinned against one is satisfied by the other.

## What a mod may do

Anything. Invincibility, one-hit kills, rewriting combat, adding a verb the
engine has never heard of — all supported, none special-cased. This is a D&D
engine, not a rules referee, and arbitrary limits here would only limit the
engine.

Two things *are* enforced, and neither is a game rule:

- **Determinism.** `Date` and `Math.random` do not exist inside a mod. The only
  entropy is `dm.random()`, which draws from a generator derived off game state,
  so a run reproduces exactly on replay. Values that would break replay —
  `NaN`, `Infinity` — are refused, because `JSON.stringify` turns them into
  `null` and a save carrying one would compare equal to a save that behaves
  differently.
- **Containment.** A mod that throws, hangs, or returns nonsense produces a
  `modError` event and the turn continues. It cannot take the session down, and
  it cannot hang the tab.

Mods run inside QuickJS (WebAssembly): a separate heap, no DOM, no `fetch`, no
filesystem. That is a **security** boundary, not a gameplay one — it protects
the player's browser from a mod they downloaded, and it is the only thing that
does. The content hash identifies a version; it authenticates nothing.

## Writing an engine mod

`mod.json` declares which hooks the mod attaches to. Declaration is required —
the runtime indexes it before evaluating any code, which is what keeps the hot
path a set lookup instead of a sandbox crossing.

```json
{
  "id": "thorns",
  "target": "engine",
  "version": "1.0.0",
  "hash": "0000000000000000",
  "meta": { "title": "Thorns" },
  "entry": "main.js",
  "hooks": [
    { "hook": "applyOp", "mode": "replace", "match": "gainThorns" },
    { "hook": "action.before", "mode": "before", "match": "rest" }
  ],
  "systemText": { "thorns.tooSharp": "Too many thorns ({stacks}) to rest." }
}
```

`main.js` registers handlers:

```js
dm.hook('applyOp', (ctx) => {
  const held = ctx.self.stacks || 0;
  return [{ kind: 'modState', key: 'stacks', value: held + 1 }];
});
```

### Hooks

| Hook | When | `match` narrows by |
|---|---|---|
| `action.before` | Before the action is handled. `replace` skips it entirely | action type |
| `action.after` | After the action, before the world settles | action type |
| `applyOp` | An effect op the engine does not implement | op name |
| `occasion` | An occasion or custom event fires | occasion / event |
| `settle.after` | Perception, combat, and AI have resolved | — |
| `time.after` | The world clock advanced | — |
| `trigger.shouldFire` | A module trigger is deciding | occasion |
| `passives` | An entity's passives are evaluated | — |
| `reactions` | A creature may react | trigger |
| `event.emit` | An event is emitted. **`match` is mandatory** | event type |

`mode` is `before`, `after`, or `replace`. A `replace` handler stands in for the
core implementation; returning `{ kind: 'core' }` runs it after all — override
with super. When two mods replace the same hook, the higher `priority` wins and
the loser is reported, never silently skipped; if the game requires both, that
is an error rather than a coin flip.

`applyOp` is the highest-value hook: the branch already existed to refuse
unknown ops, so a mod can add a genuinely new effect op — usable from module
JSON, editable in the studio — with no core change at all.

### The `dm` API

```js
dm.hook(name, handler)   // register; must match a manifest declaration
dm.random()              // deterministic entropy
dm.state.get(path)       // 'entities', 'flags.x', 'module.content.monsters.<id>'
dm.log(message)          // diagnostics
```

A handler receives `{ hook, mode, now, selected, subject, self }`, where `self`
is this mod's own state bag. State is **pulled** one path at a time rather than
handed over whole — serializing the world for every hook would make mods
unusable.

### Directives

```js
{ kind: 'ops',      ops: [...] }        // through applyOps, like the DSL
{ kind: 'patch',    patches: [...] }    // write anywhere in GameState
{ kind: 'event',    event, data }       // a custom game event
{ kind: 'refuse',   action, textKey }   // refuse, in the mod's own words
{ kind: 'modState', key, value }        // this mod's own bag
{ kind: 'core' }                        // replace-mode: run core after all
```

`patch` is the unrestricted one. `ops` is the polite path — validated, clamped,
and immunity-checked on the way through.

## Writing an editor mod

Editor mods add fields, validation, bulk actions, and panels. Mod code has no
DOM, so a panel is **described** and the studio draws it.

| Hook | Returns |
|---|---|
| `editor.fields` | Extra fields on the current selection |
| `editor.lint` | Diagnostics, shown beside the engine's own |
| `editor.commands` | Named actions, and the patches they apply |
| `editor.panel` | A widget tree: text, tables, buttons |

**The limit, stated plainly:** this covers extra fields, tables, buttons, and
text. It cannot express a canvas, a map overlay, a graph, drag-and-drop, or
per-keystroke feedback. A mod wanting those needs a core editor change.

Editor fields normally write into an entry's `extra` bag, which the schema
already allows. That is what makes a paired mod work without a format change:
`mods/editor/morale_studio-*` adds a Morale field, `mods/engine/morale-*` reads
it during play, and a module carrying the value still compiles and still hashes
stably for someone who has neither.

## Requiring a mod from a game

```json
"mods": [
  { "id": "thorns", "hash": "914d347738948991", "required": true,
    "note": "The barrow rules depend on it." }
]
```

- **Missing and required** → play is blocked, naming the mod and your note.
- **Hash mismatch** → a loud warning, and play continues. The hash lives in a
  file anyone can edit, so blocking would only teach people to edit the hash.
- **Optional** → the player can toggle it.

The `mods` section is part of the module hash, so re-pinning a mod shows up as
drift on an old save. Saves record the module hashes they have been written
under as an **append-only lineage**, plus the mods that were active — so a
broken save can say which version broke it.

## One turn, traced end to end

What actually happens when a bog hound bites you while you are standing in
briar. Every step below is real code you can go and read.

**1. The engine emits an event.** `applyOps` resolves the damage and calls
`txn.emit({ type: 'damaged', entity: 'e:1', amount: 3, ... })`.

**2. The gate.** `Transaction.emit` asks `mods.has('event.emit', 'damaged')`.
That is a `Set` lookup over what the manifests declared — no allocation, no
sandbox crossing. If no mod named `damaged`, this is where it stops. Thorns
declared `{ "hook": "event.emit", "match": "damaged" }`, so it continues.

**3. The crossing.** The runtime serializes a small payload — the event, the
world clock, who is selected, and thorns' own state bag — and calls into
QuickJS. About 15 µs.

**4. The mod decides.** `thorns` checks two things:

```js
if (event.entity !== ctx.selected) return null;   // not your problem
if (!standingInBriar(event.entity)) return null;  // not in the briar
```

`standingInBriar` pulls two values back across the boundary with
`dm.state.get` — the entity, then its map's tiles — and indexes
`tiles[y * width + x]`. **State is pulled one path at a time**, never handed
over whole; serializing the world per hook would make mods unusable.

**5. The mod returns requests, not mutations.**

```js
return [
  { kind: 'modState', key: 'stacks', value: 2 },
  { kind: 'say', textKey: 'thorns.caught', params: { stacks: 2 } },
  { kind: 'event', event: 'thornCaught', data: { stacks: 2 } },
];
```

**6. The engine applies them.** `modState` is checked for JSON-safety (a `NaN`
here would compare equal to a save that behaves differently) and size, then
written under `modState.thorns` — a mod can only write beneath its own id.
`say` resolves `thorns.caught` against **this mod's** `systemText`,
interpolates `{stacks}`, and emits `modSay`. `event` becomes an ordinary
`custom` event that triggers and quests can watch.

**7. The narrator speaks.** `narrateEvent` renders `modSay` as a transcript
line: *"The briar takes its price — a barb catches and stays in. (2 in you
now.)"*

**8. Later, you try to rest.** `reduce` asks
`mods.has('action.before', 'rest')`, crosses, and thorns returns
`{ kind: 'refuse', textKey: 'thorns.tooSharp' }` because you are carrying
three. The turn short-circuits and the refusal — again in the mod's own words —
lands in the transcript.

**9. You wait.** `action.after` fires, one thorn comes out, and the count in
the Mods panel drops.

Nothing in that path is special-cased for `thorns`. The same route carries any
mod, and every step is a place where a failure becomes a `modError` event
rather than a broken session.

## The fixtures

`thorns` (engine) exercises every directive kind. `morale` + `morale_studio`
are the paired example: one authors a value, the other makes it mean something.
Both are loaded by the test suite, so they cannot rot.
