import * as Sentry from '@sentry/node';

export function initSentry(dsn: string | undefined, env: string): void {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: env,
    tracesSampleRate: 0.05,
  });
}

export function captureError(err: unknown, ctx?: Record<string, unknown>): void {
  Sentry.captureException(err, ctx ? { extra: ctx } : undefined);
}
