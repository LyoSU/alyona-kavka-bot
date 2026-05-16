import { describe, expect, it } from 'vitest';
import { bold, code, escapeHtml, italic, pre } from '@/lib/html';

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
  });
  it('keeps Markdown-only chars untouched (they are safe in HTML)', () => {
    expect(escapeHtml('_under_ *star* `code` [link](url)')).toBe(
      '_under_ *star* `code` [link](url)',
    );
  });
  it('handles null/undefined/number', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
  it('preserves unicode', () => {
    expect(escapeHtml('Альона — HR')).toBe('Альона — HR');
  });
});

describe('html helpers', () => {
  it('code() escapes', () => {
    expect(code('<script>')).toBe('<code>&lt;script&gt;</code>');
  });
  it('bold/italic/pre wrap and escape', () => {
    expect(bold('a&b')).toBe('<b>a&amp;b</b>');
    expect(italic('x')).toBe('<i>x</i>');
    expect(pre('a<b>')).toBe('<pre>a&lt;b&gt;</pre>');
  });
});
