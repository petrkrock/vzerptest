import { Fragment, useState, useMemo, useEffect } from 'react';
import { getStore, updateStore, useStoreVersion } from '@/lib/store';
import { generateId } from '@/lib/utils';
import { canEditPlanFact, canSeePlanCity, getCurrentUser } from '@/lib/auth';
import { History, Save, Edit2, X, Plus, Trash2, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import type { PlanFactEntry } from '@/types';

const PERIODS = [
  { key: 'day', label: 'Текущий день' },
  { key: 'week', label: 'Текущая неделя' },
  { key: 'month', label: 'Текущий месяц' },
  { key: 'quarter', label: 'Квартал' },
  { key: 'half', label: 'Полугодие' },
  { key: 'year', label: 'Текущий год' },
  { key: 'custom', label: 'Произвольный' },
];

const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Диапазон месяца со смещением от текущего (0 — текущий, 1 — следующий). */
function monthRange(offset: number): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { startDate: dstr(first), endDate: dstr(last), label: MONTH_NAMES[first.getMonth()] };
}

function getPeriodRange(period: string): { from: Date; to: Date } {
  // Календарные периоды (ТЗ): день=сегодня, неделя=пн–вс, месяц=текущий,
  // квартал/полугодие — как у налоговой, год=текущий календарный.
  const now = new Date();
  const y = now.getFullYear(); const m = now.getMonth();
  let from: Date; let to: Date;
  if (period === 'day') { from = new Date(y, m, now.getDate()); to = new Date(y, m, now.getDate(), 23, 59, 59); }
  else if (period === 'week') { const dow = (now.getDay() + 6) % 7; from = new Date(y, m, now.getDate() - dow); to = new Date(y, m, now.getDate() - dow + 6, 23, 59, 59); }
  else if (period === 'month') { from = new Date(y, m, 1); to = new Date(y, m + 1, 0, 23, 59, 59); }
  else if (period === 'quarter') { const q = Math.floor(m / 3) * 3; from = new Date(y, q, 1); to = new Date(y, q + 3, 0, 23, 59, 59); }
  else if (period === 'half') { const h = m < 6 ? 0 : 6; from = new Date(y, h, 1); to = new Date(y, h + 6, 0, 23, 59, 59); }
  else { from = new Date(y, 0, 1); to = new Date(y, 11, 31, 23, 59, 59); }
  return { from, to };
}

const dstr = (d: Date) => d.toISOString().slice(0, 10);

/** «Сентябрь 26г.» — месяц и год плана из ISO-даты начала.
 *  План на текущий месяц (даже созданный в середине, напр. 15.09–30.09) помечается «Текущий — …»,
 *  план на следующий месяц (01.10–30.10) — «Следующий — …». */
function monthLabel(iso: string): string {
  const m = parseInt(iso.slice(5, 7), 10) - 1;
  const name = MONTH_NAMES[m] || '';
  const baseRaw = name.charAt(0).toUpperCase() + name.slice(1) + ' ' + iso.slice(2, 4) + 'г.';
  return baseRaw;
}

