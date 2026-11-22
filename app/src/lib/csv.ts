/** CSV/JSONL helpers and file download. */

export type Row = Record<string, string | number | boolean | null | undefined>;

function cell(v: Row[string]): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly Row[], columns?: string[]): string {
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const lines = [cols.join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c])).join(','));
  return lines.join('\n') + '\n';
}

export function toJsonl(items: readonly unknown[]): string {
  return items.map((i) => JSON.stringify(i)).join('\n') + (items.length ? '\n' : '');
}

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function timestampForFile(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
