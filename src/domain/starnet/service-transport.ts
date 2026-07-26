import type { StarNetVmJob, StarNetVmResult } from '@/domain/starnet/vm-bridge';

export interface EphemeralStarNetServiceConnection {
  origin: string;
  apiKey: string;
}

export type StarNetServiceGatewayRequest =
  | {
      action: 'test';
      connection: EphemeralStarNetServiceConnection;
    }
  | {
      action: 'submit';
      connection: EphemeralStarNetServiceConnection;
      job: StarNetVmJob;
    }
  | {
      action: 'result';
      connection: EphemeralStarNetServiceConnection;
      jobId: string;
    };

export type StarNetServiceGatewayResponse =
  | {
      ok: true;
      action: 'test';
      message: string;
      maximumConcurrentExecutions: number;
      hostMode?: 'interactive-pilot' | 'windows-service';
    }
  | {
      ok: true;
      action: 'submit';
      jobId: string;
      state: 'queued';
    }
  | {
      ok: true;
      action: 'result';
      jobId: string;
      state: 'pending';
      lifecycle: 'queued' | 'running';
    }
  | {
      ok: true;
      action: 'result';
      jobId: string;
      state: 'completed';
      result: StarNetVmResult;
    }
  | {
      ok: false;
      code: string;
      message: string;
    };

export type SuccessfulStarNetServiceGatewayResponse = Extract<
  StarNetServiceGatewayResponse,
  { ok: true }
>;
