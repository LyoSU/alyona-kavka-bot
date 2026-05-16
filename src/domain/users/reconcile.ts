import { getCollections } from '@/db/client';
import { logger } from '@/lib/logger';

// Recompute purchases_count / total_spent_uah from the purchases collection.
// Acts as a backstop: even if a crash between purchase insert and the user
// $inc leaves the counter behind, the next reconcile run brings it back in
// sync (eventual consistency, standalone Mongo — no transactions needed).
//
// Only counts "money-paid" statuses: delivered + paid_pending_delivery.
// refunded and failed_delivery are excluded.
export async function reconcileUserCounters(): Promise<{ updated: number }> {
  const { users, purchases } = getCollections();

  const agg = await purchases
    .aggregate<{ _id: number; count: number; total: number }>([
      {
        $match: {
          status: { $in: ['delivered', 'paid_pending_delivery'] as const },
        },
      },
      {
        $group: {
          _id: '$user_tg_id',
          count: { $sum: 1 },
          total: { $sum: '$amount_uah' },
        },
      },
    ])
    .toArray();

  const desired = new Map(agg.map((row) => [row._id, { count: row.count, total: row.total }]));

  // Users with at least one purchase: fix them.
  let updated = 0;
  for (const [tg_id, { count, total }] of desired.entries()) {
    const u = await users.findOne(
      { tg_id },
      { projection: { purchases_count: 1, total_spent_uah: 1 } },
    );
    if (!u) continue;
    if (u.purchases_count !== count || u.total_spent_uah !== total) {
      await users.updateOne(
        { tg_id },
        { $set: { purchases_count: count, total_spent_uah: total } },
      );
      updated++;
    }
  }

  // Users with counters > 0 but NO matching purchases: zero them.
  const ghost = await users
    .find(
      { purchases_count: { $gt: 0 }, tg_id: { $nin: [...desired.keys()] } },
      { projection: { tg_id: 1 } },
    )
    .toArray();
  for (const u of ghost) {
    await users.updateOne({ tg_id: u.tg_id }, { $set: { purchases_count: 0, total_spent_uah: 0 } });
    updated++;
  }

  return { updated };
}

export function startReconcileLoop(intervalMs = 60 * 60_000): { stop: () => void } {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const { updated } = await reconcileUserCounters();
      if (updated > 0) {
        logger().info({ updated }, 'reconcile: fixed user counters');
      }
    } catch (err) {
      logger().error({ err }, 'reconcile failed');
    } finally {
      running = false;
    }
  };
  // Run once at startup, then on interval.
  void tick();
  const id = setInterval(() => void tick(), intervalMs);
  return { stop: () => clearInterval(id) };
}
