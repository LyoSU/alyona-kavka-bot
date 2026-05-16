import type { Api } from 'grammy';
import { getCollections } from '@/db/client';
import { bold, code, escapeHtml } from '@/lib/html';

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
  const text =
    `${bold('🟢 КУПІВЛЯ')}\n` +
    `${escapeHtml(title)}\n` +
    `${amount_uah} ₴\n` +
    `${escapeHtml(fmtNow())} · pay-id: ${code(payment_id)}`;
  await api.sendMessage(t.chat_id, text, {
    message_thread_id: t.thread_id,
    parse_mode: 'HTML',
  });
}

export async function notifyAppointmentRequest(
  api: Api,
  user_tg_id: number,
  title: string,
  amount_uah: number,
): Promise<void> {
  const t = await getTopic(user_tg_id);
  if (!t) return;
  const text =
    `${bold('🟠 ЗАЯВКА')}\n` +
    `${escapeHtml(title)} · ${amount_uah} ₴\n` +
    '❗ Потребує реакції — узгодити час';
  await api.sendMessage(t.chat_id, text, {
    message_thread_id: t.thread_id,
    parse_mode: 'HTML',
  });
}

export async function notifyDeliveryFailure(
  api: Api,
  user_tg_id: number,
  info: string,
): Promise<void> {
  const t = await getTopic(user_tg_id);
  if (!t) return;
  await api.sendMessage(t.chat_id, `${bold('🔴 Помилка доставки')}: ${escapeHtml(info)}`, {
    message_thread_id: t.thread_id,
    parse_mode: 'HTML',
  });
}

export async function notifyFunnelStep(
  api: Api,
  user_tg_id: number,
  node_id: string,
): Promise<void> {
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
  await api.sendMessage(t.chat_id, `🔵 Дійшов до: ${code(node_id)}`, {
    message_thread_id: t.thread_id,
    parse_mode: 'HTML',
  });
}
