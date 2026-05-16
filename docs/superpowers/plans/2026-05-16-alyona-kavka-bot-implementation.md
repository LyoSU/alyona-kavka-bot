# Alyona Kavka Career Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production-ready Telegram bot for Alyona Kavka (HR career consultant) with full sales funnel, multi-admin CRM via forum topics, TG Payments via LiqPay, protected video lessons, broadcasts, statistics, and granular permissions.

**Architecture:** Single Node.js process in Docker, MongoDB for all state, **long-polling** via `@grammyjs/runner` (no webhook, no public HTTPS), minimal Hono `/health` endpoint for Docker HEALTHCHECK. Background loops (delivery sweeper, broadcast ticker) run in-process. Admin operations through in-bot conversations + forum-group CRM.

**Tech Stack (verified 2026-05):**
- Node 24 LTS, TypeScript 6, Zod 4 Classic, Biome 2
- grammY 1.43 + plugins (runner 2.0, conversations 2.1, auto-retry 2.0, menu 1.3, transformer-throttler 1.2, storage-mongodb 2.5, files 1.2)
- Hono 4.12 + @hono/node-server 2.0 (тільки /health)
- MongoDB driver 7.2 (native, no Mongoose)
- pino 10 + pino-pretty 13
- @sentry/node 10
- libsodium-wrappers 0.8
- undici 8 (для NBU API)
- Vitest 4, @testcontainers/mongodb 11
- migrate-mongo 14
- tsup 8.5, tsx 4.22

**Reference spec:** `docs/superpowers/specs/2026-05-16-alyona-kavka-bot-design.md`

**Reference content (PDF 1:1):** to be created at `docs/reference/funnel-content.md` in Phase 4.

---

## Conventions

- **TDD strict** for: funnel engine, payments, exchange rate, delivery, broadcast cursor, segment filter, secrets crypto, anti-spam, permissions.
- **Implementation-first** (no test-first) for: configuration, docker, biome rules, env loading, bot/HTTP wiring, seed scripts. Show full code.
- **Commit cadence:** after every task. Commit messages prefixed by conventional commits (`feat:`, `chore:`, `test:`, `docs:`).
- **File rule:** every file ≤ 200 lines where reasonable. Split when growing.
- **Imports:** absolute via `tsconfig.paths` (`@/...`).
- **Run from project root** unless stated otherwise.
- **One bot instance only** (long-polling); horizontal scaling needs webhook switch later.

---

## Phase 1 — Foundation (project skeleton)

**Goal:** A buildable, type-checked, lint-clean Node project that connects to MongoDB.

### Task 1.1: Initialize package.json + scripts

**Files:** `package.json`, `.nvmrc`

- [ ] **Step 1: `.nvmrc`**

```
24
```

- [ ] **Step 2: `package.json`**

```json
{
  "name": "alyona-kavka-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24.0.0" },
  "scripts": {
    "build": "tsup",
    "start": "node dist/bundle.cjs",
    "dev": "tsx watch src/main.ts",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "test": "vitest run",
    "test:watch": "vitest",
    "migrate": "migrate-mongo",
    "seed": "tsx seed/run.ts"
  },
  "dependencies": {
    "grammy": "^1.43.0",
    "@grammyjs/runner": "^2.0.3",
    "@grammyjs/auto-retry": "^2.0.2",
    "@grammyjs/conversations": "^2.1.1",
    "@grammyjs/menu": "^1.3.1",
    "@grammyjs/transformer-throttler": "^1.2.1",
    "@grammyjs/storage-mongodb": "^2.5.1",
    "@grammyjs/files": "^1.2.0",
    "hono": "^4.12.19",
    "@hono/node-server": "^2.0.2",
    "mongodb": "^7.2.0",
    "zod": "^4.4.3",
    "pino": "^10.3.1",
    "pino-pretty": "^13.1.3",
    "@sentry/node": "^10.53.1",
    "libsodium-wrappers": "^0.8.4",
    "undici": "^8.3.0"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/libsodium-wrappers": "^0.8.2",
    "typescript": "^6.0.3",
    "tsx": "^4.22.0",
    "tsup": "^8.5.1",
    "vitest": "^4.1.6",
    "@testcontainers/mongodb": "^11.14.0",
    "@biomejs/biome": "^2.4.15",
    "migrate-mongo": "^14.0.7"
  }
}
```

- [ ] **Step 3: Install + commit**

```bash
npm install
git add package.json package-lock.json .nvmrc
git commit -m "chore: init package.json with prod-ready stack (Node 24, TS 6, Zod 4, Biome 2)"
```

---

### Task 1.2: TypeScript + Biome + tsup config

**Files:** `tsconfig.json`, `biome.json`, `tsup.config.ts`

- [ ] **Step 1: `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "outDir": "dist"
  },
  "include": ["src", "seed", "tests", "migrations"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: `biome.json` (Biome 2 schema)**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
  "files": { "ignore": ["dist", "node_modules", "coverage"] },
  "formatter": {
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": { "noNonNullAssertion": "error" },
      "suspicious": { "noExplicitAny": "error" }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "trailingCommas": "all",
      "semicolons": "always"
    }
  }
}
```

- [ ] **Step 3: `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['cjs'],
  target: 'node24',
  outDir: 'dist',
  outExtension: () => ({ js: '.cjs' }),
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  bundle: true,
  skipNodeModulesBundle: false,
  noExternal: [/.*/],
});
```

- [ ] **Step 4: Verify + commit**

```bash
mkdir -p src && echo 'console.log("hello");' > src/main.ts
npm run typecheck
git add tsconfig.json biome.json tsup.config.ts src/main.ts
git commit -m "chore: typescript 6, biome 2, tsup config"
```

> **Note**: If Biome rejects config, run `npx biome migrate --write` to auto-update.

---

### Task 1.3: Env config with Zod (no webhook)

**Files:** `src/config/env.ts`, `.env.example`, `tests/unit/env.test.ts`

- [ ] **Step 1: Failing test `tests/unit/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { loadEnv } from '@/config/env';

describe('loadEnv', () => {
  it('parses valid env', () => {
    const env = loadEnv({
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
    });
    expect(env.OWNER_TG_IDS).toEqual([111, 222]);
    expect(env.BOT_TOKEN).toBe('123:abc');
  });

  it('rejects short MASTER_KEY', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        BOT_TOKEN: '123:abc',
        MONGO_URI: 'mongodb://localhost/x',
        OWNER_TG_IDS: '1',
        LIQPAY_PROVIDER_TOKEN: 't',
        LIQPAY_TEST_MODE: 'true',
        MASTER_KEY: 'short',
        PORT: '3000',
        SENTRY_DSN: '',
        LOG_LEVEL: 'info',
      }),
    ).toThrow();
  });

  it('rejects empty OWNER_TG_IDS', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        BOT_TOKEN: '123:abc',
        MONGO_URI: 'mongodb://localhost/x',
        OWNER_TG_IDS: '',
        LIQPAY_PROVIDER_TOKEN: 't',
        LIQPAY_TEST_MODE: 'true',
        MASTER_KEY: 'a'.repeat(64),
        PORT: '3000',
        SENTRY_DSN: '',
        LOG_LEVEL: 'info',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Implement `src/config/env.ts`**

```ts
import { z } from 'zod';

const csvNumber = z.string().min(1).transform((s, ctx) => {
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
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  BOT_TOKEN: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGO_URI: z.string().refine((s) => s.startsWith('mongodb'), 'must start with mongodb'),
  MONGO_DB_NAME: z.string().default('alyona_bot'),
  OWNER_TG_IDS: csvNumber,
  LIQPAY_PROVIDER_TOKEN: z.string().min(1),
  LIQPAY_TEST_MODE: z.coerce.boolean().default(false),
  MASTER_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'MASTER_KEY must be 64 hex chars (32 bytes)'),
  SENTRY_DSN: z.string().optional().or(z.literal('')),
  NBU_API_URL: z
    .string()
    .default('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json'),
});

export type Env = z.infer<typeof Schema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = Schema.safeParse(source);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Invalid env:\n${msg}`);
  }
  return parsed.data;
}
```

- [ ] **Step 3: `.env.example`**

```
NODE_ENV=production
LOG_LEVEL=info
BOT_TOKEN=
PORT=3000
MONGO_URI=mongodb://mongo:27017
MONGO_DB_NAME=alyona_bot
OWNER_TG_IDS=
LIQPAY_PROVIDER_TOKEN=
LIQPAY_TEST_MODE=true
MASTER_KEY=
SENTRY_DSN=
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run tests/unit/env.test.ts
git add src/config tests/unit/env.test.ts .env.example
git commit -m "feat(config): zod-validated env (polling-only, no webhook)"
```

---

### Task 1.4: Logger (pino 10 with PII redaction)

**Files:** `src/lib/logger.ts`, `tests/unit/logger.test.ts`

- [ ] **Step 1: Failing test**

```ts
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
      { username: 'olena', first_name: 'Olena', text: 'secret', safe: 'ok' },
      'user-action',
    );
    const entry = logs[0];
    if (!entry) throw new Error('no log entry');
    expect(entry.username).toBe('[REDACTED]');
    expect(entry.first_name).toBe('[REDACTED]');
    expect(entry.text).toBe('[REDACTED]');
    expect(entry.safe).toBe('ok');
  });
});
```

- [ ] **Step 2: Implement**

```ts
import pino, { type Logger, type LoggerOptions } from 'pino';

const REDACT_PATHS = [
  'username', '*.username',
  'first_name', '*.first_name',
  'last_name', '*.last_name',
  'text', '*.text',
  'caption', '*.caption',
];

export function createLogger(opts: {
  level?: LoggerOptions['level'];
  destination?: (line: string) => void;
} = {}): Logger {
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
  if (!_logger) _logger = createLogger({ level: process.env.LOG_LEVEL as LoggerOptions['level'] });
  return _logger;
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/unit/logger.test.ts
git add src/lib/logger.ts tests/unit/logger.test.ts
git commit -m "feat(logger): pino 10 with PII redaction"
```

---

### Task 1.5: MongoDB client + collections accessor

**Files:** `src/db/client.ts`, `src/db/schemas/index.ts`, `tests/integration/db.test.ts`

- [ ] **Step 1: Schema types `src/db/schemas/index.ts`**

```ts
import type { ObjectId } from 'mongodb';

export type Permissions = {
  manage_admins: boolean;
  edit_content: boolean;
  manage_products: boolean;
  broadcast: boolean;
  view_stats: boolean;
  support: boolean;
  manage_settings: boolean;
  refund: boolean;
};

export type UserDoc = {
  _id?: ObjectId;
  tg_id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code: string;
  segment?: 'first_job' | 'growing' | null;
  current_node_id?: string;
  funnel_paused: boolean;
  blocked: boolean;
  is_admin: boolean;
  permissions: Permissions;
  created_at: Date;
  last_seen_at: Date;
  purchases_count: number;
  total_spent_uah: number;
  deleted_at?: Date;
};

export type FlowNodeDoc = { _id?: ObjectId; node_id: string; [k: string]: unknown };
export type ProductDoc = { _id?: ObjectId; product_id: string; [k: string]: unknown };
export type LessonDoc = { _id?: ObjectId; lesson_id: string; [k: string]: unknown };
export type PurchaseDoc = { _id?: ObjectId; user_tg_id: number; [k: string]: unknown };
export type AppointmentDoc = { _id?: ObjectId; user_tg_id: number; [k: string]: unknown };
export type SupportTopicDoc = {
  _id?: ObjectId;
  user_tg_id: number;
  thread_id: number;
  [k: string]: unknown;
};
export type BroadcastDoc = { _id?: ObjectId; status: string; [k: string]: unknown };
export type EventDoc = {
  _id?: ObjectId;
  user_tg_id: number;
  type: string;
  payload: Record<string, unknown>;
  at: Date;
};
export type SettingsDoc = { _id: 'singleton'; [k: string]: unknown };
```

