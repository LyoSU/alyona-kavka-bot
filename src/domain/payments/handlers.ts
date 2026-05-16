import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import type { PurchaseDoc } from '@/db/schemas';
import { logger } from '@/lib/logger';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';
import { parseInvoicePayload } from './invoice';

export async function handlePreCheckout(ctx: BotContext): Promise<void> {
  // Prices are static; nothing to verify dynamically. Accept all.
  await ctx.answerPreCheckoutQuery(true);
}

export async function handleSuccessfulPayment(ctx: BotContext): Promise<void> {
  const sp = ctx.message?.successful_payment;
  const tgId = ctx.from?.id;
  if (!sp || !tgId) return;

  const parsed = parseInvoicePayload(sp.invoice_payload);
  if (!parsed) {
    logger().error({ payload: sp.invoice_payload }, 'malformed invoice payload');
    return;
  }

  const product = await getCollections().products.findOne({ product_id: parsed.product_id });
  if (!product) {
    logger().error({ product_id: parsed.product_id }, 'payment for unknown product');
    return;
  }

  const amountUah = sp.total_amount / 100;

  // Idempotency: guard against duplicate insert via unique index on provider_payment_id.
  try {
    const purchase: PurchaseDoc = {
      user_tg_id: tgId,
      product_id: parsed.product_id,
      amount_uah: amountUah,
      amount_original: product.price,
      currency_original: product.currency,
      provider_payment_id: sp.provider_payment_charge_id,
      telegram_payment_charge_id: sp.telegram_payment_charge_id,
      status: 'paid_pending_delivery',
      delivery_attempts: 0,
      created_at: new Date(),
    };
    await getCollections().purchases.insertOne(purchase);
  } catch (err) {
    const msg = (err as { code?: number }).code;
    if (msg === 11000) {
      logger().warn(
        { provider_payment_id: sp.provider_payment_charge_id },
        'duplicate successful_payment ignored',
      );
      return;
    }
    throw err;
  }

  await getCollections().users.updateOne(
    { tg_id: tgId },
    {
      $inc: { purchases_count: 1, total_spent_uah: amountUah },
      $set: { last_seen_at: new Date() },
    },
  );

  await getCollections().events.insertOne({
    user_tg_id: tgId,
    type: 'payment_success',
    payload: {
      product_id: parsed.product_id,
      amount_uah: amountUah,
      currency_original: product.currency,
    },
    at: new Date(),
  });

  const intro =
    product.type === 'digital'
      ? SYSTEM_MESSAGES.payment_success_digital_intro
      : SYSTEM_MESSAGES.payment_success_appointment;
  await ctx.reply(intro);
}
