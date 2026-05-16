import type { Bot } from 'grammy';
import type { BotContext } from '@/bot/context';
import { newBroadcastConv } from './broadcasts-admin';
import { editButtonConv, editChunkConv } from './content';
import { uploadLessonConv } from './lessons-admin';
import { editProductFieldConv } from './products-admin';
import { refundConv } from './refunds-admin';
import { setSettingConv } from './settings-admin';
import { addAdminConv } from './team-admin';

export function registerAdminConversations(bot: Bot<BotContext>): void {
  bot.use(editChunkConv);
  bot.use(editButtonConv);
  bot.use(uploadLessonConv);
  bot.use(editProductFieldConv);
  bot.use(setSettingConv);
  bot.use(addAdminConv);
  bot.use(newBroadcastConv);
  bot.use(refundConv);
}
