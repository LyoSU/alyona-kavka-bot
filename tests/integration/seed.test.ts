import type { StartedMongoDBContainer } from '@testcontainers/mongodb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getCollections, initDb } from '@/db/client';
import { listNodes } from '@/domain/funnel/repo';
import { FlowNodeSchema } from '@/domain/funnel/types';
import { FLOW_NODES } from '../../seed/flow-nodes';
import { PRODUCTS } from '../../seed/products';
import { startMongo } from '../helpers/mongo';

let mongo: StartedMongoDBContainer;

beforeAll(async () => {
  const started = await startMongo();
  mongo = started.container;
  await initDb(started.uri, 'test_seed');
}, 120_000);

afterAll(async () => {
  await closeDb();
  await mongo.stop();
});

describe('seed data', () => {
  it('all flow nodes pass schema validation', () => {
    for (const node of FLOW_NODES) {
      expect(() => FlowNodeSchema.parse(node)).not.toThrow();
    }
  });

  it('all button goto_node targets exist', () => {
    const ids = new Set(FLOW_NODES.map((n) => n.node_id));
    for (const node of FLOW_NODES) {
      for (const btn of node.buttons) {
        if (btn.action === 'goto_node') {
          expect(ids).toContain(btn.node_id);
        }
      }
    }
  });

  it('all buy buttons reference existing products', () => {
    const productIds = new Set(PRODUCTS.map((p) => p.product_id));
    for (const node of FLOW_NODES) {
      for (const btn of node.buttons) {
        if (btn.action === 'buy' || btn.action === 'open_product') {
          expect(productIds).toContain(btn.product_id);
        }
      }
    }
  });

  it('seed inserts all nodes and products into DB', async () => {
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
    const stored = await listNodes();
    expect(stored.length).toBe(FLOW_NODES.length);

    const products = await c.products.find().toArray();
    expect(products.length).toBe(PRODUCTS.length);
  });

  it('product set covers all expected ids', () => {
    const ids = PRODUCTS.map((p) => p.product_id).sort();
    expect(ids).toEqual(
      [
        'base_6',
        'consult_career',
        'consult_profession',
        'lesson_hard_qs',
        'lesson_interview',
        'lesson_linkedin',
        'lesson_resume',
        'lesson_salary',
        'lesson_search',
        'system_path',
      ].sort(),
    );
  });
});
