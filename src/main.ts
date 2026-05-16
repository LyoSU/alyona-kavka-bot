// Boot marker — printed before any logger init so we can confirm the JS bundle
// is actually loading inside the container (Coolify pino-logging issues).
process.stdout.write(`[boot] alyona-bot starting pid=${process.pid} node=${process.version}\n`);
process.on('uncaughtException', (err) => {
  process.stdout.write(`[fatal] uncaughtException: ${err?.stack ?? err}\n`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  process.stdout.write(`[fatal] unhandledRejection: ${(reason as Error)?.stack ?? reason}\n`);
  process.exit(1);
});

import { run } from '@grammyjs/runner';
import { publishCommands } from '@/bot/commands';
import { handleAdmin } from '@/bot/handlers/admin/menu';
import { registerAllAdminActions } from '@/bot/handlers/admin/register';
import { handleAdminReply } from '@/bot/handlers/admin-reply';
import { handleCallback } from '@/bot/handlers/callback-router';
import { handleChatsShared, handleInitAdminGroup } from '@/bot/handlers/init-admin-group';
import { handleMyLessons } from '@/bot/handlers/lessons';
import { handlePlainMessage, handleSupportButton } from '@/bot/handlers/plain-message';
import {
  handleAbout,
  handleDeleteMyData,
  handleHelp,
  handlePause,
  handleResume,
} from '@/bot/handlers/privacy';
import { handleStart } from '@/bot/handlers/start';
import { createBot } from '@/bot/index';
import { MAIN_REPLY_BTN_LESSONS, MAIN_REPLY_BTN_SUPPORT } from '@/bot/keyboards/main-reply';
import { loadEnv } from '@/config/env';
import { initDb } from '@/db/client';
import { bootstrapSeed } from '@/bootstrap-seed';
import { startBroadcastTicker } from '@/domain/broadcasts/ticker';
import { startSweeper } from '@/domain/delivery/sweeper';
import { handlePreCheckout, handleSuccessfulPayment } from '@/domain/payments/handlers';
import { startReconcileLoop } from '@/domain/users/reconcile';
import { startHealth } from '@/http/server';
import { logger } from '@/lib/logger';
import { initSodium } from '@/lib/secrets';
import { captureError, initSentry } from '@/lib/sentry';
import { installShutdown } from '@/shutdown';

async function bootstrap() {
  const env = loadEnv();
  initSentry(env.SENTRY_DSN || undefined, env.NODE_ENV);
  await initSodium();
  await initDb(env.MONGO_URI, env.MONGO_DB_NAME);
  logger().info('db ready');

  // First-boot seeding (idempotent): if flow_nodes/products are empty, insert
  // them from the bundled seed/ modules. Pre-existing edits are preserved.
  await bootstrapSeed(env.LIQPAY_TEST_MODE);
  logger().info('seed ok');

  const bot = createBot(env.BOT_TOKEN, env.OWNER_TG_IDS);
  logger().info('bot composed');

  bot.catch(({ error, ctx }) => {
    logger().error(
      {
        err: error,
        update_id: ctx.update.update_id,
        chat_id: ctx.chat?.id,
        from_id: ctx.from?.id,
        update_kind: Object.keys(ctx.update).find((k) => k !== 'update_id'),
      },
      'bot error',
    );
    captureError(error, {
      update_id: ctx.update.update_id,
      chat_id: ctx.chat?.id,
      from_id: ctx.from?.id,
    });
  });

  registerAllAdminActions();

  bot.command('start', handleStart);
  bot.command('lessons', handleMyLessons);
  bot.command('pause', handlePause);
  bot.command('resume', handleResume);
  bot.command('delete_my_data', handleDeleteMyData);
  bot.command('help', handleHelp);
  bot.command('about', handleAbout);
  bot.command('admin', handleAdmin);
  bot.command('init_admin_group', handleInitAdminGroup);
  bot.hears(MAIN_REPLY_BTN_LESSONS, handleMyLessons);
  bot.hears(MAIN_REPLY_BTN_SUPPORT, handleSupportButton);
  bot.on('callback_query:data', handleCallback);

  // payments
  bot.on('pre_checkout_query', handlePreCheckout);
  bot.on('message:successful_payment', handleSuccessfulPayment);

  // chat_shared / users_shared come as messages in private chats — handle them before relay
  bot.on('message:chat_shared', handleChatsShared);

  // CRM relay: admin group → user (must come before plain-message handler)
  bot.on('message', async (ctx, next) => {
    if (ctx.chat?.type === 'supergroup' || ctx.chat?.type === 'group') {
      await handleAdminReply(ctx);
      return; // don't fall through
    }
    await next();
  });
  // user → admin relay (private chat)
  bot.on('message', handlePlainMessage);

  logger().info('handlers registered');

  // Ensure polling mode (drops any leftover webhook config). Wrap with a
  // hard timeout: TG outages must not block startup; the runner can poll
  // even if a stale webhook is set (it'll get cleared on first long-poll).
  try {
    await Promise.race([
      bot.api.deleteWebhook({ drop_pending_updates: false }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('deleteWebhook timeout')), 5000)),
    ]);
    logger().info('webhook cleared');
  } catch (err) {
    logger().warn({ err }, 'deleteWebhook failed/timed out — continuing');
  }
  // publishCommands has its own try/catch; race it with a deadline so it can't
  // block bootstrap if TG misbehaves.
  await Promise.race([
    publishCommands(bot, env.OWNER_TG_IDS),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);

  logger().info('starting http + runner');
  const { stop: httpStop } = startHealth(env.PORT);
  const runner = run(bot);
  logger().info('runner started');
  const sweeper = startSweeper(bot.api);
  const broadcastTicker = startBroadcastTicker(bot.api);
  const reconcile = startReconcileLoop();
  installShutdown({
    runner,
    httpStop: async () => {
      sweeper.stop();
      broadcastTicker.stop();
      reconcile.stop();
      await httpStop();
    },
  });

  logger().info({ port: env.PORT }, 'bot started (long-polling)');
}

bootstrap().catch((err) => {
  logger().fatal({ err }, 'bootstrap failed');
  captureError(err, { phase: 'bootstrap' });
  process.exit(1);
});
