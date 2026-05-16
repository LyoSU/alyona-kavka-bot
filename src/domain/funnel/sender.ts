import type { Api } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import type { Chunk } from './types';

type SendOpts = {
  sleep?: (ms: number) => Promise<void>;
  lastReplyMarkup?: InlineKeyboardMarkup;
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
  for (let i = 0; i < chunks.length; i++) {
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

    if (chunk.type === 'typing_pause') continue;

    const isLast = i === chunks.length - 1;
    const markup = isLast && opts.lastReplyMarkup ? { reply_markup: opts.lastReplyMarkup } : {};

    if (chunk.type === 'text') {
      await api.sendMessage(chatId, chunk.content, markup);
    } else if (chunk.type === 'photo') {
      await api.sendPhoto(chatId, chunk.file_id, {
        ...(chunk.caption ? { caption: chunk.caption } : {}),
        ...markup,
      });
    } else if (chunk.type === 'video_note') {
      await api.sendVideoNote(chatId, chunk.file_id);
      if (isLast && opts.lastReplyMarkup) {
        // video_note doesn't support reply_markup directly — attach via empty msg
        await api.sendMessage(chatId, '​', { reply_markup: opts.lastReplyMarkup });
      }
    }
  }
}
