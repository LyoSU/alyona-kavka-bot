import { fetch as undiciFetch } from 'undici';
import { getCollections } from '@/db/client';

type FetchFn = typeof undiciFetch;
type NbuRow = { cc: string; rate: number };

export async function fetchUsdRate(url: string, fetchImpl: FetchFn = undiciFetch): Promise<number> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`NBU: HTTP ${res.status}`);
  const data = (await res.json()) as NbuRow[];
  const usd = data.find((d) => d.cc === 'USD');
  if (!usd || typeof usd.rate !== 'number' || usd.rate <= 0) {
    throw new Error('NBU: no valid USD row');
  }
  return usd.rate;
}

export async function getCachedUsdRate(
  nbuUrl: string,
  fetchImpl: FetchFn = undiciFetch,
): Promise<number> {
  const settings = await getCollections().settings.findOne({ _id: 'singleton' });
  const override = settings?.exchange_rate_manual_override as number | undefined;
  if (typeof override === 'number' && override > 0) return override;

  const cached = settings?.exchange_rate_uah_per_usd as number | undefined;
  const updatedAt = settings?.exchange_rate_updated_at as Date | undefined;
  const stale = !updatedAt || Date.now() - updatedAt.getTime() > 24 * 3600_000;

  if (cached && cached > 0 && !stale) return cached;

  try {
    const rate = await fetchUsdRate(nbuUrl, fetchImpl);
    await getCollections().settings.updateOne(
      { _id: 'singleton' },
      {
        $set: {
          exchange_rate_uah_per_usd: rate,
          exchange_rate_updated_at: new Date(),
        },
      },
      { upsert: true },
    );
    return rate;
  } catch (err) {
    if (cached && cached > 0) return cached; // fall back to stale cache
    throw err;
  }
}
