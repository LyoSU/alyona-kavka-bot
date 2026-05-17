import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { bold, code, escapeHtml } from '@/lib/html';
import { logger } from '@/lib/logger';
import { waitOrCancel } from './_conv-wait';
import { registerAdminAction } from './router';

type Conv = Parameters<Parameters<typeof createConversation<BotContext, BotContext>>[0]>[0];

async function listLessons(ctx: BotContext): Promise<void> {
  const { lessons } = getCollections();
  const docs = await lessons
    .find({}, { projection: { lesson_id: 1, title: 1, product_ids: 1, video_file_id: 1 } })
    .sort({ uploaded_at: -1 })
    .toArray();

  const kb = new InlineKeyboard();
  kb.text('➕ Завантажити новий урок', 'a:lessons:upload').row();
  for (const l of docs.slice(0, 30)) {
    const pendingMark = l.video_file_id === 'PENDING_UPLOAD' ? '⚠️ ' : '✅ ';
    kb.text(`${pendingMark}${l.title}`, `a:lessons:l:${l.lesson_id}`).row();
  }
  kb.text('⬅️ Адмін-меню', 'a:home');
  const text = `🎬 <b>Уроки (${docs.length})</b>\n\n` + '⚠️ — без відео; ✅ — готовий до доставки';
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function showLesson(ctx: BotContext, lesson_id: string): Promise<void> {
  const c = getCollections();
  const l = await c.lessons.findOne({ lesson_id });
  if (!l) {
    await ctx.reply('Урок не знайдено.');
    return;
  }
  const fileOk = l.video_file_id && l.video_file_id !== 'PENDING_UPLOAD';
  const prodIds = (l.product_ids as string[]) ?? [];
  const prods = await c.products
    .find({ product_id: { $in: prodIds } }, { projection: { product_id: 1, title: 1 } })
    .toArray();
  const titleMap = new Map(prods.map((p) => [p.product_id as string, p.title as string]));
  const productList = prodIds.length
    ? prodIds.map((id) => escapeHtml(titleMap.get(id) ?? id)).join(', ')
    : '<i>не привʼязано</i>';
  const text =
    `🎬 ${bold(l.title)}\n` +
    `Входить у курс: ${productList}\n` +
    `Відео: ${fileOk ? '✅ завантажено' : '⚠️ відсутнє'}\n\n` +
    `<i>службовий ID:</i> ${code(lesson_id)}`;
  const kb = new InlineKeyboard()
    .text('⬆️ Замінити відео', `a:lessons:replace:${lesson_id}`)
    .row()
    .text('⬅️ Назад', 'a:lessons');
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40) || `lesson_${Date.now()}`
  );
}

async function pickProductInline(
  conversation: Conv,
  ctx: BotContext,
): Promise<{ product_id: string; title: string } | null> {
  const { products } = getCollections();
  const all = await conversation.external(() =>
    products.find({ type: 'digital' }, { projection: { product_id: 1, title: 1 } }).toArray(),
  );
  if (all.length === 0) {
    await ctx.reply('Немає цифрових продуктів — створи їх спершу в розділі 🛒 Продукти.');
    return null;
  }
  const kb = new InlineKeyboard();
  for (const p of all) {
    kb.text(p.title as string, `pickprod:${p.product_id}`).row();
  }
  kb.text('🚫 Скасувати', 'pickprod:__cancel__');
  await ctx.reply('🛒 До якого курсу/уроку привʼязати це відео?', { reply_markup: kb });
  const got = await conversation.waitFor('callback_query:data');
  await got.answerCallbackQuery().catch(() => undefined);
  const data = got.callbackQuery.data;
  if (!data.startsWith('pickprod:')) return null;
  const picked = data.slice('pickprod:'.length);
  if (picked === '__cancel__') return null;
  const p = all.find((x) => x.product_id === picked);
  return p ? { product_id: p.product_id as string, title: p.title as string } : null;
}

