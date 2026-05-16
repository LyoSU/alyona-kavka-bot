import { registerAdminAction } from './router';

export function registerStubActions(): void {
  registerAdminAction({
    prefix: 'a:stats',
    perm: 'view_stats',
    run: async (ctx) => {
      await ctx.reply('📊 Статистика — у Phase 11. Скоро буде.');
    },
  });

  registerAdminAction({
    prefix: 'a:refunds',
    perm: 'refund',
    run: async (ctx) => {
      await ctx.reply('↩️ Повернення коштів через Telegram Payments — у Phase 11. Скоро буде.');
    },
  });
}
