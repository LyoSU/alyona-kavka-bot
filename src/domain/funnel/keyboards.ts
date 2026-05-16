import { InlineKeyboard } from 'grammy';
import type { InlineKeyboardMarkup } from 'grammy/types';
import { encode } from './callbacks';
import type { Button } from './types';

export function buildKeyboard(buttons: Button[]): InlineKeyboardMarkup | undefined {
  if (buttons.length === 0) return undefined;
  const kb = new InlineKeyboard();
  const sorted = [...buttons].sort((a, b) => a.row - b.row);
  let lastRow = sorted[0]?.row ?? 0;
  for (const btn of sorted) {
    if (btn.row !== lastRow) {
      kb.row();
      lastRow = btn.row;
    }
    if (btn.action === 'open_url') {
      kb.url(btn.label, btn.url);
    } else {
      kb.text(btn.label, encode(btn));
    }
  }
  return kb;
}
