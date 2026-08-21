/** What a creature does when nothing is telling it what to do. */

import type { CompiledModule } from '@dm/module';
import type { Entity } from '../state.js';
import { npcIdOf } from '../state.js';
import { toTiles } from '../rules/combat/targeting.js';
import { isHostileTo } from '../rules/combat/targeting.js';

/** How one creature stands toward another. */
export type Regard = 'hostile' | 'neutral' | 'ally';

/** How fast a creature moves, per reason it is moving. */
export interface Speeds {
  readonly wander: number;
  readonly investigate: number;
  readonly engage: number;
  readonly returning: number;
}

/** A temperament with every default resolved and every distance in tiles. */
export interface Temperament {
  /** Territory around the anchor, in tiles. */
  readonly roamRadius: number;
  /** How far a lead may pull it from the anchor. */
  readonly investigateRadius: number;
  /** How far it chases before turning for home. */
  readonly leashRadius: number;
  readonly wanderChance: number;
  readonly disengageTurns: number;
  readonly speeds: Speeds;
  /** Senses it acts on, best first. */
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

/** How `observer` stands toward `other`. */
export function regardFor(observer: Entity, other: Entity): Regard {
  if (isHostileTo(observer, other)) return 'hostile';
  return observer.disposition === other.disposition ? 'ally' : 'neutral';
}

/** The temperament this creature runs on. */
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

  // An absent radius is no limit rather than a radius of zero.
  const optionalTiles = (field: 'investigateRadius' | 'leashRadius'): number => {
    const declared = pick(field);
    return declared === undefined ? Infinity : toTiles(module, declared);
  };

  // Resolved one name at a time, so unstated names keep the ruleset's answer.
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

/** What two creatures sharing a temperament have in common. */
function keyFor(entity: Entity): string {
  if (entity.kind === 'npc') return `npc:${npcIdOf(entity)}`;
  if (entity.statblock) return `mon:${entity.statblock}`;
  return `kind:${entity.kind}`;
}

/** Whether this creature registers that one at all. */
export function notices(module: CompiledModule, observer: Entity, other: Entity): boolean {
  return temperamentOf(module, observer).notices.includes(regardFor(observer, other));
}
