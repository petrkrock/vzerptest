import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generates a valid RFC4122 v4 UUID.
 *
 * IMPORTANT: this must stay a real UUID (not a short base36 string) because
 * the Supabase schema (supabase/schema.sql) declares every entity `id` and
 * every foreign key (supplier_id, entity_id, created_by, ...) as a Postgres
 * UUID column. A non-UUID id would be accepted by localStorage but rejected
 * by Postgres the moment it's synced ("invalid input syntax for type uuid").
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // fall through to manual implementation (e.g. non-secure context)
    }
  }
  // RFC4122 v4 fallback — works even without the Web Crypto API / HTTPS.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatDate(isoString: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return isoString;
  }
}

export function formatDateTime(isoString: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
}

export function isToday(isoString: string): boolean {
  if (!isoString) return false;
  const today = new Date();
  const d = new Date(isoString);
  return d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
}

export function isOverdue(isoString: string): boolean {
  if (!isoString) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(isoString);
  d.setHours(0, 0, 0, 0);
  return d < today;
}



export function exportToCSV(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csvLines = [
    keys.join(';'),
    ...rows.map(row =>
      keys.map(k => {
        const val = row[k];
        if (Array.isArray(val)) return `"${(val as string[]).join(', ')}"`;
        const str = String(val ?? '').replace(/"/g, '""');
        return `"${str}"`;
      }).join(';')
    )
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(';').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(';').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

// v1.32.8: debounce() удалён — единственное вхождение во всём src было объявлением.
