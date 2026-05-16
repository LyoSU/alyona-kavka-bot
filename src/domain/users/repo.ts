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

export async function upsertUserFromTg(
  tg: TgUser,
  ownerIds: number[],
): Promise<UserDoc> {
  const { users } = getCollections();
  const now = new Date();
  const isOwner = ownerIds.includes(tg.id);

  const existing = await users.findOne({ tg_id: tg.id });
  if (existing) {
    const update: Partial<UserDoc> = {
      username: tg.username,
      first_name: tg.first_name,
      last_name: tg.last_name,
      language_code: tg.language_code ?? existing.language_code ?? 'uk',
      last_seen_at: now,
    };
    if (isOwner && !existing.is_admin) {
      update.is_admin = true;
      update.permissions = OWNER_PERMISSIONS;
    }
    await users.updateOne({ tg_id: tg.id }, { $set: update });
    const fresh = await users.findOne({ tg_id: tg.id });
    if (!fresh) throw new Error('user disappeared');
    return fresh;
  }

  const doc: UserDoc = {
    tg_id: tg.id,
    username: tg.username,
    first_name: tg.first_name,
    last_name: tg.last_name,
    language_code: tg.language_code ?? 'uk',
    funnel_paused: false,
    blocked: false,
    is_admin: isOwner,
    permissions: isOwner ? OWNER_PERMISSIONS : NO_PERMISSIONS,
    created_at: now,
    last_seen_at: now,
    purchases_count: 0,
    total_spent_uah: 0,
  };
  await users.insertOne(doc);
  return doc;
}
