/**
 * Casting: slots, points, concentration, rituals, and components.
 *
 * `rules.spellcasting` described a whole economy — Vancian slots, a points
 * pool, concentration with its save, ritual casting, upcasting, and the verbal,
 * somatic and material components that make a bound caster a problem — and not
 * one field of it was read. A module that declared a wizard got a fighter whose
 * abilities happened to cost focus.
 *
 * Two things decide the shape here:
 *
 * - **The engine owns no spell list.** Which abilities are spells is decided by
 *   an ability carrying a `spellLevel`, exactly as the schema says. An ability
 *   without one is unaffected by everything in this file.
 * - **A slot is spent, not reserved.** `Entity.slotsUsed` counts what is gone,
 *   indexed by level, so a character who levels up gains slots without anything
 *   having to reconcile a stored maximum.
 */

import { Rng } from '@dm/core';
import { evalExpr } from '@dm/module';
import type { CompiledModule, Expr, Scope, Value, Spellcasting } from '@dm/module';
import type { Entity } from '../state.js';
import { buildScope, statsOf, proficiencyOf, OPEN_NAMESPACES } from '../stats.js';
import { Transaction, changeInventory } from './apply.js';
import { preventsAction } from './conditions.js';
import { savingThrow } from './check.js';
import { message } from '../narrate/systemText.js';
import type { Message } from '../narrate/systemText.js';


interface ClassCasting {
  castingAttribute: string;
  spellList: string[];
  progression: number;
  knownByLevel: Record<string, number>;
}

export interface SpellDef {
  id: string;
  name: string;
  spellLevel?: number;
  concentration: boolean;
  ritual: boolean;
  castingTime: string;
  duration: string;
  components: readonly ('verbal' | 'somatic' | 'material' | 'focus')[];
  materialComponent?: string;
  upcast: unknown[];
}

/**
 * The module's casting rules.
 *
 * The schema's own type, not a copy of it: a hand-written mirror here meant an
 * `as unknown as` cast, and a field added to one and not the other would have
 * type-checked all the way to a runtime undefined.
 */
export function spellcastingOf(module: CompiledModule): Spellcasting {
  return module.source.rules.spellcasting;
}

/** The casting half of a character's class, when it has one. */
export function casterClassOf(module: CompiledModule, actor: Entity): ClassCasting | null {
  if (!actor.characterClass) return null;
  const characterClass = module.find<{ spellcasting?: ClassCasting }>(
    'content.classes',
    actor.characterClass,
  );
  return characterClass?.spellcasting ?? null;
}

/** Whether this ability is a spell at all. Everything here turns on that. */
export function isSpell(ability: { spellLevel?: number }): boolean {
  return typeof ability.spellLevel === 'number';
}

/**
 * Slots this character has at each level, before any are spent.
 *
 * `slotTable` is keyed by caster level and `progression` scales it, so a
 * half-caster reads the same table at half the rate — which is what the field
 * has always meant and never done.
 */
export function slotsFor(module: CompiledModule, actor: Entity): number[] {
  const casting = spellcastingOf(module);
  if (casting.mode !== 'slots' && casting.mode !== 'both') return [];

  const caster = casterClassOf(module, actor);
  if (!caster) return [];

  const effective = Math.max(0, Math.floor(actor.level * (caster.progression ?? 1)));
  if (effective <= 0) return [];

  // The highest declared level at or below the caster's, so a table that only
  // lists odd levels still works.
  let best: number[] = [];
  for (const [levelKey, slots] of Object.entries(casting.slotTable)) {
    if (Number(levelKey) <= effective) {
      if (Number(levelKey) >= bestLevel(casting.slotTable, effective)) best = slots;
    }
  }
  return [...best];
}

function bestLevel(table: Record<string, number[]>, effective: number): number {
  let best = 0;
  for (const key of Object.keys(table)) {
    const level = Number(key);
    if (level <= effective && level > best) best = level;
  }
  return best;
}

/** Slots left at each level: what the table gives, less what has been spent. */
export function slotsLeft(module: CompiledModule, actor: Entity): number[] {
  return slotsFor(module, actor).map((total, index) => total - (actor.slotsUsed[index] ?? 0));
}

/**
 * The lowest slot that can carry this spell, or null when none can.
 *
 * A spell may be cast from a higher slot than its own — that is what upcasting
 * *is* — so the search runs upward from the spell's level.
 */
