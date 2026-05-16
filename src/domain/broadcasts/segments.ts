import type { Filter } from 'mongodb';
import type { UserDoc } from '@/db/schemas';

export type SegmentKey =
  | 'all'
  | 'first_job'
  | 'growing'
  | 'has_purchased'
  | 'no_purchases'
  | 'active_7d'
  | 'admins';

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: '👤 Усі активні',
  first_job: '🎓 Перша робота',
  growing: '📈 Хоче рости',
  has_purchased: '💰 Купували',
  no_purchases: '🌿 Без купівель',
  active_7d: '⚡ Активні 7 днів',
  admins: '🛠 Тільки адміни',
};

export function buildSegmentFilter(seg: SegmentKey): Filter<UserDoc> {
  const base: Filter<UserDoc> = {
    blocked: { $ne: true },
    funnel_paused: { $ne: true },
    deleted_at: { $exists: false },
  };
  switch (seg) {
    case 'all':
      return base;
    case 'first_job':
      return { ...base, segment: 'first_job' };
    case 'growing':
      return { ...base, segment: 'growing' };
    case 'has_purchased':
      return { ...base, purchases_count: { $gt: 0 } };
    case 'no_purchases':
      return { ...base, purchases_count: { $eq: 0 } };
    case 'active_7d': {
      const cutoff = new Date(Date.now() - 7 * 24 * 3600_000);
      return { ...base, last_seen_at: { $gte: cutoff } };
    }
    case 'admins':
      return { ...base, is_admin: true };
  }
}
