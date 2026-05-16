import type { Bot } from 'grammy';
import type { BotContext } from '@/bot/context';
import { editButtonConv, editChunkConv } from './content';
import { uploadLessonConv } from './lessons-admin';
import { editProductFieldConv } from './products-admin';
import { setSettingConv } from './settings-admin';
import { addAdminConv } from './team-admin';

export function registerAdminConversations(bot: Bot<BotContext>): void {
  bot.use(editChunkConv);
  bot.use(editButtonConv);
  bot.use(uploadLessonConv);
  bot.use(editProductFieldConv);
  bot.use(setSettingConv);
  bot.use(addAdminConv);
}
