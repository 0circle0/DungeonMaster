/** The world envelope: the file form a world takes outside the repository. */

import type { Prefab, InstanceMap, StyleTables, Contract } from '@dm/module';

/** Bumped when the envelope gains or loses a field readers cannot infer. */
export const WORLD_FORMAT = 1;

/** The authored half of a world: prefabs, instance links and style tables. */
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
  /** The assembled document: `maps/<id>/` folders inlined into `world.maps`, `extends` left unresolved. */
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
