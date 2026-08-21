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

/**
 * Statuses the host emits for a request the demo backend never saw.
 *
 * `PUT /api/v2/drafts/draft-1224 failed (405)` was the visible form of this: the service worker had
 * lost control of the page — the window between a new deployment activating a new worker and the page
 * being claimed by it — so the request went to the network, matched `vercel.json`'s
 * `"/(.*)" -> "/index.html"` rewrite, and a PUT on a static file is Method Not Allowed. Nothing is
 * wrong with the handler; the request simply never reached it.
 */
const HOST_ANSWERED_INSTEAD = new Set([404, 405, 501]);

/** True when the answer came from the host rather than from the demo backend. */
function cameFromTheHost(response: Response, text: string): boolean {
  if (!HOST_ANSWERED_INSTEAD.has(response.status)) return false;
  try {
    JSON.parse(text);
    return false; // a real JSON error payload: the backend answered and said no
  } catch {
    return true;
  }
}

/** Waits for the worker to control the page again, so one retry is worth attempting. */
async function waitForTheDemoBackend(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  try {
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  } catch {
    return false;
  }
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  let response = await send(method, path, body);
  let text = await response.text();

  // One retry, and only for the case above: the worker is back, so the same request now has a
  // backend to reach. Retrying anything else would replay a mutation the backend already refused.
  if (cameFromTheHost(response, text) && await waitForTheDemoBackend()) {
    response = await send(method, path, body);
    text = await response.text();
  }

  if (!response.ok) {
    let message: string | undefined;
    try {
      message = (JSON.parse(text) as { message?: string }).message;
    } catch {
      message = undefined; // an error page rather than an error payload
    }
    if (message === undefined && cameFromTheHost(response, text)) {
      throw new ApiError(
        response.status,
        `${method} ${path} did not reach the demo backend (${response.status}). Reload the page: the mock-up's backend is a service worker, and it is not controlling this page.`,
      );
    }
    throw new ApiError(response.status, message ?? `${method} ${path} failed (${response.status})`);
  }
  return parseBody(text, method, path, response.status) as T;
}
