/**
 * What a creature does when nothing is telling it what to do.
 *
 * Perception answers *what can it tell is there*. This answers the other half:
 * *what does it bother to do about it*. Keeping them apart is the whole point —
 * a hound and a shopkeeper standing in the same doorway smell the same street,
 * and only one of them goes to look.
 *
 * Every default here reproduces the engine's older behaviour exactly. Nothing
 * wandered, nothing was leashed, and a fight ended the moment nobody could be
 * perceived; a world comes alive by opting in, one field at a time.
 */

import type { CompiledModule } from '@dm/module';
import type { Entity } from '../state.js';
import { npcIdOf } from '../state.js';
import { toTiles } from '../rules/combat/targeting.js';
import { isHostileTo } from '../rules/combat/targeting.js';

/** How one creature stands toward another. Exhaustive, and each exactly once. */
export type Regard = 'hostile' | 'neutral' | 'ally';

/** How fast a creature moves, per reason it is moving. */
export interface Speeds {
  readonly wander: number;
  readonly investigate: number;
  readonly engage: number;
  readonly returning: number;
}

/**
 * A temperament with every default resolved and every distance in **tiles**.
 *
 * Built per statblock and cached, the way `SenseDef` is: resolving it touches
 * three collections and it is read on every idle step of every creature.
 */
export interface Temperament {
  /** Territory around the anchor, in tiles. Zero is a creature that stands still. */
  readonly roamRadius: number;
  /** How far a lead may pull it from the anchor. `Infinity` when unbounded. */
  readonly investigateRadius: number;
  /** How far it chases before turning for home. `Infinity` when unbounded. */
  readonly leashRadius: number;
  readonly wanderChance: number;
  readonly disengageTurns: number;
  readonly speeds: Speeds;
  /** Senses it acts on, best first. Null means all of them, strongest first. */
  readonly investigates: readonly string[] | null;
  readonly followsTrails: boolean;
  readonly notices: readonly Regard[];
}

/** A temperament exactly as a module wrote it, before defaults are resolved. */
interface DeclaredTemperament {
  roamRadius?: number;
  investigateRadius?: number;
  leashRadius?: number;
  wanderChance?: number;
  disengageTurns?: number;
  speeds?: Partial<Speeds>;
  investigates?: string[];
  followsTrails?: boolean;
  notices?: Regard[];
}

const cache = new WeakMap<CompiledModule, Map<string, Temperament>>();

/**
 * How `observer` stands toward `other`.
 *
 * Built on {@link isHostileTo} rather than reading `disposition` directly,
 * because disposition is held toward the *party* while this is a question about
 * two particular creatures — a hostile thing opposes everything that is not
 * also hostile, including other hostiles' enemies. Reading the raw field would
 * have a wolf ignore the party entirely, since a party member is not `hostile`.
 */
export function regardFor(observer: Entity, other: Entity): Regard {
  if (isHostileTo(observer, other)) return 'hostile';
  return observer.disposition === other.disposition ? 'ally' : 'neutral';
}

/**
 * The temperament this creature runs on.
 *
 * Resolution mirrors `rangeOf`: the most specific statement wins. A person's
 * own entry beats the statblock they borrow to fight with, because the
 * statblock says how they swing and the entry says who they are.
 */
export function temperamentOf(module: CompiledModule, entity: Entity): Temperament {
  const key = keyFor(entity);

  let perModule = cache.get(module);
  if (!perModule) {
    perModule = new Map();
    cache.set(module, perModule);
  }
  const held = perModule.get(key);
  if (held) return held;

  const base = module.source.rules.temperament as unknown as Required<
    Omit<DeclaredTemperament, 'investigateRadius' | 'leashRadius' | 'investigates'>
  > & Pick<DeclaredTemperament, 'investigateRadius' | 'leashRadius' | 'investigates'>;

  const overrides = [
    entity.kind === 'npc'
      ? module.find<{ temperament?: DeclaredTemperament }>('content.npcs', npcIdOf(entity))?.temperament
      : undefined,
    entity.statblock
      ? module.find<{ temperament?: DeclaredTemperament }>('content.monsters', entity.statblock)?.temperament
      : undefined,
  ].filter((held): held is DeclaredTemperament => held !== undefined);

  const pick = <K extends keyof DeclaredTemperament>(field: K): DeclaredTemperament[K] => {
    for (const override of overrides) {
      const declared = override[field];
      if (declared !== undefined) return declared;
    }
    return base[field];
  };

  // An absent radius is no limit rather than a radius of zero. The distinction
  // matters: zero would pin a creature to the tile it spawned on, which is the
  // opposite of "this module has no opinion about how far it will go".
  const optionalTiles = (field: 'investigateRadius' | 'leashRadius'): number => {
    const declared = pick(field);
    return declared === undefined ? Infinity : toTiles(module, declared);
  };

  // Resolved one name at a time, for the same reason the override schema is
  // written out longhand: a creature saying only how fast it wanders must keep
  // the ruleset's answer for the other three.
  const speed = (name: keyof Speeds): number => {
    for (const override of overrides) {
      const declared = override.speeds?.[name];
      if (declared !== undefined) return declared;
    }
    return base.speeds?.[name] ?? 1;
  };

  const speeds: Speeds = {
    wander: speed('wander'),
    investigate: speed('investigate'),
    engage: speed('engage'),
    returning: speed('returning'),
  };

  const resolved: Temperament = {
    roamRadius: toTiles(module, pick('roamRadius') ?? 0),
    investigateRadius: optionalTiles('investigateRadius'),
    leashRadius: optionalTiles('leashRadius'),
    wanderChance: pick('wanderChance') ?? 0,
    disengageTurns: pick('disengageTurns') ?? 0,
    speeds,
    investigates: pick('investigates') ?? null,
    followsTrails: pick('followsTrails') ?? true,
    notices: pick('notices') ?? ['hostile'],
  };

  perModule.set(key, resolved);
  return resolved;
}

/**
 * What two creatures sharing a temperament have in common.
 *
 * A person is keyed by who they are and a monster by what it is, so a room of
 * twelve identical bog hounds resolves once rather than twelve times — and two
 * different people running the same statblock still get their own answer.
 */
function keyFor(entity: Entity): string {
  if (entity.kind === 'npc') return `npc:${npcIdOf(entity)}`;
  if (entity.statblock) return `mon:${entity.statblock}`;
  return `kind:${entity.kind}`;
}

/** Whether this creature registers that one at all. */
export function notices(module: CompiledModule, observer: Entity, other: Entity): boolean {
  return temperamentOf(module, observer).notices.includes(regardFor(observer, other));
}
