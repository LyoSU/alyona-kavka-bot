import type { Api } from 'grammy';
import { getCollections } from '@/db/client';
import { notifyDeliveryFailure } from '@/domain/support/notifications';
import { logger } from '@/lib/logger';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';

const MAX_ATTEMPTS = 5;
const BETWEEN_LESSONS_MS = 1500;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function deliverDigital(api: Api, user_tg_id: number, product_id: string): Promise<void> {
  const { products, lessons } = getCollections();
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

  for (let i = 0; i < ordered.length; i++) {
    const l = ordered[i];
    if (!l) continue;
    const fileId = l.video_file_id as string | undefined;
    if (!fileId || fileId === 'PENDING_UPLOAD') {
      throw new Error(`lesson ${l.lesson_id} has no uploaded video`);
    }
    const caption = `📚 Урок ${i + 1}/${ordered.length}: ${l.title}`;
    await api.sendVideo(user_tg_id, fileId, { caption, protect_content: true });
    if (i < ordered.length - 1) await sleep(BETWEEN_LESSONS_MS);
  }
  await api.sendMessage(user_tg_id, SYSTEM_MESSAGES.delivered_outro);
}

async function deliverAppointment(
  api: Api,
  user_tg_id: number,
  product_id: string,
  purchase_id_str: string,
): Promise<void> {
  await getCollections().appointments.insertOne({
    user_tg_id,
    product_id,
    purchase_id: purchase_id_str as never, // ObjectId is set by caller wrapper
    status: 'new',
    admin_notes: [],
    created_at: new Date(),
  });
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
    try {
      const product = await products.findOne({ product_id: productId });
      if (!product) {
        logger().error({ product_id: productId }, 'sweeper: product missing');
        await purchases.updateOne({ _id: p._id }, { $inc: { delivery_attempts: 1 } });
        continue;
      }

      if (product.type === 'digital') {
        await deliverDigital(api, userId, productId);
      } else {
        await deliverAppointment(api, userId, productId, String(p._id));
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
