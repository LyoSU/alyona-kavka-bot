import { InlineKeyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { listLessonsForProduct } from '@/domain/lessons/repo';
import { getProduct } from '@/domain/products/repo';
import { logger } from '@/lib/logger';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';

export async function handleMyLessons(ctx: BotContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const purchases = await getCollections()
    .purchases.find({ user_tg_id: tgId, status: 'delivered' })
    .toArray();
  const productIds = [...new Set(purchases.map((p) => p.product_id as string))];

  const products = (await Promise.all(productIds.map((id) => getProduct(id)))).filter(
    (p): p is NonNullable<typeof p> => p !== null && p.type === 'digital',
  );

  if (products.length === 0) {
    await ctx.reply(SYSTEM_MESSAGES.lessons_empty, {
      reply_markup: new InlineKeyboard().text('🎯 Подивитись продукти', 'f:segment_pick'),
    });
    return;
  }

  const kb = new InlineKeyboard();
  for (const p of products) {
    kb.text(`📚 ${p.title}`, `lib:${p.product_id}`).row();
  }
  await ctx.reply(SYSTEM_MESSAGES.lessons_list_title, { reply_markup: kb });
}

export async function handleLessonsProduct(ctx: BotContext, product_id: string): Promise<void> {
  const product = await getProduct(product_id);
  if (!product) {
    await ctx.reply('Продукт не знайдено 🤔');
    return;
  }
  const lessons = await listLessonsForProduct(product_id);
  if (lessons.length === 0) {
    await ctx.reply('Уроків ще немає 🤔');
    return;
  }
  const kb = new InlineKeyboard();
  for (const l of lessons) {
    kb.text(`▶️ ${l.title}`, `play:${l.lesson_id}`).row();
  }
  kb.text('👈 Назад', 'lib:back');
  await ctx.reply(`📚 ${product.title}`, { reply_markup: kb });
}

export async function handleLessonPlay(ctx: BotContext, lesson_id: string): Promise<void> {
  if (!ctx.chat) return;
  const tgId = ctx.from?.id;
  if (!tgId) return;

  const lesson = await getCollections().lessons.findOne({ lesson_id });
  if (!lesson) {
    await ctx.reply('Урок не знайдено 🤔');
    return;
  }

  // Authorization: user must have a delivered purchase of any product that contains this lesson
  const userPurchases = await getCollections()
    .purchases.find({ user_tg_id: tgId, status: 'delivered' })
    .toArray();
  const ownedProductIds = new Set(userPurchases.map((p) => p.product_id as string));
  const lessonAvailable = (lesson.product_ids as string[]).some((pid) => ownedProductIds.has(pid));
  if (!lessonAvailable) {
    await ctx.reply('Цей урок доступний після покупки 🔒');
    return;
  }

  const fileId = lesson.video_file_id as string | undefined;
  if (!fileId || fileId === 'PENDING_UPLOAD') {
    logger().warn({ lesson_id }, 'lesson play: video not yet uploaded');
    await ctx.reply(
      'Цей урок ще готується 🛠 Альона завантажить відео найближчим часом — повернись пізніше.',
    );
    return;
  }

  try {
    await ctx.api.sendVideo(ctx.chat.id, fileId, {
      caption: lesson.caption as string | undefined,
      protect_content: true,
    });
  } catch (err) {
    logger().error({ err, lesson_id }, 'lesson play failed');
    await ctx.reply('Не вдалося відкрити урок 😔 Спробуй пізніше або напиши в підтримку.');
  }
}
