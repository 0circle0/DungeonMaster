/**
 * Using an ability, and hitting with it.
 *
 * One path for everything a creature actively does: a sword swing, a spell, a
 * shout, a healing touch. The differences are declared in the ability — whether
 * it rolls to hit, whether the target saves, what it costs — so the engine has
 * no separate notion of "attack" versus "spell".
 *
 * Order of resolution:
 *
 *   1. can it be used at all — costs, cooldown, requirement, conditions
 *   2. who does it reach — range, line of sight, area shape
 *   3. per target: attack roll, or saving throw, or neither
 *   4. effects, scaled for criticals and successful saves
 */

import { Rng, parseDice, rollDice } from '@dm/core';
import {
  isSpell, paySpell, componentsMissing, consumeComponents, beginConcentration,
  saveDifficultyOf, attackBonusOf,
} from '../casting.js';
import type { SpellDef } from '../casting.js';
import { evalEffects, evalExpr, evalPredicate, compileRequirement, isEmptyRequirement } from '@dm/module';
import type { Expr } from '@dm/module';
import type { CompiledModule, Effect, EffectOp, Scope, Predicate, Requirement } from '@dm/module';
import type { Entity, EntityId } from '../../state.js';
import type { Position } from '../../grid/tiles.js';
import { buildScope, statsOf, proficiencyOf, OPEN_NAMESPACES } from '../../stats.js';
import { Transaction, applyOps, adjustResource } from '../apply.js';
import { preventsAction, swingsFrom } from '../conditions.js';
import { check, savingThrow, succeeded, criticalMultiplier, difficultyOf } from '../check.js';
import type { Swing } from '../check.js';
import type { TargetingContext } from './targeting.js';
import { resolveTargets, reachability, coverBonus, toTiles, reachOf } from './targeting.js';
import { message, text, grammarOf } from '../../narrate/systemText.js';
import { saveMultiplier, roundDamageOf } from '../config.js';
import { count } from '../../narrate/grammar.js';
import type { Message } from '../../narrate/systemText.js';

/**
 * What a spell gains from being cast out of a bigger slot.
 *
 * Applied once per level above the spell's own, with `upcastLevels` in scope so
 * one authored effect can scale itself rather than being repeated. Nothing at
 * all for a spell cast at its own level, which is the common case.
 */
function upcastEffects(
  ability: AbilityDef,
  slot: number,
  scope: Scope,
  rng: Rng,
): EffectOp[] {
  const upcast = ability.upcast ?? [];
  if (upcast.length === 0 || !isSpell(ability)) return [];

  const levels = slot - (ability.spellLevel ?? 0);
  if (levels <= 0) return [];

  const out: EffectOp[] = [];
  for (let step = 0; step < levels; step += 1) {
    out.push(...evalEffects(upcast, {
      scope: { ...scope, upcastLevels: levels },
      rng,
      openNamespaces: OPEN_NAMESPACES,
    }));
  }
  return out;
}

/** The spell half of an ability, with the schema's own defaults filled in. */
function asSpell(ability: AbilityDef): SpellDef {
  return {
    id: ability.id,
    name: ability.name,
    ...(ability.spellLevel === undefined ? {} : { spellLevel: ability.spellLevel }),
    concentration: ability.concentration === true,
    ritual: ability.ritual === true,
    castingTime: ability.castingTime ?? '',
    duration: ability.duration ?? '',
    components: ability.components ?? [],
    ...(ability.materialComponent === undefined ? {} : { materialComponent: ability.materialComponent }),
    upcast: ability.upcast ?? [],
  };
}

export interface AbilityDef {
  id: string;
  name: string;
  actionType?: string;
  costs: Record<string, unknown>;
  range: number;
  cooldown: number;
  targeting: 'self' | 'single' | 'allEnemies' | 'allAllies' | 'all' | 'none';
  requires?: Requirement;
  when?: Predicate;
  attack?: { stat: string; against: string };
  /** Which way this ability's own roll always leans. */
  swing?: Swing;
  savingThrow?: {
    save: string;
    difficulty?: unknown;
    onSuccess: 'none' | 'half' | 'negates' | 'partial';
    onSuccessEffects: Effect[];
    swing?: Swing;
  };
  areaOfEffect?: {
    shape: never; size: number; angle: number;
    affects: 'all' | 'enemies' | 'allies' | 'others';
  };
  onUse: Effect[];
  onMiss: Effect[];
  onCritical: Effect[];

