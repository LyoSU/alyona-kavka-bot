import { autoRetry } from '@grammyjs/auto-retry';
import { conversations } from '@grammyjs/conversations';
import { sequentialize } from '@grammyjs/runner';
import { MongoDBAdapter } from '@grammyjs/storage-mongodb';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { Bot, session } from 'grammy';
import { getDb } from '@/db/client';
import type { BotContext, SessionData } from './context';
import { registerAdminConversations } from './handlers/admin/conversations';
import { userMiddleware } from './middlewares/user';

// Serialize updates that share the same chat OR user id. The runner processes
// updates concurrently by default; without this, two fast taps from the same
// user race on session writes (history.push, current_node_id) and user docs.
function constraints(ctx: BotContext): string[] {
  const keys: string[] = [];
  if (ctx.chat) keys.push(`c:${ctx.chat.id}`);
  if (ctx.from) keys.push(`u:${ctx.from.id}`);
  return keys;
}

export function createBot(token: string, ownerIds: number[]): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  bot.api.config.use(autoRetry({ maxRetryAttempts: 5, maxDelaySeconds: 30 }));
  bot.api.config.use(apiThrottler());

  // Must come BEFORE session/conversations so we lock around all stateful ops.
  bot.use(sequentialize(constraints));

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
