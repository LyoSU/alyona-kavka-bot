import type { Api } from 'grammy';
import { buildKeyboard } from './keyboards';
import { getNode } from './repo';
import { sendChunks } from './sender';

export async function renderNode(
  api: Api,
  chatId: number,
  node_id: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const node = await getNode(node_id);
  if (!node) return { ok: false, reason: 'not_found' };
  const kb = buildKeyboard(node.buttons);
  await sendChunks(api, chatId, node.chunks, kb ? { lastReplyMarkup: kb } : {});
  return { ok: true };
}
