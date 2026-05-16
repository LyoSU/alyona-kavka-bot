import { describe, expect, it } from 'vitest';
import { createLogger } from '@/lib/logger';

describe('logger', () => {
  it('redacts PII fields', () => {
    const logs: Array<Record<string, unknown>> = [];
    const logger = createLogger({
      level: 'info',
      destination: (s: string) => logs.push(JSON.parse(s)),
    });
    logger.info(
      {
        username: 'olena',
        first_name: 'Olena',
        last_name: 'P',
        text: 'secret',
        caption: 'hidden',
        safe: 'ok',
      },
      'user-action',
    );
    const entry = logs[0];
    if (!entry) throw new Error('no log entry');
    expect(entry.username).toBe('[REDACTED]');
    expect(entry.first_name).toBe('[REDACTED]');
    expect(entry.last_name).toBe('[REDACTED]');
    expect(entry.text).toBe('[REDACTED]');
    expect(entry.caption).toBe('[REDACTED]');
    expect(entry.safe).toBe('ok');
  });

  it('redacts nested PII fields one level deep', () => {
    const logs: Array<Record<string, unknown>> = [];
    const logger = createLogger({
      level: 'info',
      destination: (s: string) => logs.push(JSON.parse(s)),
    });
    logger.info({ user: { username: 'x', id: 1 } }, 'nested');
    const entry = logs[0] as { user: { username: string; id: number } };
    expect(entry.user.username).toBe('[REDACTED]');
    expect(entry.user.id).toBe(1);
  });

  it('includes service base field', () => {
    const logs: Array<Record<string, unknown>> = [];
    const logger = createLogger({
      level: 'info',
      destination: (s: string) => logs.push(JSON.parse(s)),
    });
    logger.info('hello');
    expect(logs[0]?.service).toBe('alyona-bot');
  });
});
