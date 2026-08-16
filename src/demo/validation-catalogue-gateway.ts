import {
  validationManifestSchema,
  validationShardSchema,
  type ValidationDataset,
  type ValidationManifest,
  type ValidationManifestEntry,
} from '@/domain/validation-catalogue/schema';

/**
 * I/O adapter for the generated validation catalogue.
 *
 * The 12 MB of shards must never reach the initial bundle, so nothing here is a static import:
 * the manifest (56 kB) is fetched on first use and a shard (0.3–1.3 MB) only when a dataset from
 * it is opened. Both are validated against the published schema before any caller sees them, and
 * both are cached for the session because the files are immutable build output.
 *
 * The cache is deliberately NOT tied to any caller's `AbortSignal`. Sharing one promise between
 * callers while letting the *first* caller cancel it meant that leaving the page mid-load poisoned
 * the entry: everyone who arrived afterwards received that caller's abort as a network failure.
 * A caller that goes away now simply stops awaiting; the download finishes and fills the cache.
 */

const CATALOGUE_ROOT = 'demo-datasets/v1';

function catalogueUrl(path: string): string {
  const base = typeof import.meta.env?.BASE_URL === 'string' ? import.meta.env.BASE_URL : '/';
  return `${base.replace(/\/$/, '')}/${CATALOGUE_ROOT}/${path}`;
}

export class ValidationCatalogueError extends Error {
  constructor(
    message: string,
    readonly kind: 'network' | 'schema' | 'not-found',
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ValidationCatalogueError';
  }
}

let manifestPromise: Promise<ValidationManifest> | undefined;
const shardPromises = new Map<string, Promise<ValidationDataset[]>>();

async function fetchJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(catalogueUrl(path));
  } catch (cause) {
    throw new ValidationCatalogueError(`Could not reach the validation catalogue file ${path}.`, 'network', cause);
  }
  if (response.status === 404) {
    throw new ValidationCatalogueError(`The validation catalogue file ${path} is missing.`, 'not-found');
  }
  if (!response.ok) {
    throw new ValidationCatalogueError(
      `The validation catalogue file ${path} could not be read (HTTP ${response.status}).`,
      'network',
    );
  }
  try {
    return await response.json();
  } catch (cause) {
    throw new ValidationCatalogueError(`The validation catalogue file ${path} is not valid JSON.`, 'schema', cause);
  }
}

/**
 * Resolves when the caller's own signal aborts, so a component that unmounts stops waiting
 * without cancelling the shared download that other callers may still need.
 */
function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (error) => { signal.removeEventListener('abort', onAbort); reject(error); },
    );
  });
}

export async function loadValidationManifest(signal?: AbortSignal): Promise<ValidationManifest> {
  if (!manifestPromise) {
    const pending = (async () => {
      const raw = await fetchJson('manifest.json');
      const parsed = validationManifestSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationCatalogueError(
          `The validation manifest does not match the published schema: ${parsed.error.issues[0]?.message ?? 'unknown issue'}.`,
          'schema',
          parsed.error,
        );
      }
      return parsed.data;
    })();
    // A genuine failure must not be cached, otherwise a transient network error is permanent.
    // Attach the reset before exposing the promise, and swallow nothing the caller needs to see.
    pending.catch(() => {
      if (manifestPromise === pending) manifestPromise = undefined;
    });
    manifestPromise = pending;
  }
  return withAbort(manifestPromise, signal);
}

async function loadShard(shardFile: string, signal?: AbortSignal): Promise<ValidationDataset[]> {
  let promise = shardPromises.get(shardFile);
  if (!promise) {
    const pending = (async () => {
      const raw = await fetchJson(shardFile);
      const parsed = validationShardSchema.safeParse(raw);
      if (!parsed.success) {
        throw new ValidationCatalogueError(
          `Shard ${shardFile} does not match the published schema: ${parsed.error.issues[0]?.message ?? 'unknown issue'}.`,
          'schema',
          parsed.error,
        );
      }
      return parsed.data.datasets;
    })();
    pending.catch(() => {
      if (shardPromises.get(shardFile) === pending) shardPromises.delete(shardFile);
    });
    shardPromises.set(shardFile, pending);
    promise = pending;
  }
  return withAbort(promise, signal);
}

/** Loads exactly one dataset, pulling its shard only if it is not cached yet. */
export async function loadValidationDataset(
  entry: Pick<ValidationManifestEntry, 'id' | 'shard'>,
  signal?: AbortSignal,
): Promise<ValidationDataset> {
  const datasets = await loadShard(entry.shard, signal);
  const dataset = datasets.find((candidate) => candidate.id === entry.id);
  if (!dataset) {
    throw new ValidationCatalogueError(
      `Dataset ${entry.id} is not present in ${entry.shard}.`,
      'not-found',
    );
  }
  return dataset;
}

/** Test seam: forget every cached file. */
export function resetValidationCatalogueCache(): void {
  manifestPromise = undefined;
  shardPromises.clear();
}

/** Shards already downloaded this session — surfaced so the UI can explain what is cached. */
export function loadedShardFiles(): string[] {
  return [...shardPromises.keys()].sort();
}
