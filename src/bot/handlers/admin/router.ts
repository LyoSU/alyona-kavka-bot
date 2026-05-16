import type { BotContext } from '@/bot/context';
import type { Permissions } from '@/db/schemas';
import { logger } from '@/lib/logger';
import { buildAdminMenu, handleAdmin } from './menu';

type AdminAction = {
  prefix: string;
  perm: keyof Permissions;
  run: (ctx: BotContext, rest: string) => Promise<void>;
};

const REGISTRY: AdminAction[] = [];

export function registerAdminAction(action: AdminAction): void {
  REGISTRY.push(action);
}

function denied(label: keyof Permissions): string {
  const map: Record<keyof Permissions, string> = {
    manage_admins: 'керування командою',
    edit_content: 'редагування контенту',
    manage_products: 'керування продуктами',
    broadcast: 'розсилки',
    view_stats: 'перегляд статистики',
    support: 'підтримка',
    manage_settings: 'налаштування',
    refund: 'повернення коштів',
  };
  return `Тут потрібен дозвіл "${map[label]}". Звернись до Альони.`;
}

export async function handleAdminCallback(ctx: BotContext): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('a:')) return false;

  const u = ctx.state.user;
  if (!u?.is_admin) {
    await ctx.answerCallbackQuery({ text: 'Тільки для адміністраторів', show_alert: true });
    return true;
  }

  await ctx.answerCallbackQuery().catch(() => undefined);

  // home of admin menu
  if (data === 'a:home') {
    const kb = buildAdminMenu(u.permissions);
    try {
      await ctx.editMessageText('👋 Що робимо?', { reply_markup: kb });
    } catch {
      await handleAdmin(ctx);
    }
    return true;
  }

  for (const action of REGISTRY) {
    if (data === action.prefix || data.startsWith(`${action.prefix}:`)) {
      if (!u.permissions[action.perm]) {
        await ctx.reply(denied(action.perm));
        return true;
      }
      const rest = data === action.prefix ? '' : data.slice(action.prefix.length + 1);
      try {
        await action.run(ctx, rest);
      } catch (err) {
        logger().error({ err, data }, 'admin action failed');
        await ctx.reply('Помилка під час виконання дії. Деталі в логах.');
      }
      return true;
    }
  }

  logger().warn({ data }, 'unhandled admin callback');
  return true;
}
