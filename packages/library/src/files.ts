/** Worlds as files, in and out. */

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

/** Downloads the world as a gzipped project bundle: the paths and bytes a repository would hold. */
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

/** The project files out of a file the user picked, or a reason why not. */
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

  // A project bundle is rebuilt into a document; issues are reported together.
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
