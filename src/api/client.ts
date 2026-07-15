/** Thin fetch client for the demo API (H-02 single path). Errors carry the server message. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new ApiError(response.status, data.message ?? `${method} ${path} failed (${response.status})`);
  return data as T;
}