async function uploadLessonFlow(
  conversation: Conv,
  ctx: BotContext,
  mode: { kind: 'replace'; lesson_id: string } | { kind: 'new'; preset_product_id?: string },
): Promise<void> {
  const { lessons, products, events } = getCollections();

  await ctx.reply('🎥 Надішли відео-файл (mp4) для уроку.\n<i>Або /cancel щоб вийти.</i>', {
    parse_mode: 'HTML',
  });
  const videoMsg = await conversation.wait();
  const txt = videoMsg.message?.text;
  if (txt === '/cancel') {
    await ctx.reply('Скасовано.');
    return;
  }
  const v = videoMsg.message?.video;
  if (!v) {
    await ctx.reply('Не отримав відео. Завантаж саме як Video (mp4), а не як файл-документ.');
    return;
  }
  const fileId = v.file_id;
  const duration = v.duration;
  const size = v.file_size;

  if (mode.kind === 'replace') {
    await conversation.external(async () => {
      await lessons.updateOne(
        { lesson_id: mode.lesson_id },
        {
          $set: {
            video_file_id: fileId,
            duration_sec: duration,
            size_bytes: size,
            uploaded_at: new Date(),
            uploaded_by_tg_id: ctx.from?.id,
          },
        },
      );
      await events.insertOne({
        user_tg_id: ctx.from?.id ?? 0,
        type: 'admin_lesson_replace',
        payload: { lesson_id: mode.lesson_id },
        at: new Date(),
      });
    });
    await ctx.reply('✅ Відео уроку оновлено.', { parse_mode: 'HTML' });
    return;
  }

  await ctx.reply('📝 Як назвати цей урок? (видно юзеру)');
  const titleMsg = await waitOrCancel(conversation, ctx);
  if (!titleMsg) return;
  const title = titleMsg.message?.text?.trim();
  if (!title) {
    await ctx.reply('Очікую текст. Надішли назву уроку або /cancel.');
    return;
  }

  // Авто-генерую lesson_id зі slug-у назви; якщо колізія — додаю timestamp.
  let lesson_id = slugify(title);
  const collision = await conversation.external(() => lessons.findOne({ lesson_id }));
  if (collision) lesson_id = `${lesson_id}_${Date.now().toString(36)}`;

  // Продукт: з preset (з картки продукту) або через інлайн-вибір
  let product: { product_id: string; title: string } | null = null;
  if (mode.preset_product_id) {
    const p = await conversation.external(() =>
      products.findOne({ product_id: mode.preset_product_id }),
    );
    if (!p) {
      await ctx.reply('Продукт зник. Скасовано.');
      return;
    }
    product = { product_id: p.product_id as string, title: p.title as string };
  } else {
    product = await pickProductInline(conversation, ctx);
    if (!product) {
      await ctx.reply('Скасовано.');
      return;
    }
  }
  const product_id = product.product_id;

  // Автоматичний наступний порядковий номер
  const order = await conversation.external(async () => {
    const existing = await products.findOne({ product_id });
    const lessonIds = (existing?.lessons as string[] | undefined) ?? [];
    if (lessonIds.length === 0) return 1;
    const docs = await lessons
      .find(
        { lesson_id: { $in: lessonIds } },
        { projection: { lesson_id: 1, order_in_product: 1 } },
      )
      .toArray();
    let max = 0;
    for (const d of docs) {
      const o = (d.order_in_product as Record<string, number> | undefined)?.[product_id] ?? 0;
      if (o > max) max = o;
    }
    return max + 1;
  });

  await conversation.external(async () => {
    await lessons.insertOne({
      lesson_id,
      product_ids: [product_id],
      title,
      video_file_id: fileId,
      duration_sec: duration,
      size_bytes: size,
      order_in_product: { [product_id]: order },
      uploaded_at: new Date(),
      uploaded_by_tg_id: ctx.from?.id ?? 0,
    });
    await products.updateOne({ product_id }, { $addToSet: { lessons: lesson_id } });
    await events.insertOne({
      user_tg_id: ctx.from?.id ?? 0,
      type: 'admin_lesson_create',
      payload: { lesson_id, product_id, order },
      at: new Date(),
    });
  });

  await ctx.reply(
    `✅ Урок «${escapeHtml(title)}» додано до курсу «${escapeHtml(product.title)}» (порядок ${order}).`,
    { parse_mode: 'HTML' },
  );
}

// mode: 'new' (free), 'new:<product_id>' (pre-bind), 'replace:<lesson_id>'
export const uploadLessonConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext, ...args: unknown[]): Promise<void> => {
    const arg = (args[0] as string | undefined) ?? 'new';
    let mode: Parameters<typeof uploadLessonFlow>[2];
    if (arg.startsWith('replace:')) {
      mode = { kind: 'replace', lesson_id: arg.slice('replace:'.length) };
    } else if (arg.startsWith('new:')) {
      mode = { kind: 'new', preset_product_id: arg.slice('new:'.length) };
    } else {
      mode = { kind: 'new' };
    }
    try {
      await uploadLessonFlow(conversation, ctx, mode);
    } catch (err) {
      logger().error({ err }, 'upload lesson conversation failed');
      await ctx.reply('Помилка під час завантаження уроку.');
    }
  },
  'upload_lesson',
);

export function registerLessonsActions(): void {
  registerAdminAction({
    prefix: 'a:lessons',
    perm: 'edit_content',
    run: async (ctx, rest) => {
      if (rest === '') {
        await listLessons(ctx);
        return;
      }
      if (rest === 'upload') {
        await ctx.conversation.enter('upload_lesson', 'new');
        return;
      }
      if (rest.startsWith('replace:')) {
        const id = rest.slice('replace:'.length);
        await ctx.conversation.enter('upload_lesson', `replace:${id}`);
        return;
      }
      if (rest.startsWith('l:')) {
        const id = rest.slice('l:'.length);
        await showLesson(ctx, id);
        return;
      }
    },
  });
}
