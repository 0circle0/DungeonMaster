/** Entity identity. */

/** Branded string ids, so a monster id cannot be passed where an item id belongs. */
export type Id<Kind extends string> = string & { readonly __kind: Kind };

/** A reference to authored content, e.g. `monsters.skeleton`. */
export type ContentId = Id<'content'>;
/** A runtime entity spawned during play, e.g. `e:42`. */
export type EntityId = Id<'entity'>;

export function contentId(value: string): ContentId {
  return value as ContentId;
}

export function entityId(value: string): EntityId {
  return value as EntityId;
}

/** Monotonic entity id allocator. */
export class IdAllocator {
  private counter: number;

  constructor(start = 0) {
    this.counter = start;
  }

  next(): EntityId {
    this.counter += 1;
    return entityId(`e:${this.counter}`);
  }

  save(): number {
    return this.counter;
  }

  static fromSaved(counter: number): IdAllocator {
    return new IdAllocator(counter);
  }
}

/** Valid content id: dot-separated lowercase segments, e.g. `items.iron_sword`. */
const CONTENT_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export function isValidContentId(value: string): boolean {
  return CONTENT_ID_RE.test(value);
}
