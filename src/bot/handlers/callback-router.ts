import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { parse } from '@/domain/funnel/callbacks';
import { renderNode } from '@/domain/funnel/engine';
import { logger } from '@/lib/logger';
import { handleLessonPlay, handleLessonsProduct, handleMyLessons } from './lessons';

export async function handleCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  const chatId = ctx.chat?.id;
  const tgId = ctx.from?.id;
  if (!data || !chatId || !tgId) return;

  await ctx.answerCallbackQuery().catch(() => undefined);

  const parsed = parse(data);

  switch (parsed.kind) {
    case 'goto_node': {
      const prev = ctx.session.current_node_id;
      if (prev) ctx.session.history.push(prev);
      ctx.session.current_node_id = parsed.node_id;
      await getCollections().users.updateOne(
        { tg_id: tgId },
        { $set: { current_node_id: parsed.node_id } },
      );
      const r = await renderNode(ctx.api, chatId, parsed.node_id);
      if (!r.ok) logger().warn({ node_id: parsed.node_id }, 'goto_node: node not found');
      return;
    }
    case 'back': {
      const prev = ctx.session.history.pop();
      if (prev) {
        ctx.session.current_node_id = prev;
        await renderNode(ctx.api, chatId, prev);
      }
      return;
    }
    case 'home': {
      ctx.session.history = [];
      ctx.session.current_node_id = 'welcome';
      await renderNode(ctx.api, chatId, 'welcome');
      return;
    }
    case 'lessons_product':
      await handleLessonsProduct(ctx, parsed.product_id);
      return;
    case 'lessons_play':
      await handleLessonPlay(ctx, parsed.lesson_id);
      return;
    case 'lessons_root':
      await handleMyLessons(ctx);
      return;
    case 'open_product':
    case 'buy':
    case 'support':
      // wired in later phases (payments, support)
      return;
    case 'unknown':
      logger().warn({ data }, 'unknown callback data');
      return;
  }
}
