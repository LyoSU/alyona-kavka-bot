export class RateLimiter {
  private hits = new Map<number, number[]>();

  constructor(private opts: { max: number; windowMs: number }) {}

  allow(key: number, now = Date.now()): boolean {
    const cutoff = now - this.opts.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.opts.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  size(key: number): number {
    return this.hits.get(key)?.length ?? 0;
  }
}

export const supportLimiter = new RateLimiter({ max: 10, windowMs: 60_000 });
