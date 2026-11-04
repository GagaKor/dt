export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

export class AdminClient {
  private cookie = '';
  constructor(readonly baseUrl: string) {}

  async request<T>(method: string, path: string, body?: unknown | FormData): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    let payload: string | FormData | undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(new URL(path, this.baseUrl), { method, headers, body: payload });
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('dt_session='));
    if (setCookie) this.cookie = setCookie.split(';')[0]!;
    const text = await res.text();
    const json = text ? (JSON.parse(text) as unknown) : undefined;
    if (!res.ok) {
      const err = (json ?? {}) as { code?: string; message?: string };
      throw new ApiError(
        res.status,
        err.code,
        `${method} ${path} -> ${res.status} ${err.code ?? ''} ${err.message ?? text}`.trim(),
      );
    }
    return json as T;
  }

  login(username: string, password: string) {
    return this.request<unknown>('POST', '/api/auth/login', { username, password });
  }
}

export interface Timed {
  status: number;
  ms: number;
}

export async function ingest(
  baseUrl: string,
  key: string,
  path: '/api/ingest/events' | '/api/ingest/positions',
  body: unknown,
): Promise<Timed> {
  const t0 = performance.now();
  try {
    const res = await fetch(new URL(path, baseUrl), {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    await res.arrayBuffer();
    return { status: res.status, ms: performance.now() - t0 };
  } catch {
    return { status: 0, ms: performance.now() - t0 };
  }
}
