import type { Api } from 'grammy';
import { GrammyError } from 'grammy';
import { getCollections } from '@/db/client';
import type { UserDoc } from '@/db/schemas';
import { logger } from '@/lib/logger';
import { renderCard } from './card';

function topicName(user: UserDoc): string {
  const name = `${user.first_name}${user.last_name ? ` ${user.last_name}` : ''}`.trim();
  const username = user.username ? ` (@${user.username})` : '';
  return `${name}${username}`.slice(0, 128) || `User ${user.tg_id}`;
}

async function getAdminChatId(): Promise<number | null> {
  const settings = await getCollections().settings.findOne({ _id: 'singleton' });
  const id = settings?.admin_group_chat_id as number | undefined;
  return typeof id === 'number' ? id : null;
}

async function createTopic(api: Api, user: UserDoc, adminChatId: number): Promise<number> {
  const topic = await api.createForumTopic(adminChatId, topicName(user));
  const card = await api.sendMessage(adminChatId, renderCard(user), {
    message_thread_id: topic.message_thread_id,
    parse_mode: 'HTML',
  });
  try {
    await api.pinChatMessage(adminChatId, card.message_id);
  } catch (err) {
    logger().warn({ err, chat_id: adminChatId }, 'failed to pin profile card');
  }
  await getCollections().support_topics.updateOne(
    { user_tg_id: user.tg_id },
    {
      $set: {
        chat_id: adminChatId,
        thread_id: topic.message_thread_id,
        pinned_card_message_id: card.message_id,
        created_at: new Date(),
      },
    },
    { upsert: true },
  );
  return topic.message_thread_id;
}

export async function ensureTopic(api: Api, user: UserDoc): Promise<number | null> {
  const adminChatId = await getAdminChatId();
  if (!adminChatId) return null;

  const existing = await getCollections().support_topics.findOne({ user_tg_id: user.tg_id });
  if (existing) return existing.thread_id;
  return createTopic(api, user, adminChatId);
}

export async function updateCard(api: Api, user: UserDoc): Promise<void> {
  const t = await getCollections().support_topics.findOne({ user_tg_id: user.tg_id });
  if (!t) return;
  try {
    await api.editMessageText(t.chat_id, t.pinned_card_message_id, renderCard(user), {
      parse_mode: 'HTML',
    });
  } catch (err) {
    if (err instanceof GrammyError) {
      if (err.description.includes('message is not modified')) return;
      if (err.description.includes('TOPIC_DELETED') || err.description.includes('not found')) {
        const adminChatId = await getAdminChatId();
        if (adminChatId) {
          await getCollections().support_topics.deleteOne({ user_tg_id: user.tg_id });
          await createTopic(api, user, adminChatId);
        }
        return;
      }
    }
    logger().warn({ err, user_tg_id: user.tg_id }, 'updateCard failed');
  }
}

export async function findUserByThread(chatId: number, threadId: number): Promise<number | null> {
  const t = await getCollections().support_topics.findOne({ chat_id: chatId, thread_id: threadId });
  return t?.user_tg_id ?? null;
}
