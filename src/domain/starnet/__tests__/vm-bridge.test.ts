import { describe, expect, it } from 'vitest';
import type { AdjustmentRunSummary } from '@/domain/entities';
import {
  createStarNetVmJob,
  ephemeralProcessingId,
  parseStarNetConsoleSummary,
  parseStarNetVmJob,
  parseStarNetVmResult,
  vmJobId,
  type StarNetVmResult,
} from '@/domain/starnet/vm-bridge';

const run: AdjustmentRunSummary = {
  id: 'run-42',
  processingId: 101,
  configVersionId: 'cfg-2',
  outputSlot: '2026-07-25T20:00:00.000Z',
  trigger: 'manual',
  startedAt: '2026-07-25T20:01:00.000Z',
  finishedAt: '2026-07-25T20:01:02.000Z',
  status: 'success',
  chiSquareStatus: 'passed',
  stationEpochs: [],
  autoAdjustAttempts: 0,
};

const result: StarNetVmResult = {
  kind: 'btm-starnet-result',
  schemaVersion: 1,
  jobId: 'btm-run-42',
  processingId: 101,
  runId: 'run-42',
  status: 'succeeded',
  exitCode: 0,
  startedAt: '2026-07-25T20:02:00.000Z',
  finishedAt: '2026-07-25T20:02:02.000Z',
  starNet: {
    executableName: 'StarNet.exe',
    fileVersion: '14.0.2.9137',
    noGraphics: true,
    mode: 'auto-adjust',
  },
  console: {
    stdout: [
      'MicroSurvey STAR*NET-ULTIMATE v14.0.2.9137',
      'Solution Has Converged in 3 Iterations',
      'Chi-Square Test at 5.00% Level Passed',
      'Network Processing Completed',
      'Elapsed Time = 00:00:02',
    ].join('\n'),
    stderr: '',
  },
  outputFiles: [
    {
      name: 'project.lst',
      extension: '.lst',
      sizeBytes: 24,
      sha256: 'abc',
      content: 'Network Processing Completed',
    },
  ],
};

describe('STAR*NET VM bridge package', () => {
  it('creates one self-contained job with native files and explicit Auto Adjust parameters', () => {
    const job = createStarNetVmJob({
      run,
      dat: 'C ST0001 0 0 0 ! ! !\n',
      snproj: '*STAR*NET 3\n[DataFileList]\n3 "input.dat"\n',
      autoAdjust: {
        enabled: true,
        maxStandardizedResidual: 3,
        outliersRemovedPerIteration: 1,
        maxIterations: 20,
      },
      noGraphics: true,
      createdAt: '2026-07-25T20:01:30.000Z',
    });
    expect(job.jobId).toBe('btm-run-42');
    expect(job.execution).toEqual({
      mode: 'auto-adjust',
      noGraphics: true,
      timeoutSeconds: 900,
      autoAdjust: {
        maxStandardizedResidual: 3,
        outliersRemovedPerAdjustment: 1,
        maxAdjustments: 20,
      },
    });
    expect(job.files.project).toContain('*STAR*NET 3');
    expect(job.files.dataFileName).toBe('input.dat');
    expect(parseStarNetVmJob(job)).toEqual(job);
  });

  it('sanitises the external job identifier without leaking labels or paths', () => {
    expect(vmJobId('run / unsafe : 01')).toBe('btm-run___unsafe___01');
    expect(vmJobId('run-42', 'attempt-2')).toBe('btm-run-42-attempt-2');
  });

  it('defaults to the Standard CLI used by a Typical STAR*NET installation', () => {
    const job = createStarNetVmJob({
      run,
      dat: 'C ST0001 0 0 0 ! ! !\n',
      snproj: '*STAR*NET 3\n[DataFileList]\n3 "input.dat"\n',
      autoAdjust: {
        enabled: false,
        maxStandardizedResidual: 3,
        outliersRemovedPerIteration: 1,
        maxIterations: 20,
      },
    });
    expect(job.execution.noGraphics).toBe(false);
    expect(parseStarNetVmJob(job)).toEqual(job);
  });

  it('assigns a stable positive Windows-compatible transport id to a new draft', () => {
    const first = ephemeralProcessingId('draft-1227');
    expect(first).toBe(ephemeralProcessingId('draft-1227'));
    expect(first).toBeGreaterThanOrEqual(1);
    expect(first).toBeLessThanOrEqual(2_147_483_647);
    expect(ephemeralProcessingId('draft-1228')).not.toBe(first);
  });

  it('validates an imported result and extracts the native console summary', () => {
    const parsed = parseStarNetVmResult(result);
    expect(parseStarNetConsoleSummary(parsed)).toEqual({
      completed: true,
      converged: true,
      iterations: 3,
      chiSquareStatus: 'passed',
      elapsed: '00:00:02',
    });
  });

  it('rejects a result with an unsafe output filename', () => {
    const unsafe = {
      ...result,
      outputFiles: [{ ...result.outputFiles[0], name: '..\\secrets.txt' }],
    };
    expect(() => parseStarNetVmResult(unsafe)).toThrow(/Unsafe STAR\*NET output filename/);
  });

  it('rejects a result belonging to an unsupported schema', () => {
    expect(() => parseStarNetVmResult({ ...result, schemaVersion: 99 })).toThrow(/Unsupported STAR\*NET result package/);
  });

  it('rejects a remote job with non-canonical filenames or incomplete Auto Adjust settings', () => {
    const job = createStarNetVmJob({
      run,
      dat: 'C ST0001 0 0 0 ! ! !\n',
      snproj: '*STAR*NET 3\n[DataFileList]\n3 "input.dat"\n',
      autoAdjust: {
        enabled: true,
        maxStandardizedResidual: 3,
        outliersRemovedPerIteration: 1,
        maxIterations: 20,
      },
    });
    expect(() => parseStarNetVmJob({
      ...job,
      files: { ...job.files, dataFileName: '../input.dat' },
    })).toThrow(/canonical filenames/);
    expect(() => parseStarNetVmJob({
      ...job,
      execution: { ...job.execution, autoAdjust: undefined },
    })).toThrow(/Auto Adjust settings/);
    expect(() => parseStarNetVmJob({ ...job, processingId: 0 })).toThrow(/processingId/);
    expect(() => parseStarNetVmJob({ ...job, processingId: 2_147_483_648 })).toThrow(/processingId/);
  });
});
