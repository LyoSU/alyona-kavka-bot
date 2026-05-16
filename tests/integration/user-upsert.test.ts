import type { StartedMongoDBContainer } from '@testcontainers/mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, initDb } from '@/db/client';
import { upsertUserFromTg } from '@/domain/users/repo';
import { startMongo } from '../helpers/mongo';

let mongo: StartedMongoDBContainer;

beforeAll(async () => {
  const started = await startMongo();
  mongo = started.container;
  await initDb(started.uri, 'test_users');
}, 120_000);

afterAll(async () => {
  await closeDb();
  await mongo.stop();
});

describe('upsertUserFromTg', () => {
  it('creates new user with owner permissions if in OWNER_TG_IDS', async () => {
    const u = await upsertUserFromTg(
      { id: 100, first_name: 'Owner', language_code: 'uk' },
      [100],
    );
    expect(u.is_admin).toBe(true);
    expect(u.permissions.manage_admins).toBe(true);
    expect(u.permissions.support).toBe(true);
  });

  it('creates regular user with no permissions otherwise', async () => {
    const u = await upsertUserFromTg(
      { id: 200, first_name: 'Plain', language_code: 'uk' },
      [100],
    );
    expect(u.is_admin).toBe(false);
    expect(u.permissions.manage_admins).toBe(false);
    expect(u.permissions.support).toBe(false);
  });

  it('updates last_seen_at on existing user', async () => {
    const first = await upsertUserFromTg(
      { id: 300, first_name: 'A', language_code: 'uk' },
      [],
    );
    await new Promise((r) => setTimeout(r, 10));
    const second = await upsertUserFromTg(
      { id: 300, first_name: 'A', language_code: 'uk' },
      [],
    );
    expect(second.last_seen_at.getTime()).toBeGreaterThan(
      first.last_seen_at.getTime(),
    );
  });

  it('promotes existing user to admin if added to OWNER_TG_IDS', async () => {
    await upsertUserFromTg({ id: 400, first_name: 'L', language_code: 'uk' }, []);
    const promoted = await upsertUserFromTg(
      { id: 400, first_name: 'L', language_code: 'uk' },
      [400],
    );
    expect(promoted.is_admin).toBe(true);
    expect(promoted.permissions.manage_admins).toBe(true);
  });
});
