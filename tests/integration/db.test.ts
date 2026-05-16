import type { StartedMongoDBContainer } from '@testcontainers/mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getCollections, initDb } from '@/db/client';
import type { Permissions } from '@/db/schemas';
import { startMongo } from '../helpers/mongo';

const NO_PERMS: Permissions = {
  manage_admins: false,
  edit_content: false,
  manage_products: false,
  broadcast: false,
  view_stats: false,
  support: false,
  manage_settings: false,
  refund: false,
};

let mongo: StartedMongoDBContainer;

beforeAll(async () => {
  const started = await startMongo();
  mongo = started.container;
  await initDb(started.uri, 'test_db');
}, 120_000);

afterAll(async () => {
  await closeDb();
  await mongo.stop();
});

describe('db client', () => {
  it('exposes typed collections and can write/read', async () => {
    const { users } = getCollections();
    await users.insertOne({
      tg_id: 1,
      first_name: 'T',
      language_code: 'uk',
      funnel_paused: false,
      blocked: false,
      is_admin: false,
      permissions: NO_PERMS,
      created_at: new Date(),
      last_seen_at: new Date(),
      purchases_count: 0,
      total_spent_uah: 0,
    });
    const found = await users.findOne({ tg_id: 1 });
    expect(found?.first_name).toBe('T');
  });

  it('enforces unique tg_id', async () => {
    const { users } = getCollections();
    await users.insertOne({
      tg_id: 42,
      first_name: 'A',
      language_code: 'uk',
      funnel_paused: false,
      blocked: false,
      is_admin: false,
      permissions: NO_PERMS,
      created_at: new Date(),
      last_seen_at: new Date(),
      purchases_count: 0,
      total_spent_uah: 0,
    });
    await expect(
      users.insertOne({
        tg_id: 42,
        first_name: 'B',
        language_code: 'uk',
        funnel_paused: false,
        blocked: false,
        is_admin: false,
        permissions: NO_PERMS,
        created_at: new Date(),
        last_seen_at: new Date(),
        purchases_count: 0,
        total_spent_uah: 0,
      }),
    ).rejects.toThrow();
  });
});
