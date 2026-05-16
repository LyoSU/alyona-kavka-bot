import { getCollections } from '@/db/client';

export type QuickStats = {
  users: { total: number; today: number; last_7d: number; last_30d: number };
  purchases: {
    today: { count: number; revenue_uah: number };
    last_7d: { count: number; revenue_uah: number };
    last_30d: { count: number; revenue_uah: number };
    total: { count: number; revenue_uah: number };
  };
  top_products: Array<{ product_id: string; title: string; count: number; revenue_uah: number }>;
  broadcasts: { running: number; done: number; total: number };
  pending_delivery: number;
  failed_delivery: number;
};

function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 3600_000);
}

export async function getQuickStats(): Promise<QuickStats> {
  const c = getCollections();
  const today = startOfTodayUtc();
  const d7 = daysAgo(7);
  const d30 = daysAgo(30);

  const [usersTotal, usersToday, users7d, users30d] = await Promise.all([
    c.users.countDocuments({ deleted_at: { $exists: false } }),
    c.users.countDocuments({ created_at: { $gte: today }, deleted_at: { $exists: false } }),
    c.users.countDocuments({ created_at: { $gte: d7 }, deleted_at: { $exists: false } }),
    c.users.countDocuments({ created_at: { $gte: d30 }, deleted_at: { $exists: false } }),
  ]);

  const purchaseStatuses: Array<'delivered' | 'paid_pending_delivery'> = [
    'delivered',
    'paid_pending_delivery',
  ];
  const baseMatch = { status: { $in: purchaseStatuses } };

  const purchaseAgg = await c.purchases
    .aggregate<{ _id: string; count: number; revenue: number }>([
      { $match: baseMatch },
      {
        $facet: {
          today: [
            { $match: { created_at: { $gte: today } } },
            { $group: { _id: 'today', count: { $sum: 1 }, revenue: { $sum: '$amount_uah' } } },
          ],
          d7: [
            { $match: { created_at: { $gte: d7 } } },
            { $group: { _id: 'd7', count: { $sum: 1 }, revenue: { $sum: '$amount_uah' } } },
          ],
          d30: [
            { $match: { created_at: { $gte: d30 } } },
            { $group: { _id: 'd30', count: { $sum: 1 }, revenue: { $sum: '$amount_uah' } } },
          ],
          total: [
            { $group: { _id: 'total', count: { $sum: 1 }, revenue: { $sum: '$amount_uah' } } },
          ],
        },
      },
    ])
    .toArray();

  const pa = purchaseAgg[0] as unknown as Record<string, Array<{ count: number; revenue: number }>>;
  const slot = (k: string) => {
    const row = pa?.[k]?.[0];
    return { count: row?.count ?? 0, revenue_uah: row?.revenue ?? 0 };
  };

  const topProductsAgg = await c.purchases
    .aggregate<{ _id: string; count: number; revenue: number }>([
      { $match: { status: { $in: purchaseStatuses } } },
      { $group: { _id: '$product_id', count: { $sum: 1 }, revenue: { $sum: '$amount_uah' } } },
      { $sort: { count: -1, revenue: -1 } },
      { $limit: 5 },
    ])
    .toArray();

  const productIds = topProductsAgg.map((p) => p._id);
  const productDocs = await c.products
    .find({ product_id: { $in: productIds } }, { projection: { product_id: 1, title: 1 } })
    .toArray();
  const titleMap = new Map(productDocs.map((p) => [p.product_id as string, p.title as string]));

  const [bRunning, bDone, bTotal, pending, failed] = await Promise.all([
    c.broadcasts.countDocuments({ status: 'running' }),
    c.broadcasts.countDocuments({ status: 'done' }),
    c.broadcasts.countDocuments({}),
    c.purchases.countDocuments({ status: 'paid_pending_delivery' }),
    c.purchases.countDocuments({ status: 'failed_delivery' }),
  ]);

  return {
    users: { total: usersTotal, today: usersToday, last_7d: users7d, last_30d: users30d },
    purchases: {
      today: slot('today'),
      last_7d: slot('d7'),
      last_30d: slot('d30'),
      total: slot('total'),
    },
    top_products: topProductsAgg.map((p) => ({
      product_id: p._id,
      title: titleMap.get(p._id) ?? p._id,
      count: p.count,
      revenue_uah: p.revenue,
    })),
    broadcasts: { running: bRunning, done: bDone, total: bTotal },
    pending_delivery: pending,
    failed_delivery: failed,
  };
}

export type FunnelStep = {
  node_id: string;
  visits: number;
  unique_users: number;
};

export async function getFunnelStats(): Promise<FunnelStep[]> {
  const c = getCollections();
  const rows = await c.events
    .aggregate<{ _id: string; visits: number; unique_users: number }>([
      { $match: { type: 'node_visited' } },
      {
        $group: {
          _id: '$payload.node_id',
          visits: { $sum: 1 },
          uniques: { $addToSet: '$user_tg_id' },
        },
      },
      {
        $project: {
          visits: 1,
          unique_users: { $size: '$uniques' },
        },
      },
      { $sort: { unique_users: -1 } },
      { $limit: 30 },
    ])
    .toArray();
  return rows.map((r) => ({
    node_id: r._id,
    visits: r.visits,
    unique_users: r.unique_users,
  }));
}