const PlanFormFields = ({ form, setF, forAdd, cities, buyerTypesList, supplierTypesList, supplierServicesList, onPeriod }: {
  form: Partial<PlanFactEntry>; setF: (f: Partial<PlanFactEntry>) => void; forAdd?: boolean;
  cities: string[]; buyerTypesList: string[]; supplierTypesList: string[]; supplierServicesList: string[];
  onPeriod?: (key: string) => void; // ТЗ: кнопка периода также задаёт период таблицы и сводки
}) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {/* Город нужен только планам покупателей (ТЗ); планы поставщиков — общие */}
      {(form.kind || 'suppliers') === 'buyers' && (
        <div><label className="form-label">Город *</label>
          <select className="form-input" value={form.cityId || ''} onChange={e => setF({ ...form, cityId: e.target.value || undefined })}>
            <option value="" disabled>— выберите город —</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      {forAdd ? (
        // ТЗ (этап 3): «Текущий месяц» = остаток месяца (с сегодня), «Следующий» = весь следующий месяц
        <div className="col-span-2">
          <label className="form-label">Период плана *</label>
          <div className="flex flex-wrap gap-2">
            {(() => {
              const cur = monthRange(0);
              const nxt = monthRange(1);
              const opts = [
                { key: 'cur', label: 'Текущий месяц', hint: 'остаток месяца', startDate: dstr(new Date()), endDate: cur.endDate },
                { key: 'nxt', label: 'Следующий месяц', hint: 'весь месяц', startDate: nxt.startDate, endDate: nxt.endDate },
              ];
              return opts.map(o => (
                <button key={o.key} type="button"
                  onClick={() => { setF({ ...form, startDate: o.startDate, endDate: o.endDate }); onPeriod?.(o.key); }}
                  className={`text-xs px-3 py-2 rounded-lg border transition-colors ${form.startDate === o.startDate && form.endDate === o.endDate ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-600'}`}>
                  {o.label} <span className="opacity-60">({o.hint})</span>
                </button>
              ));
            })()}
          </div>
        </div>
      ) : (
        /* ТЗ: при редактировании даты плана не меняются — период задаётся при создании */
        <div className="col-span-2 flex items-center gap-2 text-xs text-gray-400">
          <span className="font-medium text-gray-500">Период плана:</span>
          <span className="px-2 py-1 rounded-lg bg-brand-gray border border-brand-gray-mid">{form.startDate} — {form.endDate}</span>
          <span className="text-gray-400">(не редактируется)</span>
        </div>
      )}
      <div><label className="form-label">Ответственный *</label>
        <ResponsibleSelect value={form.responsibleId} onChange={(id, name) => setF({ ...form, responsibleId: id, responsibleName: name })} />
      </div>
      {/* ТЗ (этап 3): вид плана определяется открытой вкладкой — «Тип плана» не спрашиваем */}
      {/* Точность плана (ТЗ): не выбрано = план на все типы/все сервисы */}
      {(form.kind || 'suppliers') === 'suppliers' ? (
        <>
          <div><label className="form-label">Тип поставщиков</label>
            <select className="form-input" value={form.filterType || ''} onChange={e => setF({ ...form, filterType: e.target.value || undefined })}>
              <option value="">— Все типы —</option>
              {supplierTypesList.map(t => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div className="sm:col-span-2"><label className="form-label">Сервис продаж *</label>
            <div className="flex flex-wrap gap-1.5">
              {supplierServicesList.map(sv => {
                const on = (form.serviceIds || []).includes(sv);
                return (
                  <button type="button" key={sv} onClick={() => setF({ ...form, serviceIds: on ? (form.serviceIds || []).filter(x => x !== sv) : [...(form.serviceIds || []), sv] })}
                    className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>
                    {sv}
                  </button>
                );
              })}
              {!supplierServicesList.length && <span className="text-xs text-gray-400">Справочник сервисов пуст (Настройки)</span>}
            </div></div>
        </>
      ) : (
        <div><label className="form-label">Тип покупателей</label>
          <select className="form-input" value={form.filterType || ''} onChange={e => setF({ ...form, filterType: e.target.value || undefined })}>
            <option value="">— Все типы —</option>
            {buyerTypesList.map(t => <option key={t} value={t}>{t}</option>)}
          </select></div>
      )}
      <div><label className="form-label">План (количество) *</label><input type="number" min="0" className="form-input" value={form.plan || 0} onChange={e => setF({ ...form, plan: parseInt(e.target.value) || 0 })} /></div>
      <div className="sm:col-span-2"><label className="form-label">Заметки</label>
        <textarea className="form-input min-h-[70px]" placeholder="Заметки к записи плана..." value={form.notes || ''} onChange={e => setF({ ...form, notes: e.target.value })} /></div>
    </div>
  );


function calcPct(fact: number, plan: number): number | null {
  return plan ? Math.round((fact / plan) * 100) : null;
}

// ── Точные планы (ТЗ: по типу и сервису продаж) ──
type FactRecord = { id: string; type: string; status?: string; services?: string[] };

function entryMatchesRecord(entry: PlanFactEntry, r: FactRecord): boolean {
  if (entry.filterType && r.type !== entry.filterType) return false;
  if (entry.filterService && !(r.services || []).includes(entry.filterService)) return false;
  return true;
}

/** Распределение факта по записям плана: точные записи (с фильтрами) получают
 *  подходящие объекты первыми — без двойного счёта; записи «без фильтров»
 *  покрывают всё остальное (не взятое точными). */
function distributeFact(records: FactRecord[], entries: PlanFactEntry[]): Map<string, { act: number; pot: number }> {
  const byEntry = new Map<string, { act: number; pot: number }>();
  entries.forEach(e => byEntry.set(e.id, { act: 0, pot: 0 }));
  const precise = entries.filter(e => e.filterType || e.filterService);
  const broad = entries.filter(e => !e.filterType && !e.filterService);
  const taken = new Set<string>();
  for (const r of records) {
    const hit = precise.find(e => entryMatchesRecord(e, r));
    if (hit) {
      const b = byEntry.get(hit.id)!;
      b.pot++;
      if (r.status && /актив/i.test(r.status)) b.act++;
      taken.add(r.id);
    }
  }
  const leftover = records.filter(r => !taken.has(r.id));
  for (const e of broad) {
    const b = byEntry.get(e.id)!;
    b.pot += leftover.length;
    b.act += leftover.filter(r => r.status && /актив/i.test(r.status)).length;
  }
  return byEntry;
}

function pctColor(pct: number | null): string {
  if (pct === null) return 'text-gray-300';
  if (pct >= 100) return 'text-green-600';
  if (pct >= 80) return 'text-yellow-600';
  return 'text-red-500';
}

export default function PlanFactPage() {
  useStoreVersion();
  const [, forceUpdate] = useState(0);
  const store = getStore();
  const [period, setPeriod] = useState('month');
  // ТЗ 1.7.7 (этап 1): жёсткий выбор базы + режим сводки
  const [baseRaw, setBase] = useState<'buyer' | 'supplier'>('buyer');
  // ТЗ v1.21.5: у менеджера с выбранной базой в правах — показываем только её (переключатель заблокирован).
  const meUser = getCurrentUser();
  const baseLocked = meUser?.role === 'manager' && !!meUser.planfactBase;
  const base: 'buyer' | 'supplier' = meUser?.role === 'manager' && meUser.planfactBase
    ? (meUser.planfactBase === 'buyers' ? 'buyer' : 'supplier')
    : baseRaw; // по умолчанию — покупатели
  const switchBase = (b: 'buyer' | 'supplier') => { setBase(b); setEditingId(null); setReportId(null); setShowAddForm(false); setSelected([]); };
  const [viewMode, setViewMode] = useState<'current' | 'next' | 'custom' | 'archive'>('current');
  const [customMonth, setCustomMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [customFrom, setCustomFrom] = useState(dstr(new Date()));
  const [customTo, setCustomTo] = useState(dstr(new Date()));
  const [filterCity, setFilterCity] = useState('');
  const [filterResponsible, setFilterResponsible] = useState(''); // фильтр по ответственным (ТЗ)
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // ТЗ: фильтр отчётов таблицы + чекбоксы для выгрузки отчётов (объявлены до memo, использующих их)
  const [reportFilter, setReportFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [selected, setSelected] = useState<string[]>([]);
  // ТЗ: блок «По городам» свёрнут по умолчанию
  const [citiesOpen, setCitiesOpen] = useState(false);
  // ТЗ: фильтр «Сервисы продаж» сводки поставщиков
  const [filterService, setFilterService] = useState('');
  // ТЗ: подгрузка таблицы «Активные планы»
  const [pfLimit, setPfLimit] = useState(50);
  const [pfShown, setPfShown] = useState(50);
  const canEdit = canEditPlanFact();

  const range = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) return { from: new Date(customFrom), to: new Date(customTo) };
    return getPeriodRange(period);
  }, [period, customFrom, customTo]);
  const fromStr = dstr(range.from);
  const toStr = dstr(range.to);

  // Города План/Факт = общие города поставщиков/покупателей (ТЗ)
  const cities = store.settings.cities || [];
  const supplierTypesList = store.settings.supplierTypes || [];
  const buyerTypesList = store.settings.buyerTypes || [];
  const supplierServicesList = ((store.settings.supplierServices || []) as Array<{ name: string; deletedAt?: string }>)
    .filter(s => !s.deletedAt).map(s => s.name);

  // Записи плана, пересекающиеся с выбранным периодом
  // ТЗ (этап 3): своя таблица на каждую вкладку, период — верхний фильтр сводки
  const entries = useMemo(() => {
    const cur = monthRange(0);
    const nxt = monthRange(1);
    const all = (store.settings.planFact || []).filter(e => (viewMode === 'archive' || !e.deletedAt) && (!e.cityName || canSeePlanCity(e.cityName)) && e.kind === (baseRaw === 'buyer' ? 'buyers' : 'suppliers')); // своя таблица на каждую секцию; на «Архиве» — и удалённые записи
    if (viewMode === 'archive') {
      // Архив = удалённые записи (любого периода) + записи прошлых периодов (ТЗ)
      return all.filter(e => e.deletedAt || (!(e.startDate <= cur.endDate && e.endDate >= cur.startDate) && !(e.startDate <= nxt.endDate && e.endDate >= nxt.startDate)));
    }
    const sel = viewMode === 'current' ? cur : viewMode === 'next' ? nxt
      : (() => { const [y, m] = customMonth.split('-').map(Number); return { startDate: dstr(new Date(y, m - 1, 1)), endDate: dstr(new Date(y, m, 0)) }; })();
    return all.filter(e => e.startDate <= sel.endDate && e.endDate >= sel.startDate);
  }, [store, baseRaw, viewMode, customMonth, filterCity, filterService]);

  // ТЗ: записи таблицы с учётом фильтров отчётов и города
  const visibleEntries = useMemo(
    () => entries
      .filter(e => reportFilter === 'all' || (reportFilter === 'yes' ? !!e.report : !e.report))
      .filter(e => !filterCity || e.cityName === filterCity),
    [entries, reportFilter, filterCity],
  );

  // ТЗ: сброс подгрузки таблицы при смене периода/секции/фильтра отчётов
  useEffect(() => { setPfShown(pfLimit); }, [visibleEntries]);

  // ТЗ: счётчики для заголовка «По городам»
  const visibleCities = cities.filter(canSeePlanCity);
  const citiesWithPlan = visibleCities.filter(c => entries.some(e => e.cityName === c)).length;

  /** Факт конкретной записи плана (ТЗ): активные/потенциал под фильтры плана, без архива */
  const entryFact = (e: PlanFactEntry): { act: number; pot: number } => {
    const list = (e.kind === 'buyers' ? store.buyers : store.suppliers) as Array<{ deletedAt?: string; status?: string; type?: string; city?: string; createdAt?: string; responsibleId?: string }>;
    const matched = list.filter(x => !x.deletedAt && x.status !== 'АРХИВ' && x.status !== 'Архив дублей'
      && (!e.filterType || x.type === e.filterType)
      && (e.kind !== 'buyers' || !e.cityName || x.city === e.cityName)
      && !!x.responsibleId && x.responsibleId === e.responsibleId   // ТЗ: только объекты, закреплённые за ответственным плана
      && !!x.createdAt && x.createdAt.slice(0, 10) >= e.startDate && x.createdAt.slice(0, 10) <= e.endDate);
    return {
      act: matched.filter(x => x.status === 'Активный').length,
      pot: matched.filter(x => !!x.status && x.status !== 'Активный').length,
    };
  };

  /** % выполнения конкретного плана (ТЗ): факт без архива под фильтры плана / план */
  const entryPct = (e: PlanFactEntry): number | null => {
    const { act, pot } = entryFact(e);
    return e.plan ? Math.min(100, Math.round(((act + pot) / e.plan) * 100)) : null;
  };


  // ═══ АКТИВНАЯ СВОДКА (ТЗ 1.7.7, этап 1) ═══
  const summary = useMemo(() => {
    const cur = monthRange(0);
    const nxt = monthRange(1);
    const overlap = (e: PlanFactEntry, r: { startDate: string; endDate: string }) => e.startDate <= r.endDate && e.endDate >= r.startDate;
    const allEntries = (store.settings.planFact || []).filter(e => (viewMode === 'archive' || !e.deletedAt) && e.kind === (baseRaw === 'buyer' ? 'buyers' : 'suppliers'));
    let sel: { startDate: string; endDate: string } | null = null;
    if (viewMode === 'current') sel = cur;
    else if (viewMode === 'next') sel = nxt;
    else if (viewMode === 'custom') {
      const [y, m] = customMonth.split('-').map(Number);
      sel = { startDate: dstr(new Date(y, m - 1, 1)), endDate: dstr(new Date(y, m, 0)) };
    }
    let planEntries = viewMode === 'archive'
      ? allEntries.filter(e => e.deletedAt || (!overlap(e, cur) && !overlap(e, nxt)))
      : sel ? allEntries.filter(e => overlap(e, sel!)) : [];
    // ТЗ: фильтр по городу (только покупатели) — сужает и план, и факт сводки
    if (filterCity) planEntries = planEntries.filter(e => e.cityName === filterCity);
    const plan = planEntries.reduce((s, e) => s + (e.plan || 0), 0);
    let fact = (baseRaw === 'buyer' ? store.buyers : store.suppliers) as Array<{ status?: string; type?: string; city?: string; createdAt?: string; responsibleId?: string }>;
    if (filterCity) fact = fact.filter(x => x.city === filterCity);
    // ТЗ (v1.21.2): фильтр по ответственному сужает и план, и факт сводки
    if (filterResponsible) {
      planEntries = planEntries.filter(e => filterResponsible === '__none__' ? !e.responsibleId : e.responsibleId === filterResponsible);
      fact = fact.filter(x => filterResponsible === '__none__' ? !x.responsibleId : x.responsibleId === filterResponsible);
    }
    // ТЗ: фильтр сервисов продаж (только поставщики); записи без сервисов покрывают все
    if (baseRaw === 'supplier' && filterService) {
      planEntries = planEntries.filter(e => !(e.serviceIds || []).length || (e.serviceIds || []).includes(filterService));
      fact = fact.filter(x => (x as { services?: string[] }).services?.includes(filterService));
    }
    if (viewMode === 'archive') {
      fact = fact.filter(x => { const d = x.createdAt?.slice(0, 10); return d && !(d >= cur.startDate && d <= cur.endDate) && !(d >= nxt.startDate && d <= nxt.endDate); });
    } else if (sel) {
      fact = fact.filter(x => { const d = x.createdAt?.slice(0, 10); return d && d >= sel!.startDate && d <= sel!.endDate; });
    }
    const isAct = (s?: string) => s === 'Активный';
    const isExcluded = (s?: string) => s === 'Активный' || s === 'АРХИВ' || s === 'Архив дублей';
    const act = fact.filter(x => isAct(x.status)).length;
    const pot = fact.filter(x => !!x.status && !isExcluded(x.status)).length;
    const pct = plan ? Math.round(((act + pot) / plan) * 100) : null;
    const typeList = (baseRaw === 'buyer' ? store.settings.buyerTypes : store.settings.supplierTypes) || [];
    const typeRows = typeList.map(tp => {
      const sub = fact.filter(x => x.type === tp);
      return {
        name: tp,
        // ПЛАН по типу: записи без фильтра типа покрывают все типы (ТЗ)
        plan: planEntries.filter(e => !e.filterType || e.filterType === tp).reduce((s, e) => s + (e.plan || 0), 0),
        act: sub.filter(x => isAct(x.status)).length,
        pot: sub.filter(x => !!x.status && !isExcluded(x.status)).length,
      };
    });
    const cityRows = (store.settings.cities || []).map(ct => {
      const sub = fact.filter(x => x.city === ct);
      return { name: ct, act: sub.filter(x => isAct(x.status)).length, pot: sub.filter(x => !!x.status && !isExcluded(x.status)).length, plan: planEntries.filter(e => e.cityName === ct).reduce((s, e) => s + (e.plan || 0), 0) };
    }).filter(r => r.act || r.pot || r.plan);
    return { plan, act, pot, pct, typeRows, cityRows, count: fact.length };
  }, [store, baseRaw, viewMode, customMonth, filterCity, filterResponsible]);


  const [addForm, setAddForm] = useState<Partial<PlanFactEntry>>({ startDate: dstr(new Date()), endDate: monthRange(0).endDate, kind: 'suppliers', plan: 0 }); // по умолчанию — Текущий месяц (остаток месяца)
  const [editForm, setEditForm] = useState<Partial<PlanFactEntry>>({});
  // ТЗ (этап 3): ОТЧЁТ по записи плана
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportText, setReportText] = useState('');

  function saveAdd(e: React.FormEvent) {
    e.preventDefault();
    if (addForm.kind === 'buyers' && !addForm.cityId) { toast.error('Для плана покупателей выберите город'); return; }
    // ТЗ (этап 3): у поставщиков сервис продаж обязателен
    if (addForm.kind === 'suppliers' && !(addForm.serviceIds || []).length) { toast.error('Для плана поставщиков выберите хотя бы один сервис продаж'); return; }
    if (!addForm.responsibleId) { toast.error('Выберите ответственного'); return; } // ТЗ: обязательно
    if (!addForm.plan) { toast.error('Укажите план (количество)'); return; }
    const now = new Date().toISOString();
    const entry: PlanFactEntry = {
      id: generateId(),
      startDate: addForm.startDate || fromStr,
      endDate: addForm.endDate || toStr,
      cityId: addForm.kind === 'buyers' ? addForm.cityId : undefined,     // город только у планов покупателей (ТЗ)
      cityName: addForm.kind === 'buyers' ? addForm.cityId : undefined,   // город — строка из общих городов
      kind: addForm.kind || 'suppliers',
      plan: addForm.plan || 0,
      filterType: addForm.filterType,
      filterService: addForm.filterService,
      serviceIds: addForm.serviceIds,                                      // ТЗ: сервисы продаж (множественный выбор)
      notes: addForm.notes,                                                // ТЗ: заметки
      responsibleId: addForm.responsibleId,
      responsibleName: addForm.responsibleName,
      createdAt: now, updatedAt: now,
      history: [{ id: generateId(), date: now, field: 'created', newValue: 'План создан', userId: getCurrentUser()?.id || '', userName: getCurrentUser()?.name || '' }],
    };
    updateStore(s => ({ ...s, settings: { ...s.settings, planFact: [...(s.settings.planFact || []), entry] } }));
    setShowAddForm(false);
    setAddForm({ startDate: dstr(new Date()), endDate: monthRange(0).endDate, kind: baseRaw === 'buyer' ? 'buyers' : 'suppliers', plan: 0, serviceIds: baseRaw === 'supplier' ? [] : undefined });
    forceUpdate(n => n + 1);
    toast.success('Запись добавлена');
  }

  function startEdit(entry: PlanFactEntry) { setEditingId(entry.id); setEditForm({ ...entry }); }

  // ТЗ: клик по городу без плана — «Новая запись (покупатели)» с выбранным городом и периодом активной вкладки
  function openNewForCity(city: string) {
    const cur = monthRange(0);
    const nxt = monthRange(1);
    let startDate: string; let endDate: string;
    if (viewMode === 'next') { startDate = nxt.startDate; endDate = nxt.endDate; }
    else if (viewMode === 'custom') { const [y, m] = customMonth.split('-').map(Number); startDate = dstr(new Date(y, m - 1, 1)); endDate = dstr(new Date(y, m, 0)); }
    else { startDate = dstr(new Date()); endDate = cur.endDate; } // current и archive — остаток текущего месяца
    setAddForm({ startDate, endDate, kind: 'buyers', cityId: city, plan: 0 });
    setShowAddForm(true); setEditingId(null);
  }

  function saveEdit() {
    if (!editingId) return;
    const now = new Date().toISOString();
    updateStore(s => ({
      ...s, settings: {
        ...s.settings, planFact: (s.settings.planFact || []).map(e => e.id === editingId
          ? { ...e, ...editForm, cityName: editForm.cityId || editForm.cityName, updatedAt: now }
          : e),
      },
    }));
    setEditingId(null); setEditForm({}); forceUpdate(n => n + 1);
    toast.success('Запись обновлена');
  }

  function saveReport(id: string) {
    const now = new Date().toISOString();
    const u = getCurrentUser();
    updateStore(s => ({ ...s, settings: { ...s.settings, planFact: (s.settings.planFact || []).map(en => en.id === id ? { ...en, report: reportText, updatedAt: now, history: [...(en.history || []), { id: generateId(), date: now, field: 'report', newValue: 'Отчёт обновлён', userId: u?.id || '', userName: u?.name || '' }] } : en) } }));
    setReportId(null); setReportText('');
    toast.success('Отчёт сохранён');
  }

  // ТЗ: выгрузка отчётов выбранных записей в Word (.doc — HTML-совместимый формат, открывается в MS Word)
  function exportReports() {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parts: string[] = [];
    parts.push(`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Отчёты план-факт</title>
      <style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:16pt}h2{font-size:12pt;margin:14pt 0 4pt}p{margin:4pt 0;white-space:pre-wrap}div.item{border-bottom:1pt solid #999;padding-bottom:6pt;margin-bottom:10pt}span.meta{color:#555;font-size:10pt}</style></head><body>`);
    parts.push(`<h1>Отчёты о проделанной работе (план-факт)</h1>`);
    parts.push(`<p><span class="meta">Дата выгрузки: ${dstr(new Date())} · Записей: ${selected.length}</span></p>`);
    (store.settings.planFact || []).filter(e => selected.includes(e.id)).forEach(e => {
      parts.push('<div class="item">');
      parts.push(`<h2>${esc(monthLabel(e.startDate))} — ${e.kind === 'buyers' ? 'Покупатели' : 'Поставщики'}${e.cityName ? ', ' + esc(e.cityName) : ''}</h2>`);
      parts.push(`<p><span class="meta">Период: ${e.startDate} — ${e.endDate} · Ответственный: ${esc(e.responsibleName || '—')} · План: ${e.plan}${e.filterType ? ' · Тип: ' + esc(e.filterType) : ''}${(e.serviceIds || []).length ? ' · Сервисы: ' + esc((e.serviceIds || []).join(', ')) : ''}</span></p>`);
      parts.push(`<p>${esc(e.report || '(отчёт не заполнен)')}</p>`);
      parts.push('</div>');
    });
    parts.push('</body></html>');
    const blob = new Blob(['\ufeff' + parts.join('')], { type: 'application/msword;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `отчеты_план-факт_${dstr(new Date())}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Выгружено отчётов в Word: ${selected.length}`);
  }

  function restoreEntry(id: string) {
    updateStore(s => ({
      ...s, settings: {
        ...s.settings, planFact: (s.settings.planFact || []).map(e => e.id === id ? { ...e, deletedAt: undefined, updatedAt: new Date().toISOString() } : e),
      },
    }));
    forceUpdate(n => n + 1); toast.success('Запись восстановлена из архива');
  }

  function deleteEntry(id: string) {
    if (!confirm('Отправить запись в архив?')) return;
    updateStore(s => ({
      ...s, settings: {
        ...s.settings, planFact: (s.settings.planFact || []).map(e => e.id === id ? { ...e, deletedAt: new Date().toISOString() } : e),
      },
    }));
    forceUpdate(n => n + 1); toast.success('Удалено');
  }

  // KPI текущего месяца (план + авто-факт)
  const now = new Date();
  const mFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const mTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const cmEntries = (store.settings.planFact || []).filter(e => !e.deletedAt && canSeePlanCity(e.cityName) && e.startDate <= mTo && e.endDate >= mFrom);
  const cmPlanS = cmEntries.filter(e => e.kind === 'suppliers').reduce((s, e) => s + (e.plan || 0), 0);
  const cmPlanB = cmEntries.filter(e => e.kind === 'buyers').reduce((s, e) => s + (e.plan || 0), 0);
  const cmRecS = store.suppliers.filter(s => !s.deletedAt && !!s.createdAt && s.createdAt.slice(0, 10) >= mFrom && s.createdAt.slice(0, 10) <= mTo) as FactRecord[];
  const cmRecB = store.buyers.filter(b => !b.deletedAt && !!b.createdAt && b.createdAt.slice(0, 10) >= mFrom && b.createdAt.slice(0, 10) <= mTo) as FactRecord[];
  const cmDistS = distributeFact(cmRecS, cmEntries.filter(e => e.kind === 'suppliers'));
  const cmDistB = distributeFact(cmRecB, cmEntries.filter(e => e.kind === 'buyers'));
  const sumBucket = (m: Map<string, { act: number; pot: number }>, key: 'act' | 'pot') =>
    Array.from(m.values()).reduce((s, b) => s + b[key], 0);
  const cmFactS = sumBucket(cmDistS, 'act');
  const cmFactB = sumBucket(cmDistB, 'act');


  const colCount = canEdit ? 7 : 6;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="actions-bar flex items-center justify-start flex-wrap gap-2">
        {/* ТЗ: выбор базы в шапке (как в базе лидов); кнопки «Добавить запись» здесь НЕТ */}
        <div className="flex items-center gap-2">
          <button onClick={() => switchBase('buyer')} disabled={baseLocked} title={baseLocked ? 'База задана в правах менеджера' : undefined} className={`action-btn text-xs py-1.5 px-3 ${base === 'buyer' ? 'bg-gray-200' : ''} ${baseLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>Покупатели</button>
          <button onClick={() => switchBase('supplier')} disabled={baseLocked} title={baseLocked ? 'База задана в правах менеджера' : undefined} className={`action-btn text-xs py-1.5 px-3 ${base === 'supplier' ? 'bg-gray-200' : ''} ${baseLocked ? 'opacity-50 cursor-not-allowed' : ''}`}>Поставщики</button>
        </div>
      </div>

      {/* ═══ АКТИВНАЯ СВОДКА (дизайн v2) ═══ */}
      <div className="card-base p-0 mb-4 overflow-hidden">
        {/* Шапка: заголовок + сегменты базы и периода */}
        <div className="px-4 pt-3 pb-2.5 border-b border-brand-gray-mid bg-gradient-to-r from-brand-gray/60 to-transparent">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h2 className="section-title">Активная сводка {baseRaw === 'buyer' ? 'покупатели' : 'поставщики'}</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">Период: {' '}
                {viewMode === 'current' ? 'текущий месяц' : viewMode === 'next' ? 'следующий месяц' : viewMode === 'archive' ? 'архив' : `период: ${customMonth}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Фильтр по ответственному (v1.21.2): перед «Все города» (покупатели) и «Все сервисы» (поставщики) */}
              <select className="form-input py-1.5 text-xs w-auto" value={filterResponsible} onChange={e => setFilterResponsible(e.target.value)} title="Фильтр по ответственному">
                <option value="">Все ответственные</option>
                <option value="__none__">Без ответственного</option>
                {store.settings.users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {/* Период — пилюли; все контролы единой высоты h-8 */}
              {baseRaw === 'buyer' && (
                <select className="form-input text-xs py-1.5 px-3 w-auto" value={filterCity} onChange={e => setFilterCity(e.target.value)} title="Фильтр по городу">
                  <option value="">Все города</option>
                  {visibleCities.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {baseRaw === 'supplier' && (
                <select className="form-input text-xs py-1.5 px-3 w-auto" value={filterService} onChange={e => setFilterService(e.target.value)} title="Фильтр по сервису продаж">
                  <option value="">Все сервисы</option>
                  {supplierServicesList.map(sv => <option key={sv} value={sv}>{sv}</option>)}
                </select>
              )}
              <button onClick={() => setViewMode('current')} className={`btn-secondary text-xs py-1.5 px-3 ${viewMode === 'current' ? 'bg-gray-200' : ''}`}>Текущий месяц</button>
              <button onClick={() => setViewMode('next')} className={`btn-secondary text-xs py-1.5 px-3 ${viewMode === 'next' ? 'bg-gray-200' : ''}`}>Следующий</button>
              <input type="month" className="form-input text-xs py-1.5 px-3 w-auto" value={customMonth} onChange={e => { setCustomMonth(e.target.value); setViewMode('custom'); }} title="Произвольный месяц" />
              <button onClick={() => setViewMode('archive')} className={`btn-secondary text-xs py-1.5 px-3 ${viewMode === 'archive' ? 'bg-gray-200' : ''}`}>Архив</button>
              {canEdit && (
                <button onClick={() => { setAddForm({ startDate: dstr(new Date()), endDate: monthRange(0).endDate, kind: baseRaw === 'buyer' ? 'buyers' : 'suppliers', plan: 0, cityId: undefined, filterType: undefined, serviceIds: baseRaw === 'buyer' ? undefined : [] }); setShowAddForm(true); setEditingId(null); }}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center" title={baseRaw === 'buyer' ? 'Новая запись (покупатели)' : 'Новая запись (поставщики)'}>
                  <Plus size={18} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KPI — компактные карточки без цветных полос */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 px-4 pt-3 pb-1.5">
          <div className="stat-card px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">План</p>
            <p className="text-2xl font-bold mt-0.5">{summary.plan}</p>
          </div>
          <div className="stat-card px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Активные</p>
            <p className="text-2xl font-bold mt-0.5 text-green-600">{summary.act}</p>
          </div>
          <div className="stat-card px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">Потенциал</p>
            <p className="text-2xl font-bold mt-0.5 text-blue-600">{summary.pot}</p>
          </div>
          <div className="stat-card px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">% выполнения общего плана</p>
            <p className="text-2xl font-bold mt-0.5">{summary.pct === null ? '—' : `${summary.pct}%`}</p>
            {summary.plan > 0 && (
              <div className="mt-1.5 h-1.5 rounded-full bg-brand-gray overflow-hidden">
                <div className="h-full bg-brand-black rounded-full transition-all" style={{ width: `${Math.min(100, summary.pct || 0)}%` }} />
              </div>
            )}
          </div>
        </div>

        {/* По типам */}
        <div className="px-4 pb-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">По типам {baseRaw === 'buyer' ? 'покупателей' : 'поставщиков'}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
            {summary.typeRows.map(r => (
              <div key={r.name} className="flex flex-col gap-1 border border-brand-gray-mid rounded-xl px-3 py-2.5 text-xs hover:bg-brand-gray/50 transition-colors">
                <span className="font-medium truncate">{r.name}</span>
                <span className="flex items-center gap-1.5 whitespace-nowrap" title="План · Активные · Потенциал">
                  <span className="min-w-[24px] text-center px-1.5 py-0.5 rounded-md bg-gray-200/80 text-gray-700 font-bold text-[10px] tabular-nums" title="План">{r.plan}</span>
                  <span className="min-w-[24px] text-center px-1.5 py-0.5 rounded-md bg-green-100 text-green-700 font-bold text-[10px] tabular-nums" title="Активные">{r.act}</span>
                  <span className="min-w-[24px] text-center px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold text-[10px] tabular-nums" title="Потенциал">{r.pot}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {baseRaw === 'buyer' && (
        <div>
        {/* По городам — только покупатели (ТЗ) */}
        <div className="px-4 pb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              По городам (всего {visibleCities.length}, с планом: {citiesWithPlan}, без плана: {visibleCities.length - citiesWithPlan})
            </h3>
            <button onClick={() => setCitiesOpen(o => !o)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1">
              {citiesOpen ? <><ChevronUp size={12} /> Свернуть</> : <><ChevronDown size={12} /> Развернуть</>}
            </button>
          </div>
          {citiesOpen && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-1.5">
            {/* Все доступные города (ТЗ): без плана в выбранном периоде — красные, клик открывает «Новая запись (покупатели)» */}
            {cities.filter(canSeePlanCity).map(ct => {
              const ent = entries.filter(e => e.cityName === ct);
              const plan = ent.reduce((s, e) => s + (e.plan || 0), 0);
              let act = 0, pot = 0;
              ent.forEach(e => { const f = entryFact(e); act += f.act; pot += f.pot; });
              const noPlan = ent.length === 0;
              return (
                <div key={ct}
                  onClick={noPlan && canEdit ? () => openNewForCity(ct) : undefined}
                  title={noPlan && canEdit ? 'Плана нет — нажмите, чтобы создать' : undefined}
                  className={'flex flex-col gap-0.5 border rounded-xl px-2.5 py-2 text-[11px] transition-colors ' + (noPlan
                    ? 'bg-red-50 border-red-300 text-red-600 cursor-pointer hover:bg-red-100'
                    : 'border-brand-gray-mid hover:bg-brand-gray/50')}>
                  <span className="font-medium truncate flex items-center gap-1">
                    {noPlan && canEdit && <Plus size={11} className="shrink-0" />}
                    {ct}
                  </span>
                  <span className="flex items-center gap-1 whitespace-nowrap text-[10px]" title="План · Активные · Потенциал">
                    <span className={'min-w-[22px] text-center px-1 py-0.5 rounded-md font-bold tabular-nums ' + (noPlan ? 'bg-red-100 text-red-600' : 'bg-gray-200/80 text-gray-700')} title="План">{plan}</span>
                    <span className="min-w-[22px] text-center px-1 py-0.5 rounded-md bg-green-100 text-green-700 font-bold tabular-nums" title="Активные">{act}</span>
                    <span className="min-w-[22px] text-center px-1 py-0.5 rounded-md bg-blue-100 text-blue-700 font-bold tabular-nums" title="Потенциал">{pot}</span>
                  </span>
                </div>
              );
            })}
            {!cities.filter(canSeePlanCity).length && <p className="text-xs text-gray-400 col-span-full">Города не заданы (Настройки → Типы и города)</p>}
          </div>
          )}
        </div>
        </div>
      )}
      </div>

{/* Форма добавления */}
      {showAddForm && canEdit && (
        <div className="card-base p-4 bg-blue-50 border-blue-200 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Новая запись ({addForm.kind === 'buyers' ? 'покупатели' : 'поставщики'})</h3>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button>
          </div>
          <form onSubmit={saveAdd}>
            <PlanFormFields form={addForm} setF={setAddForm} forAdd onPeriod={k => setViewMode(k === 'cur' ? 'current' : 'next')} cities={cities} buyerTypesList={buyerTypesList} supplierTypesList={supplierTypesList} supplierServicesList={supplierServicesList} />
            <div className="flex gap-2 justify-end mt-4">
              <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Отмена</button>
              <button type="submit" className="btn-primary"><Save size={16} /> Сохранить</button>
            </div>
          </form>
        </div>
      )}

      {/* ТЗ: панель выгрузки отчётов — появляется при выбранных чекбоксах */}
      {selected.length > 0 && (
        <div className="card-base p-3 flex flex-wrap items-center gap-2 bg-blue-50 border-blue-200 animate-fade-in">
          <span className="text-xs font-medium text-blue-700">Выбрано: {selected.length}</span>
          <button onClick={exportReports} className="btn-primary text-xs py-1">Выгрузить отчеты</button>
          <button onClick={() => setSelected([])} className="btn-secondary text-xs py-1">Снять выбор</button>
        </div>
      )}

      {/* ═══ Записи плана: своя таблица на каждую вкладку (ТЗ этап 3) ═══
          Карточка держится на записях периода; пустой фильтр отчётов показывает подсказку, а не прячет блок */}
      {entries.length > 0 && (
        <div className="card-base overflow-hidden">
          <div className="p-3 border-b border-brand-gray-mid flex items-center justify-between">
            <h3 className="section-title">Активные планы</h3>
            <div className="flex items-center gap-2">
              <select className="form-input py-1 text-xs w-auto rounded-full" value={reportFilter} onChange={e => { setReportFilter(e.target.value as 'all' | 'yes' | 'no'); setSelected([]); }} title="Фильтр по отчётам">
                <option value="all">Все</option>
                <option value="yes">Есть отчёт</option>
                <option value="no">Нет отчёта</option>
              </select>
              <span className="text-xs text-gray-400">{visibleEntries.length} шт.</span>
            </div>
          </div>
          <div className="table-scroll">
            <table className="w-full">
              <thead>
                <tr className="border-b border-brand-gray-mid">
                  <th className="table-header">
                    <input type="checkbox" className="mr-1 align-middle accent-blue-600" title="Выделить все на странице"
                      checked={visibleEntries.length > 0 && visibleEntries.slice(0, pfShown).every(e => selected.includes(e.id))}
                      onChange={() => {
                        const page = visibleEntries.slice(0, pfShown).map(e => e.id);
                        setSelected(s => page.every(id => s.includes(id)) ? s.filter(id => !page.includes(id)) : Array.from(new Set([...s, ...page])));
                      }} />
                    Месяц
                  </th>
                  {baseRaw === 'buyer' && <th className="table-header">Город *</th>}
                  {baseRaw === 'supplier' && <th className="table-header">Сервис продаж *</th>}
                  <th className="table-header">{baseRaw === 'buyer' ? 'Тип покупателей *' : 'Тип поставщиков *'}</th>
                  <th className="table-header">Ответственный *</th>
                  <th className="table-header">План *</th>
                  <th className="table-header" title="Активные">АКТ</th>
                  <th className="table-header" title="Потенциал">ПОТ</th>
                  <th className="table-header">Заметки</th>
                  <th className="table-header">Отчёт</th>
                  <th className="table-header w-8" title="История плана">Ист.</th>
                  <th className="table-header">% плана</th>
                  {canEdit && <th className="table-header w-24">Действия</th>}
                </tr>
              </thead>
              <tbody>
                {visibleEntries.slice(0, pfShown).map(entry => (
                  <Fragment key={entry.id}>
                    <tr className={'border-b border-brand-gray-mid hover:bg-brand-gray' + (entry.deletedAt ? ' opacity-55' : '')}>
                      {editingId === entry.id ? (
                        <td colSpan={canEdit ? 12 : 11} className="p-3">
                          <PlanFormFields form={editForm} setF={setEditForm} cities={cities} buyerTypesList={buyerTypesList} supplierTypesList={supplierTypesList} supplierServicesList={supplierServicesList} />
                          <div className="flex gap-2 justify-end mt-3">
                            <button onClick={() => setEditingId(null)} className="btn-secondary text-xs">Отмена</button>
                            <button onClick={saveEdit} className="btn-primary text-xs"><Save size={12} /> Сохранить</button>
                          </div>
                        </td>
                      ) : (
                        <>
                          <td className="table-cell text-xs whitespace-nowrap">
                            <input type="checkbox" className="mr-1.5 align-middle accent-blue-600" checked={selected.includes(entry.id)}
                              onChange={ev => { ev.stopPropagation(); setSelected(s => s.includes(entry.id) ? s.filter(x => x !== entry.id) : [...s, entry.id]); }}
                              title="Выбрать для выгрузки отчёта" />
                            {monthLabel(entry.startDate)}
                            {entry.deletedAt && <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 align-middle">АРХИВ</span>}
                          </td>
                          {baseRaw === 'buyer' && <td className="table-cell text-xs">{entry.cityName || '—'}</td>}
                          {baseRaw === 'supplier' && <td className="table-cell text-xs max-w-[200px] truncate" title={(entry.serviceIds || []).join(', ')}>{(entry.serviceIds || []).join(', ') || '—'}</td>}
                          <td className="table-cell text-xs">{entry.filterType || (baseRaw === 'buyer' ? 'Все' : 'Любой')}</td>
                          <td className="table-cell text-xs">{entry.responsibleName || '—'}</td>
                          <td className="table-cell font-medium">{entry.plan}</td>
                          {(() => { const f = entryFact(entry); return (<>
                            <td className="table-cell text-xs text-green-600 font-semibold">{f.act}</td>
                            <td className="table-cell text-xs text-blue-600 font-semibold">{f.pot}</td>
                          </>); })()}
                          <td className="table-cell text-xs max-w-[180px] truncate" title={entry.notes}>{entry.notes || '—'}</td>
                          <td className="table-cell">
                            <button onClick={ev => { ev.stopPropagation(); setReportId(entry.id); setReportText(entry.report || ''); }}
                              className={'text-[11px] font-semibold px-2 py-1 rounded ' + (entry.report ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                              {entry.report ? 'ОТЧЁТ ✓' : 'ОТЧЁТ'}
                            </button>
                          </td>
                          <td className="table-cell" title={(entry.history || []).map(h => (h.date || '').slice(0, 10) + ' — ' + h.newValue + (h.userName ? ' (' + h.userName + ')' : '')).join('\n') || 'История пуста'}>
                            <History size={14} className="text-gray-400" />
                          </td>
                          <td className="table-cell font-semibold text-xs">
                            {(() => { const pp = entryPct(entry); return pp === null ? '—' : pp + '%'; })()}
                          </td>
                          {canEdit && (
                            <td className="table-cell" onClick={e => e.stopPropagation()}>
                              {entry.deletedAt ? (
                                <button onClick={() => restoreEntry(entry.id)} className="p-1 text-gray-400 hover:text-green-600 transition-colors" title="Восстановить из архива"><RotateCcw size={14} /></button>
                              ) : (
                                <div className="flex gap-1">
                                  <button onClick={() => startEdit(entry)} className="p-1 text-gray-400 hover:text-brand-black transition-colors" title="Редактировать"><Edit2 size={14} /></button>
                                  <button onClick={() => deleteEntry(entry.id)} className="p-1 text-gray-400 hover:text-brand-red transition-colors" title="В архив"><Trash2 size={14} /></button>
                                </div>
                              )}
                            </td>
                          )}
                        </>
                      )}
                    </tr>
                    {reportId === entry.id && (
                      <tr className="bg-blue-50/50 border-b border-brand-gray-mid">
                        <td colSpan={canEdit ? 12 : 11} className="p-4">
                          <label className="form-label">Отчёт о проделанной работе — {entry.startDate} / {entry.responsibleName || 'без ответственного'}</label>
                          <textarea className="form-input min-h-[90px] text-xs w-full" placeholder="Заполните отчёт о проделанной работе..." value={reportText} onChange={ev => setReportText(ev.target.value)} />
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => saveReport(entry.id)} className="btn-primary text-xs">Сохранить отчёт</button>
                            <button onClick={() => setReportId(null)} className="btn-secondary text-xs">Отмена</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!visibleEntries.length && (
                  <tr>
                    <td colSpan={canEdit ? 12 : 11} className="table-cell text-center text-xs text-gray-400 py-6">
                      Нет записей по выбранному фильтру отчётов
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {visibleEntries.length > pfShown && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-brand-gray-mid">
                <button onClick={() => setPfShown(v => v + pfLimit)} className="btn-secondary text-xs">Показать ещё · осталось {visibleEntries.length - pfShown}</button>
                <select className="form-input h-6 py-0 text-[11px] w-auto" value={pfLimit} onChange={e => { const n = Number(e.target.value); setPfLimit(n); setPfShown(n); }} title="Записей на страницу">
                  {[50, 100, 300, 500, 1000].map(n => <option key={n} value={n}>{n}/стр.</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
