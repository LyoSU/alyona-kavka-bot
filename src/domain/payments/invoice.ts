import type { Api } from 'grammy';
import type { ProductDoc } from '@/db/schemas';
import { getCachedUsdRate } from './exchange-rate';

export type InvoicePayload = {
  product_id: string;
  amount_uah: number;
  rate_used?: number;
};

export async function sendProductInvoice(opts: {
  api: Api;
  chatId: number;
  product: ProductDoc;
  providerToken: string;
  nbuUrl: string;
}): Promise<InvoicePayload> {
  const { api, chatId, product, providerToken, nbuUrl } = opts;
  let amountUah: number;
  let rate: number | undefined;

  if (product.currency === 'USD') {
    rate = await getCachedUsdRate(nbuUrl);
    amountUah = Math.ceil(product.price * rate);
  } else {
    amountUah = product.price;
  }

  const description =
    product.currency === 'USD'
      ? `${product.description}\n\n≈ $${product.price} за курсом NBU (1$ = ${rate?.toFixed(2)} ₴)`
      : product.description;

  // unique payload per invoice (timestamp suffix) — захист від повторного pre_checkout
  const payload = `${product.product_id}:${Date.now()}`;

  await api.sendInvoice(
    chatId,
    product.title,
    description,
    payload,
    'UAH',
    [{ label: product.title, amount: amountUah * 100 }],
    { provider_token: providerToken },
  );

  return rate !== undefined
    ? { product_id: product.product_id, amount_uah: amountUah, rate_used: rate }
    : { product_id: product.product_id, amount_uah: amountUah };
}

export function parseInvoicePayload(payload: string): { product_id: string } | null {
  const idx = payload.indexOf(':');
  if (idx === -1) return null;
  const product_id = payload.slice(0, idx);
  if (!product_id) return null;
  return { product_id };
}
