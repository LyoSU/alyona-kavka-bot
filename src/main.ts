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

  const bot = createBot(env.BOT_TOKEN, env.OWNER_TG_IDS);

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

  // Ensure polling mode (drops any leftover webhook config)
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false });
  } catch (err) {
    logger().warn({ err }, 'deleteWebhook failed — continuing with long-polling anyway');
  }
  await publishCommands(bot, env.OWNER_TG_IDS);

  const { stop: httpStop } = startHealth(env.PORT);
  const runner = run(bot);
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
