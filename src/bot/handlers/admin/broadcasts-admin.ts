import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { ObjectId } from 'mongodb';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import type { BroadcastDoc } from '@/db/schemas';
import { buildSegmentFilter, SEGMENT_LABELS, type SegmentKey } from '@/domain/broadcasts/segments';
import { countAudience } from '@/domain/broadcasts/ticker';
import { bold, code, escapeHtml, italic } from '@/lib/html';
import { logger } from '@/lib/logger';
import { registerAdminAction } from './router';

type Conv = Parameters<Parameters<typeof createConversation<BotContext, BotContext>>[0]>[0];

const SEG_KEYS: SegmentKey[] = [
  'all',
  'first_job',
  'growing',
  'has_purchased',
  'no_purchases',
  'active_7d',
  'admins',
];

function statusEmoji(s: BroadcastDoc['status']): string {
  return s === 'running'
    ? '▶️'
    : s === 'paused'
      ? '⏸'
      : s === 'done'
        ? '✅'
        : s === 'cancelled'
          ? '🚫'
          : '📝';
}

async function listBroadcasts(ctx: BotContext): Promise<void> {
  const docs = await getCollections()
    .broadcasts.find()
    .sort({ created_at: -1 })
    .limit(20)
    .toArray();
  const kb = new InlineKeyboard();
  kb.text('📣 Створити нову', 'a:broadcasts:new').row();
  for (const b of docs) {
    const seg = (b.segment_filter.segment as string | undefined) ?? '—';
    const progress = `${b.sent_count}/${b.total_target}`;
    kb.text(
      `${statusEmoji(b.status)} ${seg} · ${progress}`,
      `a:broadcasts:b:${String(b._id)}`,
    ).row();
  }
  kb.text('⬅️ Адмін-меню', 'a:home');
  const text = `📣 <b>Розсилки (${docs.length})</b>`;
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function showBroadcast(ctx: BotContext, idStr: string): Promise<void> {
  if (!ObjectId.isValid(idStr)) return;
  const b = await getCollections().broadcasts.findOne({ _id: new ObjectId(idStr) });
  if (!b) {
    await ctx.reply('Розсилку не знайдено.');
    return;
  }
  const seg = (b.segment_filter.segment as SegmentKey | undefined) ?? 'all';
  const segLabel = SEGMENT_LABELS[seg] ?? seg;
  const total = b.total_target;
  const pct = total > 0 ? Math.round((b.sent_count / total) * 100) : 0;
  const preview =
    b.source_message.type === 'text'
      ? (b.source_message.text ?? '').slice(0, 100)
      : `${b.source_message.type}${b.source_message.caption ? `: ${b.source_message.caption.slice(0, 80)}` : ''}`;

  const text =
    `📣 <b>Розсилка</b>\n` +
    `Сегмент: ${escapeHtml(segLabel)}\n` +
    `Статус: ${statusEmoji(b.status)} ${escapeHtml(b.status)}\n` +
    `Прогрес: ${b.sent_count}/${total} (${pct}%) · помилок: ${b.failed_count}\n\n` +
    `${italic('Превʼю:')}\n${escapeHtml(preview)}`;

  const kb = new InlineKeyboard();
  if (b.status === 'running') kb.text('⏸ Пауза', `a:broadcasts:pause:${String(b._id)}`).row();
  if (b.status === 'paused') kb.text('▶️ Відновити', `a:broadcasts:resume:${String(b._id)}`).row();
  if (b.status === 'running' || b.status === 'paused') {
    kb.text('🚫 Скасувати', `a:broadcasts:cancel:${String(b._id)}`).row();
  }
  kb.text('🔄 Оновити', `a:broadcasts:b:${String(b._id)}`).row();
  kb.text('⬅️ До списку', 'a:broadcasts');
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function setStatus(
  ctx: BotContext,
  idStr: string,
  status: BroadcastDoc['status'],
): Promise<void> {
  if (!ObjectId.isValid(idStr)) return;
  const _id = new ObjectId(idStr);
  const update: Partial<BroadcastDoc> = { status };
  if (status === 'cancelled') update.finished_at = new Date();
  await getCollections().broadcasts.updateOne({ _id }, { $set: update });
  await getCollections().events.insertOne({
    user_tg_id: ctx.from?.id ?? 0,
    type: 'admin_broadcast_status',
    payload: { broadcast_id: idStr, status },
    at: new Date(),
  });
  await showBroadcast(ctx, idStr);
}

type CapturedMessage = BroadcastDoc['source_message'];

async function captureMessage(
  conversation: Conv,
  ctx: BotContext,
): Promise<CapturedMessage | null> {
  await ctx.reply(
    '📩 Надішли <b>повідомлення</b> для розсилки (текст, фото, відео, voice або документ).\n<i>Або /cancel.</i>',
    { parse_mode: 'HTML' },
  );
  const got = await conversation.wait();
  const m = got.message;
  if (!m) return null;
  if (m.text === '/cancel') return null;

  if (m.text) {
    return { type: 'text', text: m.text };
  }
  if (m.photo && m.photo.length > 0) {
    const largest = m.photo[m.photo.length - 1];
    return { type: 'photo', file_id: largest?.file_id, caption: m.caption };
  }
  if (m.video) {
    return { type: 'video', file_id: m.video.file_id, caption: m.caption };
  }
  if (m.voice) {
    return { type: 'voice', file_id: m.voice.file_id, caption: m.caption };
  }
  if (m.document) {
    return { type: 'document', file_id: m.document.file_id, caption: m.caption };
  }
  await ctx.reply('Цей тип повідомлення не підтримується.');
  return null;
}

async function pickSegment(conversation: Conv, ctx: BotContext): Promise<SegmentKey | null> {
  const kb = new InlineKeyboard();
  for (const s of SEG_KEYS) kb.text(SEGMENT_LABELS[s], `seg:${s}`).row();
  kb.text('🚫 Скасувати', 'seg:__cancel__');

  await ctx.reply('👥 Обери сегмент:', { reply_markup: kb });
  const got = await conversation.waitFor('callback_query:data');
  await got.answerCallbackQuery().catch(() => undefined);
  const raw = got.callbackQuery.data;
  if (!raw.startsWith('seg:')) return null;
  const choice = raw.slice('seg:'.length);
  if (choice === '__cancel__') return null;
  if (!SEG_KEYS.includes(choice as SegmentKey)) return null;
  return choice as SegmentKey;
}

async function confirmAndCreate(
  conversation: Conv,
  ctx: BotContext,
  source: CapturedMessage,
  seg: SegmentKey,
): Promise<void> {
  const total = await conversation.external(() => countAudience(seg));
  if (total === 0) {
    await ctx.reply(
      `Для сегмента ${escapeHtml(SEGMENT_LABELS[seg])} немає одержувачів. Скасовано.`,
      { parse_mode: 'HTML' },
    );
    return;
  }

  const preview =
    source.type === 'text'
      ? (source.text ?? '').slice(0, 200)
      : `${source.type}${source.caption ? `: ${source.caption.slice(0, 160)}` : ''}`;

  const kb = new InlineKeyboard()
    .text('✅ Так, відправити', 'b_confirm:yes')
    .text('🚫 Ні', 'b_confirm:no');
  await ctx.reply(
    `${bold('Підтверди розсилку:')}\n` +
      `Сегмент: ${escapeHtml(SEGMENT_LABELS[seg])}\n` +
      `Отримають: ${total} осіб\n\n` +
      `${italic('Превʼю:')}\n${escapeHtml(preview)}`,
    { reply_markup: kb, parse_mode: 'HTML' },
  );
  const got = await conversation.waitFor('callback_query:data');
  await got.answerCallbackQuery().catch(() => undefined);
  if (got.callbackQuery.data !== 'b_confirm:yes') {
    await ctx.reply('Скасовано.');
    return;
  }

  const doc: BroadcastDoc = {
    segment_filter: { segment: seg, ...buildSegmentFilter(seg) },
    source_message: source,
    status: 'running',
    total_target: total,
    sent_count: 0,
    failed_count: 0,
    created_by_tg_id: ctx.from?.id ?? 0,
    created_at: new Date(),
  };
  const inserted = await conversation.external(async () => {
    const r = await getCollections().broadcasts.insertOne(doc);
    await getCollections().events.insertOne({
      user_tg_id: ctx.from?.id ?? 0,
      type: 'admin_broadcast_create',
      payload: { broadcast_id: String(r.insertedId), segment: seg, total },
      at: new Date(),
    });
    return String(r.insertedId);
  });
  await ctx.reply(`📣 Запущено. ID: ${code(inserted)}. Тиснь «Розсилки» щоб бачити прогрес.`, {
    parse_mode: 'HTML',
  });
}

async function newBroadcastFlow(conversation: Conv, ctx: BotContext): Promise<void> {
  const source = await captureMessage(conversation, ctx);
  if (!source) {
    await ctx.reply('Скасовано.');
    return;
  }
  const seg = await pickSegment(conversation, ctx);
  if (!seg) {
    await ctx.reply('Скасовано.');
    return;
  }
  await confirmAndCreate(conversation, ctx, source, seg);
}

export const newBroadcastConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext): Promise<void> => {
    try {
      await newBroadcastFlow(conversation, ctx);
    } catch (err) {
      logger().error({ err }, 'new broadcast conversation failed');
      await ctx.reply('Помилка під час створення розсилки.');
    }
  },
  'new_broadcast',
);

export function registerBroadcastsActions(): void {
  registerAdminAction({
    prefix: 'a:broadcasts',
    perm: 'broadcast',
    run: async (ctx, rest) => {
      if (rest === '') {
        await listBroadcasts(ctx);
        return;
      }
      if (rest === 'new') {
        await ctx.conversation.enter('new_broadcast');
        return;
      }
      if (rest.startsWith('b:')) {
        await showBroadcast(ctx, rest.slice('b:'.length));
        return;
      }
      if (rest.startsWith('pause:')) {
        await setStatus(ctx, rest.slice('pause:'.length), 'paused');
        return;
      }
      if (rest.startsWith('resume:')) {
        await setStatus(ctx, rest.slice('resume:'.length), 'running');
        return;
      }
      if (rest.startsWith('cancel:')) {
        await setStatus(ctx, rest.slice('cancel:'.length), 'cancelled');
        return;
      }
    },
  });
}
