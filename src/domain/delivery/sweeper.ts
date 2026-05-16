import type { Api } from 'grammy';
import type { ObjectId } from 'mongodb';
import { getCollections } from '@/db/client';
import { notifyDeliveryFailure } from '@/domain/support/notifications';
import { logger } from '@/lib/logger';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';

const MAX_ATTEMPTS = 5;
const BETWEEN_LESSONS_MS = 1500;
const PLACEHOLDER_FILE_ID = 'PENDING_UPLOAD';

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

// Deliver a digital product — idempotent across retries via delivered_lesson_idx.
// Returns true if all lessons were delivered (outro sent), false if errored mid-stream.
async function deliverDigital(
  api: Api,
  purchase_id: ObjectId,
  user_tg_id: number,
  product_id: string,
  startIdx: number,
): Promise<void> {
  const { products, lessons, purchases } = getCollections();
  const product = await products.findOne({ product_id });
  if (!product) throw new Error(`product not found: ${product_id}`);

  const lessonIds = (product.lessons as string[] | undefined) ?? [];
  if (lessonIds.length === 0) {
    logger().warn({ product_id }, 'digital product has no lessons');
    return;
  }
  const lessonDocs = await lessons.find({ lesson_id: { $in: lessonIds } }).toArray();
  const ordered = lessonDocs.sort((a, b) => {
    const oa = a.order_in_product?.[product_id] ?? 999;
    const ob = b.order_in_product?.[product_id] ?? 999;
    return oa - ob;
  });

  for (let i = startIdx; i < ordered.length; i++) {
    const l = ordered[i];
    if (!l) continue;
    const fileId = l.video_file_id as string | undefined;
    if (!fileId || fileId === PLACEHOLDER_FILE_ID) {
      throw new Error(`lesson ${l.lesson_id} has no uploaded video`);
    }
    const caption = `📚 Урок ${i + 1}/${ordered.length}: ${l.title}`;
    await api.sendVideo(user_tg_id, fileId, { caption, protect_content: true });
    // Persist progress AFTER each successful send. If the process crashes mid-stream,
    // the next sweeper run resumes from i+1.
    await purchases.updateOne({ _id: purchase_id }, { $set: { delivered_lesson_idx: i + 1 } });
    if (i < ordered.length - 1) await sleep(BETWEEN_LESSONS_MS);
  }
  await api.sendMessage(user_tg_id, SYSTEM_MESSAGES.delivered_outro);
}

async function deliverAppointment(
  api: Api,
  user_tg_id: number,
  product_id: string,
  purchase_id: ObjectId,
): Promise<void> {
  const { appointments } = getCollections();
  // Idempotent: skip if appointment already exists for this purchase.
  const existing = await appointments.findOne({ purchase_id });
  if (!existing) {
    await appointments.insertOne({
      user_tg_id,
      product_id,
      purchase_id,
      status: 'new',
      admin_notes: [],
      created_at: new Date(),
    });
  }
  await api.sendMessage(user_tg_id, SYSTEM_MESSAGES.payment_success_appointment);
}

export async function runSweeperOnce(api: Api): Promise<void> {
  const { purchases, products } = getCollections();
  const pending = await purchases
    .find({
      status: 'paid_pending_delivery',
      delivery_attempts: { $lt: MAX_ATTEMPTS },
    })
    .limit(50)
    .toArray();

  for (const p of pending) {
    const productId = p.product_id as string;
    const userId = p.user_tg_id as number;
    const startIdx = (p.delivered_lesson_idx as number | undefined) ?? 0;
    try {
      const product = await products.findOne({ product_id: productId });
      if (!product) {
        logger().error({ product_id: productId }, 'sweeper: product missing');
        await purchases.updateOne({ _id: p._id }, { $inc: { delivery_attempts: 1 } });
        continue;
      }

      if (product.type === 'digital') {
        if (!p._id) throw new Error('purchase has no _id');
        await deliverDigital(api, p._id, userId, productId, startIdx);
      } else {
        if (!p._id) throw new Error('purchase has no _id');
        await deliverAppointment(api, userId, productId, p._id);
      }

      await purchases.updateOne(
        { _id: p._id },
        { $set: { status: 'delivered', delivered_at: new Date() } },
      );
      await getCollections().events.insertOne({
        user_tg_id: userId,
        type: 'delivery_success',
        payload: { product_id: productId, type: product.type },
        at: new Date(),
      });
    } catch (err) {
      logger().error({ err, purchase_id: p._id, product_id: productId }, 'delivery failed');
      const updated = await purchases.findOneAndUpdate(
        { _id: p._id },
        { $inc: { delivery_attempts: 1 } },
        { returnDocument: 'after' },
      );
      const attempts = (updated?.delivery_attempts as number | undefined) ?? 0;
      if (attempts >= MAX_ATTEMPTS) {
        await purchases.updateOne({ _id: p._id }, { $set: { status: 'failed_delivery' } });
        try {
          await api.sendMessage(userId, SYSTEM_MESSAGES.delivery_failed_user);
        } catch {
          /* user blocked bot etc — ok */
        }
        try {
          await notifyDeliveryFailure(api, userId, `${productId} (${attempts} attempts)`);
        } catch {
          /* notification failure should not block */
        }
        await getCollections().events.insertOne({
          user_tg_id: userId,
          type: 'delivery_failed',
          payload: { product_id: productId, attempts },
          at: new Date(),
        });
      }
    }
  }
}

export function startSweeper(api: Api, intervalMs = 30_000): { stop: () => void } {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSweeperOnce(api);
    } catch (err) {
      logger().error({ err }, 'sweeper tick failed');
    } finally {
      running = false;
    }
  };
  const id = setInterval(() => void tick(), intervalMs);
  return {
    stop: () => clearInterval(id),
  };
}
