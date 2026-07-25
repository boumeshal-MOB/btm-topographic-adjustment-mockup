import type { StarNetVmJob, StarNetVmResult } from '@/domain/starnet/vm-bridge';

export type FtpSecurityMode = 'explicit-tls' | 'implicit-tls' | 'plain';

export interface EphemeralFtpConnection {
  host: string;
  port: number;
  username: string;
  password: string;
  security: FtpSecurityMode;
  incomingDirectory: string;
  outgoingDirectory: string;
}

export type StarNetFtpGatewayRequest =
  | {
      action: 'test';
      connection: EphemeralFtpConnection;
    }
  | {
      action: 'submit';
      connection: EphemeralFtpConnection;
      job: StarNetVmJob;
    }
  | {
      action: 'result';
      connection: EphemeralFtpConnection;
      jobId: string;
    };

export type StarNetFtpGatewayResponse =
  | {
      ok: true;
      action: 'test';
      message: string;
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

export type SuccessfulStarNetFtpGatewayResponse = Extract<
  StarNetFtpGatewayResponse,
  { ok: true }
>;

export const DEFAULT_EPHEMERAL_FTP_CONNECTION: Omit<
  EphemeralFtpConnection,
  'host' | 'username' | 'password'
> = {
  port: 21,
  security: 'explicit-tls',
  incomingDirectory: '/incoming',
  outgoingDirectory: '/outgoing',
};
