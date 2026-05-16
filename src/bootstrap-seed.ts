// Bootstraps the DB with flow nodes, products, and settings singleton on first
// run. Idempotent: each upsert keys on its natural id, so re-running is a no-op
// (admin edits made later are preserved — only missing rows are created).
//
// We import the seed modules here so they're included in the production bundle;
// otherwise tsx-only `seed/run.ts` can't run inside the runtime image.
import { FLOW_NODES } from '../seed/flow-nodes';
import { PRODUCTS } from '../seed/products';
import { getCollections } from './db/client';
import { logger } from './lib/logger';

export async function bootstrapSeed(testMode: boolean): Promise<void> {
  const c = getCollections();
  const [nodeCount, productCount] = await Promise.all([
    c.flow_nodes.estimatedDocumentCount(),
    c.products.estimatedDocumentCount(),
  ]);

  if (nodeCount === 0) {
    logger().info({ count: FLOW_NODES.length }, 'bootstrap-seed: inserting flow nodes');
    for (const node of FLOW_NODES) {
      await c.flow_nodes.updateOne(
        { node_id: node.node_id },
        { $set: { ...node, updated_at: new Date() } },
        { upsert: true },
      );
    }
  }

  if (productCount === 0) {
    logger().info({ count: PRODUCTS.length }, 'bootstrap-seed: inserting products');
    for (const product of PRODUCTS) {
      await c.products.updateOne(
        { product_id: product.product_id },
        { $set: product },
        { upsert: true },
      );
    }
  }

  await c.settings.updateOne(
    { _id: 'singleton' },
    {
      $setOnInsert: {
        _id: 'singleton',
        liqpay_test_mode: testMode,
        exchange_rate_uah_per_usd: 0,
      },
    },
    { upsert: true },
  );
}
