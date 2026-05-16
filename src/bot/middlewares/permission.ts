import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '@/bot/context';
import type { Permissions } from '@/db/schemas';

const LABELS: Record<keyof Permissions, string> = {
  manage_admins: 'керування командою',
  edit_content: 'редагування контенту',
  manage_products: 'керування продуктами',
  broadcast: 'розсилки',
  view_stats: 'перегляд статистики',
  support: 'підтримка',
  manage_settings: 'налаштування',
  refund: 'повернення коштів',
};

export function requirePermission(perm: keyof Permissions): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const u = ctx.state.user;
    if (!u?.permissions[perm]) {
      await ctx.reply(`Тут потрібен дозвіл "${LABELS[perm]}". Звернись до Альони.`);
      return;
    }
    await next();
  };
}
