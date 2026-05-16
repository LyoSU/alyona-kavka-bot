import { loadEnv } from '@/config/env';
import { closeDb, getCollections, initDb } from '@/db/client';
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

  // settings singleton bootstrap
  await c.settings.updateOne(
    { _id: 'singleton' },
    {
      $setOnInsert: {
        _id: 'singleton',
        liqpay_test_mode: env.LIQPAY_TEST_MODE,
        exchange_rate_uah_per_usd: 0,
      },
    },
    { upsert: true },
  );

  console.log(`✅ seeded ${FLOW_NODES.length} flow nodes, ${PRODUCTS.length} products`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
