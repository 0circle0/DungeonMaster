/** Starting a world from someone else's rules. */

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
  /** The schema will not accept a document without this. */
  readonly required?: boolean;
  /** Off unless asked for. */
  readonly optional?: boolean;
}

/** The sections, grouped by what an author decides together. */
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
    // Stances live here rather than with combat: perception names one back.
    paths: [
      'rules.senses', 'rules.perception', 'rules.stances', 'rules.movementModes', 'rules.sizes',
      'rules.defaultSize', 'rules.defaultMovementMode', 'rules.interactionRange', 'rules.search',
    ],
    // Senses name the phrasings they describe with; a stance is concealed by a skill.
    requires: ['grammar', 'skills'],
  },
  {
    id: 'equipment',
    label: 'Equipment & economy',
    detail: 'Where gear goes, what it can be, and what it costs.',
    paths: ['rules.equipmentSlots', 'rules.itemProperties', 'rules.currency'],
    // A property may name the attributes a weapon carrying it can be swung with, which is what finesse is.
    requires: ['attributes'],
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
    // `rules.actionTypes` sits here: every ability names one.
    paths: ['content.skills', 'content.abilities', 'rules.actionTypes'],
    // Abilities name the attribute they use, the mastery tier they need, and the save they are resisted by.
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

/** Close a selection over its prerequisites. */
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

/** A new document, built from the blank scaffold and whatever was ticked. */
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
