import type { UserDoc } from '@/db/schemas';
import { bold, code, escapeHtml } from '@/lib/html';

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
    `👤 ${bold(fullName)}`,
    `📱 ${escapeHtml(at)}`,
    `🆔 ${code(user.tg_id)}`,
    `📅 Старт: ${escapeHtml(fmtDate(user.created_at))}`,
    `🌐 ${escapeHtml(user.language_code)}`,
    '──────────────',
    '📊 Воронка',
    `└─ Зараз на: ${code(node)}`,
    `🎯 Сегмент: ${escapeHtml(seg)}`,
    '',
    `💰 Купівлі: ${user.purchases_count} (${user.total_spent_uah} ₴)`,
    '──────────────',
  ].join('\n');
}
