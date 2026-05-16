import type { Api } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { logger } from '@/lib/logger';
import type { Chunk } from './types';

const PLACEHOLDER_FILE_ID = 'PENDING_UPLOAD';

// Adaptive "let the user read" pause between chunks.
// Average Ukrainian reader ~ 200 wpm → ~3.3 words/sec → ~300ms per word + min/max clamp.
const MS_PER_WORD = 300;
const MIN_READ_PAUSE_MS = 1800; // even "Привіт!" needs a beat
const MAX_READ_PAUSE_MS = 8000; // long paragraphs cap out
const PHOTO_PAUSE_MS = 4000; // photo → fixed "look at it" time
const VIDEO_NOTE_DEFAULT_MS = 12000; // fallback if chunk has no duration_sec
const VIDEO_NOTE_EXTRA_MS = 4000; // tap-to-watch delay + post-watch beat

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function readPauseFor(chunk: Chunk): number {
  if (chunk.type === 'typing_pause') return 0;
  if (chunk.type === 'text') {
    const ms = wordCount(chunk.content) * MS_PER_WORD;
    return Math.max(MIN_READ_PAUSE_MS, Math.min(MAX_READ_PAUSE_MS, ms));
  }
  if (chunk.type === 'photo') return PHOTO_PAUSE_MS;
  // video_note — based on actual duration if known, plus tap-and-watch buffer.
  const dur = (chunk as { duration_sec?: number }).duration_sec;
  if (typeof dur === 'number' && dur > 0) {
    return dur * 1000 + VIDEO_NOTE_EXTRA_MS;
  }
  return VIDEO_NOTE_DEFAULT_MS;
}

type SendOpts = {
  sleep?: (ms: number) => Promise<void>;
  lastReplyMarkup?: InlineKeyboardMarkup;
  // Cancellation gate: called before each chunk; if true is returned, sender bails out.
  shouldAbort?: () => boolean;
  // Disable adaptive read-pauses (useful in tests).
  noReadPause?: boolean;
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
  let prevChunk: Chunk | null = null;
  for (let i = 0; i < chunks.length; i++) {
    if (aborted()) return;
    const chunk = chunks[i];
    if (!chunk) continue;

    // 1) Adaptive read pause for the PREVIOUS chunk (so user has time to digest it).
    if (prevChunk && !opts.noReadPause) {
      const readMs = readPauseFor(prevChunk);
      if (readMs > 0) await sleep(readMs);
      if (aborted()) return;
    }

    // 2) "Typing…" indicator before the new chunk.
    if (chunk.delay_before_ms > 0) {
      if (chunk.type === 'text' || chunk.type === 'photo') {
        await api.sendChatAction(chatId, 'typing');
      } else if (chunk.type === 'video_note') {
        await api.sendChatAction(chatId, 'upload_video_note');
      }
      await sleep(chunk.delay_before_ms);
    }
    if (aborted()) return;

    if (chunk.type === 'typing_pause') {
      prevChunk = chunk;
      continue;
    }

    const isLast = i === chunks.length - 1;
    const markup = isLast && opts.lastReplyMarkup ? { reply_markup: opts.lastReplyMarkup } : {};

    if (chunk.type === 'text') {
      await api.sendMessage(chatId, chunk.content, { parse_mode: 'HTML', ...markup });
    } else if (chunk.type === 'photo') {
      if (chunk.file_id === PLACEHOLDER_FILE_ID) {
        logger().warn({ chatId }, 'sender: skipping photo chunk with PENDING_UPLOAD');
        if (isLast && opts.lastReplyMarkup) {
          await api.sendMessage(chatId, '​', { reply_markup: opts.lastReplyMarkup });
        }
      } else {
        await api.sendPhoto(chatId, chunk.file_id, {
          ...(chunk.caption ? { caption: chunk.caption, parse_mode: 'HTML' as const } : {}),
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

    prevChunk = chunk;
  }
}
