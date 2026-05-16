import { z } from 'zod';

const csvNumber = z
  .string()
  .min(1)
  .transform((s, ctx) => {
    const parts = s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'cannot be empty' });
      return z.NEVER;
    }
    const out: number[] = [];
    for (const p of parts) {
      const n = Number(p);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: 'custom', message: `not a number: ${p}` });
        return z.NEVER;
      }
      out.push(n);
    }
    return out;
  });

const Schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  BOT_TOKEN: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z
    .string()
    .refine((s) => s.startsWith('mongodb'), 'must start with mongodb'),
  MONGO_DB_NAME: z.string().default('alyona_bot'),
  OWNER_TG_IDS: csvNumber,
  LIQPAY_PROVIDER_TOKEN: z.string().min(1),
  LIQPAY_TEST_MODE: z
    .string()
    .transform((s) => s === 'true' || s === '1')
    .default('false'),
  MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'MASTER_KEY must be 64 hex chars (32 bytes)'),
  SENTRY_DSN: z.string().optional().or(z.literal('')),
  NBU_API_URL: z
    .string()
    .default(
      'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json',
    ),
});

export type Env = z.infer<typeof Schema>;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((e) => `  ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid env:\n${msg}`);
  }
  return parsed.data;
}
