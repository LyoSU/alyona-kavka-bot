import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'username',
  '*.username',
  'first_name',
  '*.first_name',
  'last_name',
  '*.last_name',
  'text',
  '*.text',
  'caption',
  '*.caption',
  'provider_payment_id',
  '*.provider_payment_id',
  'provider_payment_charge_id',
  '*.provider_payment_charge_id',
  'telegram_payment_charge_id',
  '*.telegram_payment_charge_id',
  'phone_number',
  '*.phone_number',
];

export function createLogger(
  opts: { level?: LoggerOptions['level']; destination?: (line: string) => void } = {},
): Logger {
  const level = opts.level ?? 'info';
  const baseOptions: LoggerOptions = {
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    base: { service: 'alyona-bot' },
  };
  if (opts.destination) {
    const dest = opts.destination;
    return pino(baseOptions, { write: (s: string) => dest(s) });
  }
  return pino(baseOptions);
}

let _logger: Logger | null = null;

export function logger(): Logger {
  if (!_logger) {
    _logger = createLogger({
      level: process.env.LOG_LEVEL as LoggerOptions['level'],
    });
  }
  return _logger;
}
