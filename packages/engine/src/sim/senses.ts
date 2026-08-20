/**
 * Perception.
 *
 * One question — *can this creature perceive that?* — asked in one place, so
 * that combat entry, target selection, witnessing a crime, and describing a
 * room all answer it the same way. Before this existed the answer was written
 * out four separate times and the four did not agree: a creature would notice
 * you at twelve tiles, target you at any distance, be described at ten, and be
 * drawn at eight.
 *
 * Everything here reduces to a single number: **signal strength at the
 * observer**, between zero and one. Thresholds, not ranges, decide what that
 * number means, which is what lets a cold trail be *weak at close range* —
 * something no radius can express.
 *
 * The engine names no sense. Sight, hearing and smell are whatever the module
 * calls them, and a module that declares none gets one nameless implicit sense
 * that reproduces the engine's original behaviour exactly.
 */

import type { CompiledModule, SystemTextKey } from '@dm/module';
import type { Entity, EntityId, GameState, Mark, Alert } from '../state.js';
import type { Position, TileMap } from '../grid/tiles.js';
import { TerrainIndex, key as packKey, neighbours, inBounds } from '../grid/tiles.js';
import { fieldOfView } from '../grid/fov.js';
import { hasLineOfSight } from '../grid/fov.js';
import { distance } from '../grid/geometry.js';
import { toTiles } from '../rules/combat/targeting.js';
import { notices as registers, temperamentOf } from './temperament.js';
import { conditionsInForce } from '../rules/implied.js';
import type { Transaction } from '../rules/apply.js';

/** How a signal gets from there to here. */
export type Propagation = 'line' | 'field';

/** What stops it on the way. */
export type Barrier = 'opaque' | 'impassable' | 'nothing';

/** How it weakens with distance. */
export type Falloff = 'cliff' | 'linear';

/** How much signal is enough to do what. */
export type Threshold = 'detect' | 'investigate' | 'aggro';

/**
 * A sense with every default resolved and every distance already in tiles.
 *
 * Built once per module and cached, the way `TerrainIndex` is, because
 * resolving it touches several collections and it is read on every perception
 * query.
 */
export interface SenseDef {
  readonly id: string;
  readonly propagation: Propagation;
  readonly blockedBy: Barrier;
  readonly falloff: Falloff;
  /** Baseline reach in **tiles**, converted from module units exactly once. */
  readonly range: number;
  /** Conditions this sense works through anyway, e.g. blindsight and blinded. */
  readonly ignores: readonly string[];
  /** Minutes a trace stays perceptible. Zero means this sense leaves none. */
  readonly lingerMinutes: number;
  /** Tiles a lingering trace spreads outward per minute as it thins. */
  readonly spreadPerMinute: number;
  /** Signal kept once it has spread: the same scent over more ground. */
  readonly spreadRetention: number;
  /** Minutes a percept stays remembered. Zero means it is forgotten at once. */
  readonly rememberMinutes: number;
  /** What noticing something this way reads like, strong and faint. */
  readonly impressionTextKey: string | null;
  readonly faintImpressionTextKey: string | null;
  /** What using this sense deliberately reads like when it finds nothing. */
  readonly emptyTextKey: string | null;
  /** Signal needed to notice, to go and look, and to fight. Ordered. */
  readonly detect: number;
  readonly investigate: number;
  readonly aggro: number;
}

/**
 * Structurally what `TargetingContext` already is, declared here so perception
 * does not depend on combat. Existing callers pass theirs unchanged.
 */
export interface PerceptionContext {
  readonly module: CompiledModule;
  readonly state: GameState;
  readonly terrain: TerrainIndex;
}

/**
 * The sense a module gets when it declares none.
 *
 * `defaultRange` is the schema's own default of 60 module units, which at the
 * fallback tile size of 5 is twelve tiles — the constant this engine used
 * before any of it was declarable. A cliff falloff yields one inside that reach
 * with a clear line and zero otherwise, so `strength > 0` is exactly the old
 * `hasLineOfSight(...) && distance(...) <= 12`.
 *
 * The id is empty rather than "sight" on purpose: naming it would put a game
 * concept in the engine, which is the one thing this codebase does not do.
 */
const IMPLICIT_RANGE_UNITS = 60;

function implicitSense(module: CompiledModule): SenseDef {
  return {
    id: '',
    propagation: 'line',
    blockedBy: 'opaque',
    falloff: 'cliff',
    range: toTiles(module, IMPLICIT_RANGE_UNITS),
    ignores: [],
    lingerMinutes: 0,
    spreadPerMinute: 0,
    spreadRetention: 0.5,
    rememberMinutes: 0,
    impressionTextKey: null,
    emptyTextKey: null,
    faintImpressionTextKey: null,
    detect: 0,
    investigate: 0,
    aggro: 0,
  };
}

/** A sense exactly as the module wrote it, before defaults are resolved. */
interface DeclaredSense {
  id: string;
  defaultRange: number;
  ignores: string[];
  propagation: Propagation;
  blockedBy: Barrier;
  falloff: Falloff;
  lingerMinutes: number;
  spreadPerMinute: number;
  spreadRetention: number;
  rememberMinutes: number;
  impressionTextKey?: string;
  faintImpressionTextKey?: string;
  emptyTextKey?: string;
  thresholds: { detect: number; investigate: number; aggro: number };
}

const senseCache = new WeakMap<CompiledModule, readonly SenseDef[]>();

