/** Authoring-time algorithms. */

export { fit, sizeToFit, measureRooms, PACKING, MAX_SIDE } from './dungeon.js';
export type { FitRequest, FitResult, RoomMeasurement } from './dungeon.js';

export { layOut, ringSpot } from './layout.js';
export type { Positioned, AreaSize, Placement } from './layout.js';

export { standingDc, dcAt } from './standing.js';
export type { StandingOptions } from './standing.js';

export { buildChain, chainProblems } from './chain.js';
export type { ChainLink, ChainOptions, ChainCheckOptions } from './chain.js';

export { rumour, favour, talk, givenFlag } from './dialogue.js';
export type { Voice, Fragment } from './dialogue.js';

export { rumoured, readRumoured, threadAnchored, noticing, dcKnowing, floorOf } from './discover.js';
export type { Rumoured, Discover, Noticing } from './discover.js';
