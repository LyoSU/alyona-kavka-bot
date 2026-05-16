import { describe, expect, it } from 'vitest';
import { loadEnv } from '@/config/env';

const base = {
  NODE_ENV: 'production',
  BOT_TOKEN: '123:abc',
  PORT: '3000',
  MONGO_URI: 'mongodb://localhost:27017/test',
  OWNER_TG_IDS: '111,222',
  LIQPAY_PROVIDER_TOKEN: 'token',
  LIQPAY_TEST_MODE: 'false',
  MASTER_KEY: 'a'.repeat(64),
  SENTRY_DSN: '',
  LOG_LEVEL: 'info',
};

describe('loadEnv', () => {
  it('parses valid env', () => {
    const env = loadEnv(base);
    expect(env.OWNER_TG_IDS).toEqual([111, 222]);
    expect(env.BOT_TOKEN).toBe('123:abc');
    expect(env.LIQPAY_TEST_MODE).toBe(false);
  });

  it('rejects short MASTER_KEY', () => {
    expect(() => loadEnv({ ...base, MASTER_KEY: 'short' })).toThrow();
  });

  it('rejects empty OWNER_TG_IDS', () => {
    expect(() => loadEnv({ ...base, OWNER_TG_IDS: '' })).toThrow();
  });

  it('rejects non-numeric OWNER_TG_IDS', () => {
    expect(() => loadEnv({ ...base, OWNER_TG_IDS: '111,not-a-number' })).toThrow();
  });

  it('coerces LIQPAY_TEST_MODE properly', () => {
    const env = loadEnv({ ...base, LIQPAY_TEST_MODE: 'true' });
    expect(env.LIQPAY_TEST_MODE).toBe(true);
  });

  it('uses default NBU_API_URL', () => {
    const env = loadEnv(base);
    expect(env.NBU_API_URL).toContain('bank.gov.ua');
  });
});
