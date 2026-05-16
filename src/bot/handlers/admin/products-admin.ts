import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { loadEnv } from '@/config/env';
import { getCollections } from '@/db/client';
import { getCachedUsdRate } from '@/domain/payments/exchange-rate';
import { bold, code, escapeHtml } from '@/lib/html';
import { logger } from '@/lib/logger';
import { registerAdminAction } from './router';

type Conv = Parameters<Parameters<typeof createConversation<BotContext, BotContext>>[0]>[0];

type EditField = 'title' | 'description' | 'price' | 'currency';

async function listProducts(ctx: BotContext): Promise<void> {
  const products = await getCollections().products.find().sort({ order: 1 }).toArray();
  const kb = new InlineKeyboard();
  for (const p of products) {
    const visible = p.visible ? '👁' : '🚫';
    const label = `${visible} ${p.title} — ${p.price} ${p.currency}`;
    kb.text(label, `a:products:p:${p.product_id}`).row();
  }
  kb.text('⬅️ Адмін-меню', 'a:home');
  const text = `🛒 <b>Продукти (${products.length})</b>`;
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function showProduct(ctx: BotContext, product_id: string): Promise<void> {
  const p = await getCollections().products.findOne({ product_id });
  if (!p) {
    await ctx.reply('Продукт не знайдено.');
    return;
  }
  let priceLine = `💵 ${p.price} ${p.currency}`;
  if (p.currency === 'USD') {
    try {
      const rate = await getCachedUsdRate(loadEnv().NBU_API_URL);
      const uah = Math.round(p.price * rate);
      priceLine += ` ≈ ${uah} UAH (курс ${rate.toFixed(2)})`;
    } catch {
      /* ignore */
    }
  }
  const text =
    `🛒 ${bold(p.title)}\n` +
    `ID: ${code(product_id)}\n` +
    `Тип: ${escapeHtml(p.type)}\n` +
    `${escapeHtml(priceLine)}\n` +
    `Видимий: ${p.visible ? '👁 так' : '🚫 ні'}\n\n` +
    `<i>Опис:</i>\n${escapeHtml(p.description)}`;
  const kb = new InlineKeyboard()
    .text('📝 Назва', `a:products:edit:${product_id}:title`)
    .text('📃 Опис', `a:products:edit:${product_id}:description`)
    .row()
    .text('💵 Ціна', `a:products:edit:${product_id}:price`)
    .text('💱 Валюта', `a:products:edit:${product_id}:currency`)
    .row()
    .text(p.visible ? '🚫 Сховати' : '👁 Показати', `a:products:toggle:${product_id}`)
    .row()
    .text('⬅️ До списку', 'a:products');
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function toggleVisible(ctx: BotContext, product_id: string): Promise<void> {
  const p = await getCollections().products.findOne({ product_id });
  if (!p) return;
  await getCollections().products.updateOne({ product_id }, { $set: { visible: !p.visible } });
  await getCollections().events.insertOne({
    user_tg_id: ctx.from?.id ?? 0,
    type: 'admin_product_toggle',
    payload: { product_id, visible: !p.visible },
    at: new Date(),
  });
  await showProduct(ctx, product_id);
}

async function editFieldFlow(
  conversation: Conv,
  ctx: BotContext,
  product_id: string,
  field: EditField,
): Promise<void> {
  const { products, events } = getCollections();
  const p = await conversation.external(() => products.findOne({ product_id }));
  if (!p) {
    await ctx.reply('Продукт зник.');
    return;
  }
  const prompts: Record<EditField, string> = {
    title: `📝 Нова назва (поточна: «${escapeHtml(p.title)}»)`,
    description: `📃 Новий опис (поточний нижче). Звичайний текст без розмітки.\n\n${escapeHtml(p.description)}`,
    price: `💵 Нова ціна числом (поточна: ${p.price} ${escapeHtml(p.currency)})`,
    currency: `💱 Нова валюта: UAH або USD (поточна: ${escapeHtml(p.currency)})`,
  };
  await ctx.reply(`${prompts[field]}\n\n<i>Або /cancel.</i>`, { parse_mode: 'HTML' });
  const got = await conversation.waitFor('message:text');
  const raw = got.msg.text.trim();
  if (raw === '/cancel' || !raw) {
    await ctx.reply('Скасовано.');
    return;
  }

  let update: Record<string, unknown> | null = null;
  if (field === 'price') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      await ctx.reply('Ціна має бути додатнім числом. Скасовано.');
      return;
    }
    update = { price: n };
  } else if (field === 'currency') {
    const c = raw.toUpperCase();
    if (c !== 'UAH' && c !== 'USD') {
      await ctx.reply('Допустимі значення: UAH або USD. Скасовано.');
      return;
    }
    update = { currency: c };
  } else if (field === 'title') {
    if (raw.length > 64) {
      await ctx.reply('Назва задовга (макс. 64 символи). Скасовано.');
      return;
    }
    update = { title: raw };
  } else {
    update = { description: raw };
  }

  const valueToSave = update;
  await conversation.external(async () => {
    await products.updateOne({ product_id }, { $set: valueToSave });
    await events.insertOne({
      user_tg_id: ctx.from?.id ?? 0,
      type: 'admin_product_edit',
      payload: { product_id, field, value: valueToSave },
      at: new Date(),
    });
  });
  await ctx.reply(`✅ Поле ${code(field)} оновлено.`, { parse_mode: 'HTML' });
}

export const editProductFieldConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext, ...args: unknown[]): Promise<void> => {
    try {
      await editFieldFlow(conversation, ctx, args[0] as string, args[1] as EditField);
    } catch (err) {
      logger().error({ err }, 'edit product field failed');
      await ctx.reply('Помилка при редагуванні.');
    }
  },
  'edit_product_field',
);

export function registerProductsActions(): void {
  registerAdminAction({
    prefix: 'a:products',
    perm: 'manage_products',
    run: async (ctx, rest) => {
      if (rest === '') {
        await listProducts(ctx);
        return;
      }
      if (rest.startsWith('p:')) {
        await showProduct(ctx, rest.slice('p:'.length));
        return;
      }
      if (rest.startsWith('toggle:')) {
        await toggleVisible(ctx, rest.slice('toggle:'.length));
        return;
      }
      if (rest.startsWith('edit:')) {
        const [product_id, field] = rest.slice('edit:'.length).split(':');
        if (!product_id || !field) return;
        await ctx.conversation.enter('edit_product_field', product_id, field as EditField);
        return;
      }
    },
  });
}
