import type { Button } from './types';

export type ParsedCallback =
  | { kind: 'goto_node'; node_id: string }
  | { kind: 'open_product'; product_id: string }
  | { kind: 'buy'; product_id: string }
  | { kind: 'support' }
  | { kind: 'back' }
  | { kind: 'home' }
  | { kind: 'lessons_product'; product_id: string }
  | { kind: 'lessons_play'; lesson_id: string }
  | { kind: 'lessons_root' }
  | { kind: 'unknown' };

export function encode(button: Button): string {
  switch (button.action) {
    case 'goto_node':
      return `f:${button.node_id}`;
    case 'open_product':
      return `p:${button.product_id}`;
    case 'buy':
      return `b:${button.product_id}`;
    case 'open_url':
      return '';
    case 'support':
      return 's';
    case 'back':
      return 'nav:back';
    case 'home':
      return 'nav:home';
  }
}

export function parse(data: string): ParsedCallback {
  if (data === 's') return { kind: 'support' };
  if (data === 'nav:back') return { kind: 'back' };
  if (data === 'nav:home') return { kind: 'home' };
  if (data === 'lib:back') return { kind: 'lessons_root' };

  const idx = data.indexOf(':');
  if (idx === -1) return { kind: 'unknown' };
  const prefix = data.slice(0, idx);
  const rest = data.slice(idx + 1);
  if (!rest) return { kind: 'unknown' };

  switch (prefix) {
    case 'f':
      return { kind: 'goto_node', node_id: rest };
    case 'p':
      return { kind: 'open_product', product_id: rest };
    case 'b':
      return { kind: 'buy', product_id: rest };
    case 'lib':
      return { kind: 'lessons_product', product_id: rest };
    case 'play':
      return { kind: 'lessons_play', lesson_id: rest };
    default:
      return { kind: 'unknown' };
  }
}
