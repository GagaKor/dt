export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const h = new Headers(headers);
  if (json !== undefined) {
    h.set('content-type', 'application/json');
    rest.body = JSON.stringify(json);
  }
  const res = await fetch(path, { ...rest, headers: h, credentials: 'include' });
  if (!res.ok) {
    let body: { code?: string; message?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      // non-JSON error body
    }
    throw new ApiError(
      res.status,
      body.code ?? 'http_error',
      body.message ?? res.statusText,
      body.details,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
