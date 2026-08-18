import type { ProcessingDetail } from '@/features/shared/types';

/** Runtime boundary for cached, persisted or legacy-shaped processing payloads. */
export function isProcessingDetail(value: unknown): value is ProcessingDetail {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ProcessingDetail>;
  return Boolean(
    candidate.processing
    && typeof candidate.processing.name === 'string'
    && Array.isArray(candidate.versions)
    && Array.isArray(candidate.variables)
    && Array.isArray(candidate.runs),
  );
}
