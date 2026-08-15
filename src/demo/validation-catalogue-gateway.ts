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

async function fetchJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(catalogueUrl(path), { signal });
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

export async function loadValidationManifest(signal?: AbortSignal): Promise<ValidationManifest> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const raw = await fetchJson('manifest.json', signal);
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
    // A failed load must not be cached, otherwise a transient network error is permanent.
    manifestPromise.catch(() => {
      manifestPromise = undefined;
    });
  }
  return manifestPromise;
}

async function loadShard(shardFile: string, signal?: AbortSignal): Promise<ValidationDataset[]> {
  let promise = shardPromises.get(shardFile);
  if (!promise) {
    promise = (async () => {
      const raw = await fetchJson(shardFile, signal);
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
    shardPromises.set(shardFile, promise);
    promise.catch(() => shardPromises.delete(shardFile));
  }
  return promise;
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
