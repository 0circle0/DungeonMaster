/**
 * Studio display-label overrides.
 *
 * The generated labels are right almost everywhere; the exceptions are listed
 * here rather than patched into `lib/schema.ts`, which stays a pure schema
 * mirror. "Perception" would otherwise appear twice — once for the rules
 * singleton and once for the simulation view — and these overrides are how the
 * studio tells them apart.
 */

export const SINGLETON_LABELS: Record<string, string> = {
  'rules.perception': 'Perception rules',
};

export function singletonLabel(path: string, fallback: string): string {
  return SINGLETON_LABELS[path] ?? fallback;
}

/** Acronyms the camelCase splitter mangles ("Starting Poi", "Xp Per Kill"). */
const ACRONYMS: Record<string, string> = {
  Poi: 'POI',
  Id: 'ID',
  Xp: 'XP',
  Npc: 'NPC',
  Npcs: 'NPCs',
  Json: 'JSON',
  Dsl: 'DSL',
};

/** A studio field label: the generated label with acronyms restored. */
export function fieldLabel(generated: string): string {
  return generated
    .split(' ')
    .map((word) => ACRONYMS[word] ?? word)
    .join(' ');
}
