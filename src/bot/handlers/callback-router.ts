import type { BotContext } from '@/bot/context';
import { loadEnv } from '@/config/env';
import { getCollections } from '@/db/client';
import { parse } from '@/domain/funnel/callbacks';
import { renderNode } from '@/domain/funnel/engine';
import { getNode } from '@/domain/funnel/repo';
import { sendProductInvoice } from '@/domain/payments/invoice';
import { notifyFunnelStep } from '@/domain/support/notifications';
import { logger } from '@/lib/logger';
import { handleAdminCallback } from './admin/router';
import { handleLessonPlay, handleLessonsProduct, handleMyLessons } from './lessons';

export async function handleCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  const chatId = ctx.chat?.id;
  const tgId = ctx.from?.id;
  if (!data || !chatId || !tgId) return;

  // admin callbacks have their own router and answer protocol
  if (data.startsWith('a:')) {
    await handleAdminCallback(ctx);
    return;
  }

  await ctx.answerCallbackQuery().catch(() => undefined);

  const parsed = parse(data);

  switch (parsed.kind) {
    case 'goto_node': {
      const prev = ctx.session.current_node_id;
      if (prev) ctx.session.history.push(prev);
      ctx.session.current_node_id = parsed.node_id;
      await getCollections().users.updateOne(
        { tg_id: tgId },
        { $set: { current_node_id: parsed.node_id, last_seen_at: new Date() } },
      );
      await getCollections().events.insertOne({
        user_tg_id: tgId,
        type: 'node_visited',
        payload: { node_id: parsed.node_id, from: prev },
        at: new Date(),
      });
      const r = await renderNode(ctx.api, chatId, parsed.node_id);
      if (!r.ok) {
        logger().warn({ node_id: parsed.node_id }, 'goto_node: node not found');
      } else {
        // Notify admins for "money-near" steps (any node with a buy button).
        const node = await getNode(parsed.node_id);
        const hasBuy = node?.buttons.some((b) => b.action === 'buy') ?? false;
        if (hasBuy) {
          notifyFunnelStep(ctx.api, tgId, parsed.node_id).catch(() => undefined);
        }
      }
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
    case 'buy': {
      const product = await getCollections().products.findOne({ product_id: parsed.product_id });
      if (!product) {
        await ctx.reply('Продукт не знайдено 🤔');
        return;
      }
      if (!product.visible) {
        await ctx.reply('Цей продукт зараз недоступний. Загляни пізніше або напиши /help.');
        return;
      }
      const env = loadEnv();
      if (!env.LIQPAY_PROVIDER_TOKEN) {
        logger().warn({ product_id: parsed.product_id }, 'buy attempted without LiqPay token');
        await ctx.reply(
          '💳 Оплата ще не налаштована. Напиши /help — Альона звʼяжеться найближчим часом.',
        );
        return;
      }
      try {
        await sendProductInvoice({
          api: ctx.api,
          chatId,
          product,
          providerToken: env.LIQPAY_PROVIDER_TOKEN,
          nbuUrl: env.NBU_API_URL,
        });
      } catch (err) {
        logger().error({ err, product_id: parsed.product_id }, 'invoice failed');
        await ctx.reply('Не вдалося виставити рахунок 😔 Спробуй пізніше або напиши /help');
      }
      return;
    }
    case 'open_product':
    case 'support':
      // wired in later phases (support)
      return;
    case 'unknown':
      logger().warn({ data }, 'unknown callback data');
      return;
  }
}
