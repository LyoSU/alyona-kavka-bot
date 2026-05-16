import type { Api } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { logger } from '@/lib/logger';
import type { Chunk } from './types';

const PLACEHOLDER_FILE_ID = 'PENDING_UPLOAD';

type SendOpts = {
  sleep?: (ms: number) => Promise<void>;
  lastReplyMarkup?: InlineKeyboardMarkup;
  // Cancellation gate: called before each chunk; if true is returned, sender bails out.
  shouldAbort?: () => boolean;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function sendChunks(
  api: Api,
  chatId: number,
  chunks: Chunk[],
  opts: SendOpts = {},
): Promise<void> {
  const sleep = opts.sleep ?? defaultSleep;
  const aborted = () => Boolean(opts.shouldAbort?.());
  for (let i = 0; i < chunks.length; i++) {
    if (aborted()) return;
    const chunk = chunks[i];
    if (!chunk) continue;

    if (chunk.delay_before_ms > 0) {
      if (chunk.type === 'text' || chunk.type === 'photo') {
        await api.sendChatAction(chatId, 'typing');
      } else if (chunk.type === 'video_note') {
        await api.sendChatAction(chatId, 'upload_video_note');
      }
      await sleep(chunk.delay_before_ms);
    }
    if (aborted()) return;

    if (chunk.type === 'typing_pause') continue;

    const isLast = i === chunks.length - 1;
    const markup = isLast && opts.lastReplyMarkup ? { reply_markup: opts.lastReplyMarkup } : {};

    if (chunk.type === 'text') {
      await api.sendMessage(chatId, chunk.content, markup);
    } else if (chunk.type === 'photo') {
      if (chunk.file_id === PLACEHOLDER_FILE_ID) {
        logger().warn({ chatId }, 'sender: skipping photo chunk with PENDING_UPLOAD');
        if (isLast && opts.lastReplyMarkup) {
          await api.sendMessage(chatId, '​', { reply_markup: opts.lastReplyMarkup });
        }
      } else {
        await api.sendPhoto(chatId, chunk.file_id, {
          ...(chunk.caption ? { caption: chunk.caption } : {}),
          ...markup,
        });
      }
    } else if (chunk.type === 'video_note') {
      if (chunk.file_id === PLACEHOLDER_FILE_ID) {
        logger().warn({ chatId }, 'sender: skipping video_note chunk with PENDING_UPLOAD');
        if (isLast && opts.lastReplyMarkup) {
          await api.sendMessage(chatId, '​', { reply_markup: opts.lastReplyMarkup });
        }
      } else {
        await api.sendVideoNote(chatId, chunk.file_id);
        if (isLast && opts.lastReplyMarkup) {
          await api.sendMessage(chatId, '​', { reply_markup: opts.lastReplyMarkup });
        }
      }
    }
  }
}
