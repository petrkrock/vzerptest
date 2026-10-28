import type { HistoryEntry } from '@/types';
import { formatDateTime } from '@/lib/utils';
import { Clock, User } from 'lucide-react';

interface HistoryTabProps {
  history: HistoryEntry[];
}

const FIELD_LABELS: Record<string, string> = {
  status: 'Статус',
  tradeName: 'Торговое название',
  city: 'Город',
  address: 'Адрес',
  website: 'Сайт',
  inn: 'ИНН',
  contactRole: 'Роль',
  contactName: 'Контакт',
  phone: 'Телефон',
  email: 'Email',
  priority: 'Приоритет',
  comment: 'Комментарий',
  source: 'Источник',
  scoring: 'Скоринг',
  service_search: 'Сервис проценки',
  requisites: 'Реквизиты',
  // v1.30.59: служебные поля — читаемые подписи вместо сырых ключей
  serviceAccess: 'Ссылка самообслуживания',
  warehouseLocations: 'Склады',
  serviceSearch: 'Условия проценки',
  offerAccepted: 'Оферта',
  'создание': 'Создание записи',
  // v1.30.60: история задач и поддержки
  created: 'Создание',
  deleted: 'Удаление',
  taskStatus: 'Статус задачи',
  report: 'Отчёт',
};

// v1.30.59: человеческое представление значений истории (JSON → краткое по-русски)
function fmtHistValue(field: string, v: string | undefined): string {
  const t = String(v || '');
  if (!t) return '';
  if (!t.startsWith('{') && !t.startsWith('[')) return t;
  try {
    const o = JSON.parse(t);
    if (field === 'serviceAccess') return o && typeof o === 'object' && 'pin' in o && o.pin ? 'PIN задан' : 'ссылка выдана';
    if (field === 'warehouseLocations') {
      const arr = Array.isArray(o?.warehouse_locations) ? o.warehouse_locations : (Array.isArray(o) ? o : []);
      return arr.length ? `складов: ${arr.length}` : 'данные обновлены';
    }
    if (field === 'serviceSearch') {
      const arr = Array.isArray(o?.service_search) ? o.service_search : (Array.isArray(o) ? o : []);
      return arr.length ? `условий: ${arr.length}` : 'данные обновлены';
    }
    if (Array.isArray(o)) return o.length ? `записей: ${o.length}` : '';
    return 'данные обновлены';
  } catch { return t; }
}

export default function HistoryTab({ history }: HistoryTabProps) {
  const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <Clock size={32} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm">История изменений пуста</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((entry, idx) => (
        <div key={entry.id || `${entry.date}-${idx}`} className="flex gap-3">
          <div className="flex-shrink-0 mt-1">
            <div className="w-8 h-8 rounded-full bg-brand-gray flex items-center justify-center">
              <User size={14} className="text-gray-400" />
            </div>
          </div>
          <div className="flex-1 card-base p-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <span className="text-sm font-medium text-brand-black">
                  {FIELD_LABELS[entry.field] || entry.field}
                </span>
                {fmtHistValue(entry.field, entry.oldValue) && fmtHistValue(entry.field, entry.newValue) && (
                  <span className="text-sm text-gray-500 ml-2">
                    <span className="line-through text-red-400">{fmtHistValue(entry.field, entry.oldValue)}</span>
                    <span className="mx-1">→</span>
                    <span className="text-green-600">{fmtHistValue(entry.field, entry.newValue)}</span>
                  </span>
                )}
                {!fmtHistValue(entry.field, entry.oldValue) && fmtHistValue(entry.field, entry.newValue) && (
                  <span className="text-sm text-green-600 ml-2">{fmtHistValue(entry.field, entry.newValue)}</span>
                )}
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(entry.date)}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-400">{entry.userName}</span>
            </div>
            {entry.comment && (
              <p className="text-sm text-gray-600 mt-1 italic">"{entry.comment}"</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
