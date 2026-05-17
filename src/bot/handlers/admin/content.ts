import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { nodeLabel } from '@/domain/funnel/labels';
import { code, escapeHtml, pre } from '@/lib/html';
import { logger } from '@/lib/logger';
import { waitOrCancel } from './_conv-wait';
import { registerAdminAction } from './router';

const PAGE = 10;

type Conv = Parameters<Parameters<typeof createConversation<BotContext, BotContext>>[0]>[0];

function pageKeyboard(nodes: string[], page: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  const slice = nodes.slice(page * PAGE, page * PAGE + PAGE);
  for (const id of slice) kb.text(nodeLabel(id), `a:content:n:${id}`).row();
  const totalPages = Math.ceil(nodes.length / PAGE);
  if (totalPages > 1) {
    if (page > 0) kb.text('◀️', `a:content:page:${page - 1}`);
    kb.text(`${page + 1}/${totalPages}`, 'a:noop');
    if (page < totalPages - 1) kb.text('▶️', `a:content:page:${page + 1}`);
    kb.row();
  }
  kb.text('⬅️ Адмін-меню', 'a:home');
  return kb;
}

async function listNodes(ctx: BotContext, page = 0): Promise<void> {
  const docs = await getCollections()
    .flow_nodes.find({}, { projection: { node_id: 1 } })
    .toArray();
  const ids = docs
    .map((d) => d.node_id as string)
    .sort((a, b) => nodeLabel(a).localeCompare(nodeLabel(b), 'uk'));
  const text = `📝 <b>Контент воронки</b>\nОбери крок (${ids.length}):`;
  const kb = pageKeyboard(ids, page);
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

// Universal navigation actions — their labels are shared across the whole funnel
// and editing them per-node would create inconsistency, so we hide them from the
// admin "edit buttons" list.
const NAV_ACTIONS = new Set(['back', 'home', 'support']);

function nodeKeyboard(node: {
  node_id: string;
  chunks: Array<Record<string, unknown>>;
  buttons: Array<Record<string, unknown>>;
}): InlineKeyboard {
  const kb = new InlineKeyboard();
  node.chunks.forEach((c, idx) => {
    const t = c.type as string;
    const preview = t === 'text' ? String(c.content ?? '').slice(0, 24) : t;
    kb.text(`📄 ${idx + 1}. ${t}: ${preview}`, `a:content:edit:${node.node_id}:${idx}`).row();
  });
  let editableCount = 0;
  node.buttons.forEach((b, idx) => {
    if (NAV_ACTIONS.has(b.action as string)) return;
    editableCount++;
    kb.text(`🔘 ${b.label as string}`, `a:content:btn:${node.node_id}:${idx}`).row();
  });
  if (editableCount === 0 && node.buttons.length > 0) {
    // Nothing editable but nav buttons exist — give admin a hint.
    kb.text('ℹ️ На цій ноді лише навігаційні кнопки', 'a:noop').row();
  }
  kb.text('⬅️ Назад до списку', 'a:content').row();
  return kb;
}

async function showNode(ctx: BotContext, node_id: string): Promise<void> {
  const doc = await getCollections().flow_nodes.findOne({ node_id });
  if (!doc) {
    await ctx.reply(`Ноду «${escapeHtml(node_id)}» не знайдено`, { parse_mode: 'HTML' });
    return;
  }
  const text =
    `🧩 <b>${escapeHtml(nodeLabel(node_id))}</b>\n` + `<i>технічний ID:</i> ${code(node_id)}`;
  const kb = nodeKeyboard(
    doc as unknown as {
      node_id: string;
      chunks: Array<Record<string, unknown>>;
      buttons: Array<Record<string, unknown>>;
    },
  );
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function editChunkConversation(
  conversation: Conv,
  ctx: BotContext,
  node_id: string,
  chunkIdx: number,
): Promise<void> {
  const { flow_nodes } = getCollections();
  const doc = await conversation.external(() => flow_nodes.findOne({ node_id }));
  if (!doc) {
    await ctx.reply('Нода зникла');
    return;
  }
  const chunk = (doc.chunks as Array<Record<string, unknown>>)[chunkIdx];
  if (!chunk) {
    await ctx.reply('Чанк зник');
    return;
  }
  const t = chunk.type as string;
  if (t === 'text') {
    const current = String(chunk.content ?? '');
    await ctx.reply(
      `✏️ Надішли новий <b>текст</b> для чанку #${chunkIdx + 1}:\n\nПоточний:\n${pre(current)}\n\n<i>Або /cancel щоб скасувати.</i>`,
      { parse_mode: 'HTML' },
    );
    const got = await waitOrCancel(conversation, ctx);
    if (!got) return;
    const txt = got.message?.text?.trim();
    if (!txt) {
      await ctx.reply('Очікую текст. Надішли текст або /cancel.');
      return;
    }
    await conversation.external(async () => {
      await flow_nodes.updateOne(
        { node_id },
        {
          $set: {
            [`chunks.${chunkIdx}.content`]: txt,
            updated_at: new Date(),
            updated_by_tg_id: ctx.from?.id,
          },
        },
      );
      await getCollections().events.insertOne({
        user_tg_id: ctx.from?.id ?? 0,
        type: 'admin_edit_node',
        payload: { node_id, chunk_idx: chunkIdx, type: 'text' },
        at: new Date(),
      });
    });
    await ctx.reply(`✅ Збережено. Текст чанку #${chunkIdx + 1} оновлено.`);
  } else if (t === 'photo') {
    await ctx.reply(`🖼 Надішли нове <b>фото</b> для чанку #${chunkIdx + 1}, або /cancel.`, {
      parse_mode: 'HTML',
    });
    const got = await waitOrCancel(conversation, ctx);
    if (!got) return;
    const photos = got.message?.photo;
    const largest = photos?.[photos.length - 1];
    if (!largest) {
      await ctx.reply('Очікую саме фото. Надішли фото або /cancel.');
      return;
    }
    const fileId = largest.file_id;
    await conversation.external(async () => {
      await flow_nodes.updateOne(
        { node_id },
        {
          $set: {
            [`chunks.${chunkIdx}.file_id`]: fileId,
            updated_at: new Date(),
            updated_by_tg_id: ctx.from?.id,
          },
        },
      );
      await getCollections().events.insertOne({
        user_tg_id: ctx.from?.id ?? 0,
        type: 'admin_edit_node',
        payload: { node_id, chunk_idx: chunkIdx, type: 'photo' },
        at: new Date(),
      });
    });
    await ctx.reply('✅ Фото оновлено.');
  } else if (t === 'video_note') {
    await ctx.reply(
      `🎥 Надішли нове <b>відео-кружок</b> для чанку #${chunkIdx + 1}, або /cancel.`,
      { parse_mode: 'HTML' },
    );
    const got = await waitOrCancel(conversation, ctx);
    if (!got) return;
    const vn = got.message?.video_note;
    if (!vn) {
      await ctx.reply('Очікую саме відео-кружок. Надішли video note або /cancel.');
      return;
    }
    const fileId = vn.file_id;
    const durationSec = vn.duration;
    await conversation.external(async () => {
      await flow_nodes.updateOne(
        { node_id },
        {
          $set: {
            [`chunks.${chunkIdx}.file_id`]: fileId,
            [`chunks.${chunkIdx}.duration_sec`]: durationSec,
            updated_at: new Date(),
            updated_by_tg_id: ctx.from?.id,
          },
        },
      );
      await getCollections().events.insertOne({
        user_tg_id: ctx.from?.id ?? 0,
        type: 'admin_edit_node',
        payload: { node_id, chunk_idx: chunkIdx, type: 'video_note' },
        at: new Date(),
      });
    });
    await ctx.reply('✅ Відео-кружок оновлено.');
  } else {
    await ctx.reply(`Тип «${escapeHtml(t)}» не редагується через UI (це службова пауза).`, {
      parse_mode: 'HTML',
    });
  }
}

async function editButtonLabelConversation(
  conversation: Conv,
  ctx: BotContext,
  node_id: string,
  btnIdx: number,
): Promise<void> {
  const { flow_nodes } = getCollections();
  const doc = await conversation.external(() => flow_nodes.findOne({ node_id }));
  if (!doc) {
    await ctx.reply('Нода зникла');
    return;
  }
  const button = (doc.buttons as Array<Record<string, unknown>>)[btnIdx];
  if (!button) {
    await ctx.reply('Кнопка зникла');
    return;
  }
  await ctx.reply(
    `✏️ Надішли новий <b>напис</b> для кнопки:\n\nПоточний: ${code(button.label as string)}\n\n<i>Або /cancel.</i>`,
    { parse_mode: 'HTML' },
  );
  const got = await waitOrCancel(conversation, ctx);
  if (!got) return;
  const txt = got.message?.text?.trim();
  if (!txt) {
    await ctx.reply('Очікую текст. Надішли текст або /cancel.');
    return;
  }
  await conversation.external(async () => {
    await flow_nodes.updateOne(
      { node_id },
      {
        $set: {
          [`buttons.${btnIdx}.label`]: txt,
          updated_at: new Date(),
          updated_by_tg_id: ctx.from?.id,
        },
      },
    );
    await getCollections().events.insertOne({
      user_tg_id: ctx.from?.id ?? 0,
      type: 'admin_edit_button',
      payload: { node_id, btn_idx: btnIdx },
      at: new Date(),
    });
  });
  await ctx.reply('✅ Напис кнопки оновлено.');
}

export const editChunkConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext, ...args: unknown[]): Promise<void> => {
    const node_id = args[0] as string;
    const chunkIdx = args[1] as number;
    try {
      await editChunkConversation(conversation, ctx, node_id, chunkIdx);
    } catch (err) {
      logger().error({ err, node_id, chunkIdx }, 'editChunk failed');
      await ctx.reply('Помилка при редагуванні.');
    }
  },
  'edit_chunk',
);

