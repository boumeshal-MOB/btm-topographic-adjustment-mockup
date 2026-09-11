import type {
  DetectedStationFormat,
  ParsedStationCandidate,
  StationImportSourceFile,
  SuggestedCountryTemplate,
} from '@/domain/station-import';
import type { EnvironmentReading } from '@/domain/corrections/atmosphere';
import type { RawObservation } from '@/domain/entities';
import type { SourceAngleUnit } from '@/domain/double-face';

export interface UserImportedStation {
  stationId: number;
  stationCode: string;
  sourceStationCode: string;
  detectedFormat: DetectedStationFormat;
  suggestedTemplate: SuggestedCountryTemplate;
  sourceAngleUnit: SourceAngleUnit | 'DMS';
  sourceFileNames: string[];
  sourceRowCount: number;
  acquisitionEpochs: string[];
  observations: RawObservation[];
  environment: EnvironmentReading[];
  targetNames: string[];
  failures: ParsedStationCandidate['failures'];
  warnings: string[];
}

/** One IndexedDB record per user confirmation, including the immutable selected source text. */
export interface UserStationImportBatch {
  id: string;
  importedAt: string;
  sourceFiles: StationImportSourceFile[];
  stations: UserImportedStation[];
}

const DATABASE_NAME = 'btm-topographic-adjustment-user-stations';
const DATABASE_VERSION = 1;
const STORE_NAME = 'station-import-batches';

// Tests and privacy-restricted browsers may not expose IndexedDB. The session still works, while
// the storage banner and a fresh reload make the lack of durable browser storage explicit.
const memoryFallback = new Map<string, UserStationImportBatch>();

function indexedDb(): IDBFactory | undefined {
  try {
    return typeof indexedDB === 'undefined' ? undefined : indexedDB;
  } catch {
    return undefined;
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction was aborted'));
  });
}

async function openDatabase(): Promise<IDBDatabase | undefined> {
  const factory = indexedDb();
  if (!factory) return undefined;
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open station import storage'));
  });
}

export async function listUserStationImportBatches(): Promise<UserStationImportBatch[]> {
  let database: IDBDatabase | undefined;
  try {
    database = await openDatabase();
    if (!database) return [...memoryFallback.values()];
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const result = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    return result.sort((left, right) => left.importedAt.localeCompare(right.importedAt));
  } catch {
    // Browser storage can be disabled independently of the rest of the application. Imports from
    // this session remain usable through the fallback and a storage failure must never blank boot.
    return [...memoryFallback.values()];
  } finally {
    database?.close();
  }
}

export async function saveUserStationImportBatch(batch: UserStationImportBatch): Promise<void> {
  memoryFallback.set(batch.id, structuredClone(batch));
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(batch);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearUserStationImportBatches(): Promise<void> {
  memoryFallback.clear();
  const database = await openDatabase();
  if (!database) return;
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
