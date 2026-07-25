import { Client } from 'basic-ftp';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable, Writable } from 'node:stream';
import { parseStarNetVmJob, parseStarNetVmResult } from '../src/domain/starnet/vm-bridge';
import type {
  EphemeralFtpConnection,
  StarNetFtpGatewayResponse,
  SuccessfulStarNetFtpGatewayResponse,
} from '../src/domain/starnet/remote-transport';
import {
  assertAllowedFtpEndpoint,
  parseEphemeralFtpConnection,
  parseGatewayEnvironment,
  publicGatewayError,
  remoteQueueFile,
} from './_starnet-ftp-core';

export const config = {
  maxDuration: 60,
};

const MAX_RESULT_BYTES = 4_000_000;

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

function secureOption(mode: EphemeralFtpConnection['security']): true | false | 'implicit' {
  if (mode === 'explicit-tls') return true;
  if (mode === 'implicit-tls') return 'implicit';
  return false;
}

async function withFtp<T>(
  connection: EphemeralFtpConnection,
  callback: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(15_000);
  client.ftp.verbose = false;
  try {
    await client.access({
      host: connection.host,
      port: connection.port,
      user: connection.username,
      password: connection.password,
      secure: secureOption(connection.security),
      secureOptions: { rejectUnauthorized: true },
    });
    return await callback(client);
  } finally {
    client.close();
  }
}

async function downloadUtf8(client: Client, remotePath: string): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  const target = new Writable({
    write(chunk: Buffer | string, encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      size += buffer.length;
      if (size > MAX_RESULT_BYTES) {
        callback(new Error('STAR*NET result exceeds the 4 MB Vercel prototype limit'));
        return;
      }
      chunks.push(buffer);
      callback();
    },
  });
  await client.downloadTo(target, remotePath);
  return Buffer.concat(chunks).toString('utf8');
}

async function handleTest(
  connection: EphemeralFtpConnection,
): Promise<SuccessfulStarNetFtpGatewayResponse> {
  return withFtp(connection, async (client) => {
    await client.list(connection.incomingDirectory);
    await client.list(connection.outgoingDirectory);
    return {
      ok: true,
      action: 'test',
      message: 'Connection succeeded and both STAR*NET queue folders are accessible.',
    };
  });
}

async function handleSubmit(
  connection: EphemeralFtpConnection,
  requestBody: Record<string, unknown>,
): Promise<SuccessfulStarNetFtpGatewayResponse> {
  const job = parseStarNetVmJob(requestBody.job);
  const finalName = `${job.jobId}.btmjob.json`;
  const temporaryName = `${job.jobId}.uploading`;
  const finalPath = remoteQueueFile(connection.incomingDirectory, finalName);
  const temporaryPath = remoteQueueFile(connection.incomingDirectory, temporaryName);
  const oldResultPath = remoteQueueFile(connection.outgoingDirectory, `${job.jobId}.btmresult.json`);
  const content = Buffer.from(`${JSON.stringify(job, null, 2)}\n`, 'utf8');
  if (content.length > 3_500_000) throw new Error('STAR*NET job is too large for the Vercel prototype');

  return withFtp(connection, async (client) => {
    await client.list(connection.incomingDirectory);
    await client.list(connection.outgoingDirectory);
    await client.remove(oldResultPath, true);
    await client.remove(temporaryPath, true);
    await client.uploadFrom(Readable.from([content]), temporaryPath);
    await client.rename(temporaryPath, finalPath);
    return {
      ok: true,
      action: 'submit',
      jobId: job.jobId,
      state: 'queued',
    };
  });
}

async function handleResult(
  connection: EphemeralFtpConnection,
  requestBody: Record<string, unknown>,
): Promise<SuccessfulStarNetFtpGatewayResponse> {
  if (typeof requestBody.jobId !== 'string' || !/^btm-[A-Za-z0-9._-]{1,80}$/.test(requestBody.jobId)) {
    throw new Error('jobId is invalid');
  }
  const resultPath = remoteQueueFile(
    connection.outgoingDirectory,
    `${requestBody.jobId}.btmresult.json`,
  );
  return withFtp(connection, async (client) => {
    const files = await client.list(connection.outgoingDirectory);
    if (!files.some((file) => file.name === `${requestBody.jobId}.btmresult.json`)) {
      return {
        ok: true,
        action: 'result',
        jobId: requestBody.jobId as string,
        state: 'pending',
      };
    }
    const result = parseStarNetVmResult(JSON.parse(await downloadUtf8(client, resultPath)));
    if (result.jobId !== requestBody.jobId) throw new Error('STAR*NET result jobId is invalid');
    return {
      ok: true,
      action: 'result',
      jobId: result.jobId,
      state: 'completed',
      result,
    };
  });
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
    const connection = parseEphemeralFtpConnection(body.connection);
    assertAllowedFtpEndpoint(connection, parseGatewayEnvironment(process.env));
    let result: SuccessfulStarNetFtpGatewayResponse;
    if (body.action === 'test') {
      result = await handleTest(connection);
    } else if (body.action === 'submit') {
      result = await handleSubmit(connection, body);
    } else if (body.action === 'result') {
      result = await handleResult(connection, body);
    } else {
      throw new Error('action is invalid');
    }
    response.status(result.action === 'result' && result.state === 'pending' ? 202 : 200).json(result);
  } catch (error) {
    const publicError = publicGatewayError(error);
    const payload: StarNetFtpGatewayResponse = { ok: false, ...publicError };
    response.status(publicError.code === 'INVALID_REQUEST' ? 400 : 502).json(payload);
  }
}