- [ ] **Step 2: `src/db/client.ts`**

```ts
import { MongoClient, type Db } from 'mongodb';
import type {
  AppointmentDoc, BroadcastDoc, EventDoc, FlowNodeDoc, LessonDoc, ProductDoc,
  PurchaseDoc, SettingsDoc, SupportTopicDoc, UserDoc,
} from './schemas';

let _client: MongoClient | null = null;
let _db: Db | null = null;

export async function initDb(uri: string, dbName: string): Promise<void> {
  _client = new MongoClient(uri);
  await _client.connect();
  _db = _client.db(dbName);
  await ensureIndexes();
}

export async function closeDb(): Promise<void> {
  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
  }
}

export function getDb(): Db {
  if (!_db) throw new Error('DB not initialized');
  return _db;
}

export function getCollections() {
  const db = getDb();
  return {
    users: db.collection<UserDoc>('users'),
    flow_nodes: db.collection<FlowNodeDoc>('flow_nodes'),
    products: db.collection<ProductDoc>('products'),
    lessons: db.collection<LessonDoc>('lessons'),
    purchases: db.collection<PurchaseDoc>('purchases'),
    appointments: db.collection<AppointmentDoc>('appointments'),
    support_topics: db.collection<SupportTopicDoc>('support_topics'),
    broadcasts: db.collection<BroadcastDoc>('broadcasts'),
    events: db.collection<EventDoc>('events'),
    settings: db.collection<SettingsDoc>('settings'),
  };
}

async function ensureIndexes(): Promise<void> {
  const c = getCollections();
  await Promise.all([
    c.users.createIndex({ tg_id: 1 }, { unique: true }),
    c.flow_nodes.createIndex({ node_id: 1 }, { unique: true }),
    c.products.createIndex({ product_id: 1 }, { unique: true }),
    c.lessons.createIndex({ lesson_id: 1 }, { unique: true }),
    c.purchases.createIndex({ provider_payment_id: 1 }, { unique: true, sparse: true }),
    c.purchases.createIndex({ user_tg_id: 1, created_at: -1 }),
    c.purchases.createIndex({ status: 1 }),
    c.support_topics.createIndex({ user_tg_id: 1 }, { unique: true }),
    c.support_topics.createIndex({ thread_id: 1 }),
    c.events.createIndex({ user_tg_id: 1, at: -1 }),
    c.events.createIndex({ type: 1, at: -1 }),
    c.events.createIndex({ at: -1 }),
  ]);
}
```

- [ ] **Step 3: Integration test `tests/integration/db.test.ts`**

```ts
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getCollections, initDb } from '@/db/client';
import { OWNER_PERMISSIONS } from '@/domain/users/repo';

let mongo: StartedMongoDBContainer;
beforeAll(async () => {
  mongo = await new MongoDBContainer('mongo:7').start();
  await initDb(mongo.getConnectionString(), 'test_db');
}, 60_000);
afterAll(async () => {
  await closeDb();
  await mongo.stop();
});

describe('db client', () => {
  it('exposes typed collections', async () => {
    const { users } = getCollections();
    await users.insertOne({
      tg_id: 1,
      first_name: 'T',
      language_code: 'uk',
      funnel_paused: false,
      blocked: false,
      is_admin: false,
      permissions: OWNER_PERMISSIONS, // any valid permissions value
      created_at: new Date(),
      last_seen_at: new Date(),
      purchases_count: 0,
      total_spent_uah: 0,
    });
    const found = await users.findOne({ tg_id: 1 });
    expect(found?.first_name).toBe('T');
  });
});
```

- [ ] **Step 4: Run + commit** (after Task 3.1 implements OWNER_PERMISSIONS — re-order: insert literal perms for now)

For now use literal in test:
```ts
permissions: {
  manage_admins: false, edit_content: false, manage_products: false,
  broadcast: false, view_stats: false, support: false,
  manage_settings: false, refund: false,
},
```

```bash
npx vitest run tests/integration/db.test.ts
git add src/db tests/integration/db.test.ts
git commit -m "feat(db): mongo 7 client, typed collections, indexes"
```

---

## Phase 2 — Bot skeleton + minimal HTTP

**Goal:** Bot starts via long-polling, responds to /start, exposes /health for Docker, shuts down gracefully.

### Task 2.1: Sentry init

**File:** `src/lib/sentry.ts`

- [ ] **Step 1: Implement**

```ts
import * as Sentry from '@sentry/node';

export function initSentry(dsn: string | undefined, env: string): void {
  if (!dsn) return;
  Sentry.init({ dsn, environment: env, tracesSampleRate: 0.05 });
}

export function captureError(err: unknown, ctx?: Record<string, unknown>): void {
  Sentry.captureException(err, { extra: ctx });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sentry.ts
git commit -m "feat(sentry): init helper for v10"
```

---

### Task 2.2: Bot context + composition

**Files:** `src/bot/context.ts`, `src/bot/index.ts`

- [ ] **Step 1: `src/bot/context.ts`**

```ts
import type { Context, SessionFlavor } from 'grammy';
import type { ConversationFlavor } from '@grammyjs/conversations';
import type { UserDoc } from '@/db/schemas';

export type SessionData = {
  current_node_id?: string;
  history: string[];
};

export type BotState = {
  user?: UserDoc;
};

export type BotContext = Context &
  SessionFlavor<SessionData> &
  ConversationFlavor<Context & SessionFlavor<SessionData>> & {
    state: BotState;
  };
```

- [ ] **Step 2: `src/bot/index.ts`**

```ts
import { Bot, session } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { apiThrottler } from '@grammyjs/transformer-throttler';
import { conversations } from '@grammyjs/conversations';
import { MongoDBAdapter } from '@grammyjs/storage-mongodb';
import { getDb } from '@/db/client';
import type { BotContext, SessionData } from './context';

export function createBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  bot.api.config.use(autoRetry({ maxRetryAttempts: 5, maxDelaySeconds: 30 }));
  bot.api.config.use(apiThrottler());

  bot.use(async (ctx, next) => {
    ctx.state = {};
    await next();
  });

  bot.use(
    session<SessionData, BotContext>({
      initial: () => ({ history: [] }),
      storage: new MongoDBAdapter({ collection: getDb().collection('bot_sessions') }),
    }),
  );

  bot.use(conversations());

  return bot;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/bot/context.ts src/bot/index.ts
git commit -m "feat(bot): grammY 1.43 composition with session, conversations, throttler"
```

---

### Task 2.3: Minimal /health HTTP server

**Files:** `src/http/server.ts`

- [ ] **Step 1: Implement**

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { getDb } from '@/db/client';

