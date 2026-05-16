import { registerAdminAction } from './router';

export function registerStubActions(): void {
  registerAdminAction({
    prefix: 'a:refunds',
    perm: 'refund',
    run: async (ctx) => {
      await ctx.reply('↩️ Повернення коштів через Telegram Payments — у Phase 11. Скоро буде.');
    },
  });
}
