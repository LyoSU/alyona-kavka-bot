export class RateLimiter {
  private hits = new Map<number, number[]>();
  private lastPrune = Date.now();
  private readonly PRUNE_INTERVAL_MS = 60_000;

  constructor(private opts: { max: number; windowMs: number }) {}

  private prune(now: number): void {
    if (now - this.lastPrune < this.PRUNE_INTERVAL_MS) return;
    this.lastPrune = now;
    const cutoff = now - this.opts.windowMs;
    for (const [k, arr] of this.hits) {
      const filtered = arr.filter((t) => t > cutoff);
      if (filtered.length === 0) this.hits.delete(k);
      else if (filtered.length !== arr.length) this.hits.set(k, filtered);
    }
  }

  allow(key: number, now = Date.now()): boolean {
    this.prune(now);
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
