// ═══ Этап 1.8 — API скоринг поставщиков через Checko (https://checko.ru/integration/api) ═══
// Изолированный сервис: не меняет существующий код, экспортирует только чистые функции.
// API: POST https://api.checko.ru/v2/company  body: { key, inn }

import type { ScoreData } from '@/types';

/** Маржа = строка 2100 (Валовая прибыль) / строка 2110 (Выручка) × 100%. Запасы (1210) в расчёте не участвуют. */
export function calcMargin(grossProfit?: number, revenue?: number): number | undefined {
  if (!grossProfit || !revenue) return undefined;
  return Math.round((grossProfit / revenue) * 10000) / 100;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v.replace(/\s/g, '')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}

// v1.34.0: прокси — наш API (Supabase edge function «checko» вырезан).
import { apiRequest } from '@/lib/api';

/** Запрос компании по ИНН. Через Supabase Edge Function «checko» (прокси, лечит CORS),
 *  при отсутствии Supabase — прямой запрос (может блокироваться браузером по CORS). */
export async function fetchCheckoCompany(key: string, inn: string): Promise<ScoreData> {
  const json = await apiRequest<Record<string, unknown>>('/checko/lookup', {
    method: 'POST', body: { key, inn },
  }).catch((e: Error) => { throw new Error(e.message || 'checko.ru недоступен'); });
  if (!json || json.status === 'error') {
    const err = json?.error as Record<string, unknown> | string | undefined;
    throw new Error(typeof err === 'string' ? err : (err?.message as string) || 'Ошибка checko.ru');
  }
  const data = (json.data as Record<string, unknown>) || json;
  // ТЗ v1.22.13: «Финансы» приходит то массивом [{year,...}], то объектом {"2023": {...}} —
  // раньше объект давал пустые блоки. Приводим оба формата к списку.
  const rawFin: unknown = data['Финансы'] || data.finances || [];
  const finances: Array<Record<string, unknown>> = Array.isArray(rawFin)
    ? rawFin
    : Object.entries((rawFin && typeof rawFin === 'object') ? rawFin as Record<string, unknown> : {})
        .map(([y, v]) => ({ year: Number(y), ...((v && typeof v === 'object') ? v as Record<string, unknown> : {}) }));
  const latest = [...finances].sort((a, b) => Number(b.year || 0) - Number(a.year || 0))[0] || {};
  const year = Number(latest.year) || new Date().getFullYear() - 1;
  // ТЗ v1.22.13: API отдаёт суммы в тысячах — дописываем три нуля (только API-путь;
  // ручной ввод в форме скоринга не масштабируется).
  const scale = (v?: number) => (v == null ? undefined : Math.round(v * 1000));
  // ТЗ v1.22.15: коды строк из справочника Checko + русские подписи как fallback
  const revenue = scale(num(latest['2110']) ?? num(latest['Выручка']));       // Выручка
  const inventory = scale(num(latest['1210']) ?? num(latest['Запасы']));      // Запасы
  const grossProfit = scale(num(latest['2100']) ?? num(latest['Валовая прибыль'])); // Валовая прибыль
  if (revenue == null && grossProfit == null) {
    const note = (data as Record<string, unknown>)['finances_error'];
    throw new Error('Финансовые данные не найдены в ответе Checko (нет строк 2110/2100)'
      + (note ? `. Причина: ${note}` : '. Возможно, у компании нет отчётности или тариф не включает finances'));
  }
  const name = data['Наименование'] as { Полнное?: string; Сокращенное?: string } | undefined;
  return {
    year, revenue, inventory, grossProfit,
    marginPct: calcMargin(grossProfit, revenue),
    companyName: name?.Полнное || name?.Сокращенное || undefined,
    apiLoaded: true,
    apiLoadedAt: new Date().toISOString(),
  };
}