  /** Spell fields. Absent on an ordinary ability, which is how magic is opt-in. */
  spellLevel?: number;
  concentration?: boolean;
  ritual?: boolean;
  castingTime?: string;
  duration?: string;
  components?: readonly ('verbal' | 'somatic' | 'material' | 'focus')[];
  materialComponent?: string;
  upcast?: Effect[];
}

export interface UseResult {
  readonly used: boolean;
  readonly reason: Message | null;
}

/**
 * Scale damage in a set of ops — used for criticals and half-damage saves.
 *
 * Rounded the module's way. `damageRounding` claims resistance, a save for
 * half, and a critical; it governed only resistance, because this rounded with
 * a hardcoded floor. At the default `round`, seven halved is four, not three.
 */
function scaleDamage(
  module: CompiledModule,
  ops: readonly EffectOp[],
  factor: number,
): EffectOp[] {
  if (factor === 1) return [...ops];
  const round = roundDamageOf(module);
  return ops.map((op) =>
    op.op === 'damage' ? { ...op, amount: Math.max(0, round(op.amount * factor)) } : op,
  );
}

/**
 * Evaluate an ability's costs.
 *
 * Costs are DSL expressions, so a spell can cost more at higher level. Rolled
 * once and reused for both the affordability check and the payment — evaluating
 * twice would let a random cost differ between the two.
 */
function costsOf(txn: Transaction, actor: Entity, ability: AbilityDef, rng: Rng): Map<string, number> {
  const scope = buildScope(txn.module, txn.state, actor);
  const costs = new Map<string, number>();

  for (const [resourceId, expr] of Object.entries(ability.costs)) {
    const value = evalExpr(expr as Expr, { scope, rng, openNamespaces: OPEN_NAMESPACES });
    const cost = typeof value === 'number' ? value : 0;
    if (Number.isFinite(cost) && cost > 0) costs.set(resourceId, cost);
  }
  return costs;
}

/** The first cost the actor cannot pay, as a readable reason. */
function shortfallOf(txn: Transaction, actor: Entity, costs: ReadonlyMap<string, number>): Message | null {
  for (const [resourceId, cost] of costs) {
    if ((actor.resources[resourceId] ?? 0) >= cost) continue;
    const resource = txn.module.find<{ name: string }>('rules.resources', resourceId);
    return message('refused.cost.shortfall', { resource: resource?.name ?? resourceId });
  }
  return null;
}

function payCosts(txn: Transaction, actor: Entity, costs: ReadonlyMap<string, number>): void {
  for (const [resourceId, cost] of costs) {
    const current = txn.entity(actor.id);
    if (!current) return;
    adjustResource(txn, current, resourceId, -cost);
  }
}

/**
 * Use an ability.
 *
 * Refusals are ordinary play — out of range, not enough focus, stunned — and
 * each returns a reason the player can read rather than failing silently.
 */
