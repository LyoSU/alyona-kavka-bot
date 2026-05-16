import { type Db, MongoClient } from 'mongodb';
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
