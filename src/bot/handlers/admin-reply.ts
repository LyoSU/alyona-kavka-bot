import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { findUserByThread } from '@/domain/support/topic-manager';
import { logger } from '@/lib/logger';

export async function handleAdminReply(ctx: BotContext): Promise<void> {
  if (!ctx.message || !ctx.chat) return;
  if (ctx.chat.type !== 'supergroup' && ctx.chat.type !== 'group') return;
  if (!ctx.message.message_thread_id) return;
  if (ctx.from?.is_bot) return;

  const settings = await getCollections().settings.findOne({ _id: 'singleton' });
  if (ctx.chat.id !== settings?.admin_group_chat_id) return;

  // Forum-group membership ≠ bot admin in DB. Without this check, anyone added
  // to the Telegram group could send messages to users impersonating the bot.
  // Require an explicit `support` permission in our DB.
  const fromId = ctx.from?.id;
  if (!fromId) return;
  const author = await getCollections().users.findOne({ tg_id: fromId });
  if (!author?.is_admin || !author.permissions.support) {
    logger().info(
      { tg_id: fromId, thread_id: ctx.message.message_thread_id },
      'admin reply: author lacks support permission, ignoring',
    );
    return;
  }

  // Skip internal notes
  const text = ctx.message.text;
  const caption = ctx.message.caption;
  if (
    (typeof text === 'string' && text.startsWith('//')) ||
    (typeof caption === 'string' && caption.startsWith('//'))
  ) {
    return;
  }

  const userId = await findUserByThread(ctx.chat.id, ctx.message.message_thread_id);
  if (!userId) return;

  try {
    await ctx.api.copyMessage(userId, ctx.chat.id, ctx.message.message_id);
  } catch (err) {
    logger().warn({ err, user_tg_id: userId }, 'admin reply forward failed');
    await ctx.reply('⚠️ Не вдалося доставити юзеру (можливо, заблокував бота)', {
      message_thread_id: ctx.message.message_thread_id,
    });
  }
}
