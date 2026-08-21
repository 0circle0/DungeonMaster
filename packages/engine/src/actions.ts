/** Actions: what was asked for. */

import type { Position } from './grid/tiles.js';
import type { EntityId } from './state.js';

/** Who is acting. */
interface Actor {
  readonly actor?: EntityId;
}

export type Action =
  // — movement ——————————————————————————————————————————————
  | (Actor & { readonly type: 'move'; readonly to: Position })
  | (Actor & { readonly type: 'step'; readonly direction: Direction })
  /** Walk a whole route, stopping early if something interesting happens. */
  | (Actor & { readonly type: 'travelTo'; readonly to: Position })
  /** Move between areas on the world map. */
  | (Actor & { readonly type: 'travelToArea'; readonly area: string })
  /** Enter a point of interest, or a dungeon from its entrance. */
  | (Actor & { readonly type: 'enter'; readonly target: string })
  | (Actor & { readonly type: 'leave' })
  /** Choose how to move: creeping, walking, running. */
  | (Actor & { readonly type: 'setStance'; readonly stance: string })

  // — combat ————————————————————————————————————————————————
  | (Actor & { readonly type: 'attack'; readonly target: EntityId })
  | (Actor & {
      readonly type: 'useAbility';
      readonly ability: string;
      readonly target?: EntityId;
      /** For area abilities: where it is centred or aimed. */
      readonly at?: Position;
      /** Cast it slowly instead of spending a slot, when the spell allows. */
      readonly ritual?: boolean;
    })
  | (Actor & { readonly type: 'endTurn' })
  | (Actor & { readonly type: 'disarm' })

  // — trade —————————————————————————————————————————————————
  | (Actor & { readonly type: 'buy'; readonly npc: EntityId; readonly item: string; readonly quantity?: number })
  | (Actor & { readonly type: 'sell'; readonly npc: EntityId; readonly item: string; readonly quantity?: number })
  | (Actor & { readonly type: 'flee' })

  // — items —————————————————————————————————————————————————
  | (Actor & { readonly type: 'useItem'; readonly item: string; readonly target?: EntityId })
  | (Actor & { readonly type: 'equip'; readonly item: string; readonly slot?: string })
  | (Actor & { readonly type: 'unequip'; readonly item: string })
  /** Omit `item` to take everything within reach. */
  | (Actor & { readonly type: 'take'; readonly item?: string; readonly quantity?: number })
  | (Actor & { readonly type: 'drop'; readonly item: string; readonly quantity?: number })
  | (Actor & { readonly type: 'give'; readonly item: string; readonly to: EntityId })

  // — interaction ———————————————————————————————————————————
  | (Actor & { readonly type: 'open'; readonly target: string })
  | (Actor & { readonly type: 'search' })
  | (Actor & { readonly type: 'look'; readonly at?: string })
  /**
   * Stop and use one sense deliberately. Carries the sense id rather than naming hearing and smell,
   * so a module that declares tremorsense gets a verb for it without the engine knowing the word.
   */
  | (Actor & { readonly type: 'sense'; readonly sense: string })
  | (Actor & { readonly type: 'talk'; readonly npc: EntityId })
  | (Actor & { readonly type: 'choose'; readonly option: string })
  | (Actor & { readonly type: 'rest'; readonly kind: string })
  | (Actor & { readonly type: 'wait'; readonly minutes?: number })

  // — party —————————————————————————————————————————————————
  /** Switch which character the player is controlling. */
  | { readonly type: 'select'; readonly entity: EntityId }
  /** Whether the rest of the party walks with whoever is being controlled. */
  | (Actor & { readonly type: 'setFollow'; readonly follow: boolean })

  // — quests ————————————————————————————————————————————————
  | (Actor & { readonly type: 'acceptQuest'; readonly quest: string })
  | (Actor & { readonly type: 'abandonQuest'; readonly quest: string })

  // — meta ——————————————————————————————————————————————————
  /**
   * Advance the world clock without the party doing anything, which drives off-screen simulation.
   * Separate from `wait` so a test can tick the world without going through a character.
   */
  | { readonly type: 'advanceTime'; readonly minutes: number };

export type ActionType = Action['type'];

export const DIRECTIONS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;

export type Direction = (typeof DIRECTIONS)[number];

/** Tile offset for each compass direction. */
export const DIRECTION_OFFSETS: Readonly<Record<Direction, Position>> = {
  north: { x: 0, y: -1 },
  northeast: { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  southeast: { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  southwest: { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  northwest: { x: -1, y: -1 },
};

export function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}
