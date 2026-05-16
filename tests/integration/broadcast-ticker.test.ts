import type { StartedMongoDBContainer } from '@testcontainers/mongodb';
import { GrammyError } from 'grammy';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeDb, getCollections, initDb } from '@/db/client';
import { runBroadcastTickOnce } from '@/domain/broadcasts/ticker';
import { startMongo } from '../helpers/mongo';

let mongo: StartedMongoDBContainer;

beforeAll(async () => {
  const started = await startMongo();
  mongo = started.container;
  await initDb(started.uri, 'test_broadcasts');
}, 120_000);

afterAll(async () => {
  await closeDb();
  await mongo.stop();
});

beforeEach(async () => {
  const c = getCollections();
  await Promise.all([c.users.deleteMany({}), c.broadcasts.deleteMany({})]);
});

type FakeApi = {
  sendMessage: ReturnType<typeof vi.fn>;
};

function makeUser(overrides: Partial<{ tg_id: number; segment: string; blocked: boolean }>) {
  return {
    tg_id: overrides.tg_id ?? 1,
    first_name: 'U',
    language_code: 'uk',
    funnel_paused: false,
    blocked: overrides.blocked ?? false,
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
    segment: overrides.segment as 'first_job' | 'growing' | undefined,
    created_at: new Date(),
    last_seen_at: new Date(),
    purchases_count: 0,
    total_spent_uah: 0,
  };
}

describe('broadcast ticker', () => {
  it('sends text broadcast to filtered users and advances cursor; completes when empty', async () => {
    const c = getCollections();
    await c.users.insertMany([
      makeUser({ tg_id: 100, segment: 'first_job' }),
      makeUser({ tg_id: 101, segment: 'first_job' }),
      makeUser({ tg_id: 102, segment: 'growing' }), // excluded
      makeUser({ tg_id: 103, segment: 'first_job', blocked: true }), // excluded
      makeUser({ tg_id: 104, segment: 'first_job' }),
    ]);

    const inserted = await c.broadcasts.insertOne({
      segment_filter: { segment: 'first_job' },
      source_message: { type: 'text', text: 'Привіт' },
      status: 'running',
      total_target: 3,
      sent_count: 0,
      failed_count: 0,
      created_by_tg_id: 0,
      created_at: new Date(),
    });

    const api: FakeApi = { sendMessage: vi.fn(async () => ({ message_id: 1 })) };

    await runBroadcastTickOnce(api as never);

    const after = await c.broadcasts.findOne({ _id: inserted.insertedId });
    expect(after?.sent_count).toBe(3);
    expect(after?.failed_count).toBe(0);
    expect(api.sendMessage).toHaveBeenCalledTimes(3);
    const recipients = api.sendMessage.mock.calls.map((args) => args[0]).sort();
    expect(recipients).toEqual([100, 101, 104]);

    // Next tick — cursor at end → completes
    await runBroadcastTickOnce(api as never);
    const finished = await c.broadcasts.findOne({ _id: inserted.insertedId });
    expect(finished?.status).toBe('done');
    expect(finished?.finished_at).toBeInstanceOf(Date);
  });

  it('marks user blocked on fatal send error and increments failed_count', async () => {
    const c = getCollections();
    await c.users.insertOne(makeUser({ tg_id: 200, segment: 'first_job' }));

    const inserted = await c.broadcasts.insertOne({
      segment_filter: { segment: 'first_job' },
      source_message: { type: 'text', text: 'тест' },
      status: 'running',
      total_target: 1,
      sent_count: 0,
      failed_count: 0,
      created_by_tg_id: 0,
      created_at: new Date(),
    });

    const grammyErr = Object.create(GrammyError.prototype) as Error & {
      description: string;
      error_code: number;
    };
    grammyErr.message = 'Forbidden: bot was blocked by the user';
    grammyErr.description = 'Forbidden: bot was blocked by the user';
    grammyErr.error_code = 403;

    const api: FakeApi = {
      sendMessage: vi.fn(async () => {
        throw grammyErr;
      }),
    };

    await runBroadcastTickOnce(api as never);

    const u = await c.users.findOne({ tg_id: 200 });
    expect(u?.blocked).toBe(true);
    const b = await c.broadcasts.findOne({ _id: inserted.insertedId });
    expect(b?.failed_count).toBe(1);
    expect(b?.sent_count).toBe(0);
  });
});
