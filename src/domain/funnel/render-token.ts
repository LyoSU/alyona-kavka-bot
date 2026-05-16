// Per-user "render token" — a monotonically increasing counter that lets
// the latest render of a node cancel any earlier render still in flight.
// Single-process only (in-memory). For horizontal scaling, swap for Redis INCR.

const tokens = new Map<number, number>();

export function newRenderToken(user_tg_id: number): number {
  const next = (tokens.get(user_tg_id) ?? 0) + 1;
  tokens.set(user_tg_id, next);
  return next;
}

export function isLatestRenderToken(user_tg_id: number, token: number): boolean {
  return tokens.get(user_tg_id) === token;
}

// Test-only helper.
export function _resetRenderTokens(): void {
  tokens.clear();
}
