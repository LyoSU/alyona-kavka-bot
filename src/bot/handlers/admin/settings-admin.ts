import { createConversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { handleInitAdminGroup } from '@/bot/handlers/init-admin-group';
import { loadEnv } from '@/config/env';
import { getCollections } from '@/db/client';
import { getCachedUsdRate } from '@/domain/payments/exchange-rate';
import { code, escapeHtml, italic } from '@/lib/html';
import { logger } from '@/lib/logger';
import { waitOrCancel } from './_conv-wait';
import { registerAdminAction } from './router';

type Conv = Parameters<Parameters<typeof createConversation<BotContext, BotContext>>[0]>[0];

type SettingKey =
  | 'exchange_rate_manual_override'
  | 'privacy_policy_url'
  | 'professions_channel_url';

const PROMPTS: Record<SettingKey, string> = {
  exchange_rate_manual_override:
    '💱 Введи курс USD→UAH числом (наприклад <code>42.5</code>). Надішли <code>auto</code> щоб повернути автоматичне оновлення з НБУ.',
  privacy_policy_url: '🔒 Введи URL політики приватності (https://…).',
  professions_channel_url: '📚 Введи URL каналу про професії (https://…).',
};

async function showSettings(ctx: BotContext): Promise<void> {
  const s = await getCollections().settings.findOne({ _id: 'singleton' });
  let rateLine: string;
  try {
    const rate = await getCachedUsdRate(loadEnv().NBU_API_URL);
    rateLine = `${rate.toFixed(2)} UAH/USD`;
    if (s?.exchange_rate_manual_override) {
      rateLine += ` ${italic('(ручний override)')}`;
    } else if (s?.exchange_rate_updated_at) {
      const ago = Math.round(
        (Date.now() - new Date(s.exchange_rate_updated_at).getTime()) / 1000 / 60,
      );
      rateLine += ` ${italic(`(НБУ, ${ago} хв тому)`)}`;
    }
  } catch {
    rateLine = italic('не вдалося отримати курс');
  }

  const adminGroup = s?.admin_group_chat_id
    ? code(s.admin_group_chat_id)
    : italic('не налаштовано');
  const privacy = s?.privacy_policy_url ? escapeHtml(s.privacy_policy_url) : italic('не задано');
  const profCh = s?.professions_channel_url
    ? escapeHtml(s.professions_channel_url)
    : italic('не задано');

  const text =
    '⚙️ <b>Налаштування</b>\n\n' +
    `💱 Курс: ${rateLine}\n` +
    `👥 Адмін-група: ${adminGroup}\n` +
    `🔒 Privacy URL: ${privacy}\n` +
    `📚 Канал професій: ${profCh}`;

  const kb = new InlineKeyboard()
    .text('💱 Змінити курс', 'a:settings:edit:exchange_rate_manual_override')
    .row()
    .text('🔒 Privacy URL', 'a:settings:edit:privacy_policy_url')
    .row()
    .text('📚 Канал професій', 'a:settings:edit:professions_channel_url')
    .row();
  if (s?.admin_group_chat_id) {
    kb.text('🧹 Скинути адмін-групу', 'a:settings:reset_group').row();
  } else {
    kb.text('🔗 Підключити адмін-групу', 'a:settings:link_group').row();
  }
  kb.text('⬅️ Адмін-меню', 'a:home');

  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function setSettingFlow(conversation: Conv, ctx: BotContext, key: SettingKey): Promise<void> {
  const { settings, events } = getCollections();
  await ctx.reply(`${PROMPTS[key]}\n\n<i>Або /cancel.</i>`, { parse_mode: 'HTML' });
  const got = await waitOrCancel(conversation, ctx);
  if (!got) return;
  const raw = got.message?.text?.trim();
  if (!raw) {
    await ctx.reply('Очікую текст. Надішли текст або /cancel.');
    return;
  }

  let value: unknown;
  if (key === 'exchange_rate_manual_override') {
    if (raw.toLowerCase() === 'auto') {
      value = null;
    } else {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0 || n > 1000) {
        await ctx.reply('Курс має бути числом 0..1000. Скасовано.');
        return;
      }
      value = n;
    }
  } else {
    if (!/^https?:\/\/\S+$/i.test(raw)) {
      await ctx.reply('URL має починатися з https:// — спробуй ще раз.');
      return;
    }
    value = raw;
  }

  await conversation.external(async () => {
    if (value === null) {
      await settings.updateOne({ _id: 'singleton' }, { $unset: { [key]: '' } });
    } else {
      await settings.updateOne({ _id: 'singleton' }, { $set: { [key]: value } }, { upsert: true });
    }
    await events.insertOne({
      user_tg_id: ctx.from?.id ?? 0,
      type: 'admin_setting_change',
      payload: { key, value },
      at: new Date(),
    });
  });
  await ctx.reply(`✅ Налаштування ${code(key)} оновлено.`, { parse_mode: 'HTML' });
}

async function resetAdminGroup(ctx: BotContext): Promise<void> {
  const { settings, events } = getCollections();
  await settings.updateOne({ _id: 'singleton' }, { $unset: { admin_group_chat_id: '' } });
  await events.insertOne({
    user_tg_id: ctx.from?.id ?? 0,
    type: 'admin_group_reset',
    payload: {},
    at: new Date(),
  });
  await ctx.reply(
    '🧹 Прив’язку до адмін-групи скинуто. Заново налаштуй командою /init_admin_group.',
  );
  await showSettings(ctx);
}

export const setSettingConv = createConversation<BotContext, BotContext>(
  async (conversation: Conv, ctx: BotContext, ...args: unknown[]): Promise<void> => {
    try {
      await setSettingFlow(conversation, ctx, args[0] as SettingKey);
    } catch (err) {
      logger().error({ err }, 'set setting conversation failed');
      await ctx.reply('Помилка під час оновлення налаштування.');
    }
  },
  'set_setting',
);

export function registerSettingsActions(): void {
  registerAdminAction({
    prefix: 'a:settings',
    perm: 'manage_settings',
    run: async (ctx, rest) => {
      if (rest === '') {
        await showSettings(ctx);
        return;
      }
      if (rest === 'reset_group') {
        await resetAdminGroup(ctx);
        return;
      }
      if (rest === 'link_group') {
        await handleInitAdminGroup(ctx);
        return;
      }
      if (rest.startsWith('edit:')) {
        const key = rest.slice('edit:'.length) as SettingKey;
        if (
          key === 'exchange_rate_manual_override' ||
          key === 'privacy_policy_url' ||
          key === 'professions_channel_url'
        ) {
          await ctx.conversation.enter('set_setting', key);
        }
        return;
      }
    },
  });
}
