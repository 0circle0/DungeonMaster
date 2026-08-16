/**
 * Point-buy character creation.
 *
 * The rules here are entirely the module's: how many points, which attributes,
 * what each score costs. The tests below pin that nothing about the *shape* of
 * a ruleset is assumed — greenmarch spends 27 points across six attributes with
 * a hand-authored cost curve, minimal spends 4 across two with no table at all,
 * and the same code runs both.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import type { CompiledModule } from '@dm/module';
import { loadModuleFrom } from '@dm/module/load';
import {
  creationRules, costOf, totalSpent, baseAllocation, adjust, remaining, toChoices,
} from './creation.js';
import { startSession } from './session.js';

function loadModule(name: string): CompiledModule {
  return loadModuleFrom(fileURLToPath(new URL(`../../../modules/${name}`, import.meta.url)));
}

const GREENMARCH = loadModule('greenmarch');
const MINIMAL = loadModule('minimal');

describe('character creation', () => {
  it('reads its rules from the module, not from the engine', () => {
    const green = creationRules(GREENMARCH);
    expect(green.points).toBe(27);
    expect(green.attributes.map((a) => a.id)).toContain('might');

    // A different ruleset yields a different screen with no code change.
    const alien = creationRules(MINIMAL);
    expect(alien.points).toBe(4);
    expect(alien.attributes.map((a) => a.id)).toEqual(['vigor', 'wits']);
  });

  it('prices scores from the module table', () => {
    const might = creationRules(GREENMARCH).attributes.find((a) => a.id === 'might')!;
    expect(costOf(GREENMARCH, might, 8)).toBe(0);
    expect(costOf(GREENMARCH, might, 13)).toBe(5);
    // 14 costs 7, not 6: the table's own curve, not a linear guess.
    expect(costOf(GREENMARCH, might, 14)).toBe(7);
  });

  it('extrapolates past the table at the table\'s own last rate', () => {
    const might = creationRules(GREENMARCH).attributes.find((a) => a.id === 'might')!;
    // 15 costs 9 and the last step costs 2, so 16 costs 11.
    expect(costOf(GREENMARCH, might, 16)).toBe(11);
    // And nothing below the table refunds points.
    expect(costOf(GREENMARCH, might, 4)).toBe(0);
  });

  it('falls back to one point per step when a module gives no table', () => {
    const vigor = creationRules(MINIMAL).attributes.find((a) => a.id === 'vigor')!;
    expect(costOf(MINIMAL, vigor, vigor.default)).toBe(0);
    expect(costOf(MINIMAL, vigor, vigor.default + 3)).toBe(3);
  });

  it('starts everyone at the module default', () => {
    const base = baseAllocation(GREENMARCH);
    expect(Object.values(base).every((score) => score === 10)).toBe(true);
    // Six attributes at 10, two points each.
    expect(totalSpent(GREENMARCH, base)).toBe(12);
    expect(remaining(GREENMARCH, base)).toBe(15);
  });

  it('spends and refunds', () => {
    const base = baseAllocation(GREENMARCH);
    const up = adjust(GREENMARCH, base, 'might', 4);
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    expect(up.attributes.might).toBe(14);
    expect(remaining(GREENMARCH, up.attributes)).toBe(10);

    const down = adjust(GREENMARCH, up.attributes, 'might', -2);
    expect(down.ok).toBe(true);
    if (!down.ok) return;
    expect(remaining(GREENMARCH, down.attributes)).toBe(13);
  });

  it('refuses to overspend, and says what it would have cost', () => {
    let attributes = baseAllocation(GREENMARCH);
    for (const id of ['might', 'agility', 'endurance']) {
      const step = adjust(GREENMARCH, attributes, id, 5);
      if (step.ok) attributes = step.attributes;
    }
    const over = adjust(GREENMARCH, attributes, 'intellect', 5);
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.message).toMatch(/of 27 points/);
  });

  it('refuses to leave the declared range', () => {
    const base = baseAllocation(GREENMARCH);
    const high = adjust(GREENMARCH, base, 'might', 99);
    expect(high).toMatchObject({ ok: false });
    const low = adjust(GREENMARCH, base, 'might', -99);
    expect(low).toMatchObject({ ok: false });
    const missing = adjust(GREENMARCH, base, 'charisma', 1);
    expect(missing).toMatchObject({ ok: false, message: 'there is no charisma' });
  });

  it('builds a party the engine accepts', () => {
    let attributes = baseAllocation(GREENMARCH);
    const raised = adjust(GREENMARCH, attributes, 'might', 4);
    if (raised.ok) attributes = raised.attributes;

    const rules = creationRules(GREENMARCH);
    const choices = toChoices(GREENMARCH, 'Brannoc', rules.ancestries[1]?.id, rules.classes[0]?.id, attributes);

    const play = startSession(GREENMARCH, 11, 1, [choices]);
    const hero = Object.values(play.state.entities).find((e) => e.kind === 'character')!;
    expect(hero.name).toBe('Brannoc');
    expect(hero.characterClass).toBe(rules.classes[0]?.id);

    // Ancestry and class add their own bonuses on top, so compare against the
    // same character built without the four points rather than to a number.
    const flat = toChoices(GREENMARCH, 'Brannoc', rules.ancestries[1]?.id, rules.classes[0]?.id, baseAllocation(GREENMARCH));
    const plain = Object.values(startSession(GREENMARCH, 11, 1, [flat]).state.entities)
      .find((e) => e.kind === 'character')!;
    expect((hero.attributes['might'] ?? 0) - (plain.attributes['might'] ?? 0)).toBe(4);
  });

  it('fills unmade choices with the module\'s own first entries', () => {
    const choices = toChoices(MINIMAL, 'Nobody', undefined, undefined, baseAllocation(MINIMAL));
    const rules = creationRules(MINIMAL);
    expect(choices.ancestry).toBe(rules.ancestries[0]?.id);
    expect(choices.characterClass).toBe(rules.classes[0]?.id);
  });
});
