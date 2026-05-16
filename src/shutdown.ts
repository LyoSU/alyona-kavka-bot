import type { run } from '@grammyjs/runner';
import { closeDb } from '@/db/client';
import { logger } from '@/lib/logger';

type Runner = ReturnType<typeof run>;

export function installShutdown(opts: {
  runner: Runner;
  httpStop: () => Promise<void>;
}): void {
  let stopping = false;
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger().info({ signal }, 'shutdown start');
    try {
      await opts.runner.stop();
      await opts.httpStop();
      await closeDb();
      logger().info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger().error({ err }, 'shutdown error');
      process.exit(1);
    }
  };
  process.once('SIGTERM', () => void stop('SIGTERM'));
  process.once('SIGINT', () => void stop('SIGINT'));
}
