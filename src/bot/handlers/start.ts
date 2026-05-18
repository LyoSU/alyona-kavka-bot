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

  const result = await renderNode(ctx.api, ctx.chat.id, 'welcome');
  if (!result.ok) {
    await ctx.reply('Бот ще не налаштовано. Зверніться до підтримки.');
  }
}
