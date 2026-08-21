/**
 * Worlds as files.
 *
 * The studio and the player are separate origins, so a file is the only thing that passes between
 * them — and it is also how a world reaches another machine or a backup. The reader has to accept
 * anything this project has ever handed somebody:
 *
 *   - an envelope, which is what the library and the content build write;
 *   - a bare module document, which is what the studio's Export has always produced;
 *   - either of those gzipped, which is what a downloaded artifact is;
 *   - a project bundle, the repository's own file tree flattened into one file.
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
 * Download the world as the files a repository would hold.
 *
 * The studio only sees an assembled document and a repository holds a `project/` tree beside a
 * `maps/` one, so `bundleModule` reconciles them and this writes paths and bytes that drop straight
 * into git. One file rather than a folder, because a browser cannot hand over a directory; gzipped,
 * because the tree is a couple of megabytes of small JSON. `npm run project -- unpack` is the other
 * end.
 *
 * Takes the document rather than an envelope: the authoring sidecar is not part of a repository's
 * file tree.
 *
 * All four authoring fields, not two. `splitProject` has no notion of a prefab link, so every entry
 * it writes is literal, which makes `prefabs/instances.json` the only channel provenance has out of
 * here.
 */
export async function downloadProject(
  doc: Record<string, unknown>,
  filename: string,
  authoring?: WorldAuthoring,
): Promise<void> {
  const { files } = bundleModule(doc, {
    prefabs: authoring?.prefabs ?? [],
    style: authoring?.style ?? {},
    instances: authoring?.instances ?? {},
    contract: authoring?.contract ?? {},
  });
  const text = JSON.stringify({ dmProject: 1, files });
  const bytes = await gzip(new TextEncoder().encode(text));

  const name = `${filename.replace(/\.module\.json$|\.json$/, '')}.project.json.gz`;
  download(new Blob([bytes as BlobPart], { type: 'application/gzip' }), name);
}

/** What a project bundle looks like, so a reader can tell one at a glance. */
export function isProjectBundle(value: unknown): value is { files: Record<string, string> } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const files = (value as { files?: unknown }).files;
  if (files === null || typeof files !== 'object' || Array.isArray(files)) return false;
  return PROJECT_MANIFEST in (files as Record<string, unknown>);
}

/**
 * The project files out of something the user picked, or a reason why not. Narrower than {@link
 * readWorldFile}: the editor edits project files. A bare `module.json` is the compiled form, with
 * nothing in it to edit a prefab or a style table with.
 */
export async function readProjectFile(file: File): Promise<Record<string, string>> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const raw = isGzip(bytes) ? await gunzip(bytes) : bytes;

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(raw));
  } catch (err) {
    throw new Error(`${file.name} is not JSON: ${(err as Error).message}`);
  }

  if (isProjectBundle(parsed)) return parsed.files;

  const doc = parsed as Record<string, unknown> | null;
  if (doc && typeof doc === 'object' && typeof doc['id'] === 'string' && doc['rules'] !== undefined) {
    throw new Error(
      `${file.name} is a compiled module, not a project. The studio edits project files — `
      + 'export one with “Export project files”, or open the world it was built from.',
    );
  }
  throw new Error(`${file.name} is not a project — a project has a ${PROJECT_MANIFEST}`);
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

  // A project bundle rebuilds into a document, so everything downstream sees the shape it already
  // handles. Issues are reported as one message rather than the first one.
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
