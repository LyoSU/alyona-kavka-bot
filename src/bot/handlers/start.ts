import type { BotContext } from '@/bot/context';
import { mainReplyKeyboard } from '@/bot/keyboards/main-reply';
import { getCollections } from '@/db/client';
import { renderNode } from '@/domain/funnel/engine';

export async function handleStart(ctx: BotContext): Promise<void> {
  if (!ctx.chat || !ctx.from) return;

  ctx.session.history = [];
  ctx.session.current_node_id = 'welcome';
  await getCollections().users.updateOne(
    { tg_id: ctx.from.id },
    { $set: { current_node_id: 'welcome', segment: null } },
  );

  // attach persistent reply keyboard (sticks for the chat lifetime)
  await ctx.reply('🌟', { reply_markup: mainReplyKeyboard });

  const result = await renderNode(ctx.api, ctx.chat.id, 'welcome');
  if (!result.ok) {
    await ctx.reply('Бот ще не налаштовано. Зверніться до підтримки.');
  }
}
