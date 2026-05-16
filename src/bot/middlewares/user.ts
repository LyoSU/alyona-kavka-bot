import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '@/bot/context';
import { upsertUserFromTg } from '@/domain/users/repo';

export function userMiddleware(ownerIds: number[]): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) {
      await next();
      return;
    }
    ctx.state.user = await upsertUserFromTg(
      {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        language_code: ctx.from.language_code,
      },
      ownerIds,
    );
    await next();
  };
}
