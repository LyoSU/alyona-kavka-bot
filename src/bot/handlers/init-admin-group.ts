import { Keyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { code } from '@/lib/html';
import { logger } from '@/lib/logger';

const REQUEST_CHAT_ID = 7712;

export async function handleInitAdminGroup(ctx: BotContext): Promise<void> {
  if (!ctx.chat || ctx.chat.type !== 'private') return;
  const u = ctx.state.user;
  if (!u?.is_admin || !u.permissions.manage_settings) {
    await ctx.reply('Команда тільки для адміністраторів з правом «налаштування».');
    return;
  }

  const kb = new Keyboard()
    .requestChat('👥 Обрати адмін-групу', REQUEST_CHAT_ID, {
      chat_is_channel: false,
      chat_is_forum: true,
      bot_is_member: true,
      bot_administrator_rights: {
        is_anonymous: false,
        can_manage_chat: true,
        can_delete_messages: false,
        can_manage_video_chats: false,
        can_restrict_members: false,
        can_promote_members: false,
        can_change_info: false,
        can_invite_users: true,
        can_post_stories: false,
        can_edit_stories: false,
        can_delete_stories: false,
        can_manage_topics: true,
      },
    })
    .resized()
    .oneTime();

  await ctx.reply(
    '👌 Натисни кнопку нижче й обери <b>форум-групу</b>, де бот уже доданий як адмін із правом «керувати топіками».',
    { reply_markup: kb, parse_mode: 'HTML' },
  );
}

export async function handleChatsShared(ctx: BotContext): Promise<void> {
  const shared = ctx.message?.chat_shared;
  if (!shared || shared.request_id !== REQUEST_CHAT_ID) return;
  const chatId = shared.chat_id;

  try {
    const member = await ctx.api.getChatMember(chatId, ctx.me.id);
    const isAdmin = member.status === 'administrator' || member.status === 'creator';
    if (!isAdmin) {
      await ctx.reply(
        'Бот має бути адміном цієї групи з правом керування топіками. Дай боту права і повтори /init_admin_group.',
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }
    await getCollections().settings.updateOne(
      { _id: 'singleton' },
      { $set: { admin_group_chat_id: chatId } },
      { upsert: true },
    );
    await getCollections().events.insertOne({
      user_tg_id: ctx.from?.id ?? 0,
      type: 'admin_group_set',
      payload: { chat_id: chatId },
      at: new Date(),
    });
    await ctx.reply(`✅ Адмін-група підключена. chat_id: ${code(chatId)}`, {
      reply_markup: { remove_keyboard: true },
      parse_mode: 'HTML',
    });
  } catch (err) {
    logger().error({ err, chat_id: chatId }, 'init_admin_group: getChatMember failed');
    await ctx.reply('Не вдалося перевірити права. Переконайся, що бот доданий у групу як адмін.', {
      reply_markup: { remove_keyboard: true },
    });
  }
}
