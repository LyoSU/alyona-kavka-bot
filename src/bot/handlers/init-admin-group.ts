import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { logger } from '@/lib/logger';

export async function handleInitAdminGroup(ctx: BotContext): Promise<void> {
  if (!ctx.message) return;
  const fwd = ctx.message.forward_origin;
  if (!fwd || fwd.type !== 'channel') {
    // accept forwarded from chats too (forward_origin.type === 'chat' for private/group)
    const chatId = (fwd as { chat?: { id: number } } | undefined)?.chat?.id;
    if (!chatId) {
      await ctx.reply(
        '👌 Перешли мені сюди **будь-яке повідомлення з адмін-групи** (форум-група з топіками), куди ти додав(ла) бота.',
        { parse_mode: 'Markdown' },
      );
      return;
    }
    await applyAdminGroup(ctx, chatId);
    return;
  }
  await applyAdminGroup(ctx, fwd.chat.id);
}

async function applyAdminGroup(ctx: BotContext, chatId: number): Promise<void> {
  try {
    const member = await ctx.api.getChatMember(chatId, ctx.me.id);
    const isAdmin = member.status === 'administrator' || member.status === 'creator';
    if (!isAdmin) {
      await ctx.reply('Бот має бути адміном з правом керування топіками.');
      return;
    }
    await getCollections().settings.updateOne(
      { _id: 'singleton' },
      { $set: { admin_group_chat_id: chatId } },
      { upsert: true },
    );
    await ctx.reply(`✅ Адмін-група підключена. chat_id: ${chatId}`);
  } catch (err) {
    logger().error({ err, chat_id: chatId }, 'init_admin_group failed');
    await ctx.reply('Не вдалося перевірити права. Перевір, що бот доданий як адмін.');
  }
}
