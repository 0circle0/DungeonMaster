/** Perception: signal strength at an observer, and the thresholds that read it. */

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

/** A sense with every default resolved and every distance already in tiles. */
export interface SenseDef {
  readonly id: string;
  readonly propagation: Propagation;
  readonly blockedBy: Barrier;
  readonly falloff: Falloff;
  /** Baseline reach in tiles, converted from module units exactly once. */
  readonly range: number;
  /** Conditions this sense works through anyway, e.g. blindsight and blinded. */
  readonly ignores: readonly string[];
  /** Minutes a trace stays perceptible. */
  readonly lingerMinutes: number;
  /** Tiles a lingering trace spreads outward per minute as it thins. */
  readonly spreadPerMinute: number;
  /** Signal kept once it has spread: the same scent over more ground. */
  readonly spreadRetention: number;
  /** Minutes a percept stays remembered. */
  readonly rememberMinutes: number;
  /** What noticing something this way reads like, strong and faint. */
  readonly impressionTextKey: string | null;
  readonly faintImpressionTextKey: string | null;
  /** What using this sense deliberately reads like when it finds nothing. */
  readonly emptyTextKey: string | null;
  /** Signal needed to notice, to go and look, and to fight. */
  readonly detect: number;
  readonly investigate: number;
  readonly aggro: number;
}

/** Structurally what `TargetingContext` is, declared here so perception does not depend on combat. */
export interface PerceptionContext {
  readonly module: CompiledModule;
  readonly state: GameState;
  readonly terrain: TerrainIndex;
}

/** The sense a module gets when it declares none. */
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
        // Converted from module units to tiles here.
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

/** How far this creature reaches with this sense, in tiles. */
export function rangeOf(
  context: PerceptionContext,
  observer: Entity,
  sense: SenseDef,
): number {
  const module = context.module;

  // The creature's own declaration first, the sense's default behind it.
  const sources = [
    observer.statblock
      ? module.find<{ senses?: Record<string, number> }>('content.monsters', observer.statblock)
      : undefined,
    observer.ancestry
      ? module.find<{ senses?: Record<string, number> }>('content.ancestries', observer.ancestry)
      : undefined,
  ];

  // A condition can shut the sense off unless the sense ignores it.
  if (senseSuppressed(module, observer, sense)) return 0;

  for (const source of sources) {
    const declared = source?.senses?.[sense.id];
    if (declared !== undefined) return toTiles(module, declared);
  }

  return sense.range;
}

/** Whether anything the creature is under closes this sense. */
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

/** How strongly a signal from `from` reaches `observer`. */
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

  // How far the signal had to travel.
  let travelled: number;

  if (sense.propagation === 'field') {
    const spread = fieldDistances(context, sense, observer, reach);
    const reached = spread.get(packKey(from));
    if (reached === undefined) return 0;
    travelled = reached;
  } else {
    travelled = distance(observer.position, from);
    if (travelled > reach) return 0;

    // Measured on the observer's own map.
    if (sense.blockedBy !== 'nothing' && !clearLine(context, sense, map, observer.position, from)) {
      return 0;
    }
  }

  // Whether the signal has arrived yet.
  if (!hasArrived(sense, travelled, context.state.minute - (options.since ?? -Infinity))) return 0;

  const carried = sense.falloff === 'cliff' ? 1 : 1 - travelled / (reach + 1);
  // Thinner for having spread out.
  const diluted = travels(sense)
    ? 1 - (1 - sense.spreadRetention) * Math.min(1, travelled / Math.max(1, reach))
    : 1;
  return Math.max(0, Math.min(1, carried * diluted * emission));
}

/** Whether this sense arrives at once, or has to make its way over. */
export function travels(sense: SenseDef): boolean {
  return sense.propagation === 'field' && sense.spreadPerMinute > 0;
}

/** Has the signal had time to get here? */
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

  // `impassable` blocks sound; terrain that hides you from sight may still carry every noise you make.
  for (const step of lineBetween(from, to)) {
    if (step.x === from.x && step.y === from.y) continue;
    if (step.x === to.x && step.y === to.y) continue;
    if (isSolid(context, map.tiles, step)) return false;
  }
  return true;
}

/** Whether a tile is solid enough to stop a signal. */
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

/** How far a spreading signal has to go to reach each tile. */
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

/** Cached per state object; a new state is a new cache. */
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

/** How loud, how rank, how visible a creature is right now. */
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

  // Never silent outright by default; whether perfect stealth is possible is the module's to decide.
  return Math.max(module.source.rules.perception.minimumEmission, emission);
}

/** Whether `observer` perceives `subject` well enough to act on it. */
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

/** The same question about a place rather than a creature. */
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
    /** When the signal started coming from there. */
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

/** The module's declared default stance, then its first, then null. */
export function defaultStanceOf(module: CompiledModule): string | null {
  const declared = module.source.rules.perception?.defaultStance;
  if (declared) return declared;
  return module.all<{ id: string }>('rules.stances')[0]?.id ?? null;
}

/** How strong a trace still is, from how long ago it was left. */
export function markStrength(sense: SenseDef, mark: Mark, minute: number): number {
  if (sense.lingerMinutes <= 0) return 0;

  const age = minute - mark.at;
  if (age < 0) return mark.strength;
  if (age >= sense.lingerMinutes) return 0;

  return mark.strength * (1 - age / sense.lingerMinutes);
}

