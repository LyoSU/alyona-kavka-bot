import { describe, expect, it, vi } from 'vitest';
import { requirePermission } from '@/bot/middlewares/permission';
import { NO_PERMISSIONS, OWNER_PERMISSIONS } from '@/domain/users/repo';

function fakeCtx(perms = NO_PERMISSIONS, reply = vi.fn(async () => undefined)) {
  return {
    state: { user: { permissions: perms } },
    reply,
  } as never;
}

describe('requirePermission', () => {
  it('calls next when permission present', async () => {
    const next = vi.fn(async () => undefined);
    await requirePermission('broadcast')(fakeCtx(OWNER_PERMISSIONS), next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks when missing', async () => {
    const next = vi.fn(async () => undefined);
    const reply = vi.fn(async () => undefined);
    await requirePermission('broadcast')(fakeCtx(NO_PERMISSIONS, reply), next);
    expect(next).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledOnce();
  });

  it('blocks if user missing entirely', async () => {
    const next = vi.fn(async () => undefined);
    const reply = vi.fn(async () => undefined);
    const ctx = { state: {}, reply } as never;
    await requirePermission('manage_admins')(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledOnce();
  });
});
