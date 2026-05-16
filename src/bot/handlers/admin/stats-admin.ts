import { InlineKeyboard, InputFile } from 'grammy';
import type { BotContext } from '@/bot/context';
import { nodeLabel } from '@/domain/funnel/labels';
import { exportPurchasesCsv, exportUsersCsv } from '@/domain/stats/csv';
import { getFunnelStats, getQuickStats } from '@/domain/stats/repo';
import { bold, code, escapeHtml } from '@/lib/html';
import { logger } from '@/lib/logger';
import { registerAdminAction } from './router';

function fmt(n: number): string {
  return n.toLocaleString('uk-UA').replace(/\s/g, ' ');
}

async function showQuickStats(ctx: BotContext): Promise<void> {
  const s = await getQuickStats();

  const lines: string[] = [];
  lines.push(bold('📊 Статистика'));
  lines.push('');
  lines.push(bold('👥 Користувачі'));
  lines.push(`Всього: ${fmt(s.users.total)}`);
  lines.push(`Сьогодні: ${fmt(s.users.today)}`);
  lines.push(`7 днів: ${fmt(s.users.last_7d)}`);
  lines.push(`30 днів: ${fmt(s.users.last_30d)}`);
  lines.push('');
  lines.push(bold('💰 Купівлі і дохід'));
  lines.push(`Сьогодні: ${fmt(s.purchases.today.count)} · ${fmt(s.purchases.today.revenue_uah)} ₴`);
  lines.push(
    `7 днів: ${fmt(s.purchases.last_7d.count)} · ${fmt(s.purchases.last_7d.revenue_uah)} ₴`,
  );
  lines.push(
    `30 днів: ${fmt(s.purchases.last_30d.count)} · ${fmt(s.purchases.last_30d.revenue_uah)} ₴`,
  );
  lines.push(`Всього: ${fmt(s.purchases.total.count)} · ${fmt(s.purchases.total.revenue_uah)} ₴`);
  lines.push('');
  lines.push(bold('🏆 Топ продуктів'));
  if (s.top_products.length === 0) {
    lines.push('— ще немає');
  } else {
    for (const p of s.top_products) {
      lines.push(`${escapeHtml(p.title)} — ${fmt(p.count)} (${fmt(p.revenue_uah)} ₴)`);
    }
  }
  lines.push('');
  lines.push(bold('📣 Розсилки'));
  lines.push(
    `Активних: ${s.broadcasts.running} · Завершено: ${s.broadcasts.done} · Всього: ${s.broadcasts.total}`,
  );
  if (s.pending_delivery > 0 || s.failed_delivery > 0) {
    lines.push('');
    lines.push(bold('⚠️ Алерти доставки'));
    if (s.pending_delivery > 0) lines.push(`У черзі: ${s.pending_delivery}`);
    if (s.failed_delivery > 0) lines.push(`Помилок: ${code(s.failed_delivery)}`);
  }

  const kb = new InlineKeyboard()
    .text('🪜 Воронка', 'a:stats:funnel')
    .row()
    .text('📥 CSV users', 'a:stats:csv:users')
    .text('📥 CSV purchases', 'a:stats:csv:purchases')
    .row()
    .text('🔄 Оновити', 'a:stats')
    .row()
    .text('⬅️ Адмін-меню', 'a:home');

  const text = lines.join('\n');
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function showFunnel(ctx: BotContext): Promise<void> {
  const steps = await getFunnelStats();
  const lines: string[] = [bold('🪜 Воронка — досягнення нод'), ''];
  if (steps.length === 0) {
    lines.push('Поки немає подій node_visited (бот тільки запустився).');
  } else {
    const top = steps[0]?.unique_users ?? 1;
    for (const s of steps) {
      const pct = top > 0 ? Math.round((s.unique_users / top) * 100) : 0;
      lines.push(`${escapeHtml(nodeLabel(s.node_id))} — ${fmt(s.unique_users)} (${pct}%)`);
    }
  }

  const kb = new InlineKeyboard()
    .text('🔄 Оновити', 'a:stats:funnel')
    .row()
    .text('⬅️ До статистики', 'a:stats');
  const text = lines.join('\n');
  try {
    await ctx.editMessageText(text, { reply_markup: kb, parse_mode: 'HTML' });
  } catch {
    await ctx.reply(text, { reply_markup: kb, parse_mode: 'HTML' });
  }
}

async function sendCsv(ctx: BotContext, kind: 'users' | 'purchases'): Promise<void> {
  if (!ctx.chat) return;
  try {
    const buf = kind === 'users' ? await exportUsersCsv() : await exportPurchasesCsv();
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${kind}-${date}.csv`;
    await ctx.replyWithDocument(new InputFile(buf, filename), {
      caption: `📥 ${kind}.csv (${(buf.length / 1024).toFixed(1)} KiB)`,
    });
  } catch (err) {
    logger().error({ err, kind }, 'csv export failed');
    await ctx.reply('Помилка при генерації CSV.');
  }
}

export function registerStatsActions(): void {
  registerAdminAction({
    prefix: 'a:stats',
    perm: 'view_stats',
    run: async (ctx, rest) => {
      if (rest === '') {
        await showQuickStats(ctx);
        return;
      }
      if (rest === 'funnel') {
        await showFunnel(ctx);
        return;
      }
      if (rest === 'csv:users') {
        await sendCsv(ctx, 'users');
        return;
      }
      if (rest === 'csv:purchases') {
        await sendCsv(ctx, 'purchases');
        return;
      }
    },
  });
}
