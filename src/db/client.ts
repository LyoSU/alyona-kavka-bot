import { type Db, MongoClient, MongoServerError } from 'mongodb';
import { logger } from '@/lib/logger';
import type {
  AppointmentDoc,
  BroadcastDoc,
  EventDoc,
  FlowNodeDoc,
  LessonDoc,
  ProductDoc,
  PurchaseDoc,
  SettingsDoc,
  SupportTopicDoc,
  UserDoc,
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

async function safeCreateIndex(collName: string, fn: () => Promise<string>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    // IndexOptionsConflict (85) / IndexKeySpecsConflict (86) happen when an
    // existing index has different options than what we're asking for. Don't
    // crash boot — log and move on (operator can drop+recreate manually).
    if (err instanceof MongoServerError && (err.code === 85 || err.code === 86)) {
      logger().warn(
        { coll: collName, code: err.code, msg: err.message },
        'ensureIndexes: existing index has different options — keeping it',
      );
      return;
    }
    throw err;
  }
}

async function ensureIndexes(): Promise<void> {
  const c = getCollections();
  await Promise.all([
    safeCreateIndex('users', () => c.users.createIndex({ tg_id: 1 }, { unique: true })),
    safeCreateIndex('flow_nodes', () => c.flow_nodes.createIndex({ node_id: 1 }, { unique: true })),
    safeCreateIndex('products', () => c.products.createIndex({ product_id: 1 }, { unique: true })),
    safeCreateIndex('lessons', () => c.lessons.createIndex({ lesson_id: 1 }, { unique: true })),
    safeCreateIndex('purchases', () =>
      c.purchases.createIndex({ provider_payment_id: 1 }, { unique: true, sparse: true }),
    ),
    safeCreateIndex('purchases', () => c.purchases.createIndex({ user_tg_id: 1, created_at: -1 })),
    safeCreateIndex('purchases', () => c.purchases.createIndex({ status: 1 })),
    safeCreateIndex('support_topics', () =>
      c.support_topics.createIndex({ user_tg_id: 1 }, { unique: true }),
    ),
    safeCreateIndex('support_topics', () => c.support_topics.createIndex({ thread_id: 1 })),
    safeCreateIndex('events', () => c.events.createIndex({ user_tg_id: 1, at: -1 })),
    safeCreateIndex('events', () => c.events.createIndex({ type: 1, at: -1 })),
    safeCreateIndex('events', () => c.events.createIndex({ at: -1 })),
    safeCreateIndex('broadcasts', () => c.broadcasts.createIndex({ status: 1, created_at: 1 })),
    safeCreateIndex('appointments', () =>
      c.appointments.createIndex({ purchase_id: 1 }, { unique: true }),
    ),
    // TTL: drop events older than 365d to keep collection bounded.
    safeCreateIndex('events', () =>
      c.events.createIndex({ at: 1 }, { expireAfterSeconds: 365 * 24 * 3600 }),
    ),
  ]);
}