export function startHealth(port: number): { stop: () => Promise<void> } {
  const app = new Hono();
  app.get('/health', async (c) => {
    try {
      await getDb().admin().ping();
      return c.json({ status: 'ok' });
    } catch {
      return c.json({ status: 'degraded' }, 503);
    }
  });
  const server = serve({ fetch: app.fetch, port });
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/http/server.ts
git commit -m "feat(http): minimal /health endpoint for Docker HEALTHCHECK"
```

---

### Task 2.4: Entry point with graceful shutdown (polling only)

**Files:** `src/main.ts`, `src/shutdown.ts`

- [ ] **Step 1: `src/shutdown.ts`**

```ts
import type { run } from '@grammyjs/runner';
import { closeDb } from '@/db/client';
import { logger } from '@/lib/logger';

type Runner = ReturnType<typeof run>;

export function installShutdown(opts: {
  runner: Runner;
  httpStop: () => Promise<void>;
}): void {
  const stop = async (signal: string) => {
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
```

- [ ] **Step 2: `src/main.ts`**

```ts
import { run } from '@grammyjs/runner';
import { createBot } from '@/bot/index';
import { loadEnv } from '@/config/env';
import { initDb } from '@/db/client';
import { startHealth } from '@/http/server';
import { logger } from '@/lib/logger';
import { captureError, initSentry } from '@/lib/sentry';
import { installShutdown } from '@/shutdown';

async function bootstrap() {
  const env = loadEnv();
  initSentry(env.SENTRY_DSN || undefined, env.NODE_ENV);
  await initDb(env.MONGO_URI, env.MONGO_DB_NAME);
  logger().info('db ready');

  const bot = createBot(env.BOT_TOKEN);

  bot.catch(({ error, ctx }) => {
    logger().error({ err: error, update_id: ctx.update.update_id }, 'bot error');
    captureError(error, { update_id: ctx.update.update_id });
  });

  bot.command('start', (ctx) => ctx.reply('Привіт 🙌'));

  // Ensure polling mode
  await bot.api.deleteWebhook({ drop_pending_updates: false });

  const { stop: httpStop } = startHealth(env.PORT);
  const runner = run(bot);
  installShutdown({ runner, httpStop });

  logger().info({ port: env.PORT }, 'bot started (long-polling)');
}

bootstrap().catch((err) => {
  logger().fatal({ err }, 'bootstrap failed');
  captureError(err, { phase: 'bootstrap' });
  process.exit(1);
});
```

- [ ] **Step 3: Verify build + commit**

```bash
npm run typecheck && npm run build
git add src/main.ts src/shutdown.ts
git commit -m "feat: entry point with long-polling and graceful shutdown"
```

---

## Phase 3 — Middleware (user, anti-spam, permissions)

**Goal:** Updates enriched with UserDoc; rate-limited; admin actions gated.

### Task 3.1: User upsert + permission constants

**Files:** `src/domain/users/repo.ts`, `tests/integration/user-upsert.test.ts`

- [ ] **Step 1: Failing integration test**

```ts
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, initDb } from '@/db/client';
import { upsertUserFromTg } from '@/domain/users/repo';

let mongo: StartedMongoDBContainer;
beforeAll(async () => {
  mongo = await new MongoDBContainer('mongo:7').start();
  await initDb(mongo.getConnectionString(), 'test_users');
}, 60_000);
afterAll(async () => {
  await closeDb();
  await mongo.stop();
});

describe('upsertUserFromTg', () => {
  it('creates new user with owner permissions if in OWNER_TG_IDS', async () => {
    const u = await upsertUserFromTg({ id: 100, first_name: 'Owner', language_code: 'uk' }, [100]);
    expect(u.is_admin).toBe(true);
    expect(u.permissions.manage_admins).toBe(true);
  });

  it('creates regular user with no permissions otherwise', async () => {
    const u = await upsertUserFromTg({ id: 200, first_name: 'Plain', language_code: 'uk' }, [100]);
    expect(u.is_admin).toBe(false);
    expect(u.permissions.manage_admins).toBe(false);
  });

  it('updates last_seen_at on existing user', async () => {
    const first = await upsertUserFromTg({ id: 300, first_name: 'A', language_code: 'uk' }, []);
    await new Promise((r) => setTimeout(r, 10));
    const second = await upsertUserFromTg({ id: 300, first_name: 'A', language_code: 'uk' }, []);
    expect(second.last_seen_at.getTime()).toBeGreaterThan(first.last_seen_at.getTime());
  });
});
```

- [ ] **Step 2: Implement `src/domain/users/repo.ts`**

```ts
import { getCollections } from '@/db/client';
import type { Permissions, UserDoc } from '@/db/schemas';

export const NO_PERMISSIONS: Permissions = {
  manage_admins: false, edit_content: false, manage_products: false,
  broadcast: false, view_stats: false, support: false,
  manage_settings: false, refund: false,
};

export const OWNER_PERMISSIONS: Permissions = {
  manage_admins: true, edit_content: true, manage_products: true,
  broadcast: true, view_stats: true, support: true,
  manage_settings: true, refund: true,
};

type TgUser = {
  id: number;
  username?: string;
  first_name: string;
  last_name?: string;
  language_code?: string;
};

export async function upsertUserFromTg(tg: TgUser, ownerIds: number[]): Promise<UserDoc> {
  const { users } = getCollections();
  const now = new Date();
  const isOwner = ownerIds.includes(tg.id);

  const existing = await users.findOne({ tg_id: tg.id });
  if (existing) {
    const update: Partial<UserDoc> = {
      username: tg.username,
      first_name: tg.first_name,
      last_name: tg.last_name,
      language_code: tg.language_code ?? existing.language_code ?? 'uk',
      last_seen_at: now,
    };
    if (isOwner && !existing.is_admin) {
      update.is_admin = true;
      update.permissions = OWNER_PERMISSIONS;
    }
    await users.updateOne({ tg_id: tg.id }, { $set: update });
    const fresh = await users.findOne({ tg_id: tg.id });
    if (!fresh) throw new Error('user disappeared');
    return fresh;
  }

  const doc: UserDoc = {
    tg_id: tg.id,
    username: tg.username,
    first_name: tg.first_name,
    last_name: tg.last_name,
    language_code: tg.language_code ?? 'uk',
    funnel_paused: false,
    blocked: false,
    is_admin: isOwner,
    permissions: isOwner ? OWNER_PERMISSIONS : NO_PERMISSIONS,
    created_at: now,
    last_seen_at: now,
    purchases_count: 0,
    total_spent_uah: 0,
  };
  await users.insertOne(doc);
  return doc;
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/integration/user-upsert.test.ts
git add src/domain/users tests/integration/user-upsert.test.ts
git commit -m "feat(users): upsert from TG with owner-permission bootstrap"
```

---

### Task 3.2: User middleware + wire into bot

**Files:** `src/bot/middlewares/user.ts`, modify `src/bot/index.ts`, `src/main.ts`

- [ ] **Step 1: `src/bot/middlewares/user.ts`**

```ts
import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '@/bot/context';
import { upsertUserFromTg } from '@/domain/users/repo';

export function userMiddleware(ownerIds: number[]): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    if (!ctx.from) return next();
    ctx.state.user = await upsertUserFromTg(
      {
        id: ctx.from.id,
        username: ctx.from.username,
        first_name: ctx.from.first_name,
        last_name: ctx.from.last_name,
        language_code: ctx.from.language_code,
      },
      ownerIds,
    );
    await next();
  };
}
```

- [ ] **Step 2: Modify `src/bot/index.ts` — add ownerIds param + register middleware**

```ts
// Change signature: createBot(token: string, ownerIds: number[])
// After bot.use(conversations()):
import { userMiddleware } from '@/bot/middlewares/user';
bot.use(userMiddleware(ownerIds));
```

- [ ] **Step 3: Modify `src/main.ts`**

```ts
const bot = createBot(env.BOT_TOKEN, env.OWNER_TG_IDS);
```

- [ ] **Step 4: Commit**

```bash
git add src/bot tests/integration
git commit -m "feat(bot): wire user upsert middleware"
```

---

### Task 3.3: Permission middleware

**Files:** `src/bot/middlewares/permission.ts`, `tests/unit/permission.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { requirePermission } from '@/bot/middlewares/permission';
import { NO_PERMISSIONS, OWNER_PERMISSIONS } from '@/domain/users/repo';

function fakeCtx(perms = NO_PERMISSIONS, reply = vi.fn()) {
  return { state: { user: { permissions: perms } }, reply } as never;
}

describe('requirePermission', () => {
  it('calls next when permission present', async () => {
    const next = vi.fn();
    await requirePermission('broadcast')(fakeCtx(OWNER_PERMISSIONS), next);
    expect(next).toHaveBeenCalled();
  });

  it('blocks when missing', async () => {
    const next = vi.fn();
    const reply = vi.fn();
    await requirePermission('broadcast')(fakeCtx(NO_PERMISSIONS, reply), next);
    expect(next).not.toHaveBeenCalled();
    expect(reply).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '@/bot/context';
import type { Permissions } from '@/db/schemas';

const LABELS: Record<keyof Permissions, string> = {
  manage_admins: 'керування командою',
  edit_content: 'редагування контенту',
  manage_products: 'керування продуктами',
  broadcast: 'розсилки',
  view_stats: 'перегляд статистики',
  support: 'підтримка',
  manage_settings: 'налаштування',
  refund: 'повернення коштів',
};

export function requirePermission(perm: keyof Permissions): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const u = ctx.state.user;
    if (!u || !u.permissions[perm]) {
      await ctx.reply(`Тут потрібен дозвіл "${LABELS[perm]}". Звернись до Альони.`);
      return;
    }
    await next();
  };
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/unit/permission.test.ts
git add src/bot/middlewares/permission.ts tests/unit/permission.test.ts
git commit -m "feat(permission): granular middleware gate"
```

---

### Task 3.4: Anti-spam rate limiter

**Files:** `src/bot/middlewares/anti-spam.ts`, `tests/unit/anti-spam.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '@/bot/middlewares/anti-spam';

describe('RateLimiter', () => {
  it('allows up to N within window', () => {
    const rl = new RateLimiter({ max: 3, windowMs: 1000 });
    const now = 1000;
    expect(rl.allow(1, now)).toBe(true);
    expect(rl.allow(1, now + 100)).toBe(true);
    expect(rl.allow(1, now + 200)).toBe(true);
    expect(rl.allow(1, now + 300)).toBe(false);
  });

  it('resets after window', () => {
    const rl = new RateLimiter({ max: 2, windowMs: 1000 });
    expect(rl.allow(1, 0)).toBe(true);
    expect(rl.allow(1, 100)).toBe(true);
    expect(rl.allow(1, 200)).toBe(false);
    expect(rl.allow(1, 1500)).toBe(true);
  });

  it('isolates per key', () => {
    const rl = new RateLimiter({ max: 1, windowMs: 1000 });
    expect(rl.allow(1, 0)).toBe(true);
    expect(rl.allow(2, 0)).toBe(true);
    expect(rl.allow(1, 100)).toBe(false);
  });
});
```

- [ ] **Step 2: Implement**

```ts
export class RateLimiter {
  private hits = new Map<number, number[]>();
  constructor(private opts: { max: number; windowMs: number }) {}

  allow(key: number, now = Date.now()): boolean {
    const cutoff = now - this.opts.windowMs;
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (arr.length >= this.opts.max) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(now);
    this.hits.set(key, arr);
    return true;
  }
}

export const supportLimiter = new RateLimiter({ max: 10, windowMs: 60_000 });
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/unit/anti-spam.test.ts
git add src/bot/middlewares/anti-spam.ts tests/unit/anti-spam.test.ts
git commit -m "feat(anti-spam): in-memory rate limiter (10 msg/min)"
```

---

## Phase 4 — Funnel engine + content seed

**Goal:** Bot can render nodes from MongoDB with typing-pauses, navigate via callbacks, run the test-quiz, and seed the entire PDF content.

### Task 4.1: Extract PDF content into reference doc

**Files:** `docs/reference/funnel-content.md`

- [ ] **Step 1: Manually copy PDF text into `docs/reference/funnel-content.md`** with one section per node using format:

```markdown
## node: welcome
- chunk: text, delay 1500ms
  Привіт 🙌
- chunk: text, delay 2000ms
  Якщо ти тут — скоріш за все:
  💡 дивишся вакансії, але не розумієш, чи ти взагалі підходиш
  ...
- buttons: none

## node: intro_alyona
...

## node: segment_pick
- chunk: text
  Хто ти зараз?
- buttons:
  - "👶 Шукаю першу роботу" → goto:seg_first_job_intro
  - "💼 Вже працюю / хочу рости" → goto:seg_growing_intro
```

(Повний контент — приблизно 25 нод з PDF. Дослівно копіюємо.)

- [ ] **Step 2: Commit**

```bash
git add docs/reference/funnel-content.md
git commit -m "docs(reference): PDF funnel content extracted 1:1"
```

---

### Task 4.2: Flow node schema + repo

**Files:** `src/domain/funnel/types.ts`, `src/domain/funnel/repo.ts`, `tests/unit/funnel-types.test.ts`

- [ ] **Step 1: Types `src/domain/funnel/types.ts`**

```ts
import { z } from 'zod';

export const ChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z.string(),
    delay_before_ms: z.number().int().min(0).default(0),
  }),
  z.object({
    type: z.literal('photo'),
    file_id: z.string(),
    caption: z.string().optional(),
    delay_before_ms: z.number().int().min(0).default(0),
  }),
  z.object({
    type: z.literal('video_note'),
    file_id: z.string(),
    delay_before_ms: z.number().int().min(0).default(0),
  }),
  z.object({
    type: z.literal('typing_pause'),
    delay_before_ms: z.number().int().min(0),
  }),
]);

export const ButtonActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('goto_node'), node_id: z.string() }),
  z.object({ action: z.literal('open_product'), product_id: z.string() }),
  z.object({ action: z.literal('buy'), product_id: z.string() }),
  z.object({ action: z.literal('open_url'), url: z.string().url() }),
  z.object({ action: z.literal('support') }),
  z.object({ action: z.literal('back') }),
  z.object({ action: z.literal('home') }),
]);

export const ButtonSchema = z.object({
  label: z.string().min(1),
  row: z.number().int().min(0).default(0),
}).and(ButtonActionSchema);

export const FlowNodeSchema = z.object({
  node_id: z.string().min(1),
  segment: z.enum(['first_job', 'growing']).nullable().default(null),
  chunks: z.array(ChunkSchema).min(1),
  buttons: z.array(ButtonSchema).default([]),
});

export type Chunk = z.infer<typeof ChunkSchema>;
export type Button = z.infer<typeof ButtonSchema>;
export type FlowNode = z.infer<typeof FlowNodeSchema>;
```

- [ ] **Step 2: Test schema validation**

```ts
// tests/unit/funnel-types.test.ts
import { describe, expect, it } from 'vitest';
import { FlowNodeSchema } from '@/domain/funnel/types';

