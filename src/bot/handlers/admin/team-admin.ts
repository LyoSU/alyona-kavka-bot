import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard, Keyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import type { Permissions, UserDoc } from '@/db/schemas';
import { NO_PERMISSIONS } from '@/domain/users/repo';
import { bold, code, escapeHtml } from '@/lib/html';
import { logger } from '@/lib/logger';
import { registerAdminAction } from './router';

type Conv = Parameters<Parameters<typeof createConversation<BotContext, BotContext>>[0]>[0];

const PERM_LABELS: Record<keyof Permissions, string> = {
  manage_admins: '👥 Команда',
  edit_content: '📝 Контент',
  manage_products: '🛒 Продукти',
  broadcast: '📣 Розсилки',
  view_stats: '📊 Статистика',
  support: '💬 Підтримка',
  manage_settings: '⚙️ Налаштування',
  refund: '↩️ Повернення',
};

const PERM_KEYS = Object.keys(PERM_LABELS) as Array<keyof Permissions>;
const REQUEST_USERS_ID = 7711;

async function listAdmins(ctx: BotContext): Promise<void> {
  const admins = await getCollections().users.find({ is_admin: true }).toArray();
  const kb = new InlineKeyboard();
  for (const a of admins) {
    const name = `${a.first_name}${a.last_name ? ` ${a.last_name}` : ''}`;
    kb.text(`👤 ${name}`, `a:team:u:${a.tg_id}`).row();
  }
  kb.text('➕ Додати адміна', 'a:team:add').row();
  kb.text('⬅️ Адмін-меню', 'a:home');
  const text = `👥 <b>Команда (${admins.length})</b>\n\nНатисни на адміна щоб переглянути/змінити права.`;
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

function permsKeyboard(target: UserDoc): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const key of PERM_KEYS) {
    const on = target.permissions[key];
    kb.text(`${on ? '✅' : '⬜'} ${PERM_LABELS[key]}`, `a:team:t:${target.tg_id}:${key}`).row();
  }
  kb.text('🗑 Прибрати з команди', `a:team:rm:${target.tg_id}`).row();
  kb.text('⬅️ До команди', 'a:team');
  return kb;
}