/** Every sense the module declares, in declaration order — or the implicit one. */
export function sensesOf(module: CompiledModule): readonly SenseDef[] {
  const cached = senseCache.get(module);
  if (cached) return cached;

  const declared = module.all<DeclaredSense>('rules.senses');
  const resolved: readonly SenseDef[] = declared.length === 0
    ? [implicitSense(module)]
    : declared.map((sense) => ({
        id: sense.id,
        propagation: sense.propagation,
        blockedBy: sense.blockedBy,
        falloff: sense.falloff,
        // Converted from module units to tiles once, here, so nothing
        // downstream has to remember which it is holding.
        range: toTiles(module, sense.defaultRange),
        ignores: sense.ignores,
        lingerMinutes: sense.lingerMinutes,
        spreadPerMinute: sense.spreadPerMinute,
        spreadRetention: sense.spreadRetention,
        rememberMinutes: sense.rememberMinutes,
        impressionTextKey: sense.impressionTextKey ?? null,
        faintImpressionTextKey: sense.faintImpressionTextKey ?? null,
        emptyTextKey: sense.emptyTextKey ?? null,
        detect: sense.thresholds.detect,
        investigate: sense.thresholds.investigate,
        aggro: sense.thresholds.aggro,
      }));

  senseCache.set(module, resolved);
  return resolved;
}

/** One sense by id, or undefined. */
export function senseOf(module: CompiledModule, id: string): SenseDef | undefined {
  return sensesOf(module).find((sense) => sense.id === id);
}

/**
 * How far this creature reaches with this sense, in tiles.
 *
 * Mirrors how `speedOf` resolves movement: the creature's own declaration
 * first, the rule's default behind it, so there is one pattern for "a creature
 * overrides a rules default".
 */
export function rangeOf(
  context: PerceptionContext,
  observer: Entity,
  sense: SenseDef,
): number {
  const module = context.module;

  // The creature's own declaration first, the sense's default behind it.
  // A monster's statblock wins over its ancestry, since a statblock is the more
  // specific statement about that particular creature.
  const sources = [
    observer.statblock
      ? module.find<{ senses?: Record<string, number> }>('content.monsters', observer.statblock)
      : undefined,
    observer.ancestry
      ? module.find<{ senses?: Record<string, number> }>('content.ancestries', observer.ancestry)
      : undefined,
  ];

  // Shut off entirely by something the creature is under, unless this sense is
  // the kind that does not care. Checked here because every use of a sense's
  // reach comes through this function, so there is one place to close it.
  if (senseSuppressed(module, observer, sense)) return 0;

  for (const source of sources) {
    const declared = source?.senses?.[sense.id];
    if (declared !== undefined) return toTiles(module, declared);
  }

  return sense.range;
}

/**
 * Whether anything the creature is under closes this sense.
 *
 * The two halves have to be read together. A condition names the senses it
 * shuts off; a sense names the conditions it works through anyway. `ignores`
 * shipped on its own for a long time, which made it an exception to a rule
 * nobody had written -- blindsight ignored a blindness that was never applied
 * to it in the first place.
 */
export function senseSuppressed(
  module: CompiledModule,
  observer: Entity,
  sense: SenseDef,
): boolean {
  for (const id of conditionsInForce(module, observer)) {
    if (sense.ignores.includes(id)) continue;
    const condition = module.find<{ suppressesSenses?: string[] }>('rules.conditions', id);
    if (condition?.suppressesSenses?.includes(sense.id)) return true;
  }
  return false;
}

/**
 * How strongly a signal from `from` reaches `observer`.
 *
 * The single place propagation, barriers and falloff are applied; everything
 * else in this module composes this one function. Distance is measured the way
 * movement is, so perception and reach agree tile for tile.
 */
export function signalAt(
  context: PerceptionContext,
  sense: SenseDef,
  observer: Entity,
  from: Position,
  emission: number,
  options: { readonly since?: number } = {},
): number {
  if (emission <= 0) return 0;

  const map = context.state.maps[observer.map];
  if (!map) return 0;

  const reach = rangeOf(context, observer, sense);
  if (reach <= 0) return 0;

  // How far the signal actually had to travel. A `line` sense measures the way
  // movement does; a `field` sense measures the way water finds a drain, which
  // is why a smell reaches around a corner and a shout does not.
  let travelled: number;

  if (sense.propagation === 'field') {
    const spread = fieldDistances(context, sense, observer, reach);
    const reached = spread.get(packKey(from));
    if (reached === undefined) return 0;
    travelled = reached;
  } else {
    travelled = distance(observer.position, from);
    if (travelled > reach) return 0;

    // Measured on the observer's own map, so a creature can never perceive
    // through the geometry of somewhere it is not standing.
    if (sense.blockedBy !== 'nothing' && !clearLine(context, sense, map, observer.position, from)) {
      return 0;
    }
  }

  // Whether it has got here yet. A shout is instant and a smell is not, and
  // that difference is the whole reason a nose is worth having: what reaches
  // you is where something *was*, however long ago the air took to bring it.
  if (!hasArrived(sense, travelled, context.state.minute - (options.since ?? -Infinity))) return 0;

  const carried = sense.falloff === 'cliff' ? 1 : 1 - travelled / (reach + 1);
  // Thinner for having spread out: the same scent over more ground. Eased from
  // full at the source to `spreadRetention` at the edge of reach rather than
  // switched on at the first tile, which would make standing *on* something
  // twice as pungent as standing beside it.
  const diluted = travels(sense)
    ? 1 - (1 - sense.spreadRetention) * Math.min(1, travelled / Math.max(1, reach))
    : 1;
  return Math.max(0, Math.min(1, carried * diluted * emission));
}

