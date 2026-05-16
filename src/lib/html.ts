export function escapeHtml(s: string | number | undefined | null): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function code(s: string | number | undefined | null): string {
  return `<code>${escapeHtml(s)}</code>`;
}

export function bold(s: string | number | undefined | null): string {
  return `<b>${escapeHtml(s)}</b>`;
}

export function italic(s: string | number | undefined | null): string {
  return `<i>${escapeHtml(s)}</i>`;
}

export function pre(s: string | number | undefined | null): string {
  return `<pre>${escapeHtml(s)}</pre>`;
}