export function useAbility(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  abilityId: string,
  explicit: { target?: EntityId; at?: Position; ritual?: boolean },
  rng: Rng,
): UseResult {
  const module = txn.module;
  const ability = module.find<AbilityDef>('content.abilities', abilityId);

  if (!ability) return refuse(txn, message('refused.ability.unknown', { ability: abilityId }));
  if (!actor.abilities.includes(abilityId)) return refuse(txn, message('refused.ability.notKnown', { who: actor.name, ability: abilityId }));

  // A condition that forbids this kind of action stops it before anything else.
  if (ability.actionType && preventsAction(txn, actor, ability.actionType)) {
    return refuse(txn, message('refused.ability.prevented', { who: actor.name }));
  }

  const scope = buildScope(module, txn.state, actor);
  if (!isEmptyRequirement(ability.requires)) {
    if (!evalPredicate(compileRequirement(ability.requires), { scope, rng, openNamespaces: OPEN_NAMESPACES })) {
      return refuse(txn, message('refused.ability.requirements', { who: actor.name, ability: ability.name }));
    }
  }
  if (ability.when && !evalPredicate(ability.when, { scope, rng, openNamespaces: OPEN_NAMESPACES })) {
    return refuse(txn, message('refused.ability.unavailable', { ability: ability.name }));
  }

  // Still catching its breath. Cooldowns count in rounds, so out of combat
  // there is nothing to count and an ability is always ready — which is the
  // honest reading of a field measured in rounds.
  const combat = txn.state.combat;
  if (combat && ability.cooldown > 0) {
    const waiting = combat.cooldowns.find(
      (entry) => entry.entity === actor.id && entry.ability === abilityId,
    );
    if (waiting && waiting.until > combat.round) {
      const rounds = waiting.until - combat.round;
      const grammar = grammarOf(txn.module);
      return refuse(txn, message('refused.ability.cooldown', {
        ability: ability.name,
        rounds: count(
          grammar, rounds,
          text(txn.module, 'unit.round'), text(txn.module, 'unit.rounds'),
        ),
      }));
    }
  }

  // — casting ————————————————————————————————————————————————
  // Everything below is skipped entirely for an ability with no `spellLevel`,
  // which is what makes a module with no magic in it unaffected.
  let slot = 0;
  if (isSpell(ability)) {
    const spell = asSpell(ability);
    const missing = componentsMissing(txn, actor, spell);
    if (missing) return refuse(txn, missing);

    const paid = paySpell(txn, actor, spell, { ritual: explicit.ritual === true });
    if (!paid.ok) return refuse(txn, paid.reason);
    slot = paid.slot;
  }

  const costs = costsOf(txn, actor, ability, rng);
  const shortfall = shortfallOf(txn, actor, costs);
  if (shortfall) return refuse(txn, shortfall);

  const { targets, reason } = resolveTargets(context, actor, ability, explicit);
  if (reason) return refuse(txn, reason);
  if (targets.length === 0 && ability.targeting !== 'none') return refuse(txn, message('refused.target.none'));

  payCosts(txn, actor, costs);

  if (isSpell(ability)) {
    const spell = asSpell(ability);
    consumeComponents(txn, actor, spell);
    if (spell.concentration) beginConcentration(txn, txn.entity(actor.id) ?? actor, ability.id);

    // A ritual is cast slowly instead of expensively, which is what makes the
    // trade real — `castingTime` had no job at all before.
    if (explicit.ritual && spell.castingTime) {
      txn.emit({ type: 'custom', event: 'ritualCast', data: { spell: ability.id, time: spell.castingTime } });
    }
    txn.emit({
      type: 'spellCast',
      entity: actor.id,
      spell: ability.id,
      slot,
      ritual: explicit.ritual === true,
    });
  }

  // The cooldown starts when the ability is actually spent, not when it is
  // attempted — a refusal must not put it on the shelf.
  const running = txn.state.combat;
  if (running && ability.cooldown > 0) {
    const rest = running.cooldowns.filter(
      (entry) => !(entry.entity === actor.id && entry.ability === abilityId),
    );
    txn.set({
      ...txn.state,
      combat: {
        ...running,
        // Sorted by entity then ability: a creature-accumulated collection with
        // a total order, so two runs that spent the same abilities compare equal.
        cooldowns: [...rest, { entity: actor.id, ability: abilityId, until: running.round + ability.cooldown }]
          .sort((a, b) => a.entity.localeCompare(b.entity) || a.ability.localeCompare(b.ability)),
      },
    });
  }

  for (const target of targets) {
    resolveAgainst(txn, context, actor, target, ability, rng, slot);
  }

  // A `none`-targeting ability still does whatever it declares.
  if (ability.targeting === 'none' && targets.length === 0) {
    const selfScope = buildScope(module, txn.state, actor);
    applyOps(txn, evalEffects(ability.onUse, { scope: selfScope, rng, openNamespaces: OPEN_NAMESPACES }), actor.id);
  }

  return { used: true, reason: null };
}

function refuse(txn: Transaction, reason: Message): UseResult {
  txn.emit({ type: 'refused', action: 'useAbility', reason });
  return { used: false, reason };
}