/** Whether this sense arrives at once, or has to make its way over. */
export function travels(sense: SenseDef): boolean {
  return sense.propagation === 'field' && sense.spreadPerMinute > 0;
}

/**
 * Has the signal had time to get here?
 *
 * A sense that does not travel is always yes, which is sight and sound and
 * everything else that arrives at the speed of noticing. For one that does,
 * the front of it is `spreadPerMinute` tiles out per minute since it was given
 * off — so walking into a dungeon does not fill the dungeon, it starts filling
 * it, and the far end has a while yet.
 *
 * An unknown emission time is treated as long past rather than as just now.
 * The callers that leave it out are asking about a place rather than about a
 * creature — a noise, a deed, an editor's preview — and none of them wants a
 * sense to answer "not yet" to a question with no clock in it.
 */
function hasArrived(sense: SenseDef, travelled: number, age: number): boolean {
  if (!travels(sense)) return true;
  return travelled <= age * sense.spreadPerMinute;
}

/** Whether a straight signal survives the trip. */
function clearLine(
  context: PerceptionContext,
  sense: SenseDef,
  map: { tiles: TileMap },
  from: Position,
  to: Position,
): boolean {
  if (sense.blockedBy === 'opaque') {
    return hasLineOfSight(map.tiles, context.terrain, from, to);
  }

  // `impassable` blocks sound: a reed bed or an open doorway hides you from
  // sight while carrying every noise you make perfectly well.
  for (const step of lineBetween(from, to)) {
    if (step.x === from.x && step.y === from.y) continue;
    if (step.x === to.x && step.y === to.y) continue;
    if (isSolid(context, map.tiles, step)) return false;
  }
  return true;
}

/**
 * Whether a tile is solid enough to stop a signal.
 *
 * The terrain's own `passable` flag, deliberately *not* `isPassable` — that
 * asks whether a particular creature could walk there, and a stretch of deep
 * water that needs a swim mode is impassable to a hound while doing nothing
 * whatever to stop it hearing or smelling across.
 */
function isSolid(context: PerceptionContext, tiles: TileMap, at: Position): boolean {
  return !context.terrain.at(tiles, at).passable;
}

/** The tiles a straight signal crosses, endpoints included. */
function lineBetween(from: Position, to: Position): Position[] {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (steps === 0) return [from];

  const out: Position[] = [];
  for (let i = 0; i <= steps; i += 1) {
    out.push({
      x: Math.round(from.x + ((to.x - from.x) * i) / steps),
      y: Math.round(from.y + ((to.y - from.y) * i) / steps),
    });
  }
  return out;
}

/**
 * How far a spreading signal has to go to reach each tile.
 *
 * A uniform-cost flood from the *observer*, deliberately not the pathfinder:
 * `reachable()` weights by movement cost and honours movement modes, which
 * would make deep water smell distant because it is tiring to wade through, and
 * would stop a hound smelling across a stream it cannot swim.
 *
 * Flooding from the observer rather than from each trace is what keeps this
 * affordable: one flood per creature per question, not one per scent mark.
 */
function fieldDistances(
  context: PerceptionContext,
  sense: SenseDef,
  observer: Entity,
  reach: number,
): ReadonlyMap<number, number> {
  const map = context.state.maps[observer.map];
  if (!map) return new Map();

  const cacheKey = `${observer.map}:${packKey(observer.position)}:${reach}:${sense.blockedBy}`;
  let perState = fieldCache.get(context.state);
  if (!perState) {
    perState = new Map();
    fieldCache.set(context.state, perState);
  }
  const cached = perState.get(cacheKey);
  if (cached) return cached;

  const found = new Map<number, number>();
  found.set(packKey(observer.position), 0);

  let frontier: Position[] = [observer.position];
  for (let step = 1; step <= reach && frontier.length > 0; step += 1) {
    const next: Position[] = [];
    for (const at of frontier) {
      for (const side of neighbours(at)) {
        if (!inBounds(map.tiles, side)) continue;

        const packed = packKey(side);
        if (found.has(packed)) continue;
        if (sense.blockedBy !== 'nothing' && isSolid(context, map.tiles, side)) continue;

        found.set(packed, step);
        next.push(side);
      }
    }
    frontier = next;
  }

  perState.set(cacheKey, found);
  return found;
}

/**
 * Cached per state object, which is safe because state is replaced rather than
 * mutated — a new state is a new cache, and a stale flood can never be read.
 */
const fieldCache = new WeakMap<GameState, Map<string, ReadonlyMap<number, number>>>();

/** A stance as the module wrote it. */
export interface DeclaredStance {
  id: string;
  name: string;
  speedMultiplier: number;
  emits: Record<string, number>;
  concealedBy?: string;
  concealmentPerPoint: number;
}

/** The stance a creature is holding, or none. */
export function stanceOf(module: CompiledModule, entity: Entity): DeclaredStance | undefined {
  const id = entity.stance ?? defaultStanceOf(module);
  return id ? module.find<DeclaredStance>('rules.stances', id) : undefined;
}

/**
 * How loud, how rank, how visible a creature is right now.
 *
 * Stance sets it and a declared skill quietens it further. No dice: the same
 * approach always sounds the same, so a player learns the rules by playing
 * rather than by losing a coin flip. One is ordinary presence — a creature that
 * has no opinion about how it moves is exactly as noticeable as it looks.
 */
