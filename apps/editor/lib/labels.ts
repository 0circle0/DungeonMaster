/** Studio display-label overrides. */

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
