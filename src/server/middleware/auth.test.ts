import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { createAuthMiddleware } from './auth';
import type { Env, Variables } from '../types';

// Helper to create an in-memory mock D1Database
function createMockD1(
  initialUsers: Array<{ email: string; name: string; role: string; is_active: number }>
) {
  const users = [...initialUsers];

  return {
    prepare: (sql: string) => {
      let boundParams: unknown[] = [];
      return {
        bind: (...params: unknown[]) => {
          boundParams = params;
          return {
            first: async <T>() => {
              if (
                sql.includes(
                  'SELECT id, email, name, role, is_active, created_at FROM users WHERE email = ?'
                )
              ) {
                const email = boundParams[0];
                const found = users.find((u) => u.email === email);
                if (!found) return null;
                return {
                  id: 1,
                  email: found.email,
                  name: found.name,
                  role: found.role,
                  is_active: found.is_active,
                  created_at: 1000,
                } as unknown as T;
              }
              return null;
            },
            run: async () => {
              if (sql.includes('INSERT INTO users')) {
                const [email, name] = boundParams as [string, string];
                const existing = users.find((u) => u.email === email);
                if (existing) {
                  existing.is_active = 1;
                } else {
                  users.push({
                    email,
                    name,
                    role: 'owner',
                    is_active: 1,
                  });
                }
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as Env['DB'];
}

describe('Auth Middleware (Cloudflare Access & Dev Bypass)', () => {
  it('Production mode: rejects request without Cf-Access-Jwt-Assertion with 401', async () => {
    const mockDb = createMockD1([
      { email: 'admin@toko.com', name: 'Admin', role: 'admin', is_active: 1 },
    ]);
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use('*', createAuthMiddleware());
    app.get('/api/me', (c) => c.json({ user: c.get('user') }));

    const res = await app.request(
      '/api/me',
      {},
      {
        DB: mockDb,
        ENV: 'production',
        ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
      }
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('Production mode: STRICTLY ignores DEV_AUTH_EMAIL and rejects with 401 when header is missing', async () => {
    const mockDb = createMockD1([
      { email: 'owner@local', name: 'Owner', role: 'owner', is_active: 1 },
    ]);
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use('*', createAuthMiddleware());
    app.get('/api/me', (c) => c.json({ user: c.get('user') }));

    const res = await app.request(
      '/api/me',
      {},
      {
        DB: mockDb,
        ENV: 'production', // Notice ENV is production, not dev!
        DEV_AUTH_EMAIL: 'owner@local',
        ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
      }
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('Non-dev mode (e.g. staging or undefined): rejects request with 401 even if DEV_AUTH_EMAIL is set', async () => {
    const mockDb = createMockD1([
      { email: 'owner@local', name: 'Owner', role: 'owner', is_active: 1 },
    ]);
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use('*', createAuthMiddleware());
    app.get('/api/me', (c) => c.json({ user: c.get('user') }));

    // Test with ENV: 'staging'
    const resStaging = await app.request(
      '/api/me',
      {},
      {
        DB: mockDb,
        ENV: 'staging',
        DEV_AUTH_EMAIL: 'owner@local',
        ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
      }
    );
    expect(resStaging.status).toBe(401);

    // Test with ENV: undefined
    const resUndefined = await app.request(
      '/api/me',
      {},
      {
        DB: mockDb,
        DEV_AUTH_EMAIL: 'owner@local',
        ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
      }
    );
    expect(resUndefined.status).toBe(401);
  });

  it('Dev mode: bypasses authentication using DEV_AUTH_EMAIL when header is absent', async () => {
    const mockDb = createMockD1([]);
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use('*', createAuthMiddleware());
    app.get('/api/me', (c) => c.json({ user: c.get('user') }));

    const res = await app.request(
      '/api/me',
      {},
      {
        DB: mockDb,
        ENV: 'dev',
        DEV_AUTH_EMAIL: 'developer@local',
      }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string; role: string } };
    expect(body.user.email).toBe('developer@local');
    expect(body.user.role).toBe('owner');
  });

  it('Production mode: returns 403 when email in valid JWT is not registered in users table', async () => {
    const mockDb = createMockD1([]);
    const mockVerifier = async () => ({ email: 'stranger@gmail.com' });
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use('*', createAuthMiddleware(mockVerifier));
    app.get('/api/me', (c) => c.json({ user: c.get('user') }));

    const res = await app.request(
      '/api/me',
      {
        headers: { 'cf-access-jwt-assertion': 'mock-valid-jwt' },
      },
      {
        DB: mockDb,
        ENV: 'production',
        ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
      }
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('Production mode: accepts valid JWT with registered user', async () => {
    const mockDb = createMockD1([
      { email: 'admin@toko.com', name: 'Admin Toko', role: 'admin', is_active: 1 },
    ]);
    const mockVerifier = async () => ({ email: 'admin@toko.com' });
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use('*', createAuthMiddleware(mockVerifier));
    app.get('/api/me', (c) => c.json({ user: c.get('user') }));

    const res = await app.request(
      '/api/me',
      {
        headers: { 'cf-access-jwt-assertion': 'mock-valid-jwt' },
      },
      {
        DB: mockDb,
        ENV: 'production',
        ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
      }
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string; role: string; name: string } };
    expect(body.user.email).toBe('admin@toko.com');
    expect(body.user.role).toBe('admin');
  });

  it('Production mode: rejects when JWT verification fails', async () => {
    const mockDb = createMockD1([
      { email: 'admin@toko.com', name: 'Admin Toko', role: 'admin', is_active: 1 },
    ]);
    const failingVerifier = async () => {
      throw new Error('signature verification failed');
    };
    const app = new Hono<{ Bindings: Env; Variables: Variables }>();

    app.use('*', createAuthMiddleware(failingVerifier));
    app.get('/api/me', (c) => c.json({ user: c.get('user') }));

    const res = await app.request(
      '/api/me',
      {
        headers: { 'cf-access-jwt-assertion': 'tampered-jwt' },
      },
      {
        DB: mockDb,
        ENV: 'production',
        ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com',
        ACCESS_AUD: 'test-aud',
      }
    );

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });
});