/** Resolve one ability against one target. */
function resolveAgainst(
  txn: Transaction,
  context: TargetingContext,
  actor: Entity,
  target: Entity,
  ability: AbilityDef,
  rng: Rng,
  /** The slot the spell went into, so upcasting knows how far above its own. */
  slot = 0,
): void {
  const module = txn.module;
  const current = txn.entity(target.id);
  if (!current || !current.alive) return;

  const scopeFor = (extra: Record<string, never> = {}) => ({
    ...buildScope(module, txn.state, actor, { target: targetScope(module, current) }),
    ...extra,
  });

  // — an attack roll, when the ability declares one ——————————
  if (ability.attack) {
    const stats = statsOf(module, actor);
    const defence = statsOf(module, current).derived[ability.attack.against] ?? 0;

    const range = Math.max(toTiles(module, ability.range), reachOf(module, actor));
    const reach = reachability(context, actor.position, current.position, range);
    const defenceWithCover = defence + coverBonus(module, reach.cover);

    // The weapon is chosen before the roll, not after it: which attribute the
    // blow uses can depend on what is in the hand, which is what finesse means.
    const wielded = weaponOf(module, actor);
    const attackStat = attackStatFor(module, actor, ability.attack.stat, wielded);
    const attackMod = stats.mod[attackStat] ?? 0;

    // A spell attack uses the caster's own bonus, when the module declares one
    // — the single most-felt number in casting, and it was unreachable.
    const spellBonus = isSpell(ability) ? attackBonusOf(module, actor) : undefined;
    const roll = check(module, rng, {
      modifier: spellBonus ?? weaponAttackBonus(module, actor, attackMod),
      difficulty: defenceWithCover,
      // Both sides of the blow: what the attacker is carrying, and what the
      // target's own conditions do to anyone swinging at them.
      swing: [
        ability.swing ?? null,
        ...swingsFrom(module, actor, 'ownAttacks'),
        ...swingsFrom(module, current, 'attacksAgainstSelf'),
      ],
      kind: 'attack',
    });

    txn.emit({ type: 'attacked', attacker: actor.id, target: current.id, ability: ability.id, roll });

    if (!succeeded(roll)) {
      applyOps(txn, evalEffects(ability.onMiss, { scope: scopeFor(), rng }), actor.id);
      return;
    }

    const declared = [
      ...evalEffects(ability.onUse, { scope: scopeFor(), rng }),
      ...upcastEffects(ability, slot, scopeFor(), rng),
    ];
    // The blow was struck with whatever is in the actor's hands, so the blade's
    // own qualities travel with it — a resistance's `unless` is asking about the
    // weapon, not about the ability. Damage the ability tagged itself is left
    // alone. Then, if the ability named no damage at all, the weapon supplies it.
    const ops = [
      ...withWeaponTags(declared, wielded),
      ...weaponDamage(module, actor, current, declared, wielded, rng, attackStat),
    ];
    // A critical multiplies damage by whatever the module says, and then runs
    // any extra `onCritical` effects on top.
    const factor = roll.outcome === 'critical' ? criticalMultiplier(module) : 1;
    applyOps(txn, scaleDamage(module, ops, factor), actor.id);

    if (roll.outcome === 'critical' && ability.onCritical.length > 0) {
      applyOps(txn, evalEffects(ability.onCritical, { scope: scopeFor(), rng }), actor.id);
    }
    return;
  }

  // — a saving throw, when the ability declares one ——————————
  if (ability.savingThrow) {
    // The spell's own DC when the ability names one, then the caster's formula,
    // then the module's ordinary difficulty.
    const declared = ability.savingThrow.difficulty as number | undefined;
    const casterDc = isSpell(ability) ? saveDifficultyOf(module, actor) : undefined;
    const difficulty = difficultyOf(module, declared ?? casterDc);
    const roll = savingThrow(module, rng, current, ability.savingThrow.save, difficulty, [
      ability.savingThrow.swing ?? null,
    ]);
    txn.emit({ type: 'saved', entity: current.id, save: ability.savingThrow.save, roll });

    const ops = [
      ...evalEffects(ability.onUse, { scope: scopeFor(), rng }),
      ...upcastEffects(ability, slot, scopeFor(), rng),
    ];

    if (succeeded(roll)) {
      switch (ability.savingThrow.onSuccess) {
        case 'negates':
          break;
        case 'half':
          applyOps(txn, scaleDamage(module, ops, saveMultiplier(module)), actor.id);
          break;
        default:
          applyOps(txn, ops, actor.id);
          break;
      }
      if (ability.savingThrow.onSuccessEffects.length > 0) {
        applyOps(txn, evalEffects(ability.savingThrow.onSuccessEffects, { scope: scopeFor(), rng }), actor.id);
      }
      return;
    }

    applyOps(txn, ops, actor.id);
    return;
  }

  // — no roll: it simply happens ———————————————————————————
  applyOps(txn, [
    ...evalEffects(ability.onUse, { scope: scopeFor(), rng }),
    ...upcastEffects(ability, slot, scopeFor(), rng),
  ], actor.id);
}

