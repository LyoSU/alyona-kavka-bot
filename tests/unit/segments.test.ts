import { describe, expect, it } from 'vitest';
import { buildSegmentFilter, SEGMENT_LABELS } from '@/domain/broadcasts/segments';

describe('buildSegmentFilter', () => {
  it('always excludes blocked/paused/deleted', () => {
    const f = buildSegmentFilter('all');
    expect(f.blocked).toEqual({ $ne: true });
    expect(f.funnel_paused).toEqual({ $ne: true });
    expect(f.deleted_at).toEqual({ $exists: false });
  });

  it('first_job adds segment', () => {
    expect(buildSegmentFilter('first_job').segment).toBe('first_job');
  });

  it('growing adds segment', () => {
    expect(buildSegmentFilter('growing').segment).toBe('growing');
  });

  it('has_purchased filters purchases_count > 0', () => {
    expect(buildSegmentFilter('has_purchased').purchases_count).toEqual({ $gt: 0 });
  });

  it('no_purchases filters purchases_count == 0', () => {
    expect(buildSegmentFilter('no_purchases').purchases_count).toEqual({ $eq: 0 });
  });

  it('active_7d filters last_seen_at within 7d', () => {
    const f = buildSegmentFilter('active_7d');
    const cutoff = (f.last_seen_at as { $gte: Date }).$gte;
    const ageMs = Date.now() - cutoff.getTime();
    expect(ageMs).toBeGreaterThan(6 * 24 * 3600_000);
    expect(ageMs).toBeLessThan(8 * 24 * 3600_000);
  });

  it('admins filters is_admin', () => {
    expect(buildSegmentFilter('admins').is_admin).toBe(true);
  });

  it('every key has a label', () => {
    const keys: Array<keyof typeof SEGMENT_LABELS> = [
      'all',
      'first_job',
      'growing',
      'has_purchased',
      'no_purchases',
      'active_7d',
      'admins',
    ];
    for (const k of keys) {
      expect(SEGMENT_LABELS[k]).toBeTruthy();
    }
  });
});