export function emissionOf(
  module: CompiledModule,
  entity: Entity,
  sense: SenseDef,
): number {
  const stance = stanceOf(module, entity);
  if (!stance) return 1;

  let emission = stance.emits[sense.id] ?? 1;

  if (stance.concealedBy && stance.concealmentPerPoint > 0) {
    const rank = entity.skills[stance.concealedBy] ?? 0;
    emission -= rank * stance.concealmentPerPoint;
  }

  // Never silent outright by default: whether perfect stealth is possible is
  // an opinion about the game, and it is the module's to hold.
  return Math.max(module.source.rules.perception.minimumEmission, emission);
}

/**
 * Whether `observer` perceives `subject` well enough to act on it.
 *
 * **This replaces `hasLineOfSight(...) && distance(...) <= 12`** at every site
 * that used to spell it out. Asked of every declared sense, so a creature that
 * cannot see you may still hear you.
 */
export function canPerceive(
  context: PerceptionContext,
  observer: Entity,
  subject: Entity,
  options: { readonly threshold?: Threshold; readonly sense?: string } = {},
): boolean {
  if (observer.map !== subject.map) return false;
  return canPerceiveTile(context, observer, subject.position, {
    ...options,
    emission: 1,
    subject,
    since: subject.since,
  });
}

/**
 * The same question about a place rather than a creature.
 *
 * A deed happens on a tile, and a witness perceives the act — not the actor —
 * which is why witnessing asks this one.
 */
export function canPerceiveTile(
  context: PerceptionContext,
  observer: Entity,
  at: Position,
  options: {
    readonly threshold?: Threshold;
    readonly sense?: string;
    readonly emission?: number;
    readonly subject?: Entity;
    readonly range?: number;
    /** When the signal started coming from there. Absent is "long enough ago". */
    readonly since?: number;
  } = {},
): boolean {
  const wanted = options.threshold ?? 'detect';
  const emission = options.emission ?? 1;

  for (const sense of sensesOf(context.module)) {
    if (options.sense !== undefined && sense.id !== options.sense) continue;

    const effective = options.range === undefined
      ? sense
      : { ...sense, range: options.range };

    const strength = options.since === undefined
      ? signalAt(context, effective, observer, at, emission)
      : signalAt(context, effective, observer, at, emission, { since: options.since });
    if (strength > thresholdOf(sense, wanted)) return true;
  }

  return false;
}

function thresholdOf(sense: SenseDef, threshold: Threshold): number {
  return threshold === 'aggro'
    ? sense.aggro
    : threshold === 'investigate'
      ? sense.investigate
      : sense.detect;
}

/** The furthest this creature could notice anything, in tiles. */
export function detectionRange(context: PerceptionContext, observer: Entity): number {
  let furthest = 0;
  for (const sense of sensesOf(context.module)) {
    furthest = Math.max(furthest, rangeOf(context, observer, sense));
  }
  return furthest;
}

/**
 * The stance a creature uses when it has chosen none.
 *
 * The module's declared default first, then the first stance it declares at
 * all, and null for a module with no notion of stances — which is what keeps
 * the field inert rather than requiring every ruleset to have an opinion about
 * how carefully its creatures walk.
 */
export function defaultStanceOf(module: CompiledModule): string | null {
  const declared = module.source.rules.perception?.defaultStance;
  if (declared) return declared;
  return module.all<{ id: string }>('rules.stances')[0]?.id ?? null;
}

/**
 * How strong a trace still is, from how long ago it was left.
 *
 * Never stored, always derived — which is why nothing has to tick and a trail
 * cannot drift out of step with the clock. The zero point is an integer
 * comparison on minutes rather than a float on strength, so "faded" and
 * "pruned" can never disagree about which traces still exist.
 */
export function markStrength(sense: SenseDef, mark: Mark, minute: number): number {
  if (sense.lingerMinutes <= 0) return 0;

  const age = minute - mark.at;
  if (age < 0) return mark.strength;
  if (age >= sense.lingerMinutes) return 0;

  return mark.strength * (1 - age / sense.lingerMinutes);
}

/**
 * How far a trace has got from where it was left, in tiles.
 *
 * The front of the cloud, not a bonus to anybody's reach. It used to be the
 * latter — a trace within the observer's range was smelled the instant it
 * existed, and `spread` only extended things *past* that range, so walking into
 * a dungeon filled the whole dungeon with your scent at once. This is now what
 * decides whether the smell has arrived at all.
 */
export function markSpread(sense: SenseDef, mark: Mark, minute: number): number {
  if (sense.spreadPerMinute <= 0) return 0;
  return Math.max(0, minute - mark.at) * sense.spreadPerMinute;
}

/** Whether any declared sense leaves traces at all. */
export function leavesMarks(module: CompiledModule): boolean {
  return sensesOf(module).some((sense) => sense.lingerMinutes > 0);
}

/**
 * Leave traces on a tile a creature just entered.
 *
 * Faded traces on that same tile are dropped in the same write, so ground that
 * is walked over again and again never accumulates. A ruleset whose senses
 * leave nothing writes nothing at all.
 */
