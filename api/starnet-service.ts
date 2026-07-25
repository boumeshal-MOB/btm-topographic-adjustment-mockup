import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseStarNetVmJob, parseStarNetVmResult } from '../src/domain/starnet/vm-bridge';
import type {
  StarNetServiceGatewayResponse,
  SuccessfulStarNetServiceGatewayResponse,
} from '../src/domain/starnet/service-transport';
import {
  assertAllowedServiceEndpoint,
  parseEphemeralServiceConnection,
  parseSafeJobId,
  parseServiceGatewayEnvironment,
  parseServiceHealth,
  publicServiceGatewayError,
} from './_starnet-service-core';

export const config = {
  maxDuration: 60,
};

const MAX_RESPONSE_BYTES = 4_000_000;

interface GatewayRequest extends IncomingMessage {
  body?: unknown;
}

interface GatewayResponse extends ServerResponse {
  status(statusCode: number): GatewayResponse;
  json(body: unknown): GatewayResponse;
}

function parsedBody(request: GatewayRequest): Record<string, unknown> {
  const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('request body is invalid');
  }
  return body as Record<string, unknown>;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) {
    throw new Error('The STAR*NET service response is too large');
  }
  const body = await response.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error('The STAR*NET service response is too large');
  }
  return body ? JSON.parse(body) : {};
}

async function callService(args: {
  origin: string;
  apiKey?: string;
  path: string;
  method?: 'GET' | 'POST';
  body?: unknown;
}): Promise<{ response: Response; payload: unknown }> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (args.apiKey) headers['X-BTM-StarNet-Key'] = args.apiKey;
  if (args.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${args.origin}${args.path}`, {
    method: args.method ?? 'GET',
    headers,
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(55_000),
    ...(args.body === undefined ? {} : { body: JSON.stringify(args.body) }),
  });
  return { response, payload: await readBoundedJson(response) };
}

async function handleTest(
  origin: string,
  apiKey: string,
): Promise<SuccessfulStarNetServiceGatewayResponse> {
  const { response, payload } = await callService({ origin, apiKey, path: '/v1/health' });
  if (response.status === 401) throw new Error('The STAR*NET service rejected the access key');
  if (!response.ok) throw new Error('The STAR*NET service health check failed');
  const health = parseServiceHealth(payload);
  if (!health.starNetAvailable || !health.invocationScriptAvailable) {
    throw new Error('The service is reachable, but STAR*NET 14 is not ready');
  }
  return {
    ok: true,
    action: 'test',
    message: 'STAR*NET 14 execution service is ready.',
    maximumConcurrentExecutions: health.maximumConcurrentExecutions,
  };
}

async function handleSubmit(
  origin: string,
  apiKey: string,
  requestBody: Record<string, unknown>,
): Promise<SuccessfulStarNetServiceGatewayResponse> {
  const job = parseStarNetVmJob(requestBody.job);
  const { response, payload } = await callService({
    origin,
    apiKey,
    path: '/v1/runs',
    method: 'POST',
    body: job,
  });
  if (response.status === 401) throw new Error('The STAR*NET service rejected the access key');
  if (response.status !== 202) {
    if (
      typeof payload === 'object'
      && payload !== null
      && 'message' in payload
      && typeof payload.message === 'string'
    ) {
      throw new Error(payload.message);
    }
    throw new Error('The STAR*NET service rejected the run');
  }
  return { ok: true, action: 'submit', jobId: job.jobId, state: 'queued' };
}

async function handleResult(
  origin: string,
  apiKey: string,
  requestBody: Record<string, unknown>,
): Promise<SuccessfulStarNetServiceGatewayResponse> {
  const jobId = parseSafeJobId(requestBody.jobId);
  const { response, payload } = await callService({
    origin,
    apiKey,
    path: `/v1/runs/${encodeURIComponent(jobId)}/result`,
  });
  if (response.status === 401) throw new Error('The STAR*NET service rejected the access key');
  if (response.status === 202) {
    const lifecycle =
      typeof payload === 'object'
      && payload !== null
      && 'status' in payload
      && payload.status === 'running'
        ? 'running'
        : 'queued';
    return { ok: true, action: 'result', jobId, state: 'pending', lifecycle };
  }
  if (!response.ok) {
    const message =
      typeof payload === 'object'
      && payload !== null
      && 'error' in payload
      && typeof payload.error === 'string'
        ? payload.error
        : 'STAR*NET execution failed';
    throw new Error(message);
  }
  const result = parseStarNetVmResult(payload);
  if (result.jobId !== jobId) throw new Error('STAR*NET result jobId is invalid');
  return { ok: true, action: 'result', jobId, state: 'completed', result };
}

export default async function handler(
  request: GatewayRequest,
  response: GatewayResponse,
): Promise<void> {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Pragma', 'no-cache');
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
    return;
  }

  try {
    const body = parsedBody(request);
    const connection = parseEphemeralServiceConnection(body.connection);
    assertAllowedServiceEndpoint(connection, parseServiceGatewayEnvironment(process.env));
    let result: SuccessfulStarNetServiceGatewayResponse;
    if (body.action === 'test') {
      result = await handleTest(connection.origin, connection.apiKey);
    } else if (body.action === 'submit') {
      result = await handleSubmit(connection.origin, connection.apiKey, body);
    } else if (body.action === 'result') {
      result = await handleResult(connection.origin, connection.apiKey, body);
    } else {
      throw new Error('action is invalid');
    }
    response.status(result.action === 'result' && result.state === 'pending' ? 202 : 200).json(result);
  } catch (error) {
    const publicError = publicServiceGatewayError(error);
    const payload: StarNetServiceGatewayResponse = { ok: false, ...publicError };
    const status =
      publicError.code === 'INVALID_REQUEST'
        ? 400
        : publicError.code === 'UNAUTHORIZED'
          ? 401
          : 502;
    response.status(status).json(payload);
  }
}
