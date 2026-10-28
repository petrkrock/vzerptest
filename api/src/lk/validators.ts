// v1.32.4: валидация складов/условий ЛК — порт логики supabase/functions/supplier-service
// (поведение 1:1, правки только в нотации). Статусы условий ставит СЕРВЕР, не поставщик.

export const TOKEN_RE = /^[a-f0-9]{32}$/;
const MAX_WAREHOUSES = 50;
const MAX_CONDITIONS = 20;
export const SS_KEYS = ['city', 'warehouseName', 'representative', 'contacts', 'email',
  'deliverySchedule', 'orderUnloadSchedule', 'returnConditions', 'officialWarehouse', 'deliveryTime'];

export function pinOk(expected: string | undefined, provided: unknown): boolean {
  if (!expected) return true;
  // v1.34.5: принимаем и строку, и число (фронт может слать number).
  const p = (typeof provided === 'string' || typeof provided === 'number')
    ? String(provided).trim()
    : '';
  return /^\d{4,6}$/.test(p) && p === String(expected).trim();
}

export function validateWarehouses(
  input: unknown,
  existing: Array<Record<string, unknown>>,
): string | Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return 'Некорректный список складов';
  if (input.length > MAX_WAREHOUSES) return `Максимум ${MAX_WAREHOUSES} складов`;
  const cities = new Set<string>();
  for (const w of input as Array<Record<string, unknown>>) {
    const city = String(w.city || '').trim();
    if (!city || city.length > 100) return 'У каждого склада обязателен город (до 100 символов)';
    if (cities.has(city.toLowerCase())) return `Склад "${city}" повторяется`;
    cities.add(city.toLowerCase());
    const sku = Number(w.skuCount ?? 0);
    if (!Number.isInteger(sku) || sku < 0 || sku > 10000000) return 'SKU — целое число от 0 до 10 000 000';
  }
  return (input as Array<Record<string, unknown>>).map((w, i) => {
    const id = typeof w.id === 'string' && w.id ? w.id : `wh-self-${i}-${Date.now()}`;
    const city = String(w.city).trim();
    // «Склад проверен»/статус ставит только менеджер в CRM — от клиента игнорируем.
    const old = existing.find(e => e.id === id) ||
      existing.find(e => String(e.city || '').toLowerCase() === city.toLowerCase());
    const st = String(old?.status || '');
    return {
      id, city, skuCount: Number(w.skuCount ?? 0), verified: Boolean(old?.verified),
      address: String(w.address || old?.address || '').trim().slice(0, 300),
      status: ['Новый', 'Проверен', 'Заморожен'].includes(st) ? st : (old?.verified ? 'Проверен' : 'Новый'),
    };
  });
}

export function validateConditions(
  input: unknown,
  warehouses: Array<{ city: string }>,
): string | Array<Record<string, unknown>> {
  if (!Array.isArray(input)) return 'Некорректный список условий';
  if (input.length > MAX_CONDITIONS) return `Максимум ${MAX_CONDITIONS} условий`;
  const whCities = new Set(warehouses.map(w => w.city.toLowerCase()));
  for (const raw of input as Array<Record<string, unknown>>) {
    const city = String(raw.city || '').trim();
    if (!city || city.length > 100) return 'В каждом условии обязателен город показов';
    const wh = String(raw.warehouseName || '').trim();
    if (wh && !whCities.has(wh.toLowerCase())) return `Склад "${wh}" отсутствует в вашем списке складов`;
    for (const k of SS_KEYS) if (String(raw[k] ?? '').length > 500) return 'Поле слишком длинное (макс. 500 символов)';
  }
  return (input as Array<Record<string, unknown>>).map(c => {
    const out: Record<string, string> = {};
    for (const k of SS_KEYS) out[k] = String(c[k] ?? '').trim();
    if (c.id) out.id = String(c.id);
    if (c.status) out.status = String(c.status);
    return out;
  });
}

// Статус условия определяет сервер: новое → «Новое»; изменилось при «Загружено» → «Есть изменения»;
// без изменений → статус сохраняется (легаси → «Загружено»); «Удаление» проходит всегда.
export function withStatuses(
  incoming: Array<Record<string, string>>,
  existing: Array<Record<string, unknown>>,
): Array<Record<string, string>> {
  return incoming.map(c => {
    const match = (existing || []).find(
      e => String(e.city || '').toLowerCase() === c.city.toLowerCase() &&
        String(e.warehouseName || '').toLowerCase() === (c.warehouseName || '').toLowerCase(),
    );
    if (!match) return { ...c, status: 'Новое' };
    const prev = (match.status as string) || 'Новое';
    const inc = c.status || prev;
    if (inc === 'Удаление') return { ...c, status: 'Удаление' };
    const CLIENT_OK = (st: string) => st === 'Новое' || st === 'Есть изменения' || st === 'Удаление';
    const changed = SS_KEYS.some(k => String(match[k] ?? '').trim() !== c[k]);
    if (changed && prev === 'Загружено') return { ...c, status: 'Есть изменения' };
    if (!changed) return { ...c, status: match.status ? prev : 'Загружено' };
    return { ...c, status: CLIENT_OK(prev) ? prev : 'Новое' };
  });
}