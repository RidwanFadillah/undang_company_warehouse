import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Variables } from './types';
import { authMiddleware } from './middleware/auth';
import { meRoute } from './routes/me';
import { syncRoute } from './routes/sync';
import { stockRoute } from './routes/stock';
import { productsRoute } from './routes/products';
import { partnersRoute } from './routes/partners';
import { inboundRoute } from './routes/inbound';
import { ordersRoute } from './routes/orders';
import { mappingsRoute } from './routes/mappings';
import { outboundRoute } from './routes/outbound';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Enable CORS for local Vite dev server
app.use(
  '/api/*',
  cors({
    origin: (origin) => origin || '*',
    allowHeaders: ['Content-Type', 'Cf-Access-Jwt-Assertion', 'If-None-Match'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'ETag'],
    maxAge: 600,
  })
);

// Health check endpoint (public)
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', name: 'Gudang Cepat API', timestamp: Date.now() });
});

// Protected API routes
const api = new Hono<{ Bindings: Env; Variables: Variables }>();
api.use('*', authMiddleware);
api.route('/me', meRoute);
api.route('/sync', syncRoute);
api.route('/stock', stockRoute);
api.route('/products', productsRoute);
api.route('/partners', partnersRoute);
api.route('/inbound', inboundRoute);
api.route('/orders', ordersRoute);
api.route('/mappings', mappingsRoute);
api.route('/outbound', outboundRoute);

app.route('/api', api);

// Uniform 404 handler for API routes
app.on(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], '/api/*', (c) => {
  return c.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: `Endpoint not found: ${c.req.method} ${c.req.path}`,
      },
    },
    404
  );
});

// Fallback to static assets (SPA) when deployed to Cloudflare Workers
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.notFound();
});

// Uniform Error Handler
app.onError((err, c) => {
  console.error('[API Error]:', err);
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: err.message || 'An unexpected error occurred',
      },
    },
    500
  );
});

export default app;
