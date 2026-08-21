/** Compression for stored and shipped worlds. */

/** The two bytes every gzip stream starts with. */
const MAGIC = [0x1f, 0x8b] as const;

export type Codec = 'gzip' | 'identity';

/** Is compression available here? */
export function canCompress(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** Does this look like a gzip stream? */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1];
}

/** Pushes bytes through a compression stream and collects the result. */
async function through(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const blob = new Blob([bytes as BlobPart]);
  const piped = blob.stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

export async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (!canCompress()) return bytes;
  return through(bytes, new CompressionStream('gzip'));
}

export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isGzip(bytes)) return bytes;
  return through(bytes, new DecompressionStream('gzip'));
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** A value, minified and compressed. */
export async function gzipJson(value: unknown): Promise<{ bytes: Uint8Array; codec: Codec; rawBytes: number }> {
  const raw = encoder.encode(JSON.stringify(value));
  if (!canCompress()) return { bytes: raw, codec: 'identity', rawBytes: raw.length };
  return { bytes: await gzip(raw), codec: 'gzip', rawBytes: raw.length };
}

/** The inverse of {@link gzipJson}. */
export async function gunzipJson<T>(bytes: Uint8Array): Promise<T> {
  const raw = await gunzip(bytes);
  return JSON.parse(decoder.decode(raw)) as T;
}
