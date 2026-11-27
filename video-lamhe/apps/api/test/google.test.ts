import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { User } from '../src/models/User';
import { useTestDb } from './db';
import { buildTestApp, getCookie, getSetCookieHeader } from './helpers';

useTestDb();

const A = '/api/v1/auth';
const googleEnv = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/v1/auth/google/callback',
};

function stubGoogle(profile: Record<string, unknown>) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes('/token'))
      return new Response(JSON.stringify({ access_token: 'google-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (url.includes('/userinfo'))
      return new Response(JSON.stringify(profile), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    throw new Error(`Unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe('Google sign-in', () => {
  it('redirects to Google with a state cookie', async () => {
    const app = buildTestApp({ env: googleEnv });
    const res = await request(app).get(`${A}/google`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.google.com');
    expect(res.headers.location).toContain('client-id');
    const state = new URL(res.headers.location!).searchParams.get('state');
    expect(state).toBeTruthy();
    expect(getSetCookieHeader(res, 'vl_gs')).toMatch(/HttpOnly/);
    expect(getSetCookieHeader(res, 'vl_gs')).toMatch(/SameSite=Strict/);
  });

  it('creates a verified user and starts a session on callback', async () => {
    stubGoogle({
      sub: 'g-1',
      email: 'Google@Example.com',
      email_verified: true,
      name: 'Google User',
    });
    const app = buildTestApp({ env: googleEnv });
    const start = await request(app).get(`${A}/google`);
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const res = await request(app)
      .get(`${A}/google/callback?code=abc&state=${encodeURIComponent(state)}`)
      .set('Cookie', getCookie(start, 'vl_gs')!);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:3000');
    expect(getCookie(res, 'vl_rt')).toBeTruthy();
    expect(await User.findOne({ email: 'google@example.com' })).toMatchObject({
      name: 'Google User',
      googleId: 'g-1',
      isEmailVerified: true,
      role: 'customer',
    });
  });

  it('rejects a callback with a mismatched state', async () => {
    const fetchMock = stubGoogle({ sub: 'g-2', email: 'g2@example.com', email_verified: true });
    const app = buildTestApp({ env: googleEnv });
    const start = await request(app).get(`${A}/google`);
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const res = await request(app)
      .get(`${A}/google/callback?code=abc&state=${encodeURIComponent(state)}x`)
      .set('Cookie', getCookie(start, 'vl_gs')!);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('googleError=INVALID_STATE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an unverified Google email', async () => {
    stubGoogle({ sub: 'g-3', email: 'g3@example.com', email_verified: false });
    const app = buildTestApp({ env: googleEnv });
    const start = await request(app).get(`${A}/google`);
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const res = await request(app)
      .get(`${A}/google/callback?code=abc&state=${encodeURIComponent(state)}`)
      .set('Cookie', getCookie(start, 'vl_gs')!);
    expect(res.headers.location).toContain('googleError=EMAIL_NOT_VERIFIED');
    expect(await User.countDocuments()).toBe(0);
  });

  it('redirects to the login page when Google is not configured', async () => {
    const app = buildTestApp();
    const res = await request(app).get(`${A}/google`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('googleError=NOT_CONFIGURED');
  });
});
