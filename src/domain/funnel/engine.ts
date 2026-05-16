import type { Api } from 'grammy';
import { buildKeyboard } from './keyboards';
import { isLatestRenderToken, newRenderToken } from './render-token';
import { getNode } from './repo';
import { sendChunks } from './sender';

// `chatId` is the destination chat. For private chats it equals the user's tg_id,
// so we use it for the render-token map. If the bot ever renders nodes outside
// private chats, pass an explicit user_tg_id.
export async function renderNode(
  api: Api,
  chatId: number,
  node_id: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const node = await getNode(node_id);
  if (!node) return { ok: false, reason: 'not_found' };

  const token = newRenderToken(chatId);
  const shouldAbort = () => !isLatestRenderToken(chatId, token);

  const kb = buildKeyboard(node.buttons);
  await sendChunks(
    api,
    chatId,
    node.chunks,
    kb ? { lastReplyMarkup: kb, shouldAbort } : { shouldAbort },
  );
  return { ok: true };
}
