/**
 * Starting a world from someone else's rules.
 *
 * Aurendel does this already, and has always done it in Python:
 * `modules/aurendel/src/build.py` hardcodes `core_fantasy/module.json` as its
 * base and copies the ruleset in at build time. `extends` cannot express it —
 * the linter schema-checks a raw child before resolving the merge, so a module
 * without its own `rules` block fails with "attributes is required" — which is
 * exactly why that script copies rather than inherits.
 *
 * That left the studio with no path to a ruleset at all. `blankModule()` gives
 * one attribute, one resource and one class; everything past that had to be
 * typed. So this is build.py's composition step, moved somewhere an author can
 * reach it, and generalised: the source is any world, not one hardcoded file.
 *
 * What is *not* here is `narrative.systemText`'s 54 fragments. They are not
 * optional and never a choice: `compileModule` treats a missing one as a load
 * error, because `{actor} {outcome} {target}` renders as "David  a bog hound"
 * without them. `blankModule()` writes them from `requiredSystemText()`, and
 * every composition starts from `blankModule()`, so they are always present.
 * The other 146 messages carry schema defaults — omitting one is how an author
 * says the shipped wording is fine — so they are worth copying only when the
 * source has rewritten them, which is the one prose checkbox below.
 */

import { blankModule } from './templates';
import type { ModuleDoc } from './store';

export interface RulesetSection {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  /** Top-level `section.key` paths this copies. */
  readonly paths: readonly string[];
  /** Sections whose absence would leave this one referring to nothing. */
  readonly requires: readonly string[];
  /**
   * The schema will not accept a document without this. Unchecking does not
   * omit it — there is nothing to omit to — it falls back to the one-of-each
   * version in the blank scaffold.
   */
  readonly required?: boolean;
  /** Off unless asked for. */
  readonly optional?: boolean;
}

/**
 * The sections, in the order they are worth thinking about.
 *
 * Grouped by what an author would decide together rather than by where the
 * schema happens to put them: "damage and conditions" is one decision across
 * three keys, and `rules.spellcasting` is one key that is a whole decision.
 */
export const RULESET_SECTIONS: readonly RulesetSection[] = [
  {
    id: 'attributes',
    label: 'Attributes & resources',
    detail: 'What a character is made of, and what running out of it means.',
    paths: ['rules.attributes', 'rules.resources', 'rules.derivedStats', 'rules.vitalResource', 'rules.initiativeStat'],
    requires: [],
    required: true,
  },
  {
    id: 'progression',
    label: 'Progression',
    detail: 'Levels, the experience between them, and mastery tiers.',
    paths: ['rules.progression', 'rules.masteryTiers'],
    requires: [],
    required: true,
  },
  {
    id: 'damage',
    label: 'Damage & conditions',
    detail: 'Damage types, the conditions they inflict, and the saves against them.',
    paths: ['rules.damageTypes', 'rules.conditions', 'rules.savingThrows'],
    // A saving throw names the attribute it is rolled against.
    requires: ['attributes'],
  },
  {
    id: 'combat',
    label: 'Combat',
    detail: 'Actions, how a roll resolves, stances, cover, opportunities and rest.',
    paths: ['rules.resolution', 'rules.opportunities', 'rules.coverTypes', 'rules.rests'],
    // An opportunity spends an ability.
    requires: ['skills'],
  },
  {
    id: 'movement',
    label: 'Movement, stances & senses',
    detail: 'How things move and carry themselves, what they notice, and how big they are.',
    // Stances live here rather than with combat, and the schema insists: a
    // stance emits an impression a sense must be able to pick up, while
    // `perception.defaultStance` names one back. Splitting them would be a
    // dependency cycle, and the honest grouping is that a stance is a way of
    // moving.
    paths: [
      'rules.senses', 'rules.perception', 'rules.stances', 'rules.movementModes', 'rules.sizes',
      'rules.defaultSize', 'rules.defaultMovementMode', 'rules.interactionRange', 'rules.search',
    ],
    // Senses name the phrasings they describe with; a stance is concealed by a
    // skill.
    requires: ['grammar', 'skills'],
  },
  {
    id: 'equipment',
    label: 'Equipment & economy',
    detail: 'Where gear goes, what it can be, and what it costs.',
    paths: ['rules.equipmentSlots', 'rules.itemProperties', 'rules.currency'],
    requires: [],
  },
  {
    id: 'taxonomy',
    label: 'Creature taxonomy',
    detail: 'Creature types, languages, alignments and how strangers regard you.',
    paths: ['rules.creatureTypes', 'rules.languages', 'rules.alignments', 'rules.dispositionBands'],
    requires: [],
  },
  {
    id: 'spellcasting',
    label: 'Spellcasting',
    detail: 'Schools, slots and what casting costs. Leave it out for a world without magic.',
    paths: ['rules.spellcasting'],
    // Spell slots come back on a rest, and rests arrive with combat.
    requires: ['damage', 'combat'],
  },
  {
    id: 'skills',
    label: 'Skills & abilities',
    detail: 'What characters can be good at, the things they can do, and what each costs to use.',
    // `rules.actionTypes` sits here rather than with combat because every
    // ability names one, while combat's own opportunities name an ability —
    // splitting them the other way round is a dependency cycle.
    paths: ['content.skills', 'content.abilities', 'rules.actionTypes'],
    // Abilities name the attribute they use, the mastery tier they need, and
    // the save they are resisted by.
    requires: ['attributes', 'progression', 'damage'],
  },
  {
    id: 'characters',
    label: 'Ancestries & classes',
    detail: 'Who a character can be. Classes name an attribute and their abilities.',
    paths: ['content.ancestries', 'content.classes'],
    // An ancestry is a creature type of some size that speaks languages.
    requires: ['attributes', 'skills', 'taxonomy', 'movement'],
    required: true,
  },
  {
    id: 'creation',
    label: 'Character creation',
    detail: 'Point buy, its costs, starting rank, level and purse.',
    paths: ['start.creation'],
    requires: ['characters'],
  },
  {
    id: 'grammar',
    label: 'Sense-impression pools',
    detail: 'The phrasings the engine draws on when describing what a place is like.',
    paths: ['narrative.textGrammar'],
    requires: [],
  },
  {
    id: 'prose',
    label: 'The full wording',
    detail:
      'All 200 engine messages rather than the 54 a document must declare. '
      + 'Only worth taking when the source rewrote them: the rest carry defaults.',
    paths: ['narrative.systemText'],
    requires: [],
    optional: true,
  },
];

