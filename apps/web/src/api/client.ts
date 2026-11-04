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
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function apiFetchBytes(path: string, init: RequestInit = {}): Promise<ArrayBuffer> {
  const res = await fetch(path, { ...init, credentials: 'include' });
  if (!res.ok) throw await toApiError(res);
  return res.arrayBuffer();
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: { code?: string; message?: string; details?: unknown } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON error body
  }
  return new ApiError(
    res.status,
    body.code ?? 'http_error',
    body.message ?? res.statusText,
    body.details,
  );
}