async function showAdmin(ctx: BotContext, target_tg_id: number): Promise<void> {
  const u = await getCollections().users.findOne({ tg_id: target_tg_id });
  if (!u) {
    await ctx.reply('Користувача не знайдено.');
    return;
  }
  const name = `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`;
  const uname = u.username ? `@${u.username}` : '';
  const text = `👤 ${bold(name)} ${escapeHtml(uname)}\nID: ${code(u.tg_id)}\n\nДозволи:`;
  const kb = permsKeyboard(u);
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function togglePerm(
  ctx: BotContext,
  target_tg_id: number,
  perm: keyof Permissions,
  ownerIds: number[],
): Promise<void> {
  const { users, events } = getCollections();
  const u = await users.findOne({ tg_id: target_tg_id });
  if (!u) return;

  if (ownerIds.includes(target_tg_id) && perm === 'manage_admins') {
    await ctx.answerCallbackQuery({
      text: 'Овнер не може втратити «Команда».',
      show_alert: true,
    });
    return;
  }

  const newValue = !u.permissions[perm];
  await users.updateOne({ tg_id: target_tg_id }, { $set: { [`permissions.${perm}`]: newValue } });
  await events.insertOne({
    user_tg_id: ctx.from?.id ?? 0,
    type: 'admin_perm_toggle',
    payload: { target_tg_id, perm, value: newValue },
    at: new Date(),
  });
  await showAdmin(ctx, target_tg_id);
}

async function removeAdmin(
  ctx: BotContext,
  target_tg_id: number,
  ownerIds: number[],
): Promise<void> {
  if (ownerIds.includes(target_tg_id)) {
    await ctx.answerCallbackQuery({ text: 'Овнера не можна прибрати.', show_alert: true });
    return;
  }
  const { users, events } = getCollections();
  await users.updateOne(
    { tg_id: target_tg_id },
    { $set: { is_admin: false, permissions: NO_PERMISSIONS } },
  );
  await events.insertOne({
    user_tg_id: ctx.from?.id ?? 0,
    type: 'admin_remove',
    payload: { target_tg_id },
    at: new Date(),
  });
  await ctx.reply('🗑 Адміна знято з команди.');
  await listAdmins(ctx);
}

async function addAdminFlow(conversation: Conv, ctx: BotContext): Promise<void> {
  const kb = new Keyboard()
    .requestUsers('👤 Обрати користувача', REQUEST_USERS_ID, { max_quantity: 1 })
    .resized()
    .oneTime();
  await ctx.reply(
    '👥 Тапни кнопку нижче й обери користувача, якого хочеш зробити адміном.\n<i>Або напиши /cancel.</i>',
    { reply_markup: kb, parse_mode: 'HTML' },
  );

  const got = await conversation.wait();
  if (got.message?.text === '/cancel') {
    await ctx.reply('Скасовано.', { reply_markup: { remove_keyboard: true } });
    return;
  }
  const shared = got.message?.users_shared;
  if (!shared || shared.request_id !== REQUEST_USERS_ID || shared.users.length === 0) {
    await ctx.reply('Користувача не передано. Скасовано.', {
      reply_markup: { remove_keyboard: true },
    });
    return;
  }
  const chosen = shared.users[0];
  if (!chosen) {
    await ctx.reply('Скасовано.', { reply_markup: { remove_keyboard: true } });
    return;
  }
  const target_tg_id = chosen.user_id;

  const defaults: Permissions = {
    ...NO_PERMISSIONS,
    support: true,
  };

  await conversation.external(async () => {
    const { users, events } = getCollections();
    const existing = await users.findOne({ tg_id: target_tg_id });
    if (existing) {
      await users.updateOne(
        { tg_id: target_tg_id },
        { $set: { is_admin: true, permissions: defaults } },
      );
    } else {
      await users.insertOne({
        tg_id: target_tg_id,
        first_name: chosen.first_name ?? `User ${target_tg_id}`,
        last_name: chosen.last_name,
        username: chosen.username,
        language_code: 'uk',
        funnel_paused: false,
        blocked: false,
        is_admin: true,
        permissions: defaults,
        created_at: new Date(),
        last_seen_at: new Date(),
        purchases_count: 0,
        total_spent_uah: 0,
      });
    }
    await events.insertOne({
      user_tg_id: ctx.from?.id ?? 0,
      type: 'admin_add',
      payload: { target_tg_id, defaults },
      at: new Date(),
    });
  });

  await ctx.reply(
    `✅ Додано адміна (ID ${code(target_tg_id)}) з дозволом «Підтримка».\nНалаштуй інші дозволи в розділі 👥 Команда.`,
    { reply_markup: { remove_keyboard: true }, parse_mode: 'HTML' },
  );
}

export const addAdminConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext): Promise<void> => {
    try {
      await addAdminFlow(conversation, ctx);
    } catch (err) {
      logger().error({ err }, 'add admin conversation failed');
      await ctx.reply('Помилка під час додавання адміна.', {
        reply_markup: { remove_keyboard: true },
      });
    }
  },
  'add_admin',
);

export function registerTeamActions(): void {
  registerAdminAction({
    prefix: 'a:team',
    perm: 'manage_admins',
    run: async (ctx, rest) => {
      const ownerIdsRaw = process.env.OWNER_TG_IDS ?? '';
      const ownerIds = ownerIdsRaw
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));

      if (rest === '') {
        await listAdmins(ctx);
        return;
      }
      if (rest === 'add') {
        await ctx.conversation.enter('add_admin');
        return;
      }
      if (rest.startsWith('u:')) {
        const id = Number(rest.slice('u:'.length));
        if (Number.isFinite(id)) await showAdmin(ctx, id);
        return;
      }
      if (rest.startsWith('t:')) {
        const [idStr, perm] = rest.slice('t:'.length).split(':');
        const id = Number(idStr);
        if (Number.isFinite(id) && perm && (PERM_KEYS as string[]).includes(perm)) {
          await togglePerm(ctx, id, perm as keyof Permissions, ownerIds);
        }
        return;
      }
      if (rest.startsWith('rm:')) {
        const id = Number(rest.slice('rm:'.length));
        if (Number.isFinite(id)) await removeAdmin(ctx, id, ownerIds);
        return;
      }
    },
  });
}
