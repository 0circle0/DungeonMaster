/**
 * The library is where the user's work lives, so these tests are about not
 * losing it: a world stored and read back must be the same world, a file from
 * any era must still open, and the absence of a server must never look like a
 * failure.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { stableStringify } from '@dm/core';
import { gzipJson, gunzipJson, isGzip, gzip } from './gzip.js';
import { envelopeFromDoc, isEnvelope, NO_AUTHORING } from './envelope.js';
import { readWorldFile } from './files.js';
import { fetchCatalog, fetchExampleEnvelope, EMPTY_CATALOG } from './catalog.js';
import { closeLibrary, DB_NAME } from './db.js';
import {
  listWorlds, readWorld, createWorld, writeWorld, deleteWorld, renameWorld,
  writeDraft, readDraft, clearDraft, rememberLastOpened, lastOpened,
} from './worlds.js';
import type { WorldEnvelope } from './envelope.js';

const MINIMAL = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../../modules/minimal/module.json', import.meta.url)), 'utf8'),
) as Record<string, unknown>;

const envelopeOf = (doc: Record<string, unknown> = MINIMAL): WorldEnvelope => envelopeFromDoc(doc, 'minimal');

/** A fresh database per test: leftovers between them hide ordering bugs. */
async function freshLibrary(): Promise<void> {
  await closeLibrary();
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

beforeEach(freshLibrary);

describe('gzip', () => {
  it('round-trips a document unchanged', async () => {
    const { bytes, codec, rawBytes } = await gzipJson(MINIMAL);
    expect(codec).toBe('gzip');
    expect(isGzip(bytes)).toBe(true);
    expect(bytes.length).toBeLessThan(rawBytes);
    expect(await gunzipJson(bytes)).toEqual(MINIMAL);
  });

  it('inflates only what is actually compressed', async () => {
    // A host that sets `Content-Encoding: gzip` from the file extension has
    // already inflated the body; handing plain JSON to a decompressor throws.
    const plain = new TextEncoder().encode(JSON.stringify({ hello: 'world' }));
    expect(isGzip(plain)).toBe(false);
    expect(await gunzipJson(plain)).toEqual({ hello: 'world' });
  });
});

describe('worlds', () => {
  it('stores and reads back a byte-identical document', async () => {
    const meta = await createWorld(envelopeOf());
    const read = await readWorld(meta.key);
    expect(read).not.toBeNull();
    expect(stableStringify(read!.envelope.doc)).toBe(stableStringify(MINIMAL));
  });

  it('stores the payload compressed, not raw', async () => {
    const meta = await createWorld(envelopeOf());
    expect(meta.storedBytes).toBeLessThan(meta.rawBytes);
  });

  it('records the module hash when the world compiles', async () => {
    const meta = await createWorld(envelopeOf());
    expect(meta.hash).toMatch(/^[0-9a-f]+$/);
  });

  it('still stores a world that does not compile', async () => {
    // Most of a half-finished world does not compile, and refusing to store it
    // is how an afternoon gets lost.
    const broken = { ...MINIMAL, rules: {} };
    const meta = await createWorld(envelopeOf(broken));
    expect(meta.hash).toBeNull();
    expect(await readWorld(meta.key)).not.toBeNull();
  });

  it('gives two worlds with the same module id separate keys', async () => {
    const a = await createWorld(envelopeOf());
    const b = await createWorld(envelopeOf());
    expect(a.key).not.toBe(b.key);
    expect(a.moduleId).toBe(b.moduleId);
    expect((await listWorlds()).length).toBe(2);
  });

  it('keeps createdAt and origin across a rewrite', async () => {
    const first = await createWorld(envelopeOf(), 'example', 'aurendel');
    const again = await writeWorld(first.key, { ...envelopeOf(), title: 'Changed' }, first);
    expect(again.createdAt).toBe(first.createdAt);
    expect(again.origin).toBe('example');
    expect(again.originId).toBe('aurendel');
    expect(again.title).toBe('Changed');
  });

  it('lists newest first', async () => {
    const older = await createWorld(envelopeOf());
    await writeWorld(older.key, envelopeOf(), { ...older, updatedAt: 1 });
    const newer = await createWorld({ ...envelopeOf(), title: 'Newer' });
    const listed = await listWorlds();
    expect(listed[0]?.key).toBe(newer.key);
  });

  it('renames without touching the document', async () => {
    const meta = await createWorld(envelopeOf());
    const renamed = await renameWorld(meta.key, 'My World');
    expect(renamed?.title).toBe('My World');
    const read = await readWorld(meta.key);
    expect(stableStringify(read!.envelope.doc)).toBe(stableStringify(MINIMAL));
  });

  it('deletes the world, its payload and its draft together', async () => {
    const meta = await createWorld(envelopeOf());
    await writeDraft(meta.key, { half: 'typed' });
    await deleteWorld(meta.key);
    expect(await readWorld(meta.key)).toBeNull();
    expect(await readDraft(meta.key)).toBeNull();
    expect(await listWorlds()).toEqual([]);
  });
});

describe('drafts', () => {
  it('keeps work that does not validate, and clears when it does', async () => {
    const meta = await createWorld(envelopeOf());
    await writeDraft(meta.key, { id: 'half-typ' });
    const draft = await readDraft(meta.key);
    expect(draft?.doc).toEqual({ id: 'half-typ' });
    await clearDraft(meta.key);
    expect(await readDraft(meta.key)).toBeNull();
  });
});

describe('lastOpened', () => {
  it('remembers, and forgets', async () => {
    expect(await lastOpened()).toBeNull();
    await rememberLastOpened('abc');
    expect(await lastOpened()).toBe('abc');
    await rememberLastOpened(null);
    expect(await lastOpened()).toBeNull();
  });
});

describe('readWorldFile', () => {
  const asFile = (text: string, name = 'w.module.json'): File =>
    new File([text], name, { type: 'application/json' });

  it('accepts a bare document, which is what Export has always produced', async () => {
    const envelope = await readWorldFile(asFile(JSON.stringify(MINIMAL, null, 2), 'minimal.module.json'));
    expect(isEnvelope(envelope)).toBe(true);
    expect(envelope.doc['id']).toBe('minimal');
    expect(envelope.authoring).toBeNull();
  });

  it('accepts an envelope', async () => {
    const source = { ...envelopeOf(), authoring: NO_AUTHORING, title: 'Kept' };
    const envelope = await readWorldFile(asFile(JSON.stringify(source)));
    expect(envelope.title).toBe('Kept');
    expect(envelope.authoring).toEqual(NO_AUTHORING);
  });

  it('accepts a gzipped artifact', async () => {
    const bytes = await gzip(new TextEncoder().encode(JSON.stringify(envelopeOf())));
    const file = new File([bytes as BlobPart], 'aurendel.json.gz');
    expect((await readWorldFile(file)).doc['id']).toBe('minimal');
  });

  it('explains itself on a file that is not a world', async () => {
    await expect(readWorldFile(asFile('{"nope":1}'))).rejects.toThrow(/does not look like a module/);
    await expect(readWorldFile(asFile('not json'))).rejects.toThrow(/is not JSON/);
  });
});

describe('catalog', () => {
  /** A deployment that ships nothing is a supported configuration. */
  const withFetch = async (impl: typeof fetch, body: () => Promise<void>): Promise<void> => {
    const original = globalThis.fetch;
    globalThis.fetch = impl;
    try { await body(); } finally { globalThis.fetch = original; }
  };

  it('is empty rather than an error when there is no content directory', async () => {
    await withFetch(
      (() => Promise.resolve(new Response('not found', { status: 404 }))),
      async () => {
        expect(await fetchCatalog()).toEqual(EMPTY_CATALOG);
        expect(await fetchExampleEnvelope('aurendel')).toBeNull();
      },
    );
  });

  it('is empty rather than an error when the network fails', async () => {
    await withFetch(
      (() => Promise.reject(new Error('offline'))),
      async () => {
        expect(await fetchCatalog()).toEqual(EMPTY_CATALOG);
        expect(await fetchExampleEnvelope('aurendel')).toBeNull();
      },
    );
  });

  it('is empty rather than an error when the body is not a catalog', async () => {
    await withFetch(
      (() => Promise.resolve(new Response('<!doctype html><title>login</title>'))),
      async () => { expect(await fetchCatalog()).toEqual(EMPTY_CATALOG); },
    );
  });

  it('reads a gzipped example', async () => {
    const bytes = await gzip(new TextEncoder().encode(JSON.stringify(envelopeOf())));
    await withFetch(
      (() => Promise.resolve(new Response(bytes as BodyInit))),
      async () => {
        const envelope = await fetchExampleEnvelope('minimal');
        expect(envelope?.doc['id']).toBe('minimal');
      },
    );
  });

  it('reads an example a host already inflated for us', async () => {
    await withFetch(
      (() => Promise.resolve(new Response(JSON.stringify(envelopeOf())))),
      async () => {
        const envelope = await fetchExampleEnvelope('minimal');
        expect(envelope?.doc['id']).toBe('minimal');
      },
    );
  });
});
