import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getDb } from '@/db/client';

export function startHealth(port: number): { stop: () => Promise<void> } {
  const app = new Hono();

  app.get('/health', async (c) => {
    try {
      await getDb().admin().ping();
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'degraded' }, 503);
    }
  });

  const server = serve({ fetch: app.fetch, port });

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
