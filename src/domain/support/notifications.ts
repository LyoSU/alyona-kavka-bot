import type { Api } from 'grammy';
import { getCollections } from '@/db/client';

function fmtNow(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

async function getTopic(user_tg_id: number) {
  return getCollections().support_topics.findOne({ user_tg_id });
}

export async function notifyPurchase(
  api: Api,
  user_tg_id: number,
  title: string,
  amount_uah: number,
  payment_id: string,
): Promise<void> {
  const t = await getTopic(user_tg_id);
  if (!t) return;
  await api.sendMessage(
    t.chat_id,
    `🟢 КУПІВЛЯ\n${title}\n${amount_uah} ₴\n${fmtNow()} · pay-id: ${payment_id}`,
    { message_thread_id: t.thread_id },
  );
}

export async function notifyAppointmentRequest(
  api: Api,
  user_tg_id: number,
  title: string,
  amount_uah: number,
): Promise<void> {
  const t = await getTopic(user_tg_id);
  if (!t) return;
  await api.sendMessage(
    t.chat_id,
    `🟠 ЗАЯВКА\n${title} · ${amount_uah} ₴\n❗ Потребує реакції — узгодити час`,
    { message_thread_id: t.thread_id },
  );
}

export async function notifyDeliveryFailure(
  api: Api,
  user_tg_id: number,
  info: string,
): Promise<void> {
  const t = await getTopic(user_tg_id);
  if (!t) return;
  await api.sendMessage(t.chat_id, `🔴 Помилка доставки: ${info}`, {
    message_thread_id: t.thread_id,
  });
}

export async function notifyFunnelStep(
  api: Api,
  user_tg_id: number,
  node_id: string,
): Promise<void> {
  // Throttle: only one per (user, node) per hour to avoid spam.
  const cutoff = new Date(Date.now() - 60 * 60_000);
  const recent = await getCollections().events.findOne({
    user_tg_id,
    type: 'funnel_step_notified',
    'payload.node_id': node_id,
    at: { $gte: cutoff },
  });
  if (recent) return;
  await getCollections().events.insertOne({
    user_tg_id,
    type: 'funnel_step_notified',
    payload: { node_id },
    at: new Date(),
  });
  const t = await getTopic(user_tg_id);
  if (!t) return;
  await api.sendMessage(t.chat_id, `🔵 Дійшов до: ${node_id}`, {
    message_thread_id: t.thread_id,
  });
}