export const editButtonConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext, ...args: unknown[]): Promise<void> => {
    const node_id = args[0] as string;
    const btnIdx = args[1] as number;
    try {
      await editButtonLabelConversation(conversation, ctx, node_id, btnIdx);
    } catch (err) {
      logger().error({ err, node_id, btnIdx }, 'editButton failed');
      await ctx.reply('Помилка при редагуванні кнопки.');
    }
  },
  'edit_button',
);

export function registerContentActions(): void {
  registerAdminAction({
    prefix: 'a:content',
    perm: 'edit_content',
    run: async (ctx, rest) => {
      if (rest === '' || rest.startsWith('page:')) {
        const page = rest === '' ? 0 : Number(rest.slice('page:'.length));
        await listNodes(ctx, Number.isFinite(page) ? page : 0);
        return;
      }
      if (rest.startsWith('n:')) {
        const node_id = rest.slice('n:'.length);
        await showNode(ctx, node_id);
        return;
      }
      if (rest.startsWith('edit:')) {
        const [node_id, idxStr] = rest.slice('edit:'.length).split(':');
        const idx = Number(idxStr);
        if (!node_id || !Number.isFinite(idx)) return;
        await ctx.conversation.enter('edit_chunk', node_id, idx);
        return;
      }
      if (rest.startsWith('btn:')) {
        const [node_id, idxStr] = rest.slice('btn:'.length).split(':');
        const idx = Number(idxStr);
        if (!node_id || !Number.isFinite(idx)) return;
        await ctx.conversation.enter('edit_button', node_id, idx);
        return;
      }
    },
  });
}
