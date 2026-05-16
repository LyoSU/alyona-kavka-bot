import { z } from 'zod';

export const ChunkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    content: z.string().min(1),
    delay_before_ms: z.number().int().min(0).default(0),
  }),
  z.object({
    type: z.literal('photo'),
    file_id: z.string().min(1),
    caption: z.string().optional(),
    delay_before_ms: z.number().int().min(0).default(0),
  }),
  z.object({
    type: z.literal('video_note'),
    file_id: z.string().min(1),
    delay_before_ms: z.number().int().min(0).default(0),
  }),
  z.object({
    type: z.literal('typing_pause'),
    delay_before_ms: z.number().int().min(1),
  }),
]);

export const ButtonSchema = z.discriminatedUnion('action', [
  z.object({
    label: z.string().min(1),
    row: z.number().int().min(0).default(0),
    action: z.literal('goto_node'),
    node_id: z.string().min(1),
  }),
  z.object({
    label: z.string().min(1),
    row: z.number().int().min(0).default(0),
    action: z.literal('open_product'),
    product_id: z.string().min(1),
  }),
  z.object({
    label: z.string().min(1),
    row: z.number().int().min(0).default(0),
    action: z.literal('buy'),
    product_id: z.string().min(1),
  }),
  z.object({
    label: z.string().min(1),
    row: z.number().int().min(0).default(0),
    action: z.literal('open_url'),
    url: z.string().url(),
  }),
  z.object({
    label: z.string().min(1),
    row: z.number().int().min(0).default(0),
    action: z.literal('support'),
  }),
  z.object({
    label: z.string().min(1),
    row: z.number().int().min(0).default(0),
    action: z.literal('back'),
  }),
  z.object({
    label: z.string().min(1),
    row: z.number().int().min(0).default(0),
    action: z.literal('home'),
  }),
]);

export const FlowNodeSchema = z.object({
  node_id: z.string().min(1),
  segment: z.enum(['first_job', 'growing']).nullable().default(null),
  chunks: z.array(ChunkSchema).min(1),
  buttons: z.array(ButtonSchema).default([]),
});

export type Chunk = z.infer<typeof ChunkSchema>;
export type Button = z.infer<typeof ButtonSchema>;
export type FlowNode = z.infer<typeof FlowNodeSchema>;