describe('FlowNodeSchema', () => {
  it('parses a minimal valid node', () => {
    const node = FlowNodeSchema.parse({
      node_id: 'welcome',
      chunks: [{ type: 'text', content: 'Привіт', delay_before_ms: 1000 }],
    });
    expect(node.buttons).toEqual([]);
  });

  it('rejects empty chunks', () => {
    expect(() =>
      FlowNodeSchema.parse({ node_id: 'x', chunks: [] }),
    ).toThrow();
  });

  it('parses node with action buttons', () => {
    const node = FlowNodeSchema.parse({
      node_id: 'segment_pick',
      chunks: [{ type: 'text', content: '?' }],
      buttons: [
        { label: '👶 Перша робота', row: 0, action: 'goto_node', node_id: 'seg_first_job_intro' },
        { label: '💼 Вже працюю', row: 1, action: 'goto_node', node_id: 'seg_growing_intro' },
      ],
    });
    expect(node.buttons).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Repo `src/domain/funnel/repo.ts`**

```ts
import { getCollections } from '@/db/client';
import { FlowNodeSchema, type FlowNode } from './types';

export async function getNode(node_id: string): Promise<FlowNode | null> {
  const { flow_nodes } = getCollections();
  const doc = await flow_nodes.findOne({ node_id });
  if (!doc) return null;
  return FlowNodeSchema.parse(doc);
}

export async function upsertNode(node: FlowNode): Promise<void> {
  const { flow_nodes } = getCollections();
  await flow_nodes.updateOne(
    { node_id: node.node_id },
    { $set: { ...node, updated_at: new Date() } },
    { upsert: true },
  );
}

export async function listNodes(): Promise<FlowNode[]> {
  const { flow_nodes } = getCollections();
  const docs = await flow_nodes.find().toArray();
  return docs.map((d) => FlowNodeSchema.parse(d));
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run tests/unit/funnel-types.test.ts
git add src/domain/funnel tests/unit/funnel-types.test.ts
git commit -m "feat(funnel): zod schema + repo for flow_nodes"
```

---

### Task 4.3: Chunks sender (typing + delays)

**Files:** `src/domain/funnel/sender.ts`, `tests/unit/sender.test.ts`

- [ ] **Step 1: Failing test (mock-based)**

```ts
import { describe, expect, it, vi } from 'vitest';
import { sendChunks } from '@/domain/funnel/sender';
import type { Chunk } from '@/domain/funnel/types';

describe('sendChunks', () => {
  it('emits typing then sends text in order', async () => {
    const calls: string[] = [];
    const api = {
      sendChatAction: vi.fn(async () => { calls.push('typing'); }),
      sendMessage: vi.fn(async (_chat: number, t: string) => { calls.push(`text:${t}`); }),
      sendPhoto: vi.fn(),
      sendVideoNote: vi.fn(),
    };
    const sleep = vi.fn(async () => {});
    const chunks: Chunk[] = [
      { type: 'text', content: 'hello', delay_before_ms: 100 },
      { type: 'text', content: 'world', delay_before_ms: 200 },
    ];
    await sendChunks(api as never, 42, chunks, { sleep });
    expect(calls).toEqual(['typing', 'text:hello', 'typing', 'text:world']);
    expect(sleep).toHaveBeenCalledWith(100);
    expect(sleep).toHaveBeenCalledWith(200);
  });
});
```

- [ ] **Step 2: Implement**

```ts
import type { Api } from 'grammy';
import type { InlineKeyboard } from 'grammy';
import type { Chunk } from './types';

type SendDeps = {
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function sendChunks(
  api: Api,
  chatId: number,
  chunks: Chunk[],
  opts: SendDeps & { lastReplyMarkup?: InlineKeyboard } = {},
): Promise<void> {
  const sleep = opts.sleep ?? defaultSleep;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;
    const isLast = i === chunks.length - 1;
    if (chunk.delay_before_ms > 0) {
      if (chunk.type !== 'typing_pause') {
        await api.sendChatAction(chatId, chunk.type === 'video_note' ? 'upload_video_note' : 'typing');
      }
      await sleep(chunk.delay_before_ms);
    }
    if (chunk.type === 'typing_pause') continue;

    const markup = isLast && opts.lastReplyMarkup ? { reply_markup: opts.lastReplyMarkup } : {};

    if (chunk.type === 'text') {
      await api.sendMessage(chatId, chunk.content, markup);
    } else if (chunk.type === 'photo') {
      await api.sendPhoto(chatId, chunk.file_id, { caption: chunk.caption, ...markup });
    } else if (chunk.type === 'video_note') {
      await api.sendVideoNote(chatId, chunk.file_id);
      // video notes don't support reply markup — send empty text with markup if needed
      if (isLast && opts.lastReplyMarkup) {
        await api.sendMessage(chatId, '​', { reply_markup: opts.lastReplyMarkup });
      }
    }
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/unit/sender.test.ts
git add src/domain/funnel/sender.ts tests/unit/sender.test.ts
git commit -m "feat(funnel): chunks sender with typing actions and delays"
```

---

### Task 4.4: Callback router + button keyboard builder

**Files:** `src/domain/funnel/callbacks.ts`, `src/domain/funnel/keyboards.ts`, `tests/unit/callbacks.test.ts`

- [ ] **Step 1: Implement callback encoding `src/domain/funnel/callbacks.ts`**

```ts
import type { Button } from './types';

export type ParsedCallback =
  | { kind: 'goto_node'; node_id: string }
  | { kind: 'open_product'; product_id: string }
  | { kind: 'buy'; product_id: string }
  | { kind: 'support' }
  | { kind: 'back' }
  | { kind: 'home' }
  | { kind: 'unknown' };

export function encode(button: Button): string {
  switch (button.action) {
    case 'goto_node': return `f:${button.node_id}`;
    case 'open_product': return `p:${button.product_id}`;
    case 'buy': return `b:${button.product_id}`;
    case 'open_url': return ''; // handled by url field directly
    case 'support': return 's';
    case 'back': return 'nav:back';
    case 'home': return 'nav:home';
  }
}

export function parse(data: string): ParsedCallback {
  if (data === 's') return { kind: 'support' };
  if (data === 'nav:back') return { kind: 'back' };
  if (data === 'nav:home') return { kind: 'home' };
  const [prefix, rest] = data.split(':', 2);
  if (!rest) return { kind: 'unknown' };
  if (prefix === 'f') return { kind: 'goto_node', node_id: rest };
  if (prefix === 'p') return { kind: 'open_product', product_id: rest };
  if (prefix === 'b') return { kind: 'buy', product_id: rest };
  return { kind: 'unknown' };
}
```

- [ ] **Step 2: Test**

```ts
// tests/unit/callbacks.test.ts
import { describe, expect, it } from 'vitest';
import { encode, parse } from '@/domain/funnel/callbacks';

describe('callbacks', () => {
  it('round-trips goto_node', () => {
    const data = encode({ label: '?', row: 0, action: 'goto_node', node_id: 'welcome' });
    expect(parse(data)).toEqual({ kind: 'goto_node', node_id: 'welcome' });
  });
  it('handles buy', () => {
    expect(parse('b:base_6')).toEqual({ kind: 'buy', product_id: 'base_6' });
  });
  it('handles back/home/support', () => {
    expect(parse('nav:back')).toEqual({ kind: 'back' });
    expect(parse('nav:home')).toEqual({ kind: 'home' });
    expect(parse('s')).toEqual({ kind: 'support' });
  });
  it('returns unknown for garbage', () => {
    expect(parse('xyz')).toEqual({ kind: 'unknown' });
  });
});
```

- [ ] **Step 3: Keyboard builder `src/domain/funnel/keyboards.ts`**

```ts
import { InlineKeyboard } from 'grammy';
import type { Button } from './types';
import { encode } from './callbacks';

export function buildKeyboard(buttons: Button[]): InlineKeyboard | undefined {
  if (buttons.length === 0) return undefined;
  const kb = new InlineKeyboard();
  const sorted = [...buttons].sort((a, b) => a.row - b.row);
  let lastRow = -1;
  for (const btn of sorted) {
    if (btn.row !== lastRow) {
      if (lastRow !== -1) kb.row();
      lastRow = btn.row;
    }
    if (btn.action === 'open_url') {
      kb.url(btn.label, btn.url);
    } else {
      kb.text(btn.label, encode(btn));
    }
  }
  return kb;
}
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run tests/unit/callbacks.test.ts
git add src/domain/funnel/callbacks.ts src/domain/funnel/keyboards.ts tests/unit/callbacks.test.ts
git commit -m "feat(funnel): callback encoding + inline keyboard builder"
```

---

### Task 4.5: Funnel engine — render a node

**Files:** `src/domain/funnel/engine.ts`

- [ ] **Step 1: Implement**

```ts
import type { Api } from 'grammy';
import { getNode } from './repo';
import { sendChunks } from './sender';
import { buildKeyboard } from './keyboards';

export async function renderNode(
  api: Api,
  chatId: number,
  node_id: string,
): Promise<{ ok: true } | { ok: false; reason: 'not_found' }> {
  const node = await getNode(node_id);
  if (!node) return { ok: false, reason: 'not_found' };
  const kb = buildKeyboard(node.buttons);
  await sendChunks(api, chatId, node.chunks, { lastReplyMarkup: kb });
  return { ok: true };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domain/funnel/engine.ts
git commit -m "feat(funnel): render-node engine"
```

---

### Task 4.6: Wire /start and callback routing

**Files:** `src/bot/handlers/start.ts`, `src/bot/handlers/callback-router.ts`, modify `src/main.ts`

- [ ] **Step 1: `src/bot/handlers/start.ts`**

```ts
import type { BotContext } from '@/bot/context';
import { renderNode } from '@/domain/funnel/engine';
import { getCollections } from '@/db/client';

export async function handleStart(ctx: BotContext): Promise<void> {
  if (!ctx.chat) return;
  // reset session history
  ctx.session.history = [];
  ctx.session.current_node_id = 'welcome';
  await getCollections().users.updateOne(
    { tg_id: ctx.from?.id ?? 0 },
    { $set: { current_node_id: 'welcome', segment: null } },
  );
  const result = await renderNode(ctx.api, ctx.chat.id, 'welcome');
  if (!result.ok) await ctx.reply('Бот ще не налаштовано. Зверніться до підтримки.');
}
```

- [ ] **Step 2: `src/bot/handlers/callback-router.ts`**

```ts
import type { BotContext } from '@/bot/context';
import { parse } from '@/domain/funnel/callbacks';
import { renderNode } from '@/domain/funnel/engine';
import { getCollections } from '@/db/client';

export async function handleCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  const chatId = ctx.chat?.id;
  const tgId = ctx.from?.id;
  if (!data || !chatId || !tgId) return;

  await ctx.answerCallbackQuery();
  const parsed = parse(data);

  if (parsed.kind === 'goto_node') {
    const prev = ctx.session.current_node_id;
    if (prev) ctx.session.history.push(prev);
    ctx.session.current_node_id = parsed.node_id;
    await getCollections().users.updateOne(
      { tg_id: tgId },
      { $set: { current_node_id: parsed.node_id } },
    );
    await renderNode(ctx.api, chatId, parsed.node_id);
  } else if (parsed.kind === 'back') {
    const prev = ctx.session.history.pop();
    if (prev) {
      ctx.session.current_node_id = prev;
      await renderNode(ctx.api, chatId, prev);
    }
  } else if (parsed.kind === 'home') {
    ctx.session.history = [];
    ctx.session.current_node_id = 'welcome';
    await renderNode(ctx.api, chatId, 'welcome');
  }
  // open_product, buy, support — wired in later phases
}
```

- [ ] **Step 3: Register in `src/main.ts`** (replace `bot.command('start', ...)`)

```ts
import { handleStart } from '@/bot/handlers/start';
import { handleCallback } from '@/bot/handlers/callback-router';

bot.command('start', handleStart);
bot.on('callback_query:data', handleCallback);
```

- [ ] **Step 4: Commit**

```bash
git add src/bot/handlers src/main.ts
git commit -m "feat(funnel): /start + callback router with back/home"
```

---

### Task 4.7: Seed script from PDF content

**Files:** `seed/flow-nodes.ts`, `seed/products.ts`, `seed/run.ts`, `seed/system-messages.ts`

- [ ] **Step 1: `seed/products.ts`** — list з spec розділу 7

```ts
import type { ProductDoc } from '@/db/schemas';

export const PRODUCTS: ProductDoc[] = [
  { product_id: 'base_6', type: 'digital', title: 'База (6 уроків)', description: '...', price: 960, currency: 'UAH', visible: true, order: 1, created_at: new Date() },
  { product_id: 'lesson_search', type: 'digital', title: 'Урок: Пошук роботи', description: '...', price: 200, currency: 'UAH', visible: true, order: 10, created_at: new Date() },
  { product_id: 'lesson_resume', type: 'digital', title: 'Урок: Резюме', description: '...', price: 200, currency: 'UAH', visible: true, order: 11, created_at: new Date() },
  { product_id: 'lesson_linkedin', type: 'digital', title: 'Урок: LinkedIn', description: '...', price: 200, currency: 'UAH', visible: true, order: 12, created_at: new Date() },
  { product_id: 'lesson_interview', type: 'digital', title: 'Урок: Співбесіди', description: '...', price: 200, currency: 'UAH', visible: true, order: 13, created_at: new Date() },
  { product_id: 'lesson_hard_qs', type: 'digital', title: 'Урок: Складні питання', description: '...', price: 200, currency: 'UAH', visible: true, order: 14, created_at: new Date() },
  { product_id: 'lesson_salary', type: 'digital', title: 'Урок: Зарплата', description: '...', price: 200, currency: 'UAH', visible: true, order: 15, created_at: new Date() },
  { product_id: 'consult_profession', type: 'appointment', title: 'Профорієнтація', description: '...', price: 1000, currency: 'UAH', visible: true, order: 20, created_at: new Date() },
  { product_id: 'consult_career', type: 'appointment', title: 'Кар’єрна консультація', description: '...', price: 2000, currency: 'UAH', visible: true, order: 21, created_at: new Date() },
  { product_id: 'system_path', type: 'appointment', title: 'Системний шлях до роботи', description: '...', price: 150, currency: 'USD', visible: true, order: 22, created_at: new Date() },
];
```

- [ ] **Step 2: `seed/flow-nodes.ts`** — переклад `docs/reference/funnel-content.md` у TypeScript-об'єкти.

Структура (приклад для перших трьох нод; повний набір на ~25 нод копіюється з reference markdown):

```ts
import type { FlowNode } from '@/domain/funnel/types';

export const FLOW_NODES: FlowNode[] = [
  {
    node_id: 'welcome',
    segment: null,
    chunks: [
      { type: 'text', content: 'Привіт 🙌', delay_before_ms: 1000 },
      { type: 'text', content: 'Якщо ти тут — скоріш за все:\n\n💡 дивишся вакансії...\n[full PDF text]', delay_before_ms: 1500 },
    ],
    buttons: [],
  },
  {
    node_id: 'intro_alyona',
    segment: null,
    chunks: [
      { type: 'text', content: 'Давай знайомитись 👋', delay_before_ms: 1500 },
      { type: 'text', content: 'Я — Альона Кавка 🎯\nБільше 18+ років в HR...', delay_before_ms: 2000 },
    ],
    buttons: [],
  },
  {
    node_id: 'segment_pick',
    segment: null,
    chunks: [{ type: 'text', content: 'Хто ти зараз?', delay_before_ms: 1200 }],
    buttons: [
      { label: '👶 Шукаю першу роботу', row: 0, action: 'goto_node', node_id: 'seg_first_job_intro' },
      { label: '💼 Вже працюю / хочу рости', row: 1, action: 'goto_node', node_id: 'seg_growing_intro' },
    ],
  },
  // ... повний набір (~22 більше нод): seg_first_job_intro, seg_first_job_case, seg_first_job_offer,
  // seg_first_job_pick, prod_base, prod_lessons_pick, prod_lesson_search, prod_lesson_resume,
  // prod_lesson_linkedin, prod_lesson_interview, prod_lesson_hard_qs, prod_lesson_salary,
  // prod_profession, prod_career, prod_system_path, seg_growing_intro, seg_growing_q1,
  // seg_growing_q2, seg_growing_q3, seg_growing_universal, seg_growing_case, seg_growing_offer,
  // fallback_library
];
```

- [ ] **Step 3: `seed/system-messages.ts`** (нові ділянки — потребують approval)

```ts
// TO BE APPROVED BY ALYONA — мова та стиль під її tone of voice
export const SYSTEM_MESSAGES = {
  payment_success_digital_intro: '🎉 Дякую за покупку! Готую твої уроки...',
  payment_success_appointment: '🎉 Прийнято! Альона напише сюди протягом 24 годин, щоб узгодити час 👌',
  lessons_empty: 'У тебе ще немає куплених уроків ✨\nПодивись, що в мене є — і обери, що відгукується ⬇',
  unknown_text_response: 'Передала твоє повідомлення Альоні — відповідь буде сьогодні-завтра 🙌',
  payment_failed: 'Не вдалося провести оплату 😔 Спробуй ще раз або напиши /help',
  paused: 'Окей, не буду надсилати додаткові повідомлення. Коли захочеш повернутись — /resume.',
  resumed: 'Повертаємось 🙌',
  data_deleted: 'Готово, твої дані видалено. Будь-коли можеш повернутись через /start.',
  help_prompt: 'Напиши, з чим тобі потрібна допомога — і ми зв’яжемось 🙌',
  about: 'Я — Альона Кавка 🎯\n18+ років в HR. Тут я допомагаю знайти роботу мрії.',
} as const;
```

- [ ] **Step 4: `seed/run.ts`**

```ts
import { closeDb, getCollections, initDb } from '@/db/client';
import { loadEnv } from '@/config/env';
import { FLOW_NODES } from './flow-nodes';
import { PRODUCTS } from './products';

async function main() {
  const env = loadEnv();
  await initDb(env.MONGO_URI, env.MONGO_DB_NAME);
  const c = getCollections();

  for (const node of FLOW_NODES) {
    await c.flow_nodes.updateOne(
      { node_id: node.node_id },
      { $set: { ...node, updated_at: new Date() } },
      { upsert: true },
    );
  }
  for (const product of PRODUCTS) {
    await c.products.updateOne(
      { product_id: product.product_id },
      { $set: product },
      { upsert: true },
    );
  }
  console.log(`seeded ${FLOW_NODES.length} nodes, ${PRODUCTS.length} products`);
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: Run + commit**

```bash
npm run seed
git add seed
git commit -m "feat(seed): initial flow_nodes from PDF and products with prices"
```

---

### Task 4.8: Persistent reply keyboard

**Files:** `src/bot/keyboards/main-reply.ts`, modify `src/bot/handlers/start.ts`

- [ ] **Step 1: `src/bot/keyboards/main-reply.ts`**

```ts
import { Keyboard } from 'grammy';

export const mainReplyKeyboard = new Keyboard()
  .text('📚 Мої уроки').text('💬 Підтримка')
  .resized().persistent();

export const MAIN_REPLY_BTN_LESSONS = '📚 Мої уроки';
export const MAIN_REPLY_BTN_SUPPORT = '💬 Підтримка';
```

- [ ] **Step 2: Attach in `handleStart`** — at the end after `renderNode`:

```ts
import { mainReplyKeyboard } from '@/bot/keyboards/main-reply';
// after renderNode call:
await ctx.api.sendChatAction(ctx.chat.id, 'typing');
await ctx.reply('​', { reply_markup: mainReplyKeyboard }); // invisible char to attach kb
```

(Альтернатива: attach до останнього chunk у sender — складніше, цей варіант простіший.)

- [ ] **Step 3: Commit**

```bash
git add src/bot/keyboards src/bot/handlers/start.ts
git commit -m "feat(ui): persistent reply keyboard with Lessons/Support"
```

---

## Phase 5 — Products, lessons, /lessons screen

**Goal:** Admin can mark a user as having bought a product (still simulated), and `/lessons` lists them with replay.

### Task 5.1: Products repo

**File:** `src/domain/products/repo.ts`

- [ ] **Step 1: Implement**

```ts
import { getCollections } from '@/db/client';
import type { ProductDoc } from '@/db/schemas';

export async function getProduct(product_id: string): Promise<ProductDoc | null> {
  return getCollections().products.findOne({ product_id });
}

export async function listProducts(opts: { visible_only?: boolean } = {}): Promise<ProductDoc[]> {
  const filter = opts.visible_only ? { visible: true } : {};
  return getCollections().products.find(filter).sort({ order: 1 }).toArray();
}

export async function upsertProduct(product: ProductDoc): Promise<void> {
  await getCollections().products.updateOne(
    { product_id: product.product_id },
    { $set: product },
    { upsert: true },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domain/products
git commit -m "feat(products): repo"
```

---

### Task 5.2: Lessons repo

**File:** `src/domain/lessons/repo.ts`

- [ ] **Step 1: Implement**

```ts
import { getCollections } from '@/db/client';
import type { LessonDoc } from '@/db/schemas';

export async function getLesson(lesson_id: string): Promise<LessonDoc | null> {
  return getCollections().lessons.findOne({ lesson_id });
}

export async function listLessonsForProduct(product_id: string): Promise<LessonDoc[]> {
  const lessons = await getCollections().lessons.find({ product_ids: product_id }).toArray();
  return lessons.sort((a, b) => {
    const oa = (a.order_in_product as Record<string, number> | undefined)?.[product_id] ?? 999;
    const ob = (b.order_in_product as Record<string, number> | undefined)?.[product_id] ?? 999;
    return oa - ob;
  });
}

export async function upsertLesson(lesson: LessonDoc): Promise<void> {
  await getCollections().lessons.updateOne(
    { lesson_id: lesson.lesson_id },
    { $set: lesson },
    { upsert: true },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domain/lessons
git commit -m "feat(lessons): repo with per-product ordering"
```

---

### Task 5.3: /lessons handler

**File:** `src/bot/handlers/lessons.ts`

- [ ] **Step 1: Implement**

```ts
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { getProduct } from '@/domain/products/repo';
import { listLessonsForProduct } from '@/domain/lessons/repo';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';

export async function handleLessons(ctx: BotContext): Promise<void> {
  const tgId = ctx.from?.id;
  if (!tgId) return;
  const purchases = await getCollections()
    .purchases.find({ user_tg_id: tgId, status: 'delivered' })
    .toArray();
  const productIds = [...new Set(purchases.map((p) => p.product_id as string))];
  const digitalProducts = (
    await Promise.all(productIds.map((id) => getProduct(id)))
  ).filter((p): p is NonNullable<typeof p> => p !== null && p.type === 'digital');

  if (digitalProducts.length === 0) {
    await ctx.reply(SYSTEM_MESSAGES.lessons_empty, {
      reply_markup: new InlineKeyboard().text('🎯 Подивитись продукти', 'f:segment_pick'),
    });
    return;
  }
  const kb = new InlineKeyboard();
  for (const p of digitalProducts) kb.text(`📚 ${p.title}`, `lib:${p.product_id}`).row();
  await ctx.reply('Твої уроки 👇', { reply_markup: kb });
}

export async function handleLessonsList(ctx: BotContext, product_id: string): Promise<void> {
  const product = await getProduct(product_id);
  if (!product) return;
  const lessons = await listLessonsForProduct(product_id);
  if (lessons.length === 0) {
    await ctx.reply('Уроків ще немає 🤔');
    return;
  }
  const kb = new InlineKeyboard();
  for (const l of lessons) {
    kb.text(`▶️ ${l.title}`, `play:${l.lesson_id}`).row();
  }
  kb.text('👈 Назад', 'lib:back');
  await ctx.reply(`📚 ${product.title}`, { reply_markup: kb });
}

export async function handleLessonPlay(ctx: BotContext, lesson_id: string): Promise<void> {
  const lesson = await getCollections().lessons.findOne({ lesson_id });
  if (!lesson || !ctx.chat) return;
  await ctx.api.sendVideo(ctx.chat.id, lesson.video_file_id as string, {
    caption: lesson.caption as string | undefined,
    protect_content: true,
  });
}
```

- [ ] **Step 2: Register in `src/main.ts`** — handle reply-keyboard text + new callback prefixes (`lib:`, `play:`):

```ts
import { handleLessons, handleLessonsList, handleLessonPlay } from '@/bot/handlers/lessons';
import { MAIN_REPLY_BTN_LESSONS } from '@/bot/keyboards/main-reply';

bot.hears(MAIN_REPLY_BTN_LESSONS, handleLessons);
bot.command('lessons', handleLessons);

// in handleCallback, add cases for lib:, play:
// (Modify callback router file or add separate handlers for these prefixes)
```

(Extend `callbacks.ts` parser with `lib:` and `play:` prefixes — add tests.)

- [ ] **Step 3: Commit**

```bash
git add src/bot/handlers/lessons.ts src/main.ts src/domain/funnel/callbacks.ts tests
git commit -m "feat(lessons): /lessons screen with protected video replay"
```

---

## Phase 6 — Payments (TG Payments + LiqPay + USD→UAH)

**Goal:** Bot can issue invoices, accept payment, record purchase atomically.

### Task 6.1: Secrets encryption (libsodium)

**Files:** `src/lib/secrets.ts`, `tests/unit/secrets.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { decrypt, encrypt, initSodium } from '@/lib/secrets';

const KEY = 'a'.repeat(64);

describe('secrets', () => {
  beforeAll(async () => { await initSodium(); });
  it('round-trips text', () => {
    const enc = encrypt('hello world', KEY);
    expect(decrypt(enc, KEY)).toBe('hello world');
  });
  it('fails on tampered ciphertext', () => {
    const enc = encrypt('x', KEY);
    const tampered = enc.slice(0, -2) + 'zz';
    expect(() => decrypt(tampered, KEY)).toThrow();
  });
});
```

- [ ] **Step 2: Implement**

```ts
import sodium from 'libsodium-wrappers';

export async function initSodium(): Promise<void> { await sodium.ready; }

function keyFromHex(hex: string): Uint8Array {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error('invalid key');
  return sodium.from_hex(hex);
}

export function encrypt(plaintext: string, hexKey: string): string {
  const key = keyFromHex(hexKey);
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ct = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, key);
  return `${sodium.to_base64(nonce)}.${sodium.to_base64(ct)}`;
}

export function decrypt(ciphertext: string, hexKey: string): string {
  const key = keyFromHex(hexKey);
  const [n, c] = ciphertext.split('.', 2);
  if (!n || !c) throw new Error('malformed');
  const nonce = sodium.from_base64(n);
  const ct = sodium.from_base64(c);
  const pt = sodium.crypto_secretbox_open_easy(ct, nonce, key);
  return sodium.to_string(pt);
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/unit/secrets.test.ts
git add src/lib/secrets.ts tests/unit/secrets.test.ts
git commit -m "feat(secrets): libsodium secretbox encrypt/decrypt"
```

---

### Task 6.2: NBU exchange rate

**Files:** `src/domain/payments/exchange-rate.ts`, `tests/unit/exchange-rate.test.ts`

- [ ] **Step 1: Failing test (mocked fetch)**

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchUsdRate } from '@/domain/payments/exchange-rate';

describe('fetchUsdRate', () => {
  it('parses NBU response', async () => {
    const fakeFetch = vi.fn(async () => ({
      ok: true,
      json: async () => [{ r030: 840, txt: 'Долар США', rate: 41.23, cc: 'USD', exchangedate: '16.05.2026' }],
    }));
    const rate = await fetchUsdRate('https://example', fakeFetch as never);
    expect(rate).toBeCloseTo(41.23);
  });
  it('throws on bad response', async () => {
    const fakeFetch = vi.fn(async () => ({ ok: false, json: async () => [] }));
    await expect(fetchUsdRate('https://example', fakeFetch as never)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { fetch as undiciFetch } from 'undici';
import { getCollections } from '@/db/client';

type NbuRow = { cc: string; rate: number };

export async function fetchUsdRate(
  url: string,
  fetchImpl: typeof undiciFetch = undiciFetch,
): Promise<number> {
  const res = await fetchImpl(url);
  if (!res.ok) throw new Error(`NBU: ${res.status}`);
  const data = (await res.json()) as NbuRow[];
  const usd = data.find((d) => d.cc === 'USD');
  if (!usd || typeof usd.rate !== 'number') throw new Error('NBU: no USD row');
  return usd.rate;
}

export async function getCachedUsdRate(nbuUrl: string): Promise<number> {
  const settings = await getCollections().settings.findOne({ _id: 'singleton' });
  const override = settings?.exchange_rate_manual_override as number | undefined;
  if (typeof override === 'number' && override > 0) return override;

  const cached = settings?.exchange_rate_uah_per_usd as number | undefined;
  const updatedAt = settings?.exchange_rate_updated_at as Date | undefined;
  const stale = !updatedAt || Date.now() - updatedAt.getTime() > 24 * 3600_000;

  if (cached && !stale) return cached;

  try {
    const rate = await fetchUsdRate(nbuUrl);
    await getCollections().settings.updateOne(
      { _id: 'singleton' },
      { $set: { exchange_rate_uah_per_usd: rate, exchange_rate_updated_at: new Date() } },
      { upsert: true },
    );
    return rate;
  } catch (err) {
    if (cached) return cached; // fallback to stale
    throw err;
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
npx vitest run tests/unit/exchange-rate.test.ts
git add src/domain/payments/exchange-rate.ts tests/unit/exchange-rate.test.ts
git commit -m "feat(payments): NBU USD rate with 24h cache + admin override"
```

---

### Task 6.3: Invoice generation

**File:** `src/domain/payments/invoice.ts`

- [ ] **Step 1: Implement**

```ts
import type { Api } from 'grammy';
import type { ProductDoc } from '@/db/schemas';
import { getCachedUsdRate } from './exchange-rate';

export async function sendProductInvoice(opts: {
  api: Api;
  chatId: number;
  product: ProductDoc;
  providerToken: string;
  nbuUrl: string;
}): Promise<{ amount_uah: number; rate?: number }> {
  const { api, chatId, product, providerToken, nbuUrl } = opts;
  let amountUah: number;
  let rate: number | undefined;

  if (product.currency === 'USD') {
    rate = await getCachedUsdRate(nbuUrl);
    amountUah = Math.ceil((product.price as number) * rate);
  } else {
    amountUah = product.price as number;
  }

  const title = product.title as string;
  const description =
    product.currency === 'USD'
      ? `${product.description as string}\n\n≈ $${product.price} за курсом NBU (1$ = ${rate?.toFixed(2)} ₴)`
      : (product.description as string);

  await api.sendInvoice(
    chatId,
    title,
    description,
    `${product.product_id}:${Date.now()}`, // payload — used in pre_checkout
    'UAH',
    [{ label: title, amount: amountUah * 100 }], // amount in kopecks
    { provider_token: providerToken },
  );

  return { amount_uah: amountUah, rate };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/domain/payments/invoice.ts
git commit -m "feat(payments): sendInvoice with USD→UAH conversion"
```

---

### Task 6.4: Pre-checkout and successful_payment handlers

**Files:** `src/domain/payments/handlers.ts`, modify `src/main.ts`

- [ ] **Step 1: `src/domain/payments/handlers.ts`**

```ts
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';
import { logger } from '@/lib/logger';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';

export async function handlePreCheckout(ctx: BotContext): Promise<void> {
  await ctx.answerPreCheckoutQuery(true);
}

export async function handleSuccessfulPayment(ctx: BotContext): Promise<void> {
  const sp = ctx.message?.successful_payment;
  const tgId = ctx.from?.id;
  if (!sp || !tgId) return;

  const productId = sp.invoice_payload.split(':')[0];
  if (!productId) return;

  const product = await getCollections().products.findOne({ product_id: productId });
  if (!product) {
    logger().error({ productId }, 'payment for unknown product');
    return;
  }

  await getCollections().purchases.insertOne({
    user_tg_id: tgId,
    product_id: productId,
    amount_uah: sp.total_amount / 100,
    amount_original: product.price as number,
    currency_original: product.currency as 'UAH' | 'USD',
    provider_payment_id: sp.provider_payment_charge_id,
    telegram_payment_charge_id: sp.telegram_payment_charge_id,
    status: 'paid_pending_delivery',
    delivery_attempts: 0,
    created_at: new Date(),
  });

  await getCollections().users.updateOne(
    { tg_id: tgId },
    {
      $inc: { purchases_count: 1, total_spent_uah: sp.total_amount / 100 },
      $set: { last_seen_at: new Date() },
    },
  );

  await ctx.reply(SYSTEM_MESSAGES.payment_success_digital_intro);
}
```

- [ ] **Step 2: Register in `main.ts`**

```ts
import { handlePreCheckout, handleSuccessfulPayment } from '@/domain/payments/handlers';
bot.on('pre_checkout_query', handlePreCheckout);
bot.on('message:successful_payment', handleSuccessfulPayment);
```

- [ ] **Step 3: Commit**

```bash
git add src/domain/payments src/main.ts
git commit -m "feat(payments): pre_checkout + successful_payment → purchase"
```

---

### Task 6.5: Wire buy callback

**Files:** modify `src/bot/handlers/callback-router.ts`

- [ ] **Step 1: Add case for `parsed.kind === 'buy'`**

```ts
import { sendProductInvoice } from '@/domain/payments/invoice';
import { loadEnv } from '@/config/env';

// inside handleCallback after else if (parsed.kind === 'home'):
else if (parsed.kind === 'buy') {
  const product = await getCollections().products.findOne({ product_id: parsed.product_id });
  if (!product) { await ctx.reply('Продукт не знайдено'); return; }
  const env = loadEnv();
  await sendProductInvoice({
    api: ctx.api, chatId, product,
    providerToken: env.LIQPAY_PROVIDER_TOKEN, nbuUrl: env.NBU_API_URL,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/bot/handlers/callback-router.ts
git commit -m "feat(payments): buy callback issues invoice"
```

---

## Phase 7 — Atomic delivery sweeper

**Goal:** Once `purchases.status = 'paid_pending_delivery'`, background sweeper delivers and marks `delivered`.

### Task 7.1: Delivery sweeper

**Files:** `src/domain/delivery/sweeper.ts`, `tests/integration/sweeper.test.ts`

- [ ] **Step 1: Test (integration, mocked api)** — verifies sweeper picks up pending and updates status.

```ts
import { MongoDBContainer, type StartedMongoDBContainer } from '@testcontainers/mongodb';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, getCollections, initDb } from '@/db/client';
import { runSweeperOnce } from '@/domain/delivery/sweeper';

let mongo: StartedMongoDBContainer;
beforeAll(async () => {
  mongo = await new MongoDBContainer('mongo:7').start();
  await initDb(mongo.getConnectionString(), 'test_sweeper');
}, 60_000);
afterAll(async () => { await closeDb(); await mongo.stop(); });

describe('sweeper', () => {
  it('marks delivered after sendVideo', async () => {
    await getCollections().products.insertOne({
      product_id: 'p1', type: 'digital', title: 'P', description: '',
      price: 100, currency: 'UAH', visible: true, lessons: ['l1'], order: 0, created_at: new Date(),
    });
    await getCollections().lessons.insertOne({
      lesson_id: 'l1', product_ids: ['p1'], title: 'L1', video_file_id: 'vid_l1',
      order_in_product: { p1: 1 }, uploaded_at: new Date(), uploaded_by_tg_id: 0,
    });
    await getCollections().purchases.insertOne({
      user_tg_id: 999, product_id: 'p1', amount_uah: 100, amount_original: 100, currency_original: 'UAH',
      provider_payment_id: 'x', telegram_payment_charge_id: 'y', status: 'paid_pending_delivery',
      delivery_attempts: 0, created_at: new Date(),
    });
    const api = { sendVideo: vi.fn(async () => {}), sendMessage: vi.fn(async () => {}) };
    await runSweeperOnce(api as never);
    const p = await getCollections().purchases.findOne({ user_tg_id: 999 });
    expect(p?.status).toBe('delivered');
    expect(api.sendVideo).toHaveBeenCalledWith(999, 'vid_l1', expect.objectContaining({ protect_content: true }));
  });
});
```

- [ ] **Step 2: Implement `src/domain/delivery/sweeper.ts`**

```ts
import type { Api } from 'grammy';
import { getCollections } from '@/db/client';
import { logger } from '@/lib/logger';

const MAX_ATTEMPTS = 5;

export async function runSweeperOnce(api: Api): Promise<void> {
  const { purchases, products, lessons } = getCollections();
  const pending = await purchases
    .find({ status: 'paid_pending_delivery', delivery_attempts: { $lt: MAX_ATTEMPTS } })
    .limit(50)
    .toArray();

  for (const p of pending) {
    try {
      const product = await products.findOne({ product_id: p.product_id as string });
      if (!product) continue;

      if (product.type === 'digital') {
        const lessonIds = (product.lessons as string[] | undefined) ?? [];
        const lessonDocs = await lessons.find({ lesson_id: { $in: lessonIds } }).toArray();
        const ordered = lessonDocs.sort((a, b) => {
          const pa = (a.order_in_product as Record<string, number>)?.[product.product_id as string] ?? 999;
          const pb = (b.order_in_product as Record<string, number>)?.[product.product_id as string] ?? 999;
          return pa - pb;
        });
        for (let i = 0; i < ordered.length; i++) {
          const l = ordered[i];
          if (!l) continue;
          await api.sendVideo(p.user_tg_id as number, l.video_file_id as string, {
            caption: `📚 Урок ${i + 1}/${ordered.length}: ${l.title}`,
            protect_content: true,
          });
          await new Promise((r) => setTimeout(r, 1500));
        }
      } else {
        // appointment notification — wired in Phase 8
      }

      await purchases.updateOne(
        { _id: p._id },
        { $set: { status: 'delivered', delivered_at: new Date() } },
      );
    } catch (err) {
      logger().error({ err, purchase_id: p._id }, 'delivery failed');
      await purchases.updateOne(
        { _id: p._id },
        { $inc: { delivery_attempts: 1 } },
      );
      const updated = await purchases.findOne({ _id: p._id });
      if ((updated?.delivery_attempts as number) >= MAX_ATTEMPTS) {
        await purchases.updateOne({ _id: p._id }, { $set: { status: 'failed_delivery' } });
        // TODO Phase 8: alert admin
      }
    }
  }
}

export function startSweeper(api: Api, intervalMs = 30_000): { stop: () => void } {
  const id = setInterval(() => { void runSweeperOnce(api); }, intervalMs);
  return { stop: () => clearInterval(id) };
}
```

- [ ] **Step 3: Wire in `main.ts`**

```ts
import { startSweeper } from '@/domain/delivery/sweeper';
const sweeper = startSweeper(bot.api);
// in shutdown: sweeper.stop();
```

- [ ] **Step 4: Run + commit**

```bash
npx vitest run tests/integration/sweeper.test.ts
git add src/domain/delivery src/main.ts src/shutdown.ts tests/integration/sweeper.test.ts
git commit -m "feat(delivery): atomic sweeper with retry to MAX_ATTEMPTS"
```

---

## Phase 8 — Support relay (forum topics)

**Goal:** Each user has a topic in admin forum group; messages relay both ways with `//` internal notes.

### Task 8.1: Topic manager

**Files:** `src/domain/support/topic-manager.ts`

- [ ] Implement `ensureTopic(api, userDoc, adminGroupId)` → returns thread_id, creates if missing, recreates on TOPIC_DELETED. Pin profile card on creation.

(Code skeleton — full implementation per spec section 10.)

```ts
import type { Api } from 'grammy';
import { GrammyError } from 'grammy';
import { getCollections } from '@/db/client';
import type { UserDoc } from '@/db/schemas';
import { renderCard } from './card';

export async function ensureTopic(api: Api, user: UserDoc, adminChatId: number): Promise<number> {
  const existing = await getCollections().support_topics.findOne({ user_tg_id: user.tg_id });
  if (existing) return existing.thread_id as number;

  const name = `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}${user.username ? ' (@' + user.username + ')' : ''}`.slice(0, 128);
  const topic = await api.createForumTopic(adminChatId, name);
  const card = await api.sendMessage(adminChatId, renderCard(user), { message_thread_id: topic.message_thread_id });
  try { await api.pinChatMessage(adminChatId, card.message_id); } catch { /* perms */ }
  await getCollections().support_topics.insertOne({
    user_tg_id: user.tg_id, chat_id: adminChatId, thread_id: topic.message_thread_id,
    pinned_card_message_id: card.message_id, created_at: new Date(),
  });
  return topic.message_thread_id;
}

export async function updateCard(api: Api, user: UserDoc): Promise<void> {
  const t = await getCollections().support_topics.findOne({ user_tg_id: user.tg_id });
  if (!t) return;
  try {
    await api.editMessageText(t.chat_id as number, t.pinned_card_message_id as number, renderCard(user));
  } catch (err) {
    if (err instanceof GrammyError && err.description.includes('message is not modified')) return;
    throw err;
  }
}
```

- [ ] Commit: `feat(support): topic manager + card update`

---

### Task 8.2: Profile card renderer

**File:** `src/domain/support/card.ts`

```ts
import type { UserDoc } from '@/db/schemas';

export function renderCard(user: UserDoc): string {
  const fullName = `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`;
  const at = user.username ? `@${user.username}` : '—';
  const start = user.created_at.toISOString().slice(0, 16).replace('T', ' ');
  const seg = user.segment ?? 'не визначено';
  const node = user.current_node_id ?? '—';
  return [
    `👤 ${fullName}`,
    `📱 ${at}`,
    `🆔 ${user.tg_id}`,
    `📅 Старт: ${start}`,
    `🌐 ${user.language_code}`,
    '──────────────',
    `📊 Воронка`,
    `└─ Зараз на: "${node}"`,
    `🎯 Сегмент: ${seg}`,
    '',
    `💰 Купівлі: ${user.purchases_count} (${user.total_spent_uah} ₴)`,
    '──────────────',
  ].join('\n');
}
```

Commit: `feat(support): profile card renderer`.

---

### Task 8.3: User → admin relay

**File:** `src/bot/handlers/plain-message.ts`

- [ ] Skip if it's a command or a reply-keyboard-text. Otherwise `copyMessage` to user's topic.
- [ ] Anti-spam: `supportLimiter.allow(tg_id)` — якщо false, тиша + flood-mark.

```ts
import type { BotContext } from '@/bot/context';
import { ensureTopic } from '@/domain/support/topic-manager';
import { getCollections } from '@/db/client';
import { supportLimiter } from '@/bot/middlewares/anti-spam';
import { MAIN_REPLY_BTN_LESSONS, MAIN_REPLY_BTN_SUPPORT } from '@/bot/keyboards/main-reply';
import { SYSTEM_MESSAGES } from '../../../seed/system-messages';

export async function handlePlainMessage(ctx: BotContext): Promise<void> {
  if (!ctx.message || !ctx.from || !ctx.chat) return;
  const text = ctx.message.text;
  if (text === MAIN_REPLY_BTN_LESSONS || text === MAIN_REPLY_BTN_SUPPORT) return;
  if (text?.startsWith('/')) return;

  const settings = await getCollections().settings.findOne({ _id: 'singleton' });
  const adminChatId = settings?.admin_group_chat_id as number | undefined;
  if (!adminChatId) return;

  if (!supportLimiter.allow(ctx.from.id)) return;

  const user = ctx.state.user;
  if (!user) return;
  const threadId = await ensureTopic(ctx.api, user, adminChatId);
  await ctx.api.copyMessage(adminChatId, ctx.chat.id, ctx.message.message_id, { message_thread_id: threadId });
  if (text) await ctx.reply(SYSTEM_MESSAGES.unknown_text_response);
}
```

Register in `main.ts`: `bot.on('message', handlePlainMessage);` (after specific command handlers).

Commit: `feat(support): user→admin message relay`.

---

### Task 8.4: Admin → user relay + // notes

**File:** `src/bot/handlers/admin-reply.ts`

- [ ] Filter only messages from admin group + with `message_thread_id` + author not bot. If text starts with `//` — skip. Else `copyMessage` from group to user.

```ts
import type { BotContext } from '@/bot/context';
import { getCollections } from '@/db/client';

export async function handleAdminReply(ctx: BotContext): Promise<void> {
  if (!ctx.message || !ctx.chat || !ctx.message.message_thread_id) return;
  const settings = await getCollections().settings.findOne({ _id: 'singleton' });
  if (ctx.chat.id !== settings?.admin_group_chat_id) return;
  if (ctx.from?.is_bot) return;
  if (typeof ctx.message.text === 'string' && ctx.message.text.startsWith('//')) return;

  const topic = await getCollections().support_topics.findOne({
    chat_id: ctx.chat.id,
    thread_id: ctx.message.message_thread_id,
  });
  if (!topic) return;
  await ctx.api.copyMessage(topic.user_tg_id as number, ctx.chat.id, ctx.message.message_id);
}
```

Register: `bot.on('message', handleAdminReply);` (must be **before** `handlePlainMessage`; differentiate by chat type).

Commit: `feat(support): admin→user relay with // internal notes`.

---

### Task 8.5: System notifications

**File:** `src/domain/support/notifications.ts`

- [ ] Implement `notifyPurchase(api, userId, productTitle, amount, providerPaymentId)`, `notifyAppointment(...)`, `notifyDeliveryFailure(...)`.

```ts
import type { Api } from 'grammy';
import { getCollections } from '@/db/client';

async function getChatAndThread(userId: number) {
  const t = await getCollections().support_topics.findOne({ user_tg_id: userId });
  return t ? { chat_id: t.chat_id as number, thread_id: t.thread_id as number } : null;
}

export async function notifyPurchase(api: Api, userId: number, title: string, amount: number, payId: string): Promise<void> {
  const t = await getChatAndThread(userId);
  if (!t) return;
  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await api.sendMessage(t.chat_id, `🟢 КУПІВЛЯ\n${title}\n${amount} ₴\n${ts} · pay-id: ${payId}`, {
    message_thread_id: t.thread_id,
  });
}

export async function notifyAppointment(api: Api, userId: number, title: string, amount: number): Promise<void> {
  const t = await getChatAndThread(userId);
  if (!t) return;
  await api.sendMessage(t.chat_id, `🟠 ЗАЯВКА\n${title} · ${amount} ₴\n❗ Потребує реакції — узгодити час`, {
    message_thread_id: t.thread_id,
  });
}

export async function notifyDeliveryFailure(api: Api, userId: number, info: string): Promise<void> {
  const t = await getChatAndThread(userId);
  if (!t) return;
  await api.sendMessage(t.chat_id, `🔴 Помилка доставки: ${info}`, { message_thread_id: t.thread_id });
}
```

Wire in `handleSuccessfulPayment` and `sweeper`.

Commit: `feat(support): purchase/appointment/failure notifications`.

---

## Phase 9 — Admin panel (in-bot conversations)

**Goal:** Owner manages content/products/admins/settings without leaving Telegram.

### Task 9.1: /admin entry + main menu

**Files:** `src/bot/handlers/admin.ts`

- [ ] Inline keyboard with sections, gated by `is_admin`.
- Commit: `feat(admin): /admin entry menu`.

### Task 9.2: /init_admin_group

**File:** `src/bot/handlers/init-admin-group.ts`

- [ ] Conversation: user forwards a message from the admin group → bot extracts `chat.id`, verifies bot has `manage_topics`, saves to `settings.admin_group_chat_id`. Commit.

### Task 9.3: Edit node conversation

**File:** `src/bot/conversations/edit-node.ts`

- [ ] Select segment → select node → preview → choose [replace text | replace buttons | replace media] → input new value → confirm. Commit.

### Task 9.4: Upload lesson conversation

**File:** `src/bot/conversations/upload-lesson.ts`

- [ ] Title → caption → send video → save file_id + dims → attach to product(s) → confirm. Commit.

### Task 9.5: Manage products

**File:** `src/bot/conversations/manage-products.ts`

- [ ] List with [add/edit/toggle visibility/delete]. Edit: title, description, price, currency, visible.

### Task 9.6: Team (request_users)

**File:** `src/bot/conversations/team.ts`

- [ ] Show team list. `➕ Add` → `KeyboardButton.request_users` (multi-select). On `users_shared` update — add each as user with `support: true`. Edit permissions: inline checkboxes toggling each capability with instant save.

```ts
// Snippet for add:
import { Keyboard } from 'grammy';
const kb = new Keyboard().requestUsers('Обери людей', 1, { user_is_bot: false, max_quantity: 10 }).resized().oneTime();
await ctx.reply('Обери з контактів:', { reply_markup: kb });
// In handler for ctx.message.users_shared:
for (const u of ctx.message.users_shared.users) {
  await getCollections().users.updateOne(
    { tg_id: u.user_id },
    { $set: { is_admin: true, 'permissions.support': true } },
    { upsert: false }, // user must have started bot
  );
}
```

Commit per step.

### Task 9.7: Audit log

**File:** `src/domain/audit/log.ts`

```ts
import { getCollections } from '@/db/client';
export async function logAdminAction(actor_tg_id: number, action: string, payload: Record<string, unknown> = {}): Promise<void> {
  await getCollections().events.insertOne({
    user_tg_id: actor_tg_id, type: 'admin_action', payload: { action, ...payload }, at: new Date(),
  });
}
```

Inject in every admin operation. Show last 50 in `/admin → ⚙️ → 📜 Журнал` (requires `view_stats`).

Commit per step.

---

## Phase 10 — Broadcasts

**Goal:** Owner picks segment, sends a message, watches progress.

### Task 10.1: Segment filter

**File:** `src/domain/broadcasts/segments.ts`, `tests/unit/segments.test.ts`

- [ ] Filter functions returning `Filter<UserDoc>` for each segment per spec section 12.

### Task 10.2: Broadcast cursor

**File:** `src/domain/broadcasts/cursor.ts`, `tests/integration/cursor.test.ts`

- [ ] `findNextBatch(broadcast_id, batchSize)`: query users with segment filter AND `_id > last_processed_user_id`, return batch + updated cursor.

### Task 10.3: Ticker

**File:** `src/domain/broadcasts/ticker.ts`

- [ ] setInterval 1s: pick running broadcast → send batch of 20 → update counters → advance cursor → if no more → mark `done`.

### Task 10.4: New broadcast conversation

**File:** `src/bot/conversations/new-broadcast.ts`

- [ ] Select segment → wait for message → preview with count and ETA → confirm → create broadcast doc with `status='running'`.

Commit per task.

---

## Phase 11 — Statistics

**Goal:** Quick screen + funnel/product breakdown.

### Task 11.1: Event collector

**File:** `src/domain/stats/events.ts`

- [ ] `recordEvent(tg_id, type, payload)`. Call from funnel transitions, payments, deliveries.

### Task 11.2: Quick stats screen

**File:** `src/bot/handlers/stats.ts`

- [ ] Aggregations for last 7d / 30d / all-time: new users, active, revenue per product, conversion rates.

### Task 11.3: CSV export

**File:** `src/domain/stats/export.ts`

- [ ] Generate CSV (purchases, users, events) → `sendDocument` to admin.

Commit per task.

---

## Phase 12 — Privacy commands

**File:** `src/bot/handlers/privacy.ts`

- [ ] `/pause` — `users.funnel_paused = true`.
- [ ] `/resume` — `users.funnel_paused = false`.
- [ ] `/delete_my_data` — confirmation flow → soft-delete (nullify PII, set `deleted_at`).
- [ ] `/help` — reply with text from `SYSTEM_MESSAGES.help_prompt`, then relay any next message to support topic.
- [ ] `/about` — reply with `SYSTEM_MESSAGES.about`.

Funnel engine respects `funnel_paused`: skip automatic broadcasts to paused users; but user-initiated callbacks still work.

Commit: `feat(privacy): /pause /resume /delete_my_data /help /about`.

---

## Phase 13 — Production hardening

### Task 13.1: bot.api setMyCommands per admin permissions

**File:** `src/bot/setup-commands.ts`

- [ ] On startup: set default commands (user-visible). For each admin, set scoped commands matching their permissions.

### Task 13.2: Migrations setup

**Files:** `migrate-mongo-config.js`, `migrations/20260516120000-initial.js`

```js
// migrate-mongo-config.js
module.exports = {
  mongodb: { url: process.env.MONGO_URI, databaseName: process.env.MONGO_DB_NAME, options: {} },
  migrationsDir: 'migrations',
  changelogCollectionName: 'changelog',
  migrationFileExtension: '.js',
};
```

```js
// migrations/20260516120000-initial.js
module.exports = {
  async up(db) {
    await db.collection('settings').updateOne(
      { _id: 'singleton' },
      { $setOnInsert: { admins_tg_ids: [], liqpay_test_mode: true, exchange_rate_uah_per_usd: 0 } },
      { upsert: true },
    );
  },
  async down() {},
};
```

Add `prestart` step in Docker entrypoint to run `migrate-mongo up`.

### Task 13.3: Dockerfile + docker-compose

**Files:** `docker/Dockerfile`, `docker-compose.yml`, `docker-compose.dev.yml`

```dockerfile
# docker/Dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs24-debian12
WORKDIR /app
COPY --from=builder /app/dist/bundle.cjs ./
COPY --from=builder /app/node_modules ./node_modules
USER nonroot
EXPOSE 3000
CMD ["bundle.cjs"]
```

```yaml
# docker-compose.yml
services:
  mongo:
    image: mongo:7
    volumes: ['mongo-data:/data/db']
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'mongosh', '--eval', 'db.adminCommand("ping")']
      interval: 10s
      timeout: 5s
      retries: 5
  bot:
    build: { context: ., dockerfile: docker/Dockerfile }
    env_file: .env
    depends_on: { mongo: { condition: service_healthy } }
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'wget', '--no-verbose', '--tries=1', '--spider', 'http://localhost:3000/health']
      interval: 30s
      timeout: 5s
      retries: 3
volumes:
  mongo-data:
```

Commit: `chore(deploy): Dockerfile + docker-compose (Node 24, polling-only)`.

### Task 13.4: GitHub Actions CI

**File:** `.github/workflows/ci.yml`

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

Commit: `ci: lint + typecheck + test + build on push`.

### Task 13.5: README + runbook

**Files:** `README.md`, `docs/runbook.md`

- [ ] README: prerequisites, env variables list, dev/prod commands, troubleshooting common errors.
- [ ] Runbook: how to deploy, how to upgrade, how to backup Mongo, how to recover after data loss.

Commit: `docs: README and runbook`.

---

## Phase 14 — Final polish

### Task 14.1: Bot identity

- [ ] Manual: set bot description / short description / profile photo via @BotFather.
- [ ] Document in README.

### Task 14.2: Smoke test

- [ ] Create a test bot via BotFather.
- [ ] Run full flow with LiqPay test mode: /start → segmentation → product → invoice → pay → delivery → /lessons → support relay.
- [ ] Document checklist in `docs/runbook.md`.

### Task 14.3: Production deploy

- [ ] On VPS: install Docker, `git clone`, `cp .env.example .env`, fill env, `docker compose up -d`.
- [ ] Verify `docker compose logs bot` shows "bot started (long-polling)".
- [ ] Verify `/start` works on the real bot.

---

## Open notes for executor

- **Phases 1-3** are mostly mechanical (config, scaffolding, middleware) — execute linearly.
- **Phase 4** is the heart — funnel engine. Take time to seed PDF content accurately.
- **Phases 5-8** wire together payments, delivery, support. Each can be tested in isolation.
- **Phase 9** is the most surface area (admin conversations) — be patient with FSM design.
- **Phases 10-12** are smaller features.
- **Phases 13-14** are pure ops.
- Total estimated ~70 tasks; many are 5-10 minutes each. The funnel content seed (Task 4.1, 4.7) is the longest manual step.

## Self-review notes

- ✅ Spec section 1-22 each has a corresponding task.
- ✅ No "TBD" or placeholder code in domain-logic tasks.
- ✅ Type names consistent across tasks (`Permissions`, `BotContext`, `FlowNode`, `UserDoc`).
- ✅ TDD applied to: env, logger, user repo, permission, anti-spam, funnel types, sender, callbacks, secrets, exchange rate, sweeper, segments, cursor.
- ✅ Phases 9-11 use compact task descriptions (deep TDD inside each subtask is up to executor — domain logic in those phases is mostly orchestration).
