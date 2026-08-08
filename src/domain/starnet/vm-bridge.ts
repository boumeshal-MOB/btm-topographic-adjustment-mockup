import type { AdjustmentRunSummary } from '@/domain/entities';

export const STARNET_JOB_SCHEMA_VERSION = 1 as const;
export const STARNET_RESULT_SCHEMA_VERSION = 1 as const;

export interface StarNetVmJob {
  kind: 'btm-starnet-job';
  schemaVersion: typeof STARNET_JOB_SCHEMA_VERSION;
  jobId: string;
  processingId: number;
  runId: string;
  configVersionId: string;
  outputSlot: string;
  createdAt: string;
  execution: {
    mode: 'run' | 'auto-adjust';
    noGraphics: boolean;
    timeoutSeconds: number;
    autoAdjust?: {
      maxStandardizedResidual: number;
      outliersRemovedPerAdjustment: number;
      maxAdjustments: number;
    };
  };
  files: {
    dataFileName: 'input.dat';
    projectFileName: 'project.prj';
    data: string;
    project: string;
  };
}

export interface StarNetVmResultFile {
  name: string;
  extension: string;
  sizeBytes: number;
  sha256?: string;
  content: string;
}

export interface StarNetVmResult {
  kind: 'btm-starnet-result';
  schemaVersion: typeof STARNET_RESULT_SCHEMA_VERSION;
  jobId: string;
  processingId: number;
  runId: string;
  status: 'succeeded' | 'failed' | 'timed-out';
  exitCode: number | null;
  startedAt: string;
  finishedAt: string;
  starNet: {
    executableName: string;
    fileVersion?: string;
    noGraphics: boolean;
    mode: 'run' | 'auto-adjust';
  };
  console: {
    stdout: string;
    stderr: string;
  };
  outputFiles: StarNetVmResultFile[];
  error?: string;
}

/**
 * Minimal immutable identity needed to prepare a STAR*NET job. It can represent either a stored
 * BTM run or an ephemeral configuration test in the Adjustment step.
 */
export type StarNetExecutionReference = Pick<
  AdjustmentRunSummary,
  'id' | 'processingId' | 'configVersionId' | 'outputSlot'
>;

export function vmJobId(runId: string, attemptId?: string): string {
  const identity = attemptId ? `${runId}-${attemptId}` : runId;
  const safeRunId = identity.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  return `btm-${safeRunId || 'run'}`;
}

/**
 * The Windows contract requires a positive Int32 processing id, including before a BTM processing
 * has been persisted. This deterministic namespace is transport metadata only; it is never used
 * as a real BTM id or stored as an output owner.
 */
