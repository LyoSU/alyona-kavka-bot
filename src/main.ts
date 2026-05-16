import { run } from '@grammyjs/runner';
import { createBot } from '@/bot/index';
import { loadEnv } from '@/config/env';
import { initDb } from '@/db/client';
import { startHealth } from '@/http/server';
import { logger } from '@/lib/logger';
import { captureError, initSentry } from '@/lib/sentry';
import { installShutdown } from '@/shutdown';

async function bootstrap() {
  const env = loadEnv();
  initSentry(env.SENTRY_DSN || undefined, env.NODE_ENV);
  await initDb(env.MONGO_URI, env.MONGO_DB_NAME);
  logger().info('db ready');

  const bot = createBot(env.BOT_TOKEN, env.OWNER_TG_IDS);

  bot.catch(({ error, ctx }) => {
    logger().error({ err: error, update_id: ctx.update.update_id }, 'bot error');
    captureError(error, { update_id: ctx.update.update_id });
  });

  bot.command('start', (ctx) => ctx.reply('Привіт 🙌'));

  // Ensure polling mode (drops any leftover webhook config)
  await bot.api.deleteWebhook({ drop_pending_updates: false });

  const { stop: httpStop } = startHealth(env.PORT);
  const runner = run(bot);
  installShutdown({ runner, httpStop });

  logger().info({ port: env.PORT }, 'bot started (long-polling)');
}

bootstrap().catch((err) => {
  logger().fatal({ err }, 'bootstrap failed');
  captureError(err, { phase: 'bootstrap' });
  process.exit(1);
});
