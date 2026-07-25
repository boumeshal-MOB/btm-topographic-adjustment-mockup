import type { EphemeralStarNetServiceConnection } from '../src/domain/starnet/service-transport';

export interface StarNetServiceGatewayEnvironment {
  allowedOrigins: string[];
  allowInsecureLocalhost: boolean;
  allowTryCloudflarePilot: boolean;
}

interface ServiceHealth {
  status: 'ok';
  starNetAvailable: boolean;
  invocationScriptAvailable: boolean;
  maximumConcurrentExecutions: number;
}

const SAFE_JOB_ID = /^btm-[A-Za-z0-9._-]{1,80}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalOrigin(value: string): string {
  const parsed = new URL(value);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('service URL is invalid');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('service URL must not contain a path');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('service URL must use HTTPS');
  }
  return parsed.origin;
}

export function parseServiceGatewayEnvironment(
  environment: Record<string, string | undefined>,
): StarNetServiceGatewayEnvironment {
  const allowedOrigins = String(environment.STARNET_ALLOWED_SERVICE_ORIGINS ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(canonicalOrigin);
  return {
    allowedOrigins,
    allowInsecureLocalhost:
      String(environment.STARNET_ALLOW_INSECURE_LOCALHOST ?? '').toLowerCase() === 'true',
    allowTryCloudflarePilot:
      String(environment.STARNET_ALLOW_TRYCLOUDFLARE_PILOT ?? '').toLowerCase() === 'true',
  };
}

export function parseEphemeralServiceConnection(
  value: unknown,
): EphemeralStarNetServiceConnection {
  if (!isRecord(value)) throw new Error('connection is required');
  if (typeof value.origin !== 'string' || value.origin.length < 1 || value.origin.length > 500) {
    throw new Error('service URL is invalid');
  }
  if (typeof value.apiKey !== 'string' || value.apiKey.length < 24 || value.apiKey.length > 500) {
    throw new Error('service access key is invalid');
  }
  return {
    origin: canonicalOrigin(value.origin.trim()),
    apiKey: value.apiKey,
  };
}

function isLocalhost(origin: string): boolean {
  const hostname = new URL(origin).hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isTryCloudflarePilotOrigin(origin: string): boolean {
  const parsed = new URL(origin);
  return (
    parsed.protocol === 'https:'
    && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com$/i.test(parsed.hostname)
  );
}

export function assertAllowedServiceEndpoint(
  connection: Pick<EphemeralStarNetServiceConnection, 'origin'>,
  environment: StarNetServiceGatewayEnvironment,
): void {
  if (environment.allowedOrigins.length === 0 && !environment.allowTryCloudflarePilot) {
    throw new Error('The STAR*NET service gateway is not configured on Vercel');
  }
  const exactOriginAllowed = environment.allowedOrigins.includes(connection.origin);
  const pilotOriginAllowed =
    environment.allowTryCloudflarePilot && isTryCloudflarePilotOrigin(connection.origin);
  if (!exactOriginAllowed && !pilotOriginAllowed) {
    throw new Error('This STAR*NET service URL is not authorised by the Vercel gateway');
  }
  if (
    new URL(connection.origin).protocol !== 'https:'
    && !(environment.allowInsecureLocalhost && isLocalhost(connection.origin))
  ) {
    throw new Error('The STAR*NET service must be exposed through HTTPS');
  }
}

export function parseSafeJobId(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_JOB_ID.test(value)) {
    throw new Error('jobId is invalid');
  }
  return value;
}

export function parseServiceHealth(value: unknown): ServiceHealth {
  if (
    !isRecord(value)
    || value.status !== 'ok'
    || typeof value.starNetAvailable !== 'boolean'
    || typeof value.invocationScriptAvailable !== 'boolean'
    || typeof value.maximumConcurrentExecutions !== 'number'
    || !Number.isInteger(value.maximumConcurrentExecutions)
  ) {
    throw new Error('The STAR*NET service returned an invalid health response');
  }
  return value as unknown as ServiceHealth;
}

export function publicServiceGatewayError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('not configured')) return { code: 'GATEWAY_NOT_CONFIGURED', message };
  if (message.includes('not authorised') || message.includes('must be exposed')) {
    return { code: 'ENDPOINT_NOT_ALLOWED', message };
  }
  if (
    message.includes('invalid')
    || message.includes('required')
    || message.includes('Unsupported')
  ) {
    return { code: 'INVALID_REQUEST', message };
  }
  if (message.includes('rejected the access key')) {
    return { code: 'UNAUTHORIZED', message };
  }
  return {
    code: 'SERVICE_CONNECTION_FAILED',
    message: 'The STAR*NET execution service could not be reached or rejected the request.',
  };
}
