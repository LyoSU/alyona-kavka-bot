import type { BotContext } from '@/bot/context';
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

  // Drop any legacy reply keyboard from previous bot version. Telegram has no
  // silent "remove keyboard" call — we must send a message with the flag, so
  // we piggy-back it onto a single emoji that doubles as a hello.
  await ctx.reply('👋', { reply_markup: { remove_keyboard: true } });

  const result = await renderNode(ctx.api, ctx.chat.id, 'welcome');
  if (!result.ok) {
    await ctx.reply('Бот ще не налаштовано. Зверніться до підтримки.');
  }
}
