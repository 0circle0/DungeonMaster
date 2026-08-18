/**
 * Composing a new world out of an existing ruleset.
 *
 * The thing worth testing is not that keys get copied — it is that every
 * combination an author can produce with the dialog still compiles. A "new
 * module" that fails to load is the worst possible first minute, and the
 * failure would be in reference integrity between sections rather than anywhere
 * a schema check would point.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileModule, formatIssues } from '@dm/module';
import {
  RULESET_SECTIONS, DEFAULT_SECTIONS, composeModule, withPrerequisites, dependents,
} from './ruleset';

const CORE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../modules/core_fantasy/module.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

const compiles = (doc: unknown): true | string => {
  const result = compileModule(doc);
  return result.ok ? true : formatIssues(result.errors);
};

describe('composeModule', () => {
  it('produces a compiling document with everything taken', () => {
    expect(compiles(composeModule(CORE, RULESET_SECTIONS.map((s) => s.id)))).toBe(true);
  });

  it('produces a compiling document with the defaults', () => {
    expect(compiles(composeModule(CORE, DEFAULT_SECTIONS))).toBe(true);
  });

  it('produces a compiling document with nothing taken', () => {
    // Which is just the blank scaffold, and that has to keep working: it is
    // what "New world" gives somebody who unticks everything.
    expect(compiles(composeModule(CORE, []))).toBe(true);
  });

  it('compiles with any one section taken', () => {
    for (const section of RULESET_SECTIONS) {
      const result = compiles(composeModule(CORE, [section.id]));
      expect(result, `${section.id} alone: ${String(result)}`).toBe(true);
    }
  });

  it('compiles with any one section left out', () => {
    for (const section of RULESET_SECTIONS) {
      const rest = RULESET_SECTIONS.filter((other) => other.id !== section.id).map((s) => s.id);
      // Prerequisites are closed over, so dropping `attributes` while `classes`
      // is present puts it back — the dialog does the same thing.
      const result = compiles(composeModule(CORE, rest));
      expect(result, `without ${section.id}: ${String(result)}`).toBe(true);
    }
  });

  it('actually brings the ruleset across', () => {
    const doc = composeModule(CORE, DEFAULT_SECTIONS) as {
      rules: { attributes: unknown[]; damageTypes: unknown[] };
      content: { classes: unknown[]; skills: unknown[] };
    };
    expect(doc.rules.attributes.length).toBe(6);
    expect(doc.rules.damageTypes.length).toBe(10);
    expect(doc.content.classes.length).toBe(5);
    expect(doc.content.skills.length).toBe(16);
  });

  it('leaves out what was not asked for', () => {
    const doc = composeModule(CORE, ['attributes']) as { rules: Record<string, unknown> };
    expect(doc.rules['spellcasting']).toBeUndefined();
    expect(doc.rules['damageTypes']).toBeUndefined();
  });

  it('keeps the scaffold as the base, not the source', () => {
    // The scaffold sets no start and no areas on purpose, so the console reads
    // as a to-do list. Composing must not import core_fantasy's token area.
    const doc = composeModule(CORE, RULESET_SECTIONS.map((s) => s.id)) as {
      world: Record<string, unknown>;
      start: Record<string, unknown>;
    };
    expect(doc.world['areas']).toBeUndefined();
    expect(doc.start['startingArea']).toBeUndefined();
  });

  it('always carries the systemText fragments, which are not optional', () => {
    // A missing fragment is a load error, not a warning: other messages are
    // built out of them and render with a hole where one should be.
    const bare = composeModule(CORE, []) as { narrative: { systemText: Record<string, string> } };
    expect(Object.keys(bare.narrative.systemText).length).toBeGreaterThan(50);
    expect(compiles(bare)).toBe(true);
  });
});

describe('prerequisites', () => {
  it('pulls in what a section refers to', () => {
    // Membership rather than an exact list: what a section refers to is a fact
    // about the content, and pinning the whole closure here would mean editing
    // this test every time core_fantasy gains a cross-reference — while the
    // property that matters, "it still compiles", is checked above.
    for (const needed of ['attributes', 'skills', 'taxonomy']) {
      expect([...withPrerequisites(['characters'])]).toContain(needed);
    }
    expect([...withPrerequisites(['creation'])]).toContain('attributes');
    expect([...withPrerequisites(['spellcasting'])]).toContain('damage');
    // Slots recover on a rest, and rests arrive with combat.
    expect([...withPrerequisites(['spellcasting'])]).toContain('combat');
  });

  it('terminates on a section that needs nothing', () => {
    expect([...withPrerequisites(['grammar'])]).toEqual(['grammar']);
  });

  it('follows a chain rather than one step of it', () => {
    // combat → skills → damage → attributes. A single pass over the
    // requirements would stop at the first hop and produce a document with
    // dangling references in it.
    const closed = withPrerequisites(['combat']);
    for (const needed of ['skills', 'damage', 'attributes', 'progression']) {
      expect([...closed], `combat should pull in ${needed}`).toContain(needed);
    }
  });

  it('names what would break if a section were dropped', () => {
    expect(dependents('attributes', DEFAULT_SECTIONS)).toContain('characters');
    // The sense-impression pools are not a leaf: senses name the phrasings they
    // describe with, so dropping them takes movement — and combat with it.
    expect(dependents('grammar', DEFAULT_SECTIONS)).toContain('movement');
    // Nothing refers to equipment, so it can always be dropped alone.
    expect(dependents('equipment', DEFAULT_SECTIONS)).toEqual([]);
  });
});