interface WeaponDef {
  id: string;
  kind: string;
  tags?: string[];
  properties?: string[];
  damage?: { dice: string; damageType: string; stat?: string };
}

/**
 * The weapon a character is actually wielding.
 *
 * Weapon-kind items only: a shield and a ring are equipped too, and neither
 * should decide how hard you hit.
 */
export function weaponOf(module: CompiledModule, actor: Entity): WeaponDef | null {
  for (const items of Object.values(actor.equipped)) {
    for (const itemId of items) {
      const item = module.find<WeaponDef>('content.items', itemId);
      if (item?.kind === 'weapon' && item.damage) return item;
    }
  }
  return null;
}

/**
 * Which attribute this blow is actually swung with.
 *
 * The ability names one; the weapon's properties may offer others, and the
 * best of them wins. That is finesse: a choice of attribute rather than a
 * bonus, which is why `itemProperties[].modifiers` could never express it.
 *
 * Ties keep the ability's own attribute, so a weapon that offers nothing
 * better changes nothing at all.
 */
/** Whether any of this weapon's properties offer a choice of attack attribute. */
function offersAttackStats(module: CompiledModule, weapon: WeaponDef | null): boolean {
  return (weapon?.properties ?? []).some((propertyId) => {
    const property = module.find<{ attackStats?: string[] }>('rules.itemProperties', propertyId);
    return (property?.attackStats?.length ?? 0) > 0;
  });
}

export function attackStatFor(
  module: CompiledModule,
  actor: Entity,
  declared: string,
  weapon: WeaponDef | null,
): string {
  const offered = new Set<string>();
  for (const propertyId of weapon?.properties ?? []) {
    const property = module.find<{ attackStats?: string[] }>('rules.itemProperties', propertyId);
    for (const stat of property?.attackStats ?? []) offered.add(stat);
  }
  if (offered.size === 0) return declared;

  const mod = statsOf(module, actor).mod;
  let best = declared;
  for (const candidate of offered) {
    if ((mod[candidate] ?? 0) > (mod[best] ?? 0)) best = candidate;
  }
  return best;
}

/**
 * What a weapon attack adds to the die.
 *
 * The attribute modifier alone unless the ruleset says otherwise, which is
 * what the engine always did -- and what meant a weapon never improved with
 * level, since nothing raises an attribute after character creation. Spells
 * had `spellcasting.attackBonus` and weapons had nothing, so fixing the caster
 * side alone would have left the martial side further behind than it started.
 */
function weaponAttackBonus(
  module: CompiledModule,
  actor: Entity,
  attackMod: number,
): number {
  const declared = module.source.rules.resolution.attackBonus;
  if (declared === undefined) return attackMod;

  const stats = statsOf(module, actor);
  const scope: Scope = {
    actor: {
      level: actor.level,
      mod: stats.mod,
      derived: stats.derived,
      proficiency: proficiencyOf(module, actor),
      // The modifier for whichever attribute the attack resolved to, so one
      // formula covers a might swing and an agility one.
      attackMod,
    },
  };
  const value = evalExpr(declared, { scope, rng: Rng.fromSeed(0), openNamespaces: OPEN_NAMESPACES });
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : attackMod;
}

