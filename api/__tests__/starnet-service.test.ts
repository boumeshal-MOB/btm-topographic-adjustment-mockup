import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import gateway, { handleRequest } from '../starnet-service';

const connection = {
  origin: 'https://calm-bird-42.trycloudflare.com',
  apiKey: 'a-random-key-with-more-than-24-characters',
};

const execFileAsync = promisify(execFile);

function gatewayRequest(body: unknown): Request {
  return new Request('https://mockup.example.test/api/starnet-service', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function transpileEsm(source: string, destination: string): Promise<void> {
  const output = transpileModule(await readFile(source, 'utf8'), {
    compilerOptions: {
      module: ModuleKind.ESNext,
      target: ScriptTarget.ES2022,
    },
  }).outputText;
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, output, 'utf8');
}

describe('STAR*NET Vercel gateway web handler', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses the standard Request/Response contract and rejects unsupported methods', async () => {
    expect(gateway.fetch).toBe(handleRequest);
    const response = await gateway.fetch(new Request(
      'https://mockup.example.test/api/starnet-service',
      { method: 'GET' },
    ));

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'METHOD_NOT_ALLOWED',
      message: 'Use POST.',
    });
  });

  it('returns a bounded client error instead of crashing on an invalid request', async () => {
    const response = await gateway.fetch(gatewayRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'INVALID_REQUEST',
      message: 'connection is required',
    });
  });

  it('loads after non-bundled ESM compilation, matching the Vercel Node runtime', async () => {
    const runtimeDirectory = await mkdtemp(join(tmpdir(), 'btm-starnet-vercel-runtime-'));
    try {
      await writeFile(join(runtimeDirectory, 'package.json'), '{"type":"module"}\n', 'utf8');
      await Promise.all([
        transpileEsm(
          join(process.cwd(), 'api/starnet-service.ts'),
          join(runtimeDirectory, 'api/starnet-service.js'),
        ),
        transpileEsm(
          join(process.cwd(), 'api/_starnet-service-core.ts'),
          join(runtimeDirectory, 'api/_starnet-service-core.js'),
        ),
        transpileEsm(
          join(process.cwd(), 'src/domain/starnet/vm-bridge.ts'),
          join(runtimeDirectory, 'src/domain/starnet/vm-bridge.js'),
        ),
      ]);

      const moduleUrl = pathToFileURL(join(runtimeDirectory, 'api/starnet-service.js')).href;
      const { stdout } = await execFileAsync(process.execPath, ['--input-type=module', '--eval', `
        const runtimeModule = await import(${JSON.stringify(moduleUrl)});
        const response = await runtimeModule.default.fetch(new Request(
          'https://mockup.example.test/api/starnet-service',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
        ));
        console.log(JSON.stringify({ status: response.status, body: await response.json() }));
      `]);
      const runtimeResponse = JSON.parse(stdout) as { status: number; body: unknown };

      expect(runtimeResponse.status).toBe(400);
      expect(runtimeResponse.body).toMatchObject({
        ok: false,
        code: 'INVALID_REQUEST',
      });
    } finally {
      await rm(runtimeDirectory, { recursive: true, force: true });
    }
  });

  it('proxies a service health check with the ephemeral access key', async () => {
    vi.stubEnv('STARNET_ALLOW_TRYCLOUDFLARE_PILOT', 'true');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: 'ok',
      starNetAvailable: true,
      invocationScriptAvailable: true,
      hostMode: 'interactive-pilot',
      maximumConcurrentExecutions: 1,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await gateway.fetch(gatewayRequest({ action: 'test', connection }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      action: 'test',
      message: 'STAR*NET 14 execution service is ready.',
      maximumConcurrentExecutions: 1,
      hostMode: 'interactive-pilot',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://calm-bird-42.trycloudflare.com/v1/health');
    expect((init.headers as Record<string, string>)['X-BTM-StarNet-Key']).toBe(connection.apiKey);
  });

  it('maps a rejected service key to an explicit 401 response', async () => {
    vi.stubEnv('STARNET_ALLOW_TRYCLOUDFLARE_PILOT', 'true');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'UNAUTHORIZED',
      message: 'A valid STAR*NET service key is required.',
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })));

    const response = await gateway.fetch(gatewayRequest({ action: 'test', connection }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'The STAR*NET service rejected the access key',
    });
  });
});
