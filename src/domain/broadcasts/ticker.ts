import type { Api } from 'grammy';
import { GrammyError } from 'grammy';
import type { Filter, ObjectId } from 'mongodb';
import { getCollections } from '@/db/client';
import type { BroadcastDoc, UserDoc } from '@/db/schemas';
import { logger } from '@/lib/logger';
import { buildSegmentFilter, type SegmentKey } from './segments';

const CHUNK_SIZE = 25;
const BETWEEN_USERS_MS = 50; // ~20 msg/sec — under TG ~30/sec limit with throttler safety

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function sendOne(api: Api, b: BroadcastDoc, user_tg_id: number): Promise<void> {
  const m = b.source_message;
  switch (m.type) {
    case 'text':
      await api.sendMessage(user_tg_id, m.text ?? '', {
        parse_mode: m.parse_mode,
      });
      return;
    case 'photo':
      if (!m.file_id) throw new Error('photo: no file_id');
      await api.sendPhoto(user_tg_id, m.file_id, {
        caption: m.caption,
        parse_mode: m.parse_mode,
      });
      return;
    case 'video':
      if (!m.file_id) throw new Error('video: no file_id');
      await api.sendVideo(user_tg_id, m.file_id, {
        caption: m.caption,
        parse_mode: m.parse_mode,
      });
      return;
    case 'voice':
      if (!m.file_id) throw new Error('voice: no file_id');
      await api.sendVoice(user_tg_id, m.file_id, {
        caption: m.caption,
        parse_mode: m.parse_mode,
      });
      return;
    case 'document':
      if (!m.file_id) throw new Error('document: no file_id');
      await api.sendDocument(user_tg_id, m.file_id, {
        caption: m.caption,
        parse_mode: m.parse_mode,
      });
      return;
  }
}

function isFatalSendError(err: unknown): boolean {
  if (!(err instanceof GrammyError)) return false;
  const d = err.description.toLowerCase();
  return (
    d.includes('bot was blocked') ||
    d.includes('user is deactivated') ||
    d.includes('chat not found') ||
    d.includes('forbidden')
  );
}

async function processChunk(api: Api, b: BroadcastDoc): Promise<{ done: boolean }> {
  const { users, broadcasts } = getCollections();
  const segFilter = buildSegmentFilter(b.segment_filter.segment as SegmentKey);
  const cursorFilter: Filter<UserDoc> = b.last_processed_user_id
    ? { ...segFilter, _id: { $gt: b.last_processed_user_id } }
    : segFilter;

  const chunk = await users.find(cursorFilter).sort({ _id: 1 }).limit(CHUNK_SIZE).toArray();
  if (chunk.length === 0) {
    await broadcasts.updateOne(
      { _id: b._id },
      { $set: { status: 'done', finished_at: new Date() } },
    );
    return { done: true };
  }

  let sent = 0;
  let failed = 0;
  let lastId: ObjectId | undefined;

  for (const u of chunk) {
    try {
      await sendOne(api, b, u.tg_id);
      sent++;
    } catch (err) {
      failed++;
      if (isFatalSendError(err)) {
        await users.updateOne({ _id: u._id }, { $set: { blocked: true } });
      } else {
        logger().warn(
          { err, broadcast_id: String(b._id), user_tg_id: u.tg_id },
          'broadcast send failed',
        );
      }
    }
    lastId = u._id;
    if (u !== chunk[chunk.length - 1]) await sleep(BETWEEN_USERS_MS);
  }

  await broadcasts.updateOne(
    { _id: b._id },
    {
      $inc: { sent_count: sent, failed_count: failed },
      $set: { last_processed_user_id: lastId },
    },
  );
  return { done: false };
}

let running = false;

export async function runBroadcastTickOnce(api: Api): Promise<void> {
  if (running) return;
  running = true;
  try {
    const b = await getCollections().broadcasts.findOne(
      { status: 'running' },
      { sort: { created_at: 1 } },
    );
    if (!b) return;
    if (!b.started_at) {
      await getCollections().broadcasts.updateOne(
        { _id: b._id },
        { $set: { started_at: new Date() } },
      );
    }
    await processChunk(api, b);
  } catch (err) {
    logger().error({ err }, 'broadcast tick failed');
  } finally {
    running = false;
  }
}

export function startBroadcastTicker(api: Api, intervalMs = 4000): { stop: () => void } {
  const id = setInterval(() => void runBroadcastTickOnce(api), intervalMs);
  return { stop: () => clearInterval(id) };
}

export async function countAudience(seg: SegmentKey): Promise<number> {
  return getCollections().users.countDocuments(buildSegmentFilter(seg));
}

export type { ObjectId };
