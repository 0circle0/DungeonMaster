/**
 * The world library.
 *
 * Worlds live on the machine that edits or plays them: nothing here talks to a
 * server, and after the client-side conversion there is no server to talk to.
 * The shipped examples arrive as static files, once, and become ordinary worlds
 * the moment they land.
 */

export {
  WORLD_FORMAT,
  NO_AUTHORING,
  isEnvelope,
  describeDoc,
  envelopeFromDoc,
} from './envelope.js';
export type { WorldEnvelope, WorldAuthoring } from './envelope.js';

export { gzip, gunzip, gzipJson, gunzipJson, isGzip, canCompress } from './gzip.js';
export type { Codec } from './gzip.js';

export { openLibrary, hasStorage, closeLibrary, DB_NAME, DB_VERSION } from './db.js';
export type { WorldMeta, FileRecord } from './db.js';

export {
  listWorlds,
  readWorld,
  readWorldMeta,
  writeWorld,
  createWorld,
  deleteWorld,
  renameWorld,
  // The studio's storage: a world is its project files, and a save writes the
  // ones that changed.
  readWorldFiles,
  writeWorldFiles,
  createWorldFromFiles,
  factsFor,
  rememberLastOpened,
  lastOpened,
} from './worlds.js';
export type { FileChange, WorldFacts } from './worlds.js';

export { claimWorld } from './claim.js';
export type { WorldClaim } from './claim.js';

export { downloadProject, readWorldFile, readProjectFile, isProjectBundle } from './files.js';

export { fetchCatalog, fetchExampleEnvelope, fetchExampleProject, EMPTY_CATALOG, CONTENT_BASE } from './catalog.js';
export type { Catalog, CatalogEntry } from './catalog.js';

export { resolveExtendsFor } from './extends.js';
export type { ResolveOutcome } from './extends.js';

export { requestPersistence, estimateStorage, isQuotaError, OUT_OF_SPACE } from './quota.js';
export type { PersistenceResult, StorageEstimate } from './quota.js';
