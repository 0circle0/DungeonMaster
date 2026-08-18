/**
 * Compression, at the two edges that need it.
 *
 * Worlds are stored compressed and shipped compressed. Aurendel is 2.9 MB of
 * pretty JSON, 1.5 MB minified and 296 KB gzipped — a tenth of the storage
 * quota and a tenth of the transfer, for a few milliseconds of CPU.
 *
 * Everything goes through here rather than reaching for `CompressionStream` at
 * a call site, so that moving this work to a Worker later is a change to one
 * file. It also keeps the codec a recorded fact: a record says how it was
 * compressed, so a browser without `CompressionStream` can store plain bytes
 * and still be read by one that has it.
 */

/** The two bytes every gzip stream starts with. */
const MAGIC = [0x1f, 0x8b] as const;

export type Codec = 'gzip' | 'identity';

/** Is compression available here? Everything current has it; Node 18+ too. */
export function canCompress(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/** Does this look like a gzip stream? */
export function isGzip(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === MAGIC[0] && bytes[1] === MAGIC[1];
}

/**
 * Push bytes through a compression stream and collect the result.
 *
 * Typed as `GenericTransformStream` because that is what the DOM declares
 * `CompressionStream` and `DecompressionStream` to be — their `writable` takes
 * a `BufferSource`, not a `Uint8Array`, so the narrower `TransformStream` does
 * not describe them.
 */
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

/** A value, minified and compressed. Returns the codec actually used. */
export async function gzipJson(value: unknown): Promise<{ bytes: Uint8Array; codec: Codec; rawBytes: number }> {
  const raw = encoder.encode(JSON.stringify(value));
  if (!canCompress()) return { bytes: raw, codec: 'identity', rawBytes: raw.length };
  return { bytes: await gzip(raw), codec: 'gzip', rawBytes: raw.length };
}

/**
 * The inverse, tolerant of either codec.
 *
 * Tolerant on purpose: a static host that infers `Content-Encoding: gzip` from
 * a `.gz` extension will have inflated the body already, and a decompressor
 * handed plain JSON throws. Sniffing the magic bytes costs two comparisons and
 * removes a failure that only ever reproduces on someone else's deployment.
 */
export async function gunzipJson<T>(bytes: Uint8Array): Promise<T> {
  const raw = await gunzip(bytes);
  return JSON.parse(decoder.decode(raw)) as T;
}