export function leaveMarks(
  txn: Transaction,
  terrain: TerrainIndex,
  actor: Entity,
  at: Position,
): void {
  const module = txn.module;
  if (!leavesMarks(module)) return;

  const map = txn.state.maps[actor.map];
  if (!map) return;

  const minute = txn.state.minute;
  const tile = packKey(at);
  const kept: Mark[] = [];

  // Prune this tile while we are already rewriting it.
  for (const mark of map.marks[tile] ?? []) {
    const sense = senseOf(module, mark.sense);
    if (!sense) continue;
    // A creature crossing its own trail refreshes it rather than layering.
    if (mark.by === actor.id) continue;
    if (markStrength(sense, mark, minute) > 0) kept.push(mark);
  }

  for (const sense of sensesOf(module)) {
    if (sense.lingerMinutes <= 0) continue;
    // What the ground will hold. Bare rock takes no print however heavily you
    // walk on it, and that is a fact about the stone rather than about the
    // creature — so it scales the emission rather than the sense.
    const held = terrain.marksKept(map.tiles, at, sense.id);
    if (held <= 0) continue;

    const strength = emissionOf(module, actor, sense) * held;
    if (strength <= 0) continue;
    kept.push(newMark(sense.id, actor.id, minute, strength));
  }

  writeMarks(txn, actor.map, tile, capMarks(module, kept));
}

/**
 * Keep only the freshest few traces per sense on one tile.
 *
 * A thousand of a thing crossing one tile is still, to a nose, "they came
 * through here": the thousandth trace says nothing the first did not. Two of
 * them passing in opposite directions is genuinely two things, which is why
 * this trims to a few rather than to one.
 *
 * It matters more for speed than for space. {@link perceive} reads every trace
 * on every tile, for every sense, for every creature, every turn — so an
 * unbounded tile is an unbounded inner loop, and no amount of later pruning
 * could reach it.
 *
 * The result carries a **total order** — oldest first, ties broken on sense and
 * then on who left it. Truncation is exactly where a partial order would start
 * costing runs their determinism: two equivalent games would drop different
 * traces and stop comparing equal.
 */
function capMarks(module: CompiledModule, marks: readonly Mark[]): Mark[] {
  const cap = module.source.rules.perception.maxMarksPerTile;

  const bySense = new Map<string, Mark[]>();
  for (const mark of marks) {
    const held = bySense.get(mark.sense);
    if (held) held.push(mark);
    else bySense.set(mark.sense, [mark]);
  }

  const out: Mark[] = [];
  for (const held of bySense.values()) {
    held.sort(byAgeThenId);
    // Sorted oldest first, so the tail is what is still worth smelling.
    out.push(...held.slice(Math.max(0, held.length - cap)));
  }

  return out.sort(byAgeThenId);
}

/** Oldest first, and total — the order a tile's traces are stored in. */
function byAgeThenId(a: Mark, b: Mark): number {
  if (a.at !== b.at) return a.at - b.at;
  if (a.sense !== b.sense) return a.sense < b.sense ? -1 : 1;
  if (a.by !== b.by) return a.by < b.by ? -1 : 1;
  return a.strength - b.strength;
}

/**
 * The one place a trace is constructed.
 *
 * Field order in an object literal is serialization order, and saved state is
 * compared by its serialization — so two traces that are equal must also be
 * *written* the same way, which means exactly one factory.
 */
function newMark(sense: string, by: string, at: number, strength: number): Mark {
  return { sense, by, at, strength };
}

/** Write one tile's traces, dropping the key entirely when none are left. */
function writeMarks(
  txn: Transaction,
  mapId: string,
  tile: number,
  marks: readonly Mark[],
): void {
  const map = txn.state.maps[mapId];
  if (!map) return;

  const next = { ...map.marks };
  if (marks.length === 0) delete next[tile];
  else next[tile] = marks;

  txn.set({ ...txn.state, maps: { ...txn.state.maps, [mapId]: { ...map, marks: next } } });
}

/**
 * Drop faded traces everywhere.
 *
 * Housekeeping, not decay — a faded trace is already invisible either way, and
 * this only stops a save growing. It catches the corridor walked once and never
 * returned to, which pruning at the point of writing can never reach.
 */
export function pruneMarks(txn: Transaction): void {
  const module = txn.module;
  if (!leavesMarks(module)) return;

  const minute = txn.state.minute;
  const maps = { ...txn.state.maps };
  let changed = false;

  for (const [mapId, map] of Object.entries(maps)) {
    const next: Record<number, readonly Mark[]> = {};
    let touched = false;

    for (const [rawTile, marks] of Object.entries(map.marks)) {
      const tile = Number(rawTile);
      const kept = marks.filter((mark) => {
        const sense = senseOf(module, mark.sense);
        return sense !== undefined && markStrength(sense, mark, minute) > 0;
      });

      if (kept.length !== marks.length) touched = true;
      if (kept.length > 0) next[tile] = kept;
    }

    if (touched) {
      maps[mapId] = { ...map, marks: next };
      changed = true;
    }
  }

  if (changed) txn.set({ ...txn.state, maps });
}

/**
 * The tiles a creature perceives with one sense — what to draw, and what to
 * describe.
 *
 * Deliberately not the same operation as {@link canPerceive}. This is a field,
 * computed by shadowcasting for a straight sense and by flooding for a
 * spreading one, and shadowcasting uses a round disk where perception measures
 * the way movement does. Folding them together would quietly change what a
 * creature notices on the diagonal.
 */
