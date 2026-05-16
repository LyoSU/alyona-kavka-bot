import { InlineKeyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import type { Permissions } from '@/db/schemas';

type Row = { perm: keyof Permissions; label: string; cb: string };

const ROWS: Row[] = [
  { perm: 'edit_content', label: '📝 Контент воронки', cb: 'a:content' },
  { perm: 'edit_content', label: '🎬 Уроки (відео)', cb: 'a:lessons' },
  { perm: 'manage_products', label: '🛒 Продукти і ціни', cb: 'a:products' },
  { perm: 'broadcast', label: '📣 Розсилки', cb: 'a:broadcasts' },
  { perm: 'view_stats', label: '📊 Статистика', cb: 'a:stats' },
  { perm: 'manage_admins', label: '👥 Команда', cb: 'a:team' },
  { perm: 'manage_settings', label: '⚙️ Налаштування', cb: 'a:settings' },
  { perm: 'refund', label: '↩️ Повернення', cb: 'a:refunds' },
];

export function buildAdminMenu(perms: Permissions): InlineKeyboard {
  const kb = new InlineKeyboard();
  const seen = new Set<string>();
  for (const r of ROWS) {
    if (!perms[r.perm]) continue;
    if (seen.has(r.cb)) continue;
    seen.add(r.cb);
    kb.text(r.label, r.cb).row();
  }
  return kb;
}

export async function handleAdmin(ctx: BotContext): Promise<void> {
  const u = ctx.state.user;
  if (!u?.is_admin) {
    await ctx.reply('Команда тільки для адміністраторів.');
    return;
  }
  const kb = buildAdminMenu(u.permissions);
  if (kb.inline_keyboard.length === 0) {
    await ctx.reply('У тебе немає жодного активного дозволу. Зверніться до Альони.');
    return;
  }
  await ctx.reply(`👋 Привіт, ${u.first_name}!\nЩо робимо?`, { reply_markup: kb });
}
