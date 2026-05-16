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

  // Послаблені фільтри: TG валідує наявність хоч одного відповідного чату; жорсткі
  // bot_administrator_rights дають USER_RIGHTS_MISSING якщо user сам не має таких прав.
  // Перевірку прав бота робимо вже у handleChatsShared() через getChatMember.
  const kb = new Keyboard()
    .requestChat('👥 Обрати адмін-групу', REQUEST_CHAT_ID, {
      chat_is_channel: false,
      bot_is_member: true,
    })
    .resized()
    .oneTime();

  await ctx.reply(
    '👌 Натисни кнопку нижче й обери <b>групу</b>, куди ти вже додав(ла) бота як адміна з правом «керувати топіками» (потрібна форум-група з увімкненими топіками).',
    { reply_markup: kb, parse_mode: 'HTML' },
  );
}

export async function handleChatsShared(ctx: BotContext): Promise<void> {
  const shared = ctx.message?.chat_shared;
  if (!shared || shared.request_id !== REQUEST_CHAT_ID) return;
  const chatId = shared.chat_id;

  try {
    const chat = await ctx.api.getChat(chatId);
    if (chat.type !== 'supergroup' || !('is_forum' in chat) || !chat.is_forum) {
      await ctx.reply(
        '⚠️ Це не форум-група. Створи групу заново з увімкненими <b>Топіками</b> (Edit group → Topics: ON) і обери її ще раз.',
        { reply_markup: { remove_keyboard: true }, parse_mode: 'HTML' },
      );
      return;
    }
    const member = await ctx.api.getChatMember(chatId, ctx.me.id);
    const isAdmin = member.status === 'administrator' || member.status === 'creator';
    if (!isAdmin) {
      await ctx.reply(
        '⚠️ Бот не є адміном у цій групі. Зроби бота адміністратором із дозволом «керувати топіками» і обери групу ще раз через /admin → ⚙️ Налаштування → 🔗 Підключити адмін-групу.',
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }
    if (member.status === 'administrator' && !member.can_manage_topics) {
      await ctx.reply(
        '⚠️ Боту бракує права «керувати топіками» у цій групі. Постав цей дозвіл у налаштуваннях групи і повтори.',
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
