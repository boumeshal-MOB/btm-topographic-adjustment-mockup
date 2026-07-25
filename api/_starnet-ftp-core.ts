import type { EphemeralFtpConnection } from '../src/domain/starnet/remote-transport';

const SAFE_HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/;
const SAFE_DIRECTORY = /^\/(?:[A-Za-z0-9_.-]+\/?)*$/;

export interface FtpGatewayEnvironment {
  allowedHosts: string[];
  allowedPorts: number[];
}

export function parseGatewayEnvironment(
  environment: Record<string, string | undefined>,
): FtpGatewayEnvironment {
  const allowedHosts = String(environment.STARNET_ALLOWED_FTP_HOSTS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const allowedPorts = String(environment.STARNET_ALLOWED_FTP_PORTS ?? '21,990')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 1 && item <= 65_535);
  return { allowedHosts, allowedPorts };
}

function requiredBoundedString(
  record: Record<string, unknown>,
  key: string,
  maximumLength: number,
): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new Error(`${key} is invalid`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseEphemeralFtpConnection(value: unknown): EphemeralFtpConnection {
  if (!isRecord(value)) throw new Error('connection is required');
  const host = requiredBoundedString(value, 'host', 253).trim().toLowerCase();
  if (!SAFE_HOST.test(host) || host.includes('..')) throw new Error('host is invalid');
  if (typeof value.port !== 'number' || !Number.isInteger(value.port) || value.port < 1 || value.port > 65_535) {
    throw new Error('port is invalid');
  }
  const username = requiredBoundedString(value, 'username', 200);
  const password = requiredBoundedString(value, 'password', 500);
  if (!['explicit-tls', 'implicit-tls', 'plain'].includes(String(value.security))) {
    throw new Error('security mode is invalid');
  }
  const incomingDirectory = requiredBoundedString(value, 'incomingDirectory', 500);
  const outgoingDirectory = requiredBoundedString(value, 'outgoingDirectory', 500);
  if (
    !SAFE_DIRECTORY.test(incomingDirectory)
    || !SAFE_DIRECTORY.test(outgoingDirectory)
    || incomingDirectory.includes('..')
    || outgoingDirectory.includes('..')
  ) {
    throw new Error('remote queue directory is invalid');
  }
  return {
    host,
    port: value.port,
    username,
    password,
    security: value.security as EphemeralFtpConnection['security'],
    incomingDirectory: incomingDirectory.replace(/\/+$/, '') || '/',
    outgoingDirectory: outgoingDirectory.replace(/\/+$/, '') || '/',
  };
}

export function assertAllowedFtpEndpoint(
  connection: Pick<EphemeralFtpConnection, 'host' | 'port'>,
  environment: FtpGatewayEnvironment,
): void {
  if (environment.allowedHosts.length === 0) {
    throw new Error('The STAR*NET FTP gateway is not configured on Vercel');
  }
  if (!environment.allowedHosts.includes(connection.host.toLowerCase())) {
    throw new Error('This FTP host is not authorised by the Vercel gateway');
  }
  if (!environment.allowedPorts.includes(connection.port)) {
    throw new Error('This FTP port is not authorised by the Vercel gateway');
  }
}

export function remoteQueueFile(directory: string, fileName: string): string {
  if (!/^[A-Za-z0-9_.-]{1,140}$/.test(fileName)) throw new Error('queue filename is invalid');
  return directory === '/' ? `/${fileName}` : `${directory}/${fileName}`;
}

export function publicGatewayError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('not configured')) return { code: 'GATEWAY_NOT_CONFIGURED', message };
  if (message.includes('not authorised')) return { code: 'ENDPOINT_NOT_ALLOWED', message };
  if (message.includes('invalid') || message.includes('required') || message.includes('Unsupported')) {
    return { code: 'INVALID_REQUEST', message };
  }
  return {
    code: 'FTP_CONNECTION_FAILED',
    message: 'The FTPS/FTP server could not be reached or rejected the connection.',
  };
}
