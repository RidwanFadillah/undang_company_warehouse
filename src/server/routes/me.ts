import { Hono } from 'hono';
import type { Env, Variables } from '../types';

export const meRoute = new Hono<{ Bindings: Env; Variables: Variables }>();

meRoute.get('/', (c) => {
  const user = c.get('user');
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});