/** How far a trace has got from where it was left, in tiles. */
export function markSpread(sense: SenseDef, mark: Mark, minute: number): number {
  if (sense.spreadPerMinute <= 0) return 0;
  return Math.max(0, minute - mark.at) * sense.spreadPerMinute;
}

/** Whether any declared sense leaves traces at all. */
export function leavesMarks(module: CompiledModule): boolean {
  return sensesOf(module).some((sense) => sense.lingerMinutes > 0);
}

/** Leave traces on a tile a creature just entered. */
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

  // Prune this tile while it is already being rewritten.
  for (const mark of map.marks[tile] ?? []) {
    const sense = senseOf(module, mark.sense);
    if (!sense) continue;
    // A creature crossing its own trail refreshes it rather than layering.
    if (mark.by === actor.id) continue;
    if (markStrength(sense, mark, minute) > 0) kept.push(mark);
  }

  for (const sense of sensesOf(module)) {
    if (sense.lingerMinutes <= 0) continue;
    // What the ground will hold.
    const held = terrain.marksKept(map.tiles, at, sense.id);
    if (held <= 0) continue;

    const strength = emissionOf(module, actor, sense) * held;
    if (strength <= 0) continue;
    kept.push(newMark(sense.id, actor.id, minute, strength));
  }

  writeMarks(txn, actor.map, tile, capMarks(module, kept));
}

/** Keep only the freshest few traces per sense on one tile. */
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

/** Oldest first, and total: the order a tile's traces are stored in. */
function byAgeThenId(a: Mark, b: Mark): number {
  if (a.at !== b.at) return a.at - b.at;
  if (a.sense !== b.sense) return a.sense < b.sense ? -1 : 1;
  if (a.by !== b.by) return a.by < b.by ? -1 : 1;
  return a.strength - b.strength;
}

/** The one place a trace is constructed. */
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

/** Drop faded traces everywhere. */
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

/** The tiles a creature perceives with one sense — what to draw and what to describe. */
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

/** The sense a module draws its map with. */
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

/** Everything a creature perceives right now, strongest first. */
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
      // What it registers.
      if (!registers(module, observer, other)) continue;

      // Measured from when it arrived, not from now.
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
    // A creature that does not read traces.
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

        // The trace is its own clock: it began spreading where it was laid.
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
  // A trace outlives whoever left it, so a trail of something long gone is still followable.
  if (!other) return true;
  return registers(context.module, observer, other);
}

/** Strongest first; ties settled by sense order then subject, so the order is total. */
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

/** The one place an alert is constructed — same reason as {@link newMark}. */
function newAlert(percept: Percept, minute: number): Alert {
  return {
    sense: percept.sense,
    of: percept.of,
    at: { x: percept.at.x, y: percept.at.y },
    minute,
    strength: percept.strength,
  };
}

/** Fold what a creature perceives into what it remembers. */
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

    // A fresher or stronger reading replaces the older one.
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

/** Somebody who has just become aware of a party member. */
export interface Noticed {
  readonly observer: EntityId;
  readonly subject: EntityId;
}

/** Let everything on the party's map notice what there is to notice. */
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

    // Somebody who has just perceived a party member.
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

    // Announce what the party just noticed.
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

  // Which sense it trusts.
  const preference = temperamentOf(context.module, observer).investigates;
  if (preference === null) return observer.alerts.find(usable) ?? null;

  // Named senses are a preference order, not a filter on strength.
  for (const senseId of preference) {
    const found = observer.alerts.find((alert) => alert.sense === senseId && usable(alert));
    if (found) return found;
  }
  return null;
}

/** Something made a sound; everything that can hear it takes note. */
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

/** What the party notices without being told — the "you hear something" line. */
export function impressions(
  context: PerceptionContext,
  observer: Entity,
): { sense: string; direction: string; strength: number; fresh: boolean }[] {
  const module = context.module;
  const sight = sightSenseOf(module);
  const out: { sense: string; direction: string; strength: number; fresh: boolean }[] = [];
  const seen = new Set<string>();

  // Anything already in plain view is described by name elsewhere.
  const visible = new Set(
    perceive(context, observer)
      .filter((percept) => percept.sense === sight.id)
      .map((percept) => percept.of),
  );

  for (const percept of perceive(context, observer)) {
    // What you can see is described elsewhere; this is for the rest.
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
  /** Minutes since it was noticed. */
  readonly age: number;
}

/** Everything one sense currently has to say, on demand. */
export function senseReport(
  context: PerceptionContext,
  observer: Entity,
  senseId: string,
): SenseReading[] {
  // Keyed by bearing, which is all the player is told.
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

/** Which way something lies — the fuzzy reading. */
export function roughBearing(from: Position, to: Position): SystemTextKey {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return 'direction.here';

  const vertical = Math.abs(dy) * 2 > Math.abs(dx) ? (dy < 0 ? 'north' : 'south') : '';
  const horizontal = Math.abs(dx) * 2 > Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : '';
  const named = `${vertical}${horizontal}`;
  return named === '' ? 'direction.nearby' : (`direction.${named}` as SystemTextKey);
}