export function perceivedTiles(
  context: PerceptionContext,
  observer: Entity,
  sense: SenseDef,
): ReadonlySet<number> {
  const map = context.state.maps[observer.map];
  if (!map) return new Set();

  const reach = rangeOf(context, observer, sense);
  if (reach <= 0) return new Set();

  if (sense.propagation === 'field') {
    return new Set(fieldDistances(context, sense, observer, reach).keys());
  }

  return fieldOfView({
    map: map.tiles,
    terrain: context.terrain,
    origin: observer.position,
    radius: reach,
  });
}

/**
 * The sense a module draws its map with.
 *
 * Falls back to the first declared sense, and then to the implicit one, so
 * something is always drawable even for a ruleset that never mentions sight.
 */
export function sightSenseOf(module: CompiledModule): SenseDef {
  const declared = module.source.rules.perception?.sightSense;
  const named = declared ? senseOf(module, declared) : undefined;
  return named ?? sensesOf(module)[0]!;
}

/** One thing perceived, whether it is standing there or merely passed through. */
export interface Percept {
  readonly sense: string;
  readonly of: EntityId;
  readonly at: Position;
  readonly strength: number;
  /** True when the source is there now, false when it is a trace it left. */
  readonly fresh: boolean;
}

/**
 * Everything a creature perceives right now, strongest first.
 *
 * Living creatures and cold trails come back through the same shape, so a hound
 * following a scent and a hound watching you are one code path rather than two
 * that have to be kept in step.
 */
export function perceive(context: PerceptionContext, observer: Entity): readonly Percept[] {
  const module = context.module;
  const senses = sensesOf(module);
  const minute = context.state.minute;
  const map = context.state.maps[observer.map];
  if (!map) return [];

  const out: Percept[] = [];

  for (const sense of senses) {
    // Creatures, where they actually are.
    for (const other of Object.values(context.state.entities)) {
      if (other.id === observer.id || !other.alive || other.map !== observer.map) continue;
      // What it bothers to register. Enemies only by default, which is the
      // filter this was born with; a module widens it per creature, which is
      // how a wolf comes to track a deer and a shopkeeper comes to see anyone.
      if (!registers(module, observer, other)) continue;

      // Measured from when it got there, not from now: something that has just
      // stepped into the room has not yet filled it.
      const strength = signalAt(
        context, sense, observer, other.position, emissionOf(module, other, sense),
        { since: other.since },
      );
      if (strength > sense.detect) {
        out.push({ sense: sense.id, of: other.id, at: other.position, strength, fresh: true });
      }
    }

    // And the traces they left behind, which is what makes a trail followable.
    if (sense.lingerMinutes <= 0) continue;
    // Something that does not know what a footprint is. It can smell you
    // perfectly well; it simply has no idea that the ground remembers.
    if (!temperamentOf(module, observer).followsTrails) continue;

    for (const [rawTile, marks] of Object.entries(map.marks)) {
      const tile = Number(rawTile);
      const at = { x: tile & 0xffff, y: tile >>> 16 };

      for (const mark of marks) {
        if (mark.sense !== sense.id || mark.by === observer.id) continue;

        const left = txnEntityIsHostile(context, observer, mark.by);
        if (!left) continue;

        const remaining = markStrength(sense, mark, minute);
        if (remaining <= 0) continue;

        // The trace is its own clock. It began spreading where it was laid, so
        // an old one has reached further than a fresh one — which is what makes
        // a cold trail perceptible from across a room while the warm one you
        // are standing beside has not got anywhere yet.
        const strength = signalAt(context, sense, observer, at, remaining, { since: mark.at });

        if (strength > sense.detect) {
          out.push({ sense: sense.id, of: mark.by, at, strength, fresh: false });
        }
      }
    }
  }

  return out.sort(byStrengthThenId(senses));
}

/** Whether a trace is worth following: left by something this creature registers. */
function txnEntityIsHostile(
  context: PerceptionContext,
  observer: Entity,
  leftBy: EntityId,
): boolean {
  const other = context.state.entities[leftBy];
  // A trace outlives whoever left it, and a cold trail of something long gone
  // is still worth following.
  if (!other) return true;
  return registers(context.module, observer, other);
}

/** Strongest first; ties settled by sense order then subject, so it is total. */
function byStrengthThenId(senses: readonly SenseDef[]) {
  const order = new Map(senses.map((sense, index) => [sense.id, index]));
  return (a: Percept, b: Percept): number => {
    if (a.strength !== b.strength) return b.strength - a.strength;
    const senseGap = (order.get(a.sense) ?? 0) - (order.get(b.sense) ?? 0);
    if (senseGap !== 0) return senseGap;
    if (a.of !== b.of) return a.of < b.of ? -1 : 1;
    return packKey(a.at) - packKey(b.at);
  };
}

/**
 * The one place an alert is constructed — same reason as {@link newMark}.
 */
function newAlert(percept: Percept, minute: number): Alert {
  return {
    sense: percept.sense,
    of: percept.of,
    at: { x: percept.at.x, y: percept.at.y },
    minute,
    strength: percept.strength,
  };
}

/**
 * Fold what a creature perceives into what it remembers.
 *
 * At most one alert per sense and subject, so a hound tracking you across a
 * room holds one steadily-updating idea of where you are rather than a hundred.
 * Writes nothing at all when nothing changed, so a quiet turn costs no state.
 */
