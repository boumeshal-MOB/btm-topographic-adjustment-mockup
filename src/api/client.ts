/** Thin fetch client for the demo API (H-02 single path). Errors carry the server message. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * A 200 whose body is not JSON used to be swallowed into `{}` and handed to the caller as if it were
 * the expected payload. The screens then failed far from the cause — `sessions.data?.find is not a
 * function` in the middle of the Analysis Lab — because the demo backend is a service worker: when
 * it stops answering, the host serves the application shell with status 200 instead. A body that is
 * not JSON is now an error of its own, so react-query keeps the last good data and reports the
 * failure where it happened.
 */
function parseBody(text: string, method: string, path: string, status: number): unknown {
  if (text.trim().length === 0) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      status,
      `${method} ${path} did not return JSON (${status}). The demo backend is not answering — reload the page.`,
    );
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) {
    let message: string | undefined;
    try {
      message = (JSON.parse(text) as { message?: string }).message;
    } catch {
      message = undefined; // an error page rather than an error payload
    }
    throw new ApiError(response.status, message ?? `${method} ${path} failed (${response.status})`);
  }
  return parseBody(text, method, path, response.status) as T;
}
