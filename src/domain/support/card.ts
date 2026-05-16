import type { UserDoc } from '@/db/schemas';

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function renderCard(user: UserDoc): string {
  const fullName = `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`;
  const at = user.username ? `@${user.username}` : '—';
  const seg =
    user.segment === 'first_job'
      ? 'Перша робота'
      : user.segment === 'growing'
        ? 'Хоче рости'
        : 'не визначено';
  const node = user.current_node_id ?? '—';
  return [
    `👤 ${fullName}`,
    `📱 ${at}`,
    `🆔 ${user.tg_id}`,
    `📅 Старт: ${fmtDate(user.created_at)}`,
    `🌐 ${user.language_code}`,
    '──────────────',
    '📊 Воронка',
    `└─ Зараз на: ${node}`,
    `🎯 Сегмент: ${seg}`,
    '',
    `💰 Купівлі: ${user.purchases_count} (${user.total_spent_uah} ₴)`,
    '──────────────',
  ].join('\n');
}
