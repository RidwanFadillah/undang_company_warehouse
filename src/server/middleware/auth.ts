import type { MiddlewareHandler } from 'hono';
import { jwtVerify, createRemoteJWKSet } from 'jose';
import type { Env, Variables } from '../types';
import type { User, UserRole } from '../../shared/types';

// Cache remote JWKS instances per team domain to avoid recreating inside Worker
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(teamDomain: string) {
  let jwks = jwksCache.get(teamDomain);
  if (!jwks) {
    const certsUrl = new URL(`https://${teamDomain}/cdn-cgi/access/certs`);
    jwks = createRemoteJWKSet(certsUrl);
    jwksCache.set(teamDomain, jwks);
  }
  return jwks;
}

export type JwtPayloadVerifier = (
  token: string,
  teamDomain: string,
  aud: string
) => Promise<{ email: string }>;

// Default verifier using jose
export const defaultVerifyJwt: JwtPayloadVerifier = async (token, teamDomain, aud) => {
  const JWKS = getJWKS(teamDomain);
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `https://${teamDomain}`,
    audience: aud,
  });

  const email = payload.email as string | undefined;
  if (!email) {
    throw new Error('JWT payload missing email');
  }
  return { email };
};

export function createAuthMiddleware(
  customVerifier: JwtPayloadVerifier = defaultVerifyJwt
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const env = c.env;
    const isDev = env.ENV === 'dev';
    const devAuthEmail = env.DEV_AUTH_EMAIL;

    const token = c.req.header('cf-access-jwt-assertion');
    let email: string | null = null;

    if (!token) {
      if (isDev && devAuthEmail) {
        // Dev bypass allowed ONLY when ENV === 'dev'
        email = devAuthEmail;
      } else {
        return c.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Missing authentication assertion header (Cf-Access-Jwt-Assertion)',
            },
          },
          401
        );
      }
    } else {
      // Verify JWT token with jose
      const teamDomain = env.ACCESS_TEAM_DOMAIN;
      const aud = env.ACCESS_AUD;

      if (!teamDomain || !aud) {
        return c.json(
          {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Access team domain or AUD configuration missing',
            },
          },
          500
        );
      }

      try {
        const verified = await customVerifier(token, teamDomain, aud);
        email = verified.email;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Invalid assertion';
        return c.json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: `JWT verification failed: ${message}`,
            },
          },
          401
        );
      }
    }

    if (!email) {
      return c.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Unable to determine user email from assertion',
          },
        },
        401
      );
    }

    // Look up user in D1 database
    const userRow = await env.DB.prepare(
      'SELECT id, email, name, role, is_active, created_at FROM users WHERE email = ?'
    )
      .bind(email)
      .first<{
        id: number;
        email: string;
        name: string | null;
        role: UserRole;
        is_active: number;
        created_at: number;
      }>();

    if (!userRow || userRow.is_active !== 1) {
      // If running in dev mode with DEV_AUTH_EMAIL, auto-seed the dev user if not in DB
      if (isDev && email === devAuthEmail) {
        const now = Date.now();
        await env.DB.prepare(
          `INSERT INTO users (email, name, role, is_active, created_at)
           VALUES (?, ?, 'owner', 1, ?)
           ON CONFLICT(email) DO UPDATE SET is_active = 1`
        )
          .bind(email, 'Local Developer', now)
          .run();

        const seededUser: User = {
          id: userRow?.id ?? 1,
          email,
          name: 'Local Developer',
          role: 'owner',
          is_active: 1,
          created_at: now,
        };
        c.set('user', seededUser);
        return next();
      }

      return c.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: 'User not registered or inactive in Gudang Cepat',
          },
        },
        403
      );
    }

    c.set('user', userRow);
    return next();
  };
}

export const authMiddleware = createAuthMiddleware();
