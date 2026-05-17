import type { BotContext } from '@/bot/context';

type ConversationLike = { wait(): Promise<BotContext> };

// `waitFor('message:photo')` silently drops anything that is not a photo —
// including /cancel — so the conversation hangs until the user sends the right
// type. Always use this helper instead: it accepts the next update, exits on
// /cancel with a uniform reply, and lets the caller validate the payload.
export async function waitOrCancel(
  conversation: ConversationLike,
  ctx: BotContext,
): Promise<BotContext | null> {
  const got = await conversation.wait();
  if (got.message?.text === '/cancel') {
    await ctx.reply('Скасовано.');
    return null;
  }
  return got;
}
