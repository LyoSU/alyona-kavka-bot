import type { BotContext } from '@/bot/context';
import { MAIN_REPLY_BTN_LESSONS, MAIN_REPLY_BTN_SUPPORT } from '@/bot/keyboards/main-reply';
import { supportLimiter } from '@/bot/middlewares/anti-spam';
import { ensureTopic } from '@/domain/support/topic-manager';
import { logger } from '@/lib/logger';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';

export async function handlePlainMessage(ctx: BotContext): Promise<void> {
  if (!ctx.message || !ctx.from || !ctx.chat) return;
  if (ctx.chat.type !== 'private') return; // ignore admin group / other chats here

  // ignore service shares from KeyboardButton.request_users / request_chat
  if (ctx.message.users_shared || ctx.message.chat_shared) return;

  const text = ctx.message.text;
  if (text === MAIN_REPLY_BTN_LESSONS || text === MAIN_REPLY_BTN_SUPPORT) return;
  if (typeof text === 'string' && text.startsWith('/')) return;

  if (!supportLimiter.allow(ctx.from.id)) {
    logger().info({ tg_id: ctx.from.id }, 'support flood-mute');
    return;
  }

  const user = ctx.state.user;
  if (!user) return;

  const threadId = await ensureTopic(ctx.api, user);
  if (!threadId) {
    // admin group not configured — just acknowledge, do not lose the message
    await ctx.reply(SYSTEM_MESSAGES.unknown_text_response);
    return;
  }
  try {
    const settings = await import('@/db/client').then((m) =>
      m.getCollections().settings.findOne({ _id: 'singleton' }),
    );
    const adminChatId = settings?.admin_group_chat_id as number | undefined;
    if (!adminChatId) return;
    await ctx.api.copyMessage(adminChatId, ctx.chat.id, ctx.message.message_id, {
      message_thread_id: threadId,
    });
    await ctx.reply(SYSTEM_MESSAGES.unknown_text_response);
  } catch (err) {
    logger().error({ err, user_tg_id: ctx.from.id }, 'support relay failed');
  }
}

export async function handleSupportButton(ctx: BotContext): Promise<void> {
  await ctx.reply(SYSTEM_MESSAGES.help_prompt);
}
