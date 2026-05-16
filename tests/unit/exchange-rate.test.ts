import { describe, expect, it, vi } from 'vitest';
import { fetchUsdRate } from '@/domain/payments/exchange-rate';

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as never;
}

describe('fetchUsdRate', () => {
  it('parses NBU response', async () => {
    const fakeFetch = vi.fn(async () =>
      ok([{ r030: 840, txt: 'Долар США', rate: 41.23, cc: 'USD', exchangedate: '16.05.2026' }]),
    ) as never;
    const rate = await fetchUsdRate('https://example', fakeFetch);
    expect(rate).toBeCloseTo(41.23);
  });

  it('throws when no USD row', async () => {
    const fakeFetch = vi.fn(async () => ok([{ cc: 'EUR', rate: 45 }])) as never;
    await expect(fetchUsdRate('https://example', fakeFetch)).rejects.toThrow();
  });

  it('throws on bad HTTP', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => [],
    })) as never;
    await expect(fetchUsdRate('https://example', fakeFetch)).rejects.toThrow();
  });

  it('throws on zero rate', async () => {
    const fakeFetch = vi.fn(async () => ok([{ cc: 'USD', rate: 0 }])) as never;
    await expect(fetchUsdRate('https://example', fakeFetch)).rejects.toThrow();
  });
});
