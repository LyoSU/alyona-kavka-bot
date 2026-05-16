import { describe, expect, it } from 'vitest';
import { RateLimiter } from '@/bot/middlewares/anti-spam';

describe('RateLimiter', () => {
  it('allows up to N within window', () => {
    const rl = new RateLimiter({ max: 3, windowMs: 1000 });
    const now = 1000;
    expect(rl.allow(1, now)).toBe(true);
    expect(rl.allow(1, now + 100)).toBe(true);
    expect(rl.allow(1, now + 200)).toBe(true);
    expect(rl.allow(1, now + 300)).toBe(false);
  });

  it('resets after window', () => {
    const rl = new RateLimiter({ max: 2, windowMs: 1000 });
    expect(rl.allow(1, 0)).toBe(true);
    expect(rl.allow(1, 100)).toBe(true);
    expect(rl.allow(1, 200)).toBe(false);
    expect(rl.allow(1, 1500)).toBe(true);
  });

  it('isolates per key', () => {
    const rl = new RateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.allow(1, 0)).toBe(true);
    expect(rl.allow(2, 0)).toBe(true);
    expect(rl.allow(1, 100)).toBe(false);
  });

  it('cleans expired hits from the buffer', () => {
    const rl = new RateLimiter({ max: 100, windowMs: 1000 });
    for (let i = 0; i < 100; i++) rl.allow(1, i);
    expect(rl.size(1)).toBe(100);
    rl.allow(1, 2000);
    expect(rl.size(1)).toBe(1);
  });
});