export function slotForSpell(
  module: CompiledModule,
  actor: Entity,
  spellLevel: number,
): number | null {
  if (spellLevel <= 0) return 0; // Cantrips cost nothing.
  // `maxSpellLevel` was declared by every module with magic and consulted by
  // nothing, so a spell above the ruleset's own ceiling cast perfectly well.
  const ceiling = spellcastingOf(module).maxSpellLevel;
  if (spellLevel > ceiling) return null;

  const left = slotsLeft(module, actor);
  for (let level = spellLevel; level <= Math.min(left.length, ceiling); level += 1) {
    if ((left[level - 1] ?? 0) > 0) return level;
  }
  return null;
}

/** The save DC a caster imposes, from the module's own formula. */
export function saveDifficultyOf(module: CompiledModule, actor: Entity): number | undefined {
  const casting = spellcastingOf(module);
  if (casting.saveDifficulty === undefined) return undefined;
  return evaluate(module, actor, casting.saveDifficulty);
}

/** The bonus a caster adds to a spell attack roll. */
export function attackBonusOf(module: CompiledModule, actor: Entity): number | undefined {
  const casting = spellcastingOf(module);
  if (casting.attackBonus === undefined) return undefined;
  return evaluate(module, actor, casting.attackBonus);
}

function evaluate(module: CompiledModule, actor: Entity, expr: Expr): number | undefined {
  const caster = casterClassOf(module, actor);
  const stats = statsOf(module, actor);
  const scope: Scope = {
    actor: {
      level: actor.level,
      attr: actor.attributes as Record<string, Value>,
      mod: stats.mod,
      derived: stats.derived,
      // The attribute the class casts with, so one formula covers every caster.
      castingMod: caster ? (stats.mod[caster.castingAttribute] ?? 0) : 0,
      // Without this a caster's save DC and attack bonus cannot grow with
      // level, because this scope is built here rather than by `buildScope`:
      // a formula could name `actor.level` but not the module's own
      // proficiency curve, which is the number a ruleset actually tunes.
      proficiency: proficiencyOf(module, actor),
    },
  };
  const value = evalExpr(expr, { scope, rng: Rng.fromSeed(0), openNamespaces: OPEN_NAMESPACES });
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;
}

/**
 * Whether the caster can supply what the spell asks for.
 *
 * A gagged caster cannot speak the words and a bound one cannot make the signs
 * — which is the entire point of components, and the reason a module declares
 * them. Blocking conditions are named by the module's own `prevents` lists, so
 * the engine still knows nothing about what silence or manacles are.
 */
export function componentsMissing(
  txn: Transaction,
  actor: Entity,
  spell: SpellDef,
): Message | null {
  // Which action a component actually is, per the module. A ruleset that names
  // neither cannot have its casting interrupted that way, which is a coherent
  // thing for a ruleset to say.
  const { verbal, somatic } = spellcastingOf(txn.module).componentActionTypes;

  for (const component of spell.components) {
    if (component === 'verbal' && verbal !== undefined && preventsAction(txn, actor, verbal)) {
      return message('refused.cast.silenced', { who: actor.name });
    }
    if (component === 'somatic' && somatic !== undefined && preventsAction(txn, actor, somatic)) {
      return message('refused.cast.bound', { who: actor.name });
    }
    if (component === 'material' && spell.materialComponent) {
      const held = actor.inventory.some((stack) => stack.item === spell.materialComponent);
      if (!held) {
        const item = txn.module.find<{ name: string }>('content.items', spell.materialComponent);
        return message('refused.cast.noComponent', {
          who: actor.name,
          component: (item?.name ?? spell.materialComponent).toLowerCase(),
        });
      }
    }
  }
  return null;
}

/** Spend the material component a spell consumes, if it says so. */
export function consumeComponents(txn: Transaction, actor: Entity, spell: SpellDef): void {
  if (!spell.components.includes('material') || !spell.materialComponent) return;
  // Only a `focus` component is reusable; a plain material is used up.
  if (spell.components.includes('focus')) return;
  changeInventory(txn, txn.entity(actor.id) ?? actor, spell.materialComponent, -1);
}

/**
 * Pay for a spell, in whatever currency the module casts in.
 *
 * Returns the slot the spell went into, so the caller knows how far it was
 * upcast. A ritual pays nothing and takes time instead.
 */
