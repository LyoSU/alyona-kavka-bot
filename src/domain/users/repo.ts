import { getCollections } from '@/db/client';
import type { Permissions, UserDoc } from '@/db/schemas';

export const NO_PERMISSIONS: Permissions = {
  manage_admins: false,
  edit_content: false,
  manage_products: false,
  broadcast: false,
  view_stats: false,
  support: false,
  manage_settings: false,
  refund: false,
};

export const OWNER_PERMISSIONS: Permissions = {
  manage_admins: true,
  edit_content: true,
  manage_products: true,
  broadcast: true,
  view_stats: true,
  support: true,
  manage_settings: true,
  refund: true,
};

type TgUser = {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code?: string;
};

export async function upsertUserFromTg(tg: TgUser, ownerIds: number[]): Promise<UserDoc> {
  const { users } = getCollections();
  const now = new Date();
  const isOwner = ownerIds.includes(tg.id);

  // Atomic upsert: $set always-updated fields, $setOnInsert defaults only on first insert.
  // Owner promotion runs as a separate atomic step afterwards to avoid overriding
  // permissions for an existing admin (assistant) who happens to share the owner id.
  const setOnInsert: Partial<UserDoc> = {
    language_code: tg.language_code ?? 'uk',
    funnel_paused: false,
    blocked: false,
    is_admin: isOwner,
    permissions: isOwner ? OWNER_PERMISSIONS : NO_PERMISSIONS,
    created_at: now,
    purchases_count: 0,
    total_spent_uah: 0,
  };
  const set: Partial<UserDoc> = {
    username: tg.username,
    first_name: tg.first_name,
    last_name: tg.last_name,
    last_seen_at: now,
  };

  const result = await users.findOneAndUpdate(
    { tg_id: tg.id },
    { $set: set, $setOnInsert: { tg_id: tg.id, ...setOnInsert } },
    { upsert: true, returnDocument: 'after' },
  );
  if (!result) throw new Error('upsert failed');

  // Re-promote to owner if this user pre-existed without admin rights (e.g. updated env after first /start).
  if (isOwner && !result.is_admin) {
    await users.updateOne(
      { tg_id: tg.id },
      { $set: { is_admin: true, permissions: OWNER_PERMISSIONS } },
    );
    return { ...result, is_admin: true, permissions: OWNER_PERMISSIONS };
  }
  return result;
}
