// Per-user "render token" — monotonically increasing counter that lets the
// latest render cancel earlier ones still in flight.
// Single-process only (in-memory). For horizontal scaling, swap for Redis INCR.

type Entry = { token: number; touched: number };

const tokens = new Map<number, Entry>();
const TTL_MS = 30 * 60_000; // 30 min — way longer than any render
const MAX_ENTRIES = 10_000;

function maybePrune(now: number): void {
  if (tokens.size < MAX_ENTRIES) return;
  for (const [k, v] of tokens) {
    if (now - v.touched > TTL_MS) tokens.delete(k);
  }
  // If still too big after TTL prune, drop the oldest 25% by `touched`.
  if (tokens.size >= MAX_ENTRIES) {
    const sorted = [...tokens.entries()].sort((a, b) => a[1].touched - b[1].touched);
    const drop = Math.floor(sorted.length / 4);
    for (let i = 0; i < drop; i++) tokens.delete(sorted[i]?.[0] ?? 0);
  }
}

export function newRenderToken(user_tg_id: number): number {
  const now = Date.now();
  maybePrune(now);
  const prev = tokens.get(user_tg_id)?.token ?? 0;
  const next = prev + 1;
  tokens.set(user_tg_id, { token: next, touched: now });
  return next;
}

export function isLatestRenderToken(user_tg_id: number, token: number): boolean {
  return tokens.get(user_tg_id)?.token === token;
}

// Test-only helper.
export function _resetRenderTokens(): void {
  tokens.clear();
}
