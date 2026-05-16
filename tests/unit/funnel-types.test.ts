import { describe, expect, it } from 'vitest';
import { FlowNodeSchema } from '@/domain/funnel/types';

describe('FlowNodeSchema', () => {
  it('parses a minimal valid node', () => {
    const node = FlowNodeSchema.parse({
      node_id: 'welcome',
      chunks: [{ type: 'text', content: 'Привіт', delay_before_ms: 1000 }],
    });
    expect(node.buttons).toEqual([]);
    expect(node.segment).toBeNull();
  });

  it('rejects empty chunks', () => {
    expect(() => FlowNodeSchema.parse({ node_id: 'x', chunks: [] })).toThrow();
  });

  it('rejects empty text content', () => {
    expect(() =>
      FlowNodeSchema.parse({
        node_id: 'x',
        chunks: [{ type: 'text', content: '' }],
      }),
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

  it('parses buy button with product_id', () => {
    const node = FlowNodeSchema.parse({
      node_id: 'prod_base',
      chunks: [{ type: 'text', content: 'База' }],
      buttons: [{ label: '💳 Купити 960₴', row: 0, action: 'buy', product_id: 'base_6' }],
    });
    expect(node.buttons[0]).toMatchObject({ action: 'buy', product_id: 'base_6' });
  });

  it('rejects unknown button action', () => {
    expect(() =>
      FlowNodeSchema.parse({
        node_id: 'x',
        chunks: [{ type: 'text', content: 'x' }],
        buttons: [{ label: 'l', row: 0, action: 'fly_to_mars' }],
      }),
    ).toThrow();
  });

  it('parses video_note chunk', () => {
    const node = FlowNodeSchema.parse({
      node_id: 'intro',
      chunks: [{ type: 'video_note', file_id: 'BAACAg...', delay_before_ms: 500 }],
    });
    expect(node.chunks[0]).toMatchObject({ type: 'video_note' });
  });
});