export function ephemeralProcessingId(draftId: string): number {
  let hash = 2_166_136_261;
  for (const character of draftId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % 2_000_000_000 + 1;
}

export function createStarNetVmJob(args: {
  run: StarNetExecutionReference;
  dat: string;
  prj: string;
  autoAdjust: {
    enabled: boolean;
    maxStandardizedResidual: number;
    outliersRemovedPerIteration: number;
    maxIterations: number;
  };
  noGraphics?: boolean;
  jobId?: string;
  createdAt?: string;
}): StarNetVmJob {
  const mode = args.autoAdjust.enabled ? 'auto-adjust' : 'run';
  return {
    kind: 'btm-starnet-job',
    schemaVersion: STARNET_JOB_SCHEMA_VERSION,
    jobId: args.jobId ?? vmJobId(args.run.id),
    processingId: args.run.processingId,
    runId: args.run.id,
    configVersionId: args.run.configVersionId,
    outputSlot: args.run.outputSlot,
    createdAt: args.createdAt ?? new Date().toISOString(),
    execution: {
      mode,
      noGraphics: args.noGraphics ?? false,
      timeoutSeconds: 900,
      ...(mode === 'auto-adjust'
        ? {
            autoAdjust: {
              maxStandardizedResidual: args.autoAdjust.maxStandardizedResidual,
              outliersRemovedPerAdjustment: args.autoAdjust.outliersRemovedPerIteration,
              maxAdjustments: args.autoAdjust.maxIterations,
            },
          }
        : {}),
    },
    files: {
      dataFileName: 'input.dat',
      projectFileName: 'project.prj',
      data: args.dat,
      project: args.prj,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`Invalid STAR*NET result: ${key} must be a string`);
  return value;
}

function boundedString(record: Record<string, unknown>, key: string, maxLength: number): string {
  const value = requiredString(record, key);
  if (value.length > maxLength) throw new Error(`Invalid STAR*NET result: ${key} is too long`);
  return value;
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid STAR*NET result: ${key} must be a string`);
  return value;
}

/** Validates a job before it crosses the Vercel/Windows-service boundary. */
export function parseStarNetVmJob(value: unknown): StarNetVmJob {
  if (!isRecord(value)) throw new Error('Invalid STAR*NET job: expected an object');
  if (value.kind !== 'btm-starnet-job' || value.schemaVersion !== STARNET_JOB_SCHEMA_VERSION) {
    throw new Error('Unsupported STAR*NET job package');
  }
  const jobId = requiredString(value, 'jobId');
  if (!/^btm-[A-Za-z0-9._-]{1,80}$/.test(jobId)) throw new Error('Invalid STAR*NET jobId');
  if (
    typeof value.processingId !== 'number'
    || !Number.isSafeInteger(value.processingId)
    || value.processingId < 1
    || value.processingId > 2_147_483_647
  ) {
    throw new Error('Invalid STAR*NET job processingId');
  }
  if (!isRecord(value.execution) || !isRecord(value.files)) {
    throw new Error('Invalid STAR*NET job structure');
  }
  if (value.execution.mode !== 'run' && value.execution.mode !== 'auto-adjust') {
    throw new Error('Invalid STAR*NET execution mode');
  }
  if (typeof value.execution.noGraphics !== 'boolean') {
    throw new Error('STAR*NET execution mode must explicitly define noGraphics');
  }
  if (
    typeof value.execution.timeoutSeconds !== 'number'
    || !Number.isInteger(value.execution.timeoutSeconds)
    || value.execution.timeoutSeconds < 30
    || value.execution.timeoutSeconds > 3600
  ) {
    throw new Error('Invalid STAR*NET timeout');
  }
  if (value.files.dataFileName !== 'input.dat' || value.files.projectFileName !== 'project.prj') {
    throw new Error('Invalid STAR*NET canonical filenames');
  }
  const data = boundedString(value.files, 'data', 3_000_000);
  const project = boundedString(value.files, 'project', 1_000_000);
  if (data.includes('\0') || project.includes('\0')) {
    throw new Error('Invalid STAR*NET file content');
  }
  if (
    /(?:[A-Z]:[\\/]|\\\\|\.\.)/i.test(project)
    || !/^\*STAR\*NET 2(?:\r?\n|$)/.test(project)
    || !/^\s*\d+\s+"input\.dat"\s*$/im.test(project)
  ) {
    throw new Error('STAR*NET project must use the native template and reference only input.dat');
  }

  let autoAdjust: StarNetVmJob['execution']['autoAdjust'];
  if (value.execution.mode === 'auto-adjust') {
    if (!isRecord(value.execution.autoAdjust)) {
      throw new Error('Missing STAR*NET Auto Adjust settings');
    }
    const maxStandardizedResidual = value.execution.autoAdjust.maxStandardizedResidual;
    const outliersRemovedPerAdjustment = value.execution.autoAdjust.outliersRemovedPerAdjustment;
    const maxAdjustments = value.execution.autoAdjust.maxAdjustments;
    if (
      typeof maxStandardizedResidual !== 'number'
      || !Number.isFinite(maxStandardizedResidual)
      || maxStandardizedResidual <= 0
      || maxStandardizedResidual > 100
      || typeof outliersRemovedPerAdjustment !== 'number'
      || !Number.isInteger(outliersRemovedPerAdjustment)
      || outliersRemovedPerAdjustment < 1
      || outliersRemovedPerAdjustment > 1_000
      || typeof maxAdjustments !== 'number'
      || !Number.isInteger(maxAdjustments)
      || maxAdjustments < 1
      || maxAdjustments > 10_000
    ) {
      throw new Error('Invalid STAR*NET Auto Adjust settings');
    }
    autoAdjust = {
      maxStandardizedResidual,
      outliersRemovedPerAdjustment,
      maxAdjustments,
    };
  }

  return {
    kind: 'btm-starnet-job',
    schemaVersion: STARNET_JOB_SCHEMA_VERSION,
    jobId,
    processingId: value.processingId,
    runId: boundedString(value, 'runId', 120),
    configVersionId: boundedString(value, 'configVersionId', 120),
    outputSlot: boundedString(value, 'outputSlot', 80),
    createdAt: boundedString(value, 'createdAt', 80),
    execution: {
      mode: value.execution.mode,
      noGraphics: value.execution.noGraphics === true,
      timeoutSeconds: value.execution.timeoutSeconds,
      ...(autoAdjust ? { autoAdjust } : {}),
    },
    files: {
      dataFileName: 'input.dat',
      projectFileName: 'project.prj',
      data,
      project,
    },
  };
}

/** Strict enough for untrusted imported JSON while keeping the bridge independent from the UI. */
export function parseStarNetVmResult(value: unknown): StarNetVmResult {
  if (!isRecord(value)) throw new Error('Invalid STAR*NET result: expected an object');
  if (value.kind !== 'btm-starnet-result' || value.schemaVersion !== STARNET_RESULT_SCHEMA_VERSION) {
    throw new Error('Unsupported STAR*NET result package');
  }
  const jobId = requiredString(value, 'jobId');
  if (!/^btm-[A-Za-z0-9._-]{1,80}$/.test(jobId)) throw new Error('Invalid STAR*NET result jobId');
  if (typeof value.processingId !== 'number' || !Number.isSafeInteger(value.processingId)) {
    throw new Error('Invalid STAR*NET result processingId');
  }
  const runId = boundedString(value, 'runId', 120);
  if (!['succeeded', 'failed', 'timed-out'].includes(String(value.status))) {
    throw new Error('Invalid STAR*NET result status');
  }
  if (value.exitCode !== null && (typeof value.exitCode !== 'number' || !Number.isInteger(value.exitCode))) {
    throw new Error('Invalid STAR*NET result exitCode');
  }
  if (!isRecord(value.starNet) || !isRecord(value.console) || !Array.isArray(value.outputFiles)) {
    throw new Error('Invalid STAR*NET result structure');
  }

  const outputFiles = value.outputFiles.map((item, index): StarNetVmResultFile => {
    if (!isRecord(item)) throw new Error(`Invalid STAR*NET result outputFiles[${index}]`);
    const name = requiredString(item, 'name');
    if (!/^[A-Za-z0-9_.-]{1,120}$/.test(name)) throw new Error(`Unsafe STAR*NET output filename "${name}"`);
    const extension = boundedString(item, 'extension', 10);
    if (!/^\.[A-Za-z0-9]{1,8}$/.test(extension)) throw new Error(`Unsafe STAR*NET output extension "${extension}"`);
    const sizeBytes = item.sizeBytes;
    if (typeof sizeBytes !== 'number' || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > 20_000_000) {
      throw new Error(`Invalid STAR*NET output size for "${name}"`);
    }
    const content = requiredString(item, 'content');
    if (content.length > 20_000_000) throw new Error(`STAR*NET output "${name}" is too large`);
    return {
      name,
      extension,
      sizeBytes,
      sha256: optionalString(item, 'sha256'),
      content,
    };
  });
  if (value.starNet.mode !== 'run' && value.starNet.mode !== 'auto-adjust') {
    throw new Error('Invalid STAR*NET result mode');
  }

  return {
    kind: 'btm-starnet-result',
    schemaVersion: STARNET_RESULT_SCHEMA_VERSION,
    jobId,
    processingId: value.processingId,
    runId,
    status: value.status as StarNetVmResult['status'],
    exitCode: value.exitCode as number | null,
    startedAt: requiredString(value, 'startedAt'),
    finishedAt: requiredString(value, 'finishedAt'),
    starNet: {
      executableName: boundedString(value.starNet, 'executableName', 120),
      fileVersion: optionalString(value.starNet, 'fileVersion'),
      noGraphics: value.starNet.noGraphics === true,
      mode: value.starNet.mode,
    },
    console: {
      stdout: boundedString(value.console, 'stdout', 5_000_000),
      stderr: boundedString(value.console, 'stderr', 5_000_000),
    },
    outputFiles,
    error: optionalString(value, 'error'),
  };
}
