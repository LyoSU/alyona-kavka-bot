import { autoRetry } from '@grammyjs/auto-retry';
import { conversations } from '@grammyjs/conversations';
import { MongoDBAdapter } from '@grammyjs/storage-mongodb';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { Bot, session } from 'grammy';
import { getDb } from '@/db/client';
import type { BotContext, SessionData } from './context';
import { registerAdminConversations } from './handlers/admin/conversations';
import { userMiddleware } from './middlewares/user';

export function createBot(token: string, ownerIds: number[]): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  bot.api.config.use(autoRetry({ maxRetryAttempts: 5, maxDelaySeconds: 30 }));
  bot.api.config.use(apiThrottler());

  bot.use(async (ctx, next) => {
    ctx.state = {};
    await next();
  });

  bot.use(
    session<SessionData, BotContext>({
      initial: () => ({ history: [] }),
      storage: new MongoDBAdapter({
        collection: getDb().collection('bot_sessions'),
      }),
    }),
  );

  bot.use(conversations());
  registerAdminConversations(bot);
  bot.use(userMiddleware(ownerIds));

  return bot;
}
