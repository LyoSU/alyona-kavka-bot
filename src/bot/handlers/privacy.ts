import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { escapeHtml } from '@/lib/html';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';

export async function handlePause(ctx: BotContext): Promise<void> {
  if (!ctx.from || ctx.chat?.type !== 'private') return;
  await getCollections().users.updateOne(
    { tg_id: ctx.from.id },
    { $set: { funnel_paused: true, last_seen_at: new Date() } },
  );
  await getCollections().events.insertOne({
    user_tg_id: ctx.from.id,
    type: 'funnel_paused',
    payload: {},
    at: new Date(),
  });
  await ctx.reply(SYSTEM_MESSAGES.paused);
}

export async function handleResume(ctx: BotContext): Promise<void> {
  if (!ctx.from || ctx.chat?.type !== 'private') return;
  await getCollections().users.updateOne(
    { tg_id: ctx.from.id },
    { $set: { funnel_paused: false, last_seen_at: new Date() } },
  );
  await getCollections().events.insertOne({
    user_tg_id: ctx.from.id,
    type: 'funnel_resumed',
    payload: {},
    at: new Date(),
  });
  await ctx.reply(SYSTEM_MESSAGES.resumed);
}

export async function handleDeleteMyData(ctx: BotContext): Promise<void> {
  if (!ctx.from || ctx.chat?.type !== 'private') return;
  const u = ctx.state.user;
  if (u?.is_admin) {
    await ctx.reply(
      'Ти зараз адміністратор бота. Спочатку нехай інший адмін зніме твої права через 👥 Команда.',
    );
    return;
  }
  const tgId = ctx.from.id;
  const { users, support_topics, events } = getCollections();

  await users.updateOne(
    { tg_id: tgId },
    {
      $set: {
        deleted_at: new Date(),
        first_name: 'deleted',
        funnel_paused: true,
      },
      $unset: {
        last_name: '',
        username: '',
        current_node_id: '',
      },
    },
  );
  // Drop the support topic linkage so future relay won't reach this user record.
  await support_topics.deleteOne({ user_tg_id: tgId });
  await events.insertOne({
    user_tg_id: tgId,
    type: 'user_deleted',
    payload: {},
    at: new Date(),
  });
  await ctx.reply(SYSTEM_MESSAGES.data_deleted);
}

export async function handleHelp(ctx: BotContext): Promise<void> {
  const lines = [
    '🧭 <b>Допомога</b>',
    '',
    'Команди:',
    '/start — на головну',
    '/lessons — мої куплені уроки',
    '/pause — призупинити отримання повідомлень',
    '/resume — повернутися',
    '/delete_my_data — видалити мої дані',
    '/about — про бота',
    '',
    'Або просто напиши тут — я передам Альоні 🙌',
  ];
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}

export async function handleAbout(ctx: BotContext): Promise<void> {
  const settings = await getCollections().settings.findOne({ _id: 'singleton' });
  const lines: string[] = [SYSTEM_MESSAGES.about];
  if (settings?.privacy_policy_url) {
    lines.push('');
    lines.push(`🔒 Політика приватності: ${escapeHtml(settings.privacy_policy_url)}`);
  }
  if (settings?.professions_channel_url) {
    lines.push(`📚 Канал про професії: ${escapeHtml(settings.professions_channel_url)}`);
  }
  await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
}