/**
 * Damage from the wielded weapon, when the ability produced none of its own.
 *
 * `content.items[].damage` was unread, so a bare `strike` dealt whatever the
 * ability declared no matter what was in your hands — swapping a 15-gold iron
 * sword for a 200-gold warded blade changed nothing at all. An ability that
 * *does* declare damage keeps it, so a fireball is still a fireball.
 */
function weaponDamage(
  module: CompiledModule,
  actor: Entity,
  target: Entity,
  produced: readonly EffectOp[],
  weapon: WeaponDef | null,
  rng: Rng,
  attackStat: string,
): EffectOp[] {
  if (produced.some((op) => op.op === 'damage')) return [];
  if (!weapon?.damage) return [];

  const stats = statsOf(module, actor);
  // The attribute the blow was swung with, when the weapon offered a choice of
  // them. Choosing once and using it for both halves is the whole point: a
  // finesse weapon that was aimed with agility and hit with might is the
  // incoherence this replaces.
  const chosen = offersAttackStats(module, weapon) ? attackStat : weapon.damage.stat;
  const bonus = chosen ? (stats.mod[chosen] ?? 0) : 0;

  let rolled: number;
  try {
    rolled = rollDice(parseDice(weapon.damage.dice), rng).total;
  } catch {
    return [];
  }

  return [{
    op: 'damage',
    target: target.id,
    amount: Math.max(0, rolled + bonus),
    damageType: weapon.damage.damageType,
    // The blade's own tags travel with the blow, so a wight immune to slashing
    // `unless: ['silvered']` can be cut by a silvered blade and nothing else.
    tags: qualitiesOf(weapon),
  }];
}

/** A weapon's qualities: its own tags plus the properties it declares. */
function qualitiesOf(weapon: WeaponDef | null): string[] {
  if (!weapon) return [];
  return [...new Set([...(weapon.tags ?? []), ...(weapon.properties ?? [])])];
}

/** Stamp the wielded weapon's qualities onto damage that carries none of its own. */
function withWeaponTags(ops: readonly EffectOp[], weapon: WeaponDef | null): EffectOp[] {
  const qualities = qualitiesOf(weapon);
  if (qualities.length === 0) return [...ops];
  return ops.map((op) =>
    op.op === 'damage' && (op.tags ?? []).length === 0 ? { ...op, tags: qualities } : op,
  );
}

/** The `target.*` half of the DSL scope. */
function targetScope(module: CompiledModule, target: Entity): Record<string, never> {
  const stats = statsOf(module, target);
  const conditions: Record<string, unknown> = {};
  for (const active of target.conditions) conditions[active.condition] = active.remaining ?? true;

  return {
    id: target.id,
    name: target.name,
    level: target.level,
    alive: target.alive,
    attr: target.attributes,
    mod: stats.mod,
    res: target.resources,
    max: stats.max,
    derived: stats.derived,
    conditions,
  } as unknown as Record<string, never>;
}

/**
 * A basic attack with whatever the actor is wielding.
 *
 * Looks for an equipped weapon's ability, then falls back to the first ability
 * the actor knows that declares an attack roll — so `attack goblin` works
 * without the player knowing ability names.
 */
export function defaultAttackAbility(module: CompiledModule, actor: Entity): string | null {
  // A weapon's own ability first: a shield or a ring may also grant one, and
  // "attack" should mean the thing you are swinging.
  for (const items of Object.values(actor.equipped)) {
    for (const itemId of items) {
      const item = module.find<{ kind: string; grantedAbilities: string[] }>('content.items', itemId);
      if (item?.kind !== 'weapon') continue;
      const granted = item.grantedAbilities?.[0];
      if (granted) return granted;
    }
  }
  for (const items of Object.values(actor.equipped)) {
    for (const itemId of items) {
      const item = module.find<{ grantedAbilities: string[] }>('content.items', itemId);
      const granted = item?.grantedAbilities?.[0];
      if (granted) return granted;
    }
  }
  for (const abilityId of actor.abilities) {
    const ability = module.find<AbilityDef>('content.abilities', abilityId);
    if (ability?.attack) return abilityId;
  }
  return null;
}
