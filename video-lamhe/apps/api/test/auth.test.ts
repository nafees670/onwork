import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { RefreshSession } from '../src/models/RefreshSession';
import { User } from '../src/models/User';
import { useTestDb } from './db';
import { buildTestApp, getCookie, getSetCookieHeader } from './helpers';

useTestDb();

const A = '/api/v1/auth';
const customer = {
  name: 'Test Customer',
  phone: '0300-1234567',
  email: 'Customer@Example.com',
  password: 'correct-horse',
};

async function register(app: ReturnType<typeof buildTestApp>, body = customer) {
  return request(app).post(`${A}/register`).send(body);
}

describe('register', () => {
  it('creates a customer, normalises fields and starts a session', async () => {
    const app = buildTestApp();
    const res = await register(app, { ...customer, role: 'admin' } as typeof customer);
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({
      name: 'Test Customer',
      email: 'customer@example.com',
      phone: '923001234567',
      role: 'customer', // role in the body is ignored
      themePreference: 'light',
    });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.expiresIn).toBe(900);

    const cookie = getSetCookieHeader(res, 'vl_rt')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('rejects duplicate emails with 409', async () => {
    const app = buildTestApp();
    await register(app);
    const res = await register(app, { ...customer, email: 'customer@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('validates input', async () => {
    const res = await register(buildTestApp(), { ...customer, password: 'short', phone: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['password', 'phone']),
    );
  });

  it('is rate limited to 5 per hour per IP', async () => {
    const app = buildTestApp();
    for (let i = 0; i < 5; i++) {
      const r = await register(app, { ...customer, email: `u${i}@example.com` });
      expect(r.status).toBe(201);
    }
    const res = await register(app, { ...customer, email: 'u6@example.com' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeTruthy();
    expect(res.headers['ratelimit-limit']).toBe('5');
  });
});

describe('login, me & logout', () => {
  it('logs in, reads /me, updates theme, logs out', async () => {
    const app = buildTestApp();
    await register(app);

    const bad = await request(app)
      .post(`${A}/login`)
      .send({ email: customer.email, password: 'nope' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');

    const unknown = await request(app)
      .post(`${A}/login`)
      .send({ email: 'ghost@example.com', password: 'x' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe(bad.body.error.message);

    const ok = await request(app)
      .post(`${A}/login`)
      .send({ email: customer.email, password: customer.password });
    expect(ok.status).toBe(200);
    const token = ok.body.data.accessToken as string;

    expect((await request(app).get(`${A}/me`)).status).toBe(401);
    expect(
      (await request(app).get(`${A}/me`).set('Authorization', 'Bearer garbage')).body.error.code,
    ).toBe('TOKEN_INVALID');
    const me = await request(app).get(`${A}/me`).set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('customer@example.com');

    const patched = await request(app)
      .patch(`${A}/me`)
      .set('Authorization', `Bearer ${token}`)
      .send({ themePreference: 'dark', role: 'admin' });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ themePreference: 'dark', role: 'customer' });

    const cookie = getCookie(ok, 'vl_rt')!;
    const out = await request(app).post(`${A}/logout`).set('Cookie', cookie);
    expect(out.status).toBe(200);
    expect(getSetCookieHeader(out, 'vl_rt')).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await request(app).post(`${A}/refresh`).set('Cookie', cookie)).status).toBe(401);
  });

  it('emails the user on a successful login, not on a failed one', async () => {
    const app = buildTestApp();
    await register(app);
    expect(app.sentMail).toHaveLength(0);

    const bad = await request(app)
      .post(`${A}/login`)
      .send({ email: customer.email, password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(app.sentMail).toHaveLength(0);

    const ok = await request(app)
      .post(`${A}/login`)
      .set('User-Agent', 'test-agent')
      .set('X-Forwarded-For', '10.1.2.3')
      .send({ email: customer.email, password: customer.password });
    expect(ok.status).toBe(200);
    expect(app.sentMail).toHaveLength(1);
    expect(app.sentMail[0]).toMatchObject({
      to: 'customer@example.com',
      subject: 'New sign-in to your Video Lamhe account',
    });
    expect(app.sentMail[0]!.text).toContain('10.1.2.3');
    expect(app.sentMail[0]!.text).toContain('test-agent');
    expect(app.sentMail[0]!.text).toContain('http://localhost:3000/reset-password');
    expect(app.sentMail[0]!.text).not.toContain(customer.password);
  });

  it('locks the account for 15 min after 5 failed logins for the same email (any IP)', async () => {
    const app = buildTestApp();
    await register(app);
    const attempt = (password: string, ip: string) =>
      request(app)
        .post(`${A}/login`)
        .set('X-Forwarded-For', ip)
        .send({ email: customer.email, password });

    for (let i = 0; i < 4; i++) expect((await attempt('wrong', '10.0.0.1')).status).toBe(401);
    const fifth = await attempt('wrong', '10.0.0.1');
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('ACCOUNT_LOCKED');

    // Correct password from another IP is still refused while locked.
    const locked = await attempt(customer.password, '10.0.0.2');
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(800);
  });
});

describe('refresh token rotation', () => {
  it('rotates, tolerates a quick multi-tab race, and revokes everything on reuse', async () => {
    const app = buildTestApp();
    const reg = await register(app);
    const c1 = getCookie(reg, 'vl_rt')!;

    const r1 = await request(app).post(`${A}/refresh`).set('Cookie', c1);
    expect(r1.status).toBe(200);
    expect(r1.body.data.accessToken).toEqual(expect.any(String));
    const c2 = getCookie(r1, 'vl_rt')!;
    expect(c2).not.toBe(c1);

    // Same old token again immediately → benign race, nothing revoked.
    const race = await request(app).post(`${A}/refresh`).set('Cookie', c1);
    expect(race.status).toBe(401);
    expect(race.body.error.code).toBe('REFRESH_CONFLICT');

    // Simulate the old token being replayed later (stolen) → reuse detection.
    await RefreshSession.updateMany(
      { usedAt: { $ne: null } },
      { usedAt: new Date(Date.now() - 60_000) },
    );
    const reuse = await request(app).post(`${A}/refresh`).set('Cookie', c1);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');

    // The legitimate newer token is now dead too.
    const after = await request(app).post(`${A}/refresh`).set('Cookie', c2);
    expect(after.status).toBe(401);
    const user = await User.findOne({ email: 'customer@example.com' });
    expect(user!.refreshTokenVersion).toBe(1);
    expect(await RefreshSession.countDocuments()).toBe(0);
  });

  it('rejects missing cookies and cross-origin requests', async () => {
    const app = buildTestApp();
    const none = await request(app).post(`${A}/refresh`);
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('NO_SESSION');

    const reg = await register(app);
    const evil = await request(app)
      .post(`${A}/refresh`)
      .set('Origin', 'https://evil.example')
      .set('Cookie', getCookie(reg, 'vl_rt')!);
    expect(evil.status).toBe(403);
  });
});

describe('forgot / reset password', () => {
  it('does not reveal whether an email exists', async () => {
    const app = buildTestApp();
    const res = await request(app)
      .post(`${A}/forgot-password`)
      .send({ email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(app.sentMail).toHaveLength(0);
  });

  it('resets the password with the emailed token and logs out other sessions', async () => {
    const app = buildTestApp();
    const reg = await register(app);
    const oldCookie = getCookie(reg, 'vl_rt')!;

    await request(app).post(`${A}/forgot-password`).send({ email: customer.email }).expect(200);
    expect(app.sentMail).toHaveLength(1);
    const token = /token=([\w-]+)/.exec(app.sentMail[0]!.text)![1]!;
    expect(app.sentMail[0]!.text).toContain('http://localhost:3000/reset-password?token=');

    const reset = await request(app)
      .post(`${A}/reset-password`)
      .send({ token, password: 'brand-new-pass' });
    expect(reset.status).toBe(200);

    const again = await request(app)
      .post(`${A}/reset-password`)
      .send({ token, password: 'another-pass' });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('RESET_TOKEN_INVALID');

    expect((await request(app).post(`${A}/refresh`).set('Cookie', oldCookie)).status).toBe(401);
    expect(
      (
        await request(app)
          .post(`${A}/login`)
          .send({ email: customer.email, password: customer.password })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(`${A}/login`)
          .send({ email: customer.email, password: 'brand-new-pass' })
      ).status,
    ).toBe(200);
  });
});