export function paySpell(
  txn: Transaction,
  actor: Entity,
  spell: SpellDef,
  options: { ritual?: boolean } = {},
): { ok: true; slot: number } | { ok: false; reason: Message } {
  const casting = spellcastingOf(txn.module);
  const level = spell.spellLevel ?? 0;

  if (options.ritual) {
    if (!casting.ritualCasting || !spell.ritual) {
      return { ok: false, reason: message('refused.cast.notRitual', { spell: spell.name }) };
    }
    return { ok: true, slot: level };
  }

  // Points first when a module casts both ways: a points caster who also has
  // slots should burn the renewable resource before the scarce one.
  if ((casting.mode === 'points' || casting.mode === 'both') && casting.pointResource) {
    const cost = casting.pointCosts[String(level)] ?? 0;
    if (cost > 0) {
      const held = actor.resources[casting.pointResource] ?? 0;
      if (held >= cost) {
        txn.putEntity({
          ...actor,
          resources: { ...actor.resources, [casting.pointResource]: held - cost },
        });
        return { ok: true, slot: level };
      }
      if (casting.mode === 'points') {
        const resource = txn.module.find<{ name: string }>('rules.resources', casting.pointResource);
        return { ok: false, reason: message('refused.cost.shortfall', { resource: resource?.name ?? casting.pointResource }) };
      }
    }
  }

  if (casting.mode === 'slots' || casting.mode === 'both') {
    const slot = slotForSpell(txn.module, actor, level);
    if (slot === null) return { ok: false, reason: message('refused.cast.noSlot', { spell: spell.name }) };
    if (slot === 0) return { ok: true, slot: 0 };

    const used = [...actor.slotsUsed];
    while (used.length < slot) used.push(0);
    used[slot - 1] = (used[slot - 1] ?? 0) + 1;
    txn.putEntity({ ...actor, slotsUsed: used });
    return { ok: true, slot };
  }

  return { ok: true, slot: level };
}

/**
 * Take up concentration on a spell, dropping whatever was already held.
 *
 * One at a time unless the module says otherwise — and because only one is
 * tracked per creature, `maxConcurrent` above one simply means the previous
 * spell is not dropped.
 */
export function beginConcentration(txn: Transaction, actor: Entity, spellId: string): void {
  const casting = spellcastingOf(txn.module);
  if (!casting.concentration.enabled) return;

  const current = txn.entity(actor.id) ?? actor;
  if (current.concentrating && casting.concentration.maxConcurrent <= 1) {
    txn.emit({ type: 'concentrationBroken', entity: current.id, spell: current.concentrating });
  }
  txn.putEntity({ ...current, concentrating: spellId });
}

/**
 * A blow that might shake a caster's hold on a spell.
 *
 * Called from the damage path, because that is the only moment concentration is
 * ever really tested. The difficulty is the module's formula — usually "ten, or
 * half the damage, whichever is worse".
 */
export function testConcentration(
  txn: Transaction,
  actor: Entity,
  damage: number,
  rng: Rng,
): void {
  const casting = spellcastingOf(txn.module);
  if (!casting.concentration.enabled) return;

  const current = txn.entity(actor.id);
  if (!current?.concentrating) return;

  const save = casting.concentration.savingThrow;
  if (!save) return;

  const difficulty = casting.concentration.difficulty === undefined
    ? undefined
    : difficultyFrom(txn, current, casting.concentration.difficulty, damage);

  const roll = savingThrow(txn.module, rng, current, save, difficulty);
  txn.emit({ type: 'saved', entity: current.id, save, roll });

  if (roll.outcome === 'success' || roll.outcome === 'critical') return;

  const spell = current.concentrating;
  txn.putEntity({ ...current, concentrating: null });
  txn.emit({ type: 'concentrationBroken', entity: current.id, spell });
}

function difficultyFrom(
  txn: Transaction,
  actor: Entity,
  expr: Expr,
  damage: number,
): number | undefined {
  const scope = { ...buildScope(txn.module, txn.state, actor), damage };
  const value = evalExpr(expr, {
    scope,
    rng: txn.rngFor(`concentration:${actor.id}`),
    openNamespaces: OPEN_NAMESPACES,
  });
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : undefined;
}

/** Give back the slots a rest of this kind restores. */
export function recoverSlots(txn: Transaction, restId: string): void {
  const casting = spellcastingOf(txn.module);
  if (!casting.recoverOn.includes(restId)) return;

  for (const id of txn.state.party) {
    const member = txn.entity(id);
    if (!member || member.slotsUsed.length === 0) continue;
    txn.putEntity({ ...member, slotsUsed: [] });
  }
}
