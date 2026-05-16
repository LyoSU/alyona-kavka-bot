import { describe, expect, it } from 'vitest';
import { encode, parse } from '@/domain/funnel/callbacks';

describe('callbacks', () => {
  it('round-trips goto_node', () => {
    const data = encode({ label: '?', row: 0, action: 'goto_node', node_id: 'welcome' });
    expect(data).toBe('f:welcome');
    expect(parse(data)).toEqual({ kind: 'goto_node', node_id: 'welcome' });
  });

  it('handles buy', () => {
    expect(parse('b:base_6')).toEqual({ kind: 'buy', product_id: 'base_6' });
  });

  it('handles open_product', () => {
    expect(parse('p:consult_career')).toEqual({
      kind: 'open_product',
      product_id: 'consult_career',
    });
  });

  it('handles nav primitives', () => {
    expect(parse('nav:back')).toEqual({ kind: 'back' });
    expect(parse('nav:home')).toEqual({ kind: 'home' });
    expect(parse('s')).toEqual({ kind: 'support' });
  });

  it('handles lessons prefixes', () => {
    expect(parse('lib:base_6')).toEqual({ kind: 'lessons_product', product_id: 'base_6' });
    expect(parse('lib:back')).toEqual({ kind: 'lessons_root' });
    expect(parse('play:l_resume_01')).toEqual({ kind: 'lessons_play', lesson_id: 'l_resume_01' });
  });

  it('returns unknown for garbage', () => {
    expect(parse('xyz')).toEqual({ kind: 'unknown' });
    expect(parse('')).toEqual({ kind: 'unknown' });
    expect(parse('f:')).toEqual({ kind: 'unknown' });
  });

  it('encodes open_url as empty (handled separately)', () => {
    expect(encode({ label: 'link', row: 0, action: 'open_url', url: 'https://x' })).toBe('');
  });
});
