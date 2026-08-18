/**
 * Worlds as files.
 *
 * The studio and the player are separate origins, so a file is the only thing
 * that passes between them — and it is also how a world reaches another
 * machine, or a friend, or a backup. That makes the reader the most
 * compatibility-sensitive code here: it has to accept anything this project has
 * ever handed somebody.
 *
 * Three shapes, all of them real:
 *   - an envelope, which is what the library and the content build write;
 *   - a bare module document, which is what the studio's Export has always
 *     produced and must keep working forever;
 *   - either of those gzipped, which is what a downloaded artifact is.
 */

import { isEnvelope, envelopeFromDoc } from './envelope.js';
import type { WorldEnvelope } from './envelope.js';
import { gunzip, isGzip } from './gzip.js';

const decoder = new TextDecoder();

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download the document alone, pretty-printed.
 *
 * The default because it is the interchange format: the player reads it, the
 * repository stores this shape, and a person can open it in a text editor and
 * see what their world is. The envelope's extra fields are studio bookkeeping
 * that a bare document does without.
 */
export function downloadWorld(envelope: WorldEnvelope, filename?: string): void {
  const text = `${JSON.stringify(envelope.doc, null, 2)}\n`;
  download(new Blob([text], { type: 'application/json' }), filename ?? envelope.filename);
}

/**
 * Download everything, including the authoring sidecar.
 *
 * Prefabs, instance links and the style tables are not part of the document —
 * they are how its entries were generated. A world that was built from prefabs
 * and comes back without them has lost the ability to regenerate anything, so
 * moving a project between machines needs this rather than the plain document.
 */
export function downloadEnvelope(envelope: WorldEnvelope, filename?: string): void {
  const text = `${JSON.stringify(envelope, null, 2)}\n`;
  const name = filename ?? envelope.filename.replace(/\.module\.json$|\.json$/, '.dmworld.json');
  download(new Blob([text], { type: 'application/json' }), name);
}

/** A world from a file the user picked, whatever shape it arrived in. */
export async function readWorldFile(file: File): Promise<WorldEnvelope> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = isGzip(bytes) ? await gunzip(bytes) : bytes;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(raw));
  } catch (err) {
    throw new Error(`${file.name} is not JSON: ${(err as Error).message}`);
  }

  if (isEnvelope(parsed)) return parsed;

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${file.name} does not contain a world`);
  }

  const doc = parsed as Record<string, unknown>;
  if (typeof doc['id'] !== 'string' || doc['rules'] === undefined) {
    throw new Error(
      `${file.name} does not look like a module — a world has an "id" and a "rules" block`,
    );
  }

  const fallback = file.name.replace(/\.module\.json$|\.json(\.gz)?$/, '');
  return envelopeFromDoc(doc, fallback);
}
