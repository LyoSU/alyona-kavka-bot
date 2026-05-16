import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { ObjectId } from 'mongodb';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { bold, code, escapeHtml, italic } from '@/lib/html';
import { logger } from '@/lib/logger';
import { registerAdminAction } from './router';

type Conv = Parameters<Parameters<typeof createConversation<BotContext, BotContext>>[0]>[0];

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

async function listPurchases(ctx: BotContext, kind: 'paid' | 'refunded'): Promise<void> {
  const c = getCollections();
  const filter =
    kind === 'paid'
      ? { status: { $in: ['delivered', 'paid_pending_delivery'] as Array<'delivered' | 'paid_pending_delivery'> } }
      : { status: 'refunded' as const };
  const docs = await c.purchases.find(filter).sort({ created_at: -1 }).limit(20).toArray();

  const userIds = [...new Set(docs.map((d) => d.user_tg_id))];
  const productIds = [...new Set(docs.map((d) => d.product_id))];
  const users = await c.users
    .find({ tg_id: { $in: userIds } }, { projection: { tg_id: 1, first_name: 1, username: 1 } })
    .toArray();
  const products = await c.products
    .find({ product_id: { $in: productIds } }, { projection: { product_id: 1, title: 1 } })
    .toArray();
  const userMap = new Map(users.map((u) => [u.tg_id as number, u]));
  const prodMap = new Map(products.map((p) => [p.product_id as string, p.title as string]));

  const kb = new InlineKeyboard();
  for (const p of docs) {
    const u = userMap.get(p.user_tg_id);
    const userLabel = u
      ? u.username
        ? `@${u.username}`
        : (u.first_name as string)
      : `id ${p.user_tg_id}`;
    const productTitle = prodMap.get(p.product_id) ?? p.product_id;
    kb.text(
      `${productTitle} · ${p.amount_uah}₴ · ${userLabel}`,
      `a:refunds:p:${String(p._id)}`,
    ).row();
  }
  if (kind === 'paid') {
    kb.text('🕓 Уже повернуті', 'a:refunds:hist').row();
  } else {
    kb.text('⬅️ До оплачених', 'a:refunds').row();
  }
  kb.text('⬅️ Адмін-меню', 'a:home');

  const heading = kind === 'paid' ? '↩️ <b>Повернення коштів</b>' : '🕓 <b>Уже повернуті</b>';
  const subline =
    kind === 'paid'
      ? `Останні ${docs.length} оплачені покупки. Обери, щоб ініціювати повернення.\n${italic('Власне повернення коштів проводиться в кабінеті LiqPay — бот лише помічає покупку як повернуту й повідомляє юзера.')}`
      : `Останні ${docs.length} повернутих покупок.`;
  const text = `${heading}\n\n${subline}`;
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function showPurchase(ctx: BotContext, idStr: string): Promise<void> {
  if (!ObjectId.isValid(idStr)) return;
  const c = getCollections();
  const p = await c.purchases.findOne({ _id: new ObjectId(idStr) });
  if (!p) {
    await ctx.reply('Покупку не знайдено.');
    return;
  }
  const user = await c.users.findOne({ tg_id: p.user_tg_id });
  const product = await c.products.findOne({ product_id: p.product_id });

  const statusLabel =
    p.status === 'delivered'
      ? '✅ Доставлено'
      : p.status === 'paid_pending_delivery'
        ? '⏳ Оплачено, у черзі'
        : p.status === 'refunded'
          ? '↩️ Повернуто'
          : p.status === 'failed_delivery'
            ? '⚠️ Помилка доставки'
            : p.status;
  const userLabel = user
    ? `${user.first_name}${user.username ? ` (@${user.username})` : ''}`
    : `id ${p.user_tg_id}`;
  const text =
    `${bold('Покупка')}\n` +
    `Юзер: ${escapeHtml(userLabel)}\n` +
    `Продукт: ${escapeHtml(product?.title ?? p.product_id)}\n` +
    `Сума: ${p.amount_uah} ₴\n` +
    `Створено: ${escapeHtml(fmtDate(p.created_at))}\n` +
    `Статус: ${escapeHtml(statusLabel)}\n\n` +
    `<i>службовий ID:</i> ${code(String(p._id))}\n` +
    `<i>pay-id:</i> ${code(p.provider_payment_id)}`;

  const kb = new InlineKeyboard();
  if (p.status === 'delivered' || p.status === 'paid_pending_delivery') {
    kb.text('↩️ Позначити повернутою', `a:refunds:refund:${idStr}`).row();
  }
  kb.text('⬅️ До списку', 'a:refunds');
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function refundFlow(conversation: Conv, ctx: BotContext, idStr: string): Promise<void> {
  if (!ObjectId.isValid(idStr)) return;
  const c = getCollections();
  const p = await conversation.external(() =>
    c.purchases.findOne({ _id: new ObjectId(idStr) }),
  );
  if (!p) {
    await ctx.reply('Покупку не знайдено.');
    return;
  }
  if (p.status === 'refunded') {
    await ctx.reply('Цю покупку вже позначено повернутою.');
    return;
  }

  const kb = new InlineKeyboard()
    .text('✅ Так, позначити повернутою', `confirm_refund:${idStr}`)
    .text('🚫 Ні', 'confirm_refund:__no__');
  await ctx.reply(
    `Позначити покупку <b>${escapeHtml(p.product_id)}</b> (${p.amount_uah} ₴) повернутою?\n` +
      `<i>Цю дію не можна скасувати в боті. Сам повернення коштів зроби в кабінеті LiqPay.</i>`,
    { reply_markup: kb, parse_mode: 'HTML' },
  );
  const got = await conversation.waitFor('callback_query:data');
  await got.answerCallbackQuery().catch(() => undefined);
  if (got.callbackQuery.data !== `confirm_refund:${idStr}`) {
    await ctx.reply('Скасовано.');
    return;
  }

  await conversation.external(async () => {
    await c.purchases.updateOne(
      { _id: new ObjectId(idStr) },
      { $set: { status: 'refunded' } },
    );
    // Декремент лічильника + повернення суми в total_spent_uah
    await c.users.updateOne(
      { tg_id: p.user_tg_id },
      { $inc: { purchases_count: -1, total_spent_uah: -p.amount_uah } },
    );
    await c.events.insertOne({
      user_tg_id: ctx.from?.id ?? 0,
      type: 'admin_refund',
      payload: {
        purchase_id: idStr,
        target_tg_id: p.user_tg_id,
        amount_uah: p.amount_uah,
        product_id: p.product_id,
      },
      at: new Date(),
    });
  });

  // Сповіщення юзеру (best-effort)
  try {
    await ctx.api.sendMessage(
      p.user_tg_id,
      'ℹ️ Кошти за твою покупку повертаються. Гроші зʼявляться на картці протягом кількох робочих днів через LiqPay. Якщо щось не так — напиши тут.',
    );
  } catch (err) {
    logger().warn({ err, target_tg_id: p.user_tg_id }, 'refund notify failed');
  }

  await ctx.reply('✅ Помічено як повернуту. Юзер сповіщений.');
}

export const refundConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext, ...args: unknown[]): Promise<void> => {
    try {
      await refundFlow(conversation, ctx, args[0] as string);
    } catch (err) {
      logger().error({ err }, 'refund conversation failed');
      await ctx.reply('Помилка під час повернення.');
    }
  },
  'refund_purchase',
);

export function registerRefundsActions(): void {
  registerAdminAction({
    prefix: 'a:refunds',
    perm: 'refund',
    run: async (ctx, rest) => {
      if (rest === '') {
        await listPurchases(ctx, 'paid');
        return;
      }
      if (rest === 'hist') {
        await listPurchases(ctx, 'refunded');
        return;
      }
      if (rest.startsWith('p:')) {
        await showPurchase(ctx, rest.slice('p:'.length));
        return;
      }
      if (rest.startsWith('refund:')) {
        await ctx.conversation.enter('refund_purchase', rest.slice('refund:'.length));
        return;
      }
    },
  });
}
