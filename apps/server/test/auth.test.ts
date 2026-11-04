import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import cookie from '@fastify/cookie';
import {
  readSessionFromCookieHeader,
  SESSION_TTL_MS,
  verifySessionCookie,
} from '../src/auth/session.js';
import { loginCookie, createTestApp, type TestApp } from './helpers.js';

describe('admin auth', () => {
  let t: TestApp;
  beforeEach(async () => {
    t = await createTestApp();
  });
  afterEach(async () => {
    await t.close();
  });

  const login = (password: string, username = 'admin') =>
    t.app.inject({ method: 'POST', url: '/api/auth/login', payload: { username, password } });

  it('wrong password -> 401 invalid_credentials', async () => {
    const res = await login('nope');
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('invalid_credentials');
  });

  it('wrong username -> 401 invalid_credentials', async () => {
    const res = await login('test-password', 'root');
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('invalid_credentials');
  });

  it('right password -> 204 and set-cookie dt_session', async () => {
    const res = await login('test-password');
    expect(res.statusCode).toBe(204);
    const c = res.cookies.find((x) => x.name === 'dt_session');
    expect(c).toBeDefined();
    expect(c?.httpOnly).toBe(true);
    expect(c?.sameSite).toBe('Lax');
    expect(c?.path).toBe('/');
  });

  it('me with cookie -> username', async () => {
    const cookie = await loginCookie(t.app);
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ username: 'admin' });
  });

  it('me without cookie -> 401 unauthenticated', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('unauthenticated');
  });

  it('tampered cookie -> 401', async () => {
    const cookie = await loginCookie(t.app);
    const tampered = cookie.slice(0, -2) + (cookie.endsWith('AA') ? 'BB' : 'AA');
    const res = await t.app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: tampered },
    });
    expect(res.statusCode).toBe(401);
  });

  it('expires after 12h', async () => {
    const cookie = await loginCookie(t.app);
    t.clock.advance(12 * 60 * 60 * 1000 + 1000);
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(401);
  });

  it('still valid just before 12h', async () => {
    const cookie = await loginCookie(t.app);
    t.clock.advance(12 * 60 * 60 * 1000 - 1000);
    const res = await t.app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(res.statusCode).toBe(200);
  });

  it('logout clears cookie', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
    const c = res.cookies.find((x) => x.name === 'dt_session');
    expect(c).toBeDefined();
    expect(c?.value).toBe('');
    expect(c?.maxAge === 0 || (c?.expires && c.expires.getTime() < Date.now())).toBe(true);
  });

  describe('before body parsing', () => {
    it('login with a ~2 MiB JSON body -> 413', async () => {
      const res = await login('x'.repeat(2 * 1024 * 1024));
      expect(res.statusCode).toBe(413);
    });

    it('admin route without cookie and with an invalid body -> 401, not 400', async () => {
      const res = await t.app.inject({
        method: 'POST',
        url: '/api/sites',
        payload: { name: 42 },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('unauthenticated');
    });
  });

  describe('cookie helpers', () => {
    const secret = 'test-session-secret-0123456789abcdef';
    const sign = (v: string, sec = secret) => cookie.sign(v, sec);
    const now = () => t.clock.now();

    it('readSessionFromCookieHeader accepts the Set-Cookie value inside a multi-cookie header', async () => {
      const res = await login('test-password');
      const setCookie = String(res.headers['set-cookie']);
      const pair = setCookie.split(';')[0];
      expect(pair).toContain('%');
      const header = `other=x; ${pair}; y=z`;
      expect(readSessionFromCookieHeader(header, secret, now())).toEqual({
        username: 'admin',
        exp: now().getTime() + SESSION_TTL_MS,
      });
    });

    it('readSessionFromCookieHeader returns null without a header or dt_session', () => {
      expect(readSessionFromCookieHeader(undefined, secret, now())).toBeNull();
      expect(readSessionFromCookieHeader('other=x; y=z', secret, now())).toBeNull();
    });

    it('verifySessionCookie rejects forged exp, wrong secret, malformed JSON', () => {
      const exp = now().getTime() + 1000;
      const good = sign(JSON.stringify({ u: 'admin', exp }));
      expect(verifySessionCookie(good, secret, now())).toEqual({ username: 'admin', exp });

      const sig = good.slice(good.lastIndexOf('.'));
      const forged = JSON.stringify({ u: 'admin', exp: exp + 86_400_000 }) + sig;
      expect(verifySessionCookie(forged, secret, now())).toBeNull();

      expect(
        verifySessionCookie(
          sign(JSON.stringify({ u: 'admin', exp }), 'other-secret-0123456789abcdef!!'),
          secret,
          now(),
        ),
      ).toBeNull();
      expect(verifySessionCookie(sign('{not json'), secret, now())).toBeNull();
    });
  });
});