export function perceiveInto(txn: Transaction, terrain: TerrainIndex, observer: Entity): void {
  const module = txn.module;
  const senses = sensesOf(module);
  if (!senses.some((sense) => sense.rememberMinutes > 0)) return;

  const context = { module, state: txn.state, terrain };
  const minute = txn.state.minute;

  const kept = observer.alerts.filter((alert) => {
    const sense = senseOf(module, alert.sense);
    return sense !== undefined && minute - alert.minute < sense.rememberMinutes;
  });

  const byKey = new Map<string, Alert>();
  for (const alert of kept) byKey.set(`${alert.sense}:${alert.of}`, alert);

  for (const percept of perceive(context, observer)) {
    const sense = senseOf(module, percept.sense);
    if (!sense || sense.rememberMinutes <= 0) continue;
    if (percept.strength <= sense.investigate) continue;

    // A fresher or stronger reading replaces the older one: what matters is the
    // best current idea of where the thing is, not a history of glimpses.
    byKey.set(`${percept.sense}:${percept.of}`, newAlert(percept, minute));
  }

  const next = [...byKey.values()].sort((a, b) => {
    if (a.strength !== b.strength) return b.strength - a.strength;
    if (a.sense !== b.sense) return a.sense < b.sense ? -1 : 1;
    return a.of < b.of ? -1 : 1;
  });

  if (sameAlerts(observer.alerts, next)) return;
  txn.putEntity({ ...observer, alerts: next });
}

