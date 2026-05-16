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
