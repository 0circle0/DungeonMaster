/**
 * Authoring-time algorithms.
 *
 * The four things a generator has to get right for a module to *play* the way
 * it reads, and which no amount of schema validation can check. Each one was a
 * silent failure in a shipped world before it was a function.
 *
 * They live outside `@dm/module` deliberately: `fit` has to agree with the
 * engine about spacing, so it calls the engine's own `diceMean` rather than a
 * second implementation of it — and a module that depended on the engine would
 * be a cycle. They live outside the studio just as deliberately: they are ours,
 * there are four of them, and as code they get types and tests rather than
 * being user script in a sandbox.
 */

export { fit, roomsThatFit, PACKING, MAX_SIDE } from './dungeon.js';
export type { FitRequest, FitResult } from './dungeon.js';

export { layOut, ringSpot } from './layout.js';
export type { Positioned, AreaSize, Placement } from './layout.js';

export { standingDc, dcAt } from './standing.js';
export type { StandingOptions } from './standing.js';

export { buildChain, chainProblems } from './chain.js';
export type { ChainLink, ChainOptions, ChainCheckOptions } from './chain.js';
