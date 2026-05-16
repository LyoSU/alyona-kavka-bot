import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { bold, code, escapeHtml } from '@/lib/html';
import { logger } from '@/lib/logger';
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
  const l = await getCollections().lessons.findOne({ lesson_id });
  if (!l) {
    await ctx.reply('Урок не знайдено.');
    return;
  }
  const fileOk = l.video_file_id && l.video_file_id !== 'PENDING_UPLOAD';
  const productList = (l.product_ids as string[]).map((id) => code(id)).join(', ');
  const text =
    `🎬 ${bold(l.title)}\n` +
    `ID: ${code(lesson_id)}\n` +
    `Прив’язано до продуктів: ${productList}\n` +
    `Відео: ${fileOk ? '✅ завантажено' : '⚠️ відсутнє'}`;
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

async function uploadLessonFlow(
  conversation: Conv,
  ctx: BotContext,
  replaceLessonId?: string,
): Promise<void> {
  const { lessons, products, events } = getCollections();

  await ctx.reply('⬆️ Надішли відео-файл (mp4) для уроку.\n<i>Або /cancel.</i>', {
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
    await ctx.reply('Не отримав відео. Завантаж саме як Video (mp4), а не як файл.');
    return;
  }
  const fileId = v.file_id;
  const duration = v.duration;
  const size = v.file_size;

  if (replaceLessonId) {
    await conversation.external(async () => {
      await lessons.updateOne(
        { lesson_id: replaceLessonId },
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
        payload: { lesson_id: replaceLessonId },
        at: new Date(),
      });
    });
    await ctx.reply(`✅ Відео для уроку ${code(replaceLessonId)} оновлено.`, {
      parse_mode: 'HTML',
    });
    return;
  }

  await ctx.reply('📝 Назва уроку?');
  const titleMsg = await conversation.waitFor('message:text');
  const title = titleMsg.msg.text.trim();
  if (!title || title === '/cancel') {
    await ctx.reply('Скасовано.');
    return;
  }

  await ctx.reply(
    '🆔 Унікальний <code>lesson_id</code> (англ. малі літери, цифри, підкреслення)?',
    { parse_mode: 'HTML' },
  );
  const idMsg = await conversation.waitFor('message:text');
  const lesson_id = idMsg.msg.text.trim();
  if (!/^[a-z0-9_]+$/.test(lesson_id)) {
    await ctx.reply('Неприпустимий ID. Скасовано.');
    return;
  }
  const exists = await conversation.external(() => lessons.findOne({ lesson_id }));
  if (exists) {
    await ctx.reply(`Урок з ID ${code(lesson_id)} уже існує. Скасовано.`, {
      parse_mode: 'HTML',
    });
    return;
  }

  await ctx.reply(
    `🛒 До якого продукту прив’язати? Надішли ${code('product_id')} (наприклад ${code('lesson_resume')}).`,
    { parse_mode: 'HTML' },
  );
  const prodMsg = await conversation.waitFor('message:text');
  const product_id = prodMsg.msg.text.trim();
  const product = await conversation.external(() => products.findOne({ product_id }));
  if (!product) {
    await ctx.reply(`Продукт ${code(product_id)} не знайдено. Скасовано.`, {
      parse_mode: 'HTML',
    });
    return;
  }

  await ctx.reply('🔢 Порядковий номер уроку в продукті (1, 2, …)?');
  const orderMsg = await conversation.waitFor('message:text');
  const order = Number(orderMsg.msg.text.trim());
  if (!Number.isFinite(order) || order < 1) {
    await ctx.reply('Порядок має бути числом. Скасовано.');
    return;
  }

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
    `✅ Урок ${code(lesson_id)} додано до ${code(product_id)} (порядок ${order}). ${escapeHtml(title)}`,
    { parse_mode: 'HTML' },
  );
}

export const uploadLessonConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext, ...args: unknown[]): Promise<void> => {
    const replaceLessonId = args[0] as string | undefined;
    try {
      await uploadLessonFlow(conversation, ctx, replaceLessonId);
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
        await ctx.conversation.enter('upload_lesson');
        return;
      }
      if (rest.startsWith('replace:')) {
        const id = rest.slice('replace:'.length);
        await ctx.conversation.enter('upload_lesson', id);
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
