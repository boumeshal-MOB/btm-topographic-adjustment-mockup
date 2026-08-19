import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '@/api/client';

/** A fresh Response per call: a body can only be read once. */
function respond(body: string, init: ResponseInit = {}): void {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  }))));
}

afterEach(() => vi.unstubAllGlobals());

describe('demo API client', () => {
  it('returns the parsed payload', async () => {
    respond(JSON.stringify([{ processingId: 7 }]));
    await expect(api('GET', '/api/v2/validation-sessions')).resolves.toEqual([{ processingId: 7 }]);
  });

  /**
   * The demo backend is a service worker. When it stops answering, the host serves the application
   * shell with status 200 — and that used to be swallowed into `{}` and handed over as the payload,
   * so a screen failed far from the cause (`sessions.data?.find is not a function` inside the
   * Analysis Lab, which took the whole workspace and its trials down).
   */
  it('refuses a 200 whose body is not JSON instead of inventing an empty payload', async () => {
    respond('<!doctype html><html><body>app shell</body></html>', {
      headers: { 'Content-Type': 'text/html' },
    });
    await expect(api('GET', '/api/v2/validation-sessions')).rejects.toThrow(ApiError);
    await expect(api('GET', '/api/v2/validation-sessions')).rejects.toThrow(/did not return JSON/);
  });

  it('keeps an empty body usable for endpoints that answer with nothing', async () => {
    respond('');
    await expect(api('DELETE', '/api/v2/validation-sessions/1')).resolves.toEqual({});
  });

  it('carries the server message of a failed call', async () => {
    respond(JSON.stringify({ code: 'demo-error', message: 'Unknown processing' }), { status: 400 });
    await expect(api('GET', '/api/v2/topographic-adjustments/9')).rejects.toThrow('Unknown processing');
  });

  it('still reports a failure whose body is an error page', async () => {
    respond('<html>502 Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } });
    await expect(api('GET', '/api/v2/topographic-adjustments/9')).rejects.toThrow(/failed \(502\)/);
  });
});
