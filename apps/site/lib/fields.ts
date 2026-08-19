/**
 * One shape for every field table on the site.
 *
 * The walk supplies structure, `FIELD_DOCS` supplies the sentence, and this
 * puts them together once so no page has to know that they were ever apart.
 * All of it runs at build time: pages are server components and the export is
 * static, so Zod never reaches the browser.
 */

import {
  walkModuleSchema,
  FIELD_DOCS,
  SYSTEM_TEXT,
  COLLECTION_PATHS,
  type SectionRow,
  type TypeNode,
} from '@dm/module';

export type { TypeNode, SectionRow };

export interface DocField {
  path: string;
  key: string;
  type: TypeNode;
  required: boolean;
  defaultValue: unknown;
  /** The one line sentence. Guaranteed present by `fieldDocs.test.ts`. */
  doc: string;
}

export interface DocSection {
  path: string;
  trail: string[];
  /** `content.npcs.shop` reads as `npcs → shop`, the area being the page. */
  title: string;
  fields: DocField[];
  fromRegistry: boolean;
}

/**
 * Where the requirement object is documented.
 *
 * It is one vocabulary reached from some thirty places, and the walk gives it
 * to whichever path met it first. That happens to be under abilities, which
 * would be a misleading place to read it, so these sections are lifted onto
 * their own page and left out of Content.
 */
export const REQUIREMENT_ROOT = 'content.abilities.requires';

const SECTIONS: DocSection[] = walkModuleSchema().map((section) => ({
  path: section.path,
  trail: section.trail,
  title: section.trail.length > 1 ? section.trail.slice(1).join(' → ') : (section.trail[0] ?? 'Document'),
  fromRegistry: section.fromRegistry,
  fields: section.fields.map((field) => ({
    path: field.path,
    key: field.key,
    type: field.type,
    required: field.required,
    defaultValue: field.defaultValue,
    doc: FIELD_DOCS[field.path] ?? '',
  })),
}));

function isRequirement(path: string): boolean {
  return path === REQUIREMENT_ROOT || path.startsWith(`${REQUIREMENT_ROOT}.`);
}

/** The document's own top-level fields. */
export function rootSection(): DocSection {
  return SECTIONS.find((section) => section.path === '')!;
}

/** Every section under one top-level area, requirement pages excluded. */
export function areaSections(...areas: string[]): DocSection[] {
  return SECTIONS.filter((section) => {
    const [area] = section.trail;
    return section.path !== ''
      && area !== undefined
      && areas.includes(area)
      && !isRequirement(section.path)
      && !section.fromRegistry;
  });
}

/** The gating vocabulary, on its own. */
export function requirementSections(): DocSection[] {
  return SECTIONS.filter((section) => isRequirement(section.path));
}

/** Which anchor a section owns, and what a reference link should point at. */
export function anchorFor(path: string): string {
  return path.replace(/\./g, '-');
}

/**
 * The page a collection lives on, so a reference can link across pages.
 *
 * Requirement sections are the one exception to "the area is the page".
 */
export function pageFor(path: string): string {
  if (isRequirement(path)) return '/format/requirements';
  const area = path.split('.')[0] ?? '';
  if (['rules', 'content', 'world', 'narrative'].includes(area)) return `/format/${area}`;
  return '/format/module';
}

/** A cross-collection reference, resolved to a page and an anchor. */
export function linkFor(target: string): string {
  return `${pageFor(target)}#${anchorFor(target)}`;
}

export interface SystemTextRow {
  key: string;
  tier: 'fragment' | 'message';
  placeholders: readonly string[];
  text: string;
  doc: string;
}

export function systemTextRows(): SystemTextRow[] {
  return SYSTEM_TEXT.map((entry) => ({
    key: entry.key,
    tier: entry.tier,
    placeholders: entry.placeholders,
    text: entry.text,
    doc: entry.doc,
  }));
}

export function collectionPaths(): readonly string[] {
  return COLLECTION_PATHS;
}

/** Every field that takes a formula, grouped by which kind it takes. */
export function dslFields(): Record<string, string[]> {
  const groups: Record<string, string[]> = { expression: [], predicate: [], effect: [], rule: [] };
  for (const section of SECTIONS) {
    for (const field of section.fields) {
      const node = field.type.kind === 'array' ? field.type.of : field.type;
      if (node.kind !== 'dsl') continue;
      const bucket = groups[node.dsl];
      if (bucket) bucket.push(field.path);
    }
  }
  return groups;
}

/** Counts the landing page quotes, so the numbers cannot go stale. */
export function formatSize(): { fields: number; sections: number; collections: number; messages: number } {
  return {
    fields: SECTIONS.reduce((total, section) => total + section.fields.length, 0),
    sections: SECTIONS.length,
    collections: COLLECTION_PATHS.length,
    messages: SYSTEM_TEXT.length,
  };
}
