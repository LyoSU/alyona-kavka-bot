import type { Bot } from 'grammy';
import type { BotContext } from '@/bot/context';
import { logger } from '@/lib/logger';

const PRIVATE_COMMANDS = [
  { command: 'start', description: 'На головну' },
  { command: 'lessons', description: 'Мої уроки' },
  { command: 'pause', description: 'Призупинити повідомлення' },
  { command: 'resume', description: 'Повернутися' },
  { command: 'help', description: 'Допомога' },
  { command: 'about', description: 'Про бота' },
  { command: 'delete_my_data', description: 'Видалити мої дані' },
];

const ADMIN_PRIVATE_COMMANDS = [
  ...PRIVATE_COMMANDS,
  { command: 'admin', description: '🛠 Адмін-панель' },
];

export async function publishCommands(bot: Bot<BotContext>, ownerIds: number[]): Promise<void> {
  try {
    await bot.api.setMyCommands(PRIVATE_COMMANDS, {
      scope: { type: 'all_private_chats' },
      language_code: 'uk',
    });
    for (const id of ownerIds) {
      await bot.api.setMyCommands(ADMIN_PRIVATE_COMMANDS, {
        scope: { type: 'chat', chat_id: id },
        language_code: 'uk',
      });
    }
    logger().info({ admins: ownerIds.length }, 'commands published');
  } catch (err) {
    logger().warn({ err }, 'failed to publish commands');
  }
}
