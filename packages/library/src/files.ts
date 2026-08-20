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
 *   - either of those gzipped, which is what a downloaded artifact is;
 *   - a project bundle, which is the repository's own file tree flattened into
 *     one file so a browser can hand it over in a single download.
 */

import { isEnvelope, envelopeFromDoc } from './envelope.js';
import type { WorldEnvelope, WorldAuthoring } from './envelope.js';
import { gunzip, gzip, isGzip } from './gzip.js';
import { bundleModule, unbundleModule, PROJECT_MANIFEST } from '@dm/module';

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

/**
 * Download the world as the files a repository would hold.
 *
 * The studio only ever sees an assembled document, and a repository holds a
 * `project/` tree beside a `maps/` one — `bundleModule` is what reconciles
 * those, so this writes paths and bytes that drop straight into git.
 *
 * One file rather than a folder because a browser cannot hand over a directory,
 * and gzipped because the tree is a couple of megabytes of small JSON.
 * `npm run project -- unpack` is the other end.
 *
 * Takes the document rather than an envelope: the authoring sidecar is not part
 * of a repository's file tree, and `downloadEnvelope` is what carries it.
 */
export async function downloadProject(
  doc: Record<string, unknown>,
  filename: string,
  authoring?: WorldAuthoring,
): Promise<void> {
  const { files } = bundleModule(doc, {
    prefabs: authoring?.prefabs ?? [],
    style: authoring?.style ?? {},
  });
  const text = JSON.stringify({ dmProject: 1, files });
  const bytes = await gzip(new TextEncoder().encode(text));

  const name = `${filename.replace(/\.module\.json$|\.json$/, '')}.project.json.gz`;
  download(new Blob([bytes as BlobPart], { type: 'application/gzip' }), name);
}

/** What a project bundle looks like, so a reader can tell one at a glance. */
function isProjectBundle(value: unknown): value is { files: Record<string, string> } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const files = (value as { files?: unknown }).files;
  if (files === null || typeof files !== 'object' || Array.isArray(files)) return false;
  return PROJECT_MANIFEST in (files as Record<string, unknown>);
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

  // A project bundle rebuilds into a document, so everything downstream sees
  // the shape it already handles. Issues are reported as one message rather
  // than the first one, because a tree that lost several files should say so
  // once rather than a file at a time.
  if (isProjectBundle(parsed)) {
    const { document, issues } = unbundleModule(parsed.files);
    if (!document || issues.length > 0) {
      const detail = issues.map((issue) => `${issue.file}: ${issue.message}`).join('; ');
      throw new Error(`${file.name} is not a complete project — ${detail || 'no document'}`);
    }
    const named = file.name.replace(/\.project\.json(\.gz)?$/, '');
    return envelopeFromDoc(document, named);
  }

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