export const DEFAULT_SECTIONS: readonly string[] =
  RULESET_SECTIONS.filter((section) => !section.optional).map((section) => section.id);

const byId = new Map(RULESET_SECTIONS.map((section) => [section.id, section]));

/**
 * Close a selection over its prerequisites.
 *
 * Taking classes without attributes leaves every `primaryAttribute` pointing at
 * nothing — a document that fails to compile the moment it is made, for a
 * reason expressed nowhere on the screen that made it. So the dialog adds what
 * is needed rather than letting somebody find out afterwards.
 */
export function withPrerequisites(selected: Iterable<string>): Set<string> {
  const out = new Set(selected);
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of [...out]) {
      for (const needed of byId.get(id)?.requires ?? []) {
        if (!out.has(needed)) { out.add(needed); grew = true; }
      }
    }
  }
  return out;
}

/** Which chosen sections depend on this one, so unchecking can say so. */
export function dependents(id: string, selected: Iterable<string>): string[] {
  const chosen = new Set(selected);
  return RULESET_SECTIONS
    .filter((section) => chosen.has(section.id) && withPrerequisites([section.id]).has(id) && section.id !== id)
    .map((section) => section.id);
}

function read(doc: Record<string, unknown>, path: string): unknown {
  const [section, key] = path.split('.') as [string, string];
  const container = doc[section];
  if (typeof container !== 'object' || container === null) return undefined;
  return (container as Record<string, unknown>)[key];
}

function write(doc: Record<string, unknown>, path: string, value: unknown): void {
  const [section, key] = path.split('.') as [string, string];
  const container = (doc[section] ?? {}) as Record<string, unknown>;
  doc[section] = { ...container, [key]: value };
}

/**
 * A new document, built from the blank scaffold and whatever was ticked.
 *
 * The scaffold is always the base rather than the source: it is the thing known
 * to compile, and it deliberately sets no start location and no areas so the
 * console reads as a to-do list. A section that is not taken simply keeps
 * whatever the scaffold had — which for the schema minimums is one attribute,
 * one resource and one class, and for everything else is nothing at all.
 */
export function composeModule(
  source: Record<string, unknown>,
  selected: Iterable<string>,
): ModuleDoc {
  const doc = blankModule() as Record<string, unknown>;
  const take = withPrerequisites(selected);

  for (const section of RULESET_SECTIONS) {
    if (!take.has(section.id)) continue;
    for (const path of section.paths) {
      const value = read(source, path);
      if (value === undefined) continue;
      write(doc, path, value);
    }
  }

  return doc;
}
