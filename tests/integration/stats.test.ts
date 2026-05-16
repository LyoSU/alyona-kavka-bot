import type { StartedMongoDBContainer } from '@testcontainers/mongodb';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getCollections, initDb } from '@/db/client';
import { exportPurchasesCsv, exportUsersCsv } from '@/domain/stats/csv';
import { getFunnelStats, getQuickStats } from '@/domain/stats/repo';
import { startMongo } from '../helpers/mongo';

let mongo: StartedMongoDBContainer;

beforeAll(async () => {
  const started = await startMongo();
  mongo = started.container;
  await initDb(started.uri, 'test_stats');
}, 120_000);

afterAll(async () => {
  await closeDb();
  await mongo.stop();
});

beforeEach(async () => {
  const c = getCollections();
  await Promise.all([
    c.users.deleteMany({}),
    c.purchases.deleteMany({}),
    c.products.deleteMany({}),
    c.events.deleteMany({}),
    c.broadcasts.deleteMany({}),
  ]);
});

function makeUser(tg_id: number, overrides: Record<string, unknown> = {}) {
  return {
    tg_id,
    first_name: `User${tg_id}`,
    language_code: 'uk',
    funnel_paused: false,
    blocked: false,
    is_admin: false,
    permissions: {
      manage_admins: false,
      edit_content: false,
      manage_products: false,
      broadcast: false,
      view_stats: false,
      support: false,
      manage_settings: false,
      refund: false,
    },
    created_at: new Date(),
    last_seen_at: new Date(),
    purchases_count: 0,
    total_spent_uah: 0,
    ...overrides,
  };
}

describe('stats repo', () => {
  it('counts users by date buckets and excludes deleted', async () => {
    const c = getCollections();
    await c.users.insertMany([makeUser(1), makeUser(2), makeUser(3, { deleted_at: new Date() })]);
    const s = await getQuickStats();
    expect(s.users.total).toBe(2);
    expect(s.users.today).toBe(2);
  });

  it('aggregates revenue from delivered + paid_pending purchases and excludes refunded/failed', async () => {
    const c = getCollections();
    await c.users.insertOne(makeUser(10));
    await c.products.insertOne({
      product_id: 'p_a',
      type: 'digital',
      title: 'Course A',
      description: '',
      price: 200,
      currency: 'UAH',
      visible: true,
      order: 0,
      created_at: new Date(),
    });
    await c.purchases.insertMany([
      {
        user_tg_id: 10,
        product_id: 'p_a',
        amount_uah: 200,
        amount_original: 200,
        currency_original: 'UAH',
        provider_payment_id: 'p1',
        telegram_payment_charge_id: 't1',
        status: 'delivered',
        delivery_attempts: 0,
        created_at: new Date(),
      },
      {
        user_tg_id: 10,
        product_id: 'p_a',
        amount_uah: 200,
        amount_original: 200,
        currency_original: 'UAH',
        provider_payment_id: 'p2',
        telegram_payment_charge_id: 't2',
        status: 'paid_pending_delivery',
        delivery_attempts: 0,
        created_at: new Date(),
      },
      {
        user_tg_id: 10,
        product_id: 'p_a',
        amount_uah: 200,
        amount_original: 200,
        currency_original: 'UAH',
        provider_payment_id: 'p3',
        telegram_payment_charge_id: 't3',
        status: 'refunded',
        delivery_attempts: 0,
        created_at: new Date(),
      },
    ]);
    const s = await getQuickStats();
    expect(s.purchases.total.count).toBe(2);
    expect(s.purchases.total.revenue_uah).toBe(400);
    expect(s.top_products[0]?.product_id).toBe('p_a');
    expect(s.top_products[0]?.title).toBe('Course A');
    expect(s.top_products[0]?.count).toBe(2);
  });

  it('funnel stats counts unique users per node from events', async () => {
    const c = getCollections();
    const at = new Date();
    await c.events.insertMany([
      { user_tg_id: 1, type: 'node_visited', payload: { node_id: 'welcome' }, at },
      { user_tg_id: 1, type: 'node_visited', payload: { node_id: 'welcome' }, at },
      { user_tg_id: 2, type: 'node_visited', payload: { node_id: 'welcome' }, at },
      { user_tg_id: 1, type: 'node_visited', payload: { node_id: 'segment_pick' }, at },
    ]);
    const f = await getFunnelStats();
    const wel = f.find((s) => s.node_id === 'welcome');
    expect(wel?.unique_users).toBe(2);
    expect(wel?.visits).toBe(3);
  });
});

describe('csv export', () => {
  it('users.csv contains header and a row per user', async () => {
    const c = getCollections();
    await c.users.insertMany([makeUser(100), makeUser(101, { username: 'al,ona' })]);
    const buf = await exportUsersCsv();
    const txt = buf.toString('utf8');
    expect(txt.startsWith('tg_id,username,first_name')).toBe(true);
    expect(txt).toContain('100,');
    // properly quoted username with comma
    expect(txt).toContain('"al,ona"');
  });

  it('purchases.csv joins user info', async () => {
    const c = getCollections();
    await c.users.insertOne(makeUser(200, { username: 'olena' }));
    await c.purchases.insertOne({
      user_tg_id: 200,
      product_id: 'p_x',
      amount_uah: 500,
      amount_original: 500,
      currency_original: 'UAH',
      provider_payment_id: 'pp_x',
      telegram_payment_charge_id: 'tt_x',
      status: 'delivered',
      delivery_attempts: 0,
      created_at: new Date(),
    });
    const buf = await exportPurchasesCsv();
    const txt = buf.toString('utf8');
    expect(txt).toContain('200,olena,');
    expect(txt).toContain(',500,');
    expect(txt).toContain(',delivered,');
  });
});
