import { describe, expect, it } from 'vitest';
import type { UserDoc } from '@/db/schemas';
import { renderCard } from '@/domain/support/card';
import { NO_PERMISSIONS } from '@/domain/users/repo';

function makeUser(overrides: Partial<UserDoc> = {}): UserDoc {
  return {
    tg_id: 42,
    username: 'olena_p',
    first_name: 'Олена',
    last_name: 'Петренко',
    language_code: 'uk',
    funnel_paused: false,
    blocked: false,
    is_admin: false,
    permissions: NO_PERMISSIONS,
    created_at: new Date('2026-05-16T14:23:00Z'),
    last_seen_at: new Date('2026-05-16T14:23:00Z'),
    purchases_count: 0,
    total_spent_uah: 0,
    ...overrides,
  };
}

describe('renderCard', () => {
  it('includes name, username, tg_id', () => {
    const txt = renderCard(makeUser());
    expect(txt).toContain('Олена Петренко');
    expect(txt).toContain('@olena_p');
    expect(txt).toContain('42');
  });

  it('handles missing username', () => {
    const txt = renderCard(makeUser({ username: undefined }));
    expect(txt).toContain('—');
    expect(txt).not.toContain('@');
  });

  it('shows segment label', () => {
    const txt = renderCard(makeUser({ segment: 'first_job' }));
    expect(txt).toContain('Перша робота');
  });

  it('shows growing segment', () => {
    const txt = renderCard(makeUser({ segment: 'growing' }));
    expect(txt).toContain('Хоче рости');
  });

  it('shows purchase counts', () => {
    const txt = renderCard(makeUser({ purchases_count: 2, total_spent_uah: 1160 }));
    expect(txt).toContain('2 (1160 ₴)');
  });
});
