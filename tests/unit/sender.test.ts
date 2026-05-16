import type { Api } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { sendChunks } from '@/domain/funnel/sender';
import type { Chunk } from '@/domain/funnel/types';

function fakeApi() {
  return {
    sendChatAction: vi.fn(async () => ({ ok: true }) as never),
    sendMessage: vi.fn(async () => ({ message_id: 1 }) as never),
    sendPhoto: vi.fn(async () => ({ message_id: 1 }) as never),
    sendVideoNote: vi.fn(async () => ({ message_id: 1 }) as never),
  } as unknown as Api & {
    sendChatAction: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    sendPhoto: ReturnType<typeof vi.fn>;
    sendVideoNote: ReturnType<typeof vi.fn>;
  };
}

describe('sendChunks', () => {
  it('emits typing then sends text in order', async () => {
    const api = fakeApi();
    const sleep = vi.fn(async () => undefined);
    const chunks: Chunk[] = [
      { type: 'text', content: 'hello', delay_before_ms: 100 },
      { type: 'text', content: 'world', delay_before_ms: 200 },
    ];
    await sendChunks(api, 42, chunks, { sleep });
    expect(api.sendChatAction).toHaveBeenCalledTimes(2);
    expect(api.sendMessage).toHaveBeenCalledTimes(2);
    expect(api.sendMessage).toHaveBeenNthCalledWith(1, 42, 'hello', {});
    expect(sleep).toHaveBeenCalledWith(100);
    expect(sleep).toHaveBeenCalledWith(200);
  });

  it('attaches reply_markup to last chunk only', async () => {
    const api = fakeApi();
    const sleep = vi.fn(async () => undefined);
    const chunks: Chunk[] = [
      { type: 'text', content: 'one', delay_before_ms: 0 },
      { type: 'text', content: 'two', delay_before_ms: 0 },
    ];
    const markup = { inline_keyboard: [[{ text: 'x', callback_data: 'y' }]] } as never;
    await sendChunks(api, 42, chunks, { sleep, lastReplyMarkup: markup });
    expect(api.sendMessage).toHaveBeenNthCalledWith(1, 42, 'one', {});
    expect(api.sendMessage).toHaveBeenNthCalledWith(2, 42, 'two', { reply_markup: markup });
  });

  it('skips typing for typing_pause chunks', async () => {
    const api = fakeApi();
    const sleep = vi.fn(async () => undefined);
    const chunks: Chunk[] = [
      { type: 'typing_pause', delay_before_ms: 500 },
      { type: 'text', content: 'after pause', delay_before_ms: 100 },
    ];
    await sendChunks(api, 42, chunks, { sleep });
    expect(api.sendChatAction).toHaveBeenCalledTimes(1); // only for the text chunk
    expect(sleep).toHaveBeenCalledWith(500);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('uses upload_video_note action for video_note chunks', async () => {
    const api = fakeApi();
    const sleep = vi.fn(async () => undefined);
    const chunks: Chunk[] = [{ type: 'video_note', file_id: 'BAAC', delay_before_ms: 100 }];
    await sendChunks(api, 42, chunks, { sleep });
    expect(api.sendChatAction).toHaveBeenCalledWith(42, 'upload_video_note');
    expect(api.sendVideoNote).toHaveBeenCalledWith(42, 'BAAC');
  });
});
