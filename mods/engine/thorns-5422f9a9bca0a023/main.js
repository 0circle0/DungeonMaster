/**
 * Thorns.
 *
 * Taking a wound **while standing in briar** leaves thorns in you. Three or
 * more and you cannot settle enough to rest; waiting picks one out.
 *
 * The briar check is the point. An earlier draft of this mod claimed briar in
 * its description and counted every wound anywhere, which made the fiction a
 * lie and the mechanic impossible to reason about. It now reads the terrain
 * under your feet, so getting bitten on dry stone costs you nothing.
 *
 * It also happens to use every hook and directive kind the mod system has,
 * which is why the test suite drives this mod rather than a synthetic one — a
 * fixture that is also a real feature cannot quietly stop making sense.
 */

/** Thorns at or above this and rest is off the table. */
const TOO_MANY = 3;

/** The terrain that does it. Anything tagged thorny would do; this is greenmarch's. */
const THORNY = 'briar';

function held(ctx) {
  return typeof ctx.self.stacks === 'number' ? ctx.self.stacks : 0;
}

/**
 * Is the given entity standing in briar?
 *
 * `TileMap` is a flat row-major array of terrain ids, so the tile under a
 * position is `tiles[y * width + x]` — the same arithmetic `terrainAt` does
 * inside the engine.
 */
function standingInBriar(entityId) {
  const entity = dm.state.get('entities.' + entityId);
  if (!entity || !entity.position) return false;

  const map = dm.state.get('maps.' + entity.map + '.tiles');
  if (!map || !map.tiles || !map.width) return false;

  const { x, y } = entity.position;
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;

  return map.tiles[y * map.width + x] === THORNY;
}

/**
 * A wound taken in the briar leaves something behind.
 *
 * `event.emit` has to name the event type it wants — an unfiltered declaration
 * would put a sandbox crossing on every event in the game — so this is
 * declared `match: "damaged"` and is never consulted for anything else.
 */
dm.hook('event.emit', (ctx) => {
  const event = ctx.subject.event;

  // Only what the player is controlling: a hound bleeding in the same thicket
  // is not something the party has to pick out later.
  if (event.entity !== ctx.selected) return null;
  if (!standingInBriar(event.entity)) return null;

  const next = held(ctx) + 1;
  return [
    { kind: 'modState', key: 'stacks', value: next },
    { kind: 'say', textKey: 'thorns.caught', params: { stacks: next }, tone: 'prose' },
    { kind: 'event', event: 'thornCaught', data: { stacks: next } },
  ];
});

/** Carrying too many, and you cannot settle. */
dm.hook('action.before', (ctx) => {
  const stacks = held(ctx);
  if (stacks < TOO_MANY) return null;

  // The refusal reads in this mod's own words: every key here is resolved from
  // this mod's `systemText`, not from the engine's table.
  return [{ kind: 'refuse', action: 'rest', textKey: 'thorns.tooSharp', params: { stacks: stacks } }];
});

/** Waiting picks one out — the way back down. */
dm.hook('action.after', (ctx) => {
  const stacks = held(ctx);
  if (stacks <= 0) return null;

  const next = stacks - 1;
  return [
    { kind: 'modState', key: 'stacks', value: next },
    {
      kind: 'say',
      textKey: next === 0 ? 'thorns.lastOut' : 'thorns.pulled',
      params: { stacks: next },
      tone: 'prose',
    },
    { kind: 'event', event: next === 0 ? 'thornsClear' : 'thornPulled', data: { stacks: next } },
  ];
});

/**
 * `pluckThorns`, an effect op the engine has never heard of.
 *
 * Declared `replace`, so this stands in for the engine's unknown-op refusal.
 * Any module's JSON can use `{ "op": "pluckThorns", "amount": 2 }` now — from
 * an item, a trigger, a dialogue node — with no core change at all.
 */
dm.hook('applyOp', (ctx) => {
  const op = ctx.subject.op;
  const by = typeof op.amount === 'number' ? op.amount : 1;
  const next = Math.max(0, held(ctx) - by);
  return [
    { kind: 'modState', key: 'stacks', value: next },
    { kind: 'say', textKey: 'thorns.lastOut', params: { stacks: next }, tone: 'prose' },
    { kind: 'event', event: 'thornsClear', data: { stacks: next } },
  ];
});

/** Resting is when you would notice them all gone. */
dm.hook('occasion', (ctx) => {
  if (ctx.subject.occasion !== 'rest') return null;
  return [{ kind: 'modState', key: 'lastRest', value: ctx.now.minute }];
});
