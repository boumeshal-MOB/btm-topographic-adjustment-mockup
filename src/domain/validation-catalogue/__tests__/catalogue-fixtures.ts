import { readFileSync } from 'node:fs';
import {
  validationManifestSchema,
  validationShardSchema,
  type ValidationDataset,
  type ValidationManifest,
} from '@/domain/validation-catalogue/schema';

/**
 * Test-only reader for the generated catalogue.
 *
 * Tests read the real published files from disk instead of a hand-written fixture: the point of
 * these suites is to prove the app agrees with what the Python generator actually emits.
 */

/** Vitest runs from the repository root, so the published files resolve relatively. */
const CATALOGUE_DIR = 'public/demo-datasets/v1/';

let manifestCache: ValidationManifest | undefined;
const shardCache = new Map<string, ValidationDataset[]>();

export function readManifest(): ValidationManifest {
  if (!manifestCache) {
    const raw = JSON.parse(readFileSync(`${CATALOGUE_DIR}manifest.json`, 'utf-8'));
    manifestCache = validationManifestSchema.parse(raw);
  }
  return manifestCache;
}

export function readShard(shardFile: string): ValidationDataset[] {
  let datasets = shardCache.get(shardFile);
  if (!datasets) {
    const raw = JSON.parse(readFileSync(`${CATALOGUE_DIR}${shardFile}`, 'utf-8'));
    datasets = validationShardSchema.parse(raw).datasets;
    shardCache.set(shardFile, datasets);
  }
  return datasets;
}

export function readDataset(datasetId: string): ValidationDataset {
  const manifest = readManifest();
  const entry = manifest.datasets.find((candidate) => candidate.id === datasetId);
  if (!entry) throw new Error(`Unknown dataset ${datasetId}`);
  const dataset = readShard(entry.shard).find((candidate) => candidate.id === datasetId);
  if (!dataset) throw new Error(`Dataset ${datasetId} missing from ${entry.shard}`);
  return dataset;
}

/** First dataset whose primary scenario matches — used to cover each defect family once. */
export function firstDatasetWithScenario(scenario: string): ValidationDataset {
  const manifest = readManifest();
  const entry = manifest.datasets.find((candidate) => candidate.primaryScenario === scenario);
  if (!entry) throw new Error(`No dataset with primary scenario ${scenario}`);
  return readDataset(entry.id);
}
