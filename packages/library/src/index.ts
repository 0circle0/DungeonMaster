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
export type { WorldMeta } from './db.js';

export {
  listWorlds,
  readWorld,
  writeWorld,
  createWorld,
  deleteWorld,
  renameWorld,
  writeDraft,
  readDraft,
  clearDraft,
  rememberLastOpened,
  lastOpened,
} from './worlds.js';

export { downloadWorld, downloadEnvelope, downloadProject, readWorldFile } from './files.js';

export { fetchCatalog, fetchExampleEnvelope, EMPTY_CATALOG, CONTENT_BASE } from './catalog.js';
export type { Catalog, CatalogEntry } from './catalog.js';

export { resolveExtendsFor } from './extends.js';
export type { ResolveOutcome } from './extends.js';

export { requestPersistence, estimateStorage, isQuotaError, OUT_OF_SPACE } from './quota.js';
export type { PersistenceResult, StorageEstimate } from './quota.js';
