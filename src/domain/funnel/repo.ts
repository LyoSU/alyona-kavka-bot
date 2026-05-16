import { getCollections } from '@/db/client';
import { type FlowNode, FlowNodeSchema } from './types';

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