function sameAlerts(a: readonly Alert[], b: readonly Alert[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((alert, i) => {
    const other = b[i]!;
    return alert.sense === other.sense && alert.of === other.of
      && alert.minute === other.minute && alert.strength === other.strength
      && alert.at.x === other.at.x && alert.at.y === other.at.y;
  });
}

/**
 * Somebody who has just become aware of a party member.
 *
 * Returned rather than acted on here: `seePlayer` reactions are driven from
 * this, and importing `runReactions` into this file would close a cycle —
 * `rules/combat/turn.ts` already imports `canPerceive` from here.
 */
export interface Noticed {
  readonly observer: EntityId;
  readonly subject: EntityId;
}

/**
 * Let everything on the party's map notice what there is to notice.
 *
 * Returns the pairs that are *new* this pass, which is the only honest way to
 * express "spotted you": noticing is a difference between two perception
 * passes, not an event anything emits.
 */
export function perceiveAll(
  txn: Transaction,
  terrain: TerrainIndex,
): readonly Noticed[] {
  if (!sensesOf(txn.module).some((sense) => sense.rememberMinutes > 0)) return [];

  const noticed: Noticed[] = [];

  for (const id of Object.keys(txn.state.entities)) {
    const entity = txn.entity(id);
    if (!entity || !entity.alive) continue;
    if (entity.map !== txn.state.currentMap) continue;

    const before = entity.alerts;
    perceiveInto(txn, terrain, entity);
    const after = txn.entity(id)?.alerts ?? [];

    // Somebody who has just caught sight — or scent, or sound — of a party
    // member. Deduped on *who* was noticed rather than on which sense noticed
    // them, so a creature that both sees and smells you reacts once.
    if (entity.kind !== 'character') {
      const already = new Set<string>();
      for (const alert of after) {
        if (!alert.of || already.has(alert.of)) continue;
        if (before.some((held) => held.of === alert.of)) continue;
        if (txn.entity(alert.of)?.kind !== 'character') continue;
        already.add(alert.of);
        noticed.push({ observer: entity.id, subject: alert.of });
      }
      continue;
    }

    // The party is told what it just noticed. Creatures act on it silently;
    // a player has only the prose, so a new impression has to be announced or
    // it may as well not exist.
    for (const alert of after) {
      const known = before.some((held) => held.sense === alert.sense && held.of === alert.of);
      if (known) continue;

      txn.emit({
        type: 'custom',
        event: 'noticed',
        data: {
          sense: alert.sense,
          x: alert.at.x,
          y: alert.at.y,
          strength: alert.strength,
          direction: roughBearing(entity.position, alert.at),
          by: entity.id,
        },
      });
    }
  }

  return noticed;
}

/** The strongest thing a creature would act on at a given threshold, or null. */
export function currentAlert(
  context: PerceptionContext,
  observer: Entity,
  threshold: Threshold,
): Alert | null {
  const usable = (alert: Alert): boolean => {
    const sense = senseOf(context.module, alert.sense);
    if (!sense) return false;
    if (context.state.minute - alert.minute >= sense.rememberMinutes) return false;
    return alert.strength > thresholdOf(sense, threshold);
  };

  // Which sense it trusts. Absent is "whichever is shouting loudest", since
  // `alerts` is already strongest first — the behaviour this had before a
  // creature could hold an opinion about its own nose.
  const preference = temperamentOf(context.module, observer).investigates;
  if (preference === null) return observer.alerts.find(usable) ?? null;

  // Named senses are a **preference order**, not a filter on strength: a wolf
  // that lists smell first follows its nose past something it can plainly see.
  // An empty list is a creature that notices everything and acts on none of it.
  for (const senseId of preference) {
    const found = observer.alerts.find((alert) => alert.sense === senseId && usable(alert));
    if (found) return found;
  }
  return null;
}

/**
 * Something made a sound. Everything that can hear it takes note.
 *
 * Instant, unlike a scent: sound is resolved where it happens rather than left
 * lying about, so this both emits the event and writes the alerts in one go.
 *
 * `loudness` scales the signal, which is how a stance makes the same footstep
 * carry twice as far or a third as far.
 */
export function makeNoise(
  txn: Transaction,
  terrain: TerrainIndex,
  senseId: string,
  at: Position,
  mapId: string,
  loudness: number,
  source: EntityId | null,
): void {
  const module = txn.module;
  const sense = senseOf(module, senseId);
  if (!sense || loudness <= 0) return;

  const context = { module, state: txn.state, terrain };
  const minute = txn.state.minute;
  const heardBy: EntityId[] = [];

  for (const id of Object.keys(txn.state.entities)) {
    const listener = txn.entity(id);
    if (!listener || !listener.alive || listener.map !== mapId) continue;
    if (listener.id === source) continue;

    const strength = signalAt(context, sense, listener, at, loudness);
    if (strength <= sense.detect) continue;

    heardBy.push(listener.id);
    if (sense.rememberMinutes <= 0 || strength <= sense.investigate) continue;
    if (listener.kind === 'character') continue;

    const alert = newAlert(
      { sense: senseId, of: source ?? listener.id, at, strength, fresh: true },
      minute,
    );
    const others = listener.alerts.filter(
      (held) => held.sense !== alert.sense || held.of !== alert.of,
    );
    txn.putEntity({ ...listener, alerts: [alert, ...others] });
  }

  txn.emit({
    type: 'custom',
    event: 'noise',
    data: { sense: senseId, x: at.x, y: at.y, loudness, heard: heardBy.length },
  });
}

/**
 * What the party notices without being told — the "you hear something" line.
 *
 * Vague on purpose, and vaguer the fainter the signal. A player should learn
 * that something is out there and roughly where, not be handed a creature's
 * name and coordinates; the whole value of a nose is that it is imprecise.
 */
export function impressions(
  context: PerceptionContext,
  observer: Entity,
): { sense: string; direction: string; strength: number; fresh: boolean }[] {
  const module = context.module;
  const sight = sightSenseOf(module);
  const out: { sense: string; direction: string; strength: number; fresh: boolean }[] = [];
  const seen = new Set<string>();

  // Anything already in plain view is described by name elsewhere. Being told
  // you can also smell the hound you are looking at is noise.
  const visible = new Set(
    perceive(context, observer)
      .filter((percept) => percept.sense === sight.id)
      .map((percept) => percept.of),
  );

  for (const percept of perceive(context, observer)) {
    // What you can see is described properly elsewhere; this is for the rest.
    if (percept.sense === sight.id) continue;
    if (percept.fresh && visible.has(percept.of)) continue;

    const key = `${percept.sense}:${percept.of}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      sense: percept.sense,
      direction: roughBearing(observer.position, percept.at),
      strength: percept.strength,
      fresh: percept.fresh,
    });
  }

  return out;
}

export interface SenseReading {
  readonly direction: string;
  readonly strength: number;
  /** False for a trail or a trace rather than the thing itself. */
  readonly fresh: boolean;
  /** Minutes since it was noticed. Zero for something present now. */
  readonly age: number;
}

/**
 * Everything one sense currently has to say, on demand.
 *
 * Deliberately different from {@link impressions}, which answers "what is
 * reaching me right now". Stopping to listen must also report what you already
 * heard and have not forgotten — otherwise listening twice in a row is silent,
 * because the alert is held rather than new, and the command reads as broken.
 *
 * Strongest first, then by bearing, so the ordering is total and the same
 * situation always reads the same way.
 */
export function senseReport(
  context: PerceptionContext,
  observer: Entity,
  senseId: string,
): SenseReading[] {
  // Keyed by bearing, because that is all the player is told. Two creatures
  // both somewhere north are one "something to the north" — collapsing them is
  // the honest answer, not a loss of detail.
  const byBearing = new Map<string, SenseReading>();

  const keep = (reading: SenseReading): void => {
    const held = byBearing.get(reading.direction);
    // The clearer reading wins: present beats remembered, then stronger.
    if (held && (held.age < reading.age
      || (held.age === reading.age && held.strength >= reading.strength))) return;
    byBearing.set(reading.direction, reading);
  };

  for (const felt of impressions(context, observer)) {
    if (felt.sense !== senseId) continue;
    keep({ direction: felt.direction, strength: felt.strength, fresh: felt.fresh, age: 0 });
  }

  const now = context.state.minute;
  for (const alert of observer.alerts) {
    if (alert.sense !== senseId) continue;
    const age = Math.max(0, now - alert.minute);
    keep({
      direction: roughBearing(observer.position, alert.at),
      strength: alert.strength,
      fresh: age === 0,
      age,
    });
  }

  return [...byBearing.values()]
    .sort((a, b) => b.strength - a.strength || a.direction.localeCompare(b.direction));
}

/**
 * Which way something lies — the fuzzy reading.
 *
 * Deliberately coarser than the octant `bearing` in `grid/geometry.ts`: a
 * sense report should be allowed to say "nearby", and its diagonal band is
 * wider. Both readings are right for their own purpose; there is one copy of
 * each.
 *
 * Returns a `systemText` **key**, not a word. The engine works out which way is
 * which; the module says what that direction is called, which is what lets a
 * `{direction}` placeholder read in the module's own language.
 */
export function roughBearing(from: Position, to: Position): SystemTextKey {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 'direction.here';

  const vertical = Math.abs(dy) * 2 > Math.abs(dx) ? (dy < 0 ? 'north' : 'south') : '';
  const horizontal = Math.abs(dx) * 2 > Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : '';
  const named = `${vertical}${horizontal}`;
  return named === '' ? 'direction.nearby' : (`direction.${named}` as SystemTextKey);
}
