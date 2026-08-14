/**
 * Small shared types for the app layer.
 *
 * `MetaCommand` is re-exported so components import it from `lib/` with a
 * relative specifier — the vitest config aliases `@` to the *editor's*
 * directory, so app lib code keeps to relative imports.
 */

export type { MetaCommand } from '@dm/play';
export type { CharacterChoices as CharacterChoicesLike } from '@dm/engine';
