/**
 * What a world is, once it leaves the repository.
 *
 * The studio and the player are separate origins with separate stores, so a
 * file is the only thing that passes between them — and a file is also what a
 * player hands to a friend, and what the content build ships. One shape for all
 * three, versioned from the first commit, because the alternative is two
 * hand-maintained readers that agree until the day they do not.
 *
 * A separate export entry — `@dm/library/envelope` — because this file is the
 * half with no browser in it. The content build runs in Node and needs the
 * shape; importing the package root would drag IndexedDB and CompressionStream
 * into a project that has no DOM lib and no business having one. Exactly the
 * split `@dm/module` and `@dm/module/load` already draw, for the same reason.
 *
 * Deliberately *not* the split `project/` file map. That form exists to give
 * git a readable diff, and there is no git in a browser; regenerating it from
 * the document is a pure function away when an export ever needs it.
 */

import type { Prefab, InstanceMap, StyleTables, Contract } from '@dm/module';

/** Bumped when the envelope gains or loses a field readers cannot infer. */
export const WORLD_FORMAT = 1;

/**
 * The authored half of a world: what generated its entries, rather than the
 * entries themselves.
 *
 * Replaces the studio's old `ProjectAuthoring`, minus the two fields that were
 * really filesystem facts — `moduleName` was a directory and `isProject` was
 * whether that directory existed. A world either carries prefabs or it does
 * not, which is a question the data answers by itself.
 */
export interface WorldAuthoring {
  readonly prefabs: readonly Prefab[];
  readonly instances: InstanceMap;
  readonly style: StyleTables;
  readonly contract: Contract;
}

export const NO_AUTHORING: WorldAuthoring = {
  prefabs: [],
  instances: {},
  style: {},
  contract: {},
};

export interface WorldEnvelope {
  /** Sniffable discriminator: this is an envelope, not a bare document. */
  readonly dmWorld: 1;
  readonly format: number;
  /**
   * The assembled document — `maps/<id>/` folders inlined into `world.maps`,
   * and `extends` deliberately left unresolved. Baking a base into a document
   * the studio then saves would corrupt it permanently.
   */
  readonly doc: Record<string, unknown>;
  /** Null for a world that was never a project, and for a bare import. */
  readonly authoring: WorldAuthoring | null;
  readonly title: string;
  /** What a download should be called: `aurendel.module.json`. */
  readonly filename: string;
}

/** Is this parsed JSON an envelope, rather than a bare module document? */
export function isEnvelope(value: unknown): value is WorldEnvelope {
  return (
    typeof value === 'object' && value !== null &&
    (value as { dmWorld?: unknown }).dmWorld === 1 &&
    typeof (value as { doc?: unknown }).doc === 'object'
  );
}

/** Title and filename for a document, used when wrapping a bare import. */
export function describeDoc(doc: Record<string, unknown>, fallback: string): {
  title: string;
  filename: string;
} {
  const meta = (doc['meta'] ?? {}) as Record<string, unknown>;
  const id = typeof doc['id'] === 'string' ? doc['id'] : fallback;
  const title = typeof meta['title'] === 'string' && meta['title'] ? meta['title'] : id;
  return { title, filename: `${id}.module.json` };
}

/** Wrap a bare document — an editor export, or a file from anywhere else. */
export function envelopeFromDoc(
  doc: Record<string, unknown>,
  fallback: string,
  authoring: WorldAuthoring | null = null,
): WorldEnvelope {
  const { title, filename } = describeDoc(doc, fallback);
  return { dmWorld: 1, format: WORLD_FORMAT, doc, authoring, title, filename };
}
