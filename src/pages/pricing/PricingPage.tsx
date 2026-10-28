import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { getStore, useStoreVersion, updateStore } from '@/lib/store';
import type { ServiceSearchCondition, WarehouseLocation } from '@/types';
import { Search, Pencil, FileDown, Trash2, Save, History } from 'lucide-react';

const STATUS_FILTERS = ['Все', 'Новое', 'Загружено', 'Есть изменения', 'Удаление'] as const;
const DAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const TK_TEXT = 'Условия доставки по согласованию!';
const RETURN_PRESETS = ['Возврат без комиссии', 'Возврат с комиссией', 'Нет возврата'];

type Cond = {
  id?: string; city?: string; warehouseName?: string;
  deliveryTime?: string; deliverySchedule?: string; orderUnloadSchedule?: string;
  returnConditions?: string; representative?: string; contacts?: string; email?: string;
  status?: string; createdAt?: string; updatedAt?: string; // ТЗ v1.24.6
};
type SupplierRow = ReturnType<typeof getStore>['suppliers'][number];
type WhLoc = { city?: string; verified?: boolean };

/** Проценка (ТЗ v1.24.0–1.24.5): единое управление условиями DBS. Источник — supplier.serviceSearch. */
export default function PricingPage() {
  useStoreVersion();
  const store = getStore();

  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [q, setQ] = useState('');
  const [fSupplier, setFSupplier] = useState('');
  const [fCity, setFCity] = useState('');
  const [fType, setFType] = useState('');
  const [fResp, setFResp] = useState('');
  const [fStatus, setFStatus] = useState<string>('Все');
  // ТЗ v1.28.0: вид раздела — условия или список складов
  const [view, setView] = useState<'cond' | 'wh'>('cond');
  const [q2, setQ2] = useState('');
  const [fSupplier2, setFSupplier2] = useState('');
  const [fCity2, setFCity2] = useState('');
  const [fType2, setFType2] = useState('');
  const [fResp2, setFResp2] = useState('');
  const [fWhStatus, setFWhStatus] = useState<'Все' | 'Новый' | 'Проверен' | 'Заморожен'>('Все');
  const [whExp, setWhExp] = useState<string | null>(null);
  const [whDraft, setWhDraft] = useState<{ city?: string; address?: string; skuCount?: number } | null>(null);
  const [whSelected, setWhSelected] = useState<Set<string>>(new Set());
  const [fTk, setFTk] = useState<'off' | 'with' | 'without'>('off');
  const [fService, setFService] = useState<'Все' | 'DBS' | 'MARKET' | 'MEDIA'>('Все'); // ТЗ v1.24.6
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draft, setDraft] = useState<Cond | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const suppliers = store.suppliers.filter(s => !s.deletedAt); // ТЗ v1.28.1: архива в Проценке нет
  const rows: Array<{ s: SupplierRow; c: Cond; idx: number; key: string }> = [];
  suppliers.forEach(s => (s.serviceSearch || []).forEach((c, i) => rows.push({ s, c: c as Cond, idx: i, key: `${s.id}:${i}` })));

  const cities = Array.from(new Set(rows.map(r => r.c.city).filter(Boolean) as string[]));
  const respUsers = (store.settings.users || []).filter(u => u.status === 'active');

  const list = rows.filter(({ s, c }) => {
    if (fSupplier && s.id !== fSupplier) return false;
    if (fCity && c.city !== fCity) return false;
    if (fType && s.type !== fType) return false;
    if (fResp && s.responsibleId !== fResp) return false;
    if (fStatus !== 'Все' && (c.status || 'Новое') !== fStatus) return false;
    const hasTk = String(c.orderUnloadSchedule || '').includes(TK_TEXT);
    if (fTk === 'with' && !hasTk) return false;
    if (fTk === 'without' && hasTk) return false;
    if (fService !== 'Все' && !(((s as unknown as { services?: string[] }).services) || []).includes(fService)) return false;
    if (q) {
      const hay = `${s.tradeName} ${c.city} ${c.warehouseName} ${c.deliveryTime} ${c.orderUnloadSchedule} ${c.representative}`.toLowerCase();
      if (!hay.includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const days = (sched?: string) => (sched || '').split(',').map(x => x.trim()).filter(Boolean);
  const chipCls = (st?: string) => (st || 'Новое') === 'Загружено'
    ? 'bg-green-50 text-green-700 border-green-200'
    : (st || 'Новое') === 'Есть изменения'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : (st || 'Новое') === 'Удаление'
        ? 'bg-gray-200 text-gray-600 border-gray-300'
        : 'bg-red-50 text-red-700 border-red-200';
  const inCls = 'form-input text-xs';
  const lblCls = 'block text-xs font-medium text-gray-600 mb-1';
  const tkOn = (c?: Cond) => !!c && String(c.orderUnloadSchedule || '').includes(TK_TEXT);

  const openRow = (key: string, c: Cond) => { setExpanded(key); setEditMode(false); setDraft({ ...(c as object) } as Cond); };
  const closeRow = () => { setExpanded(null); setEditMode(false); setDraft(null); };

  const setStatus = (supplierId: string, idx: number, status: string) => {
    updateStore(st => ({
      ...st,
      suppliers: st.suppliers.map(s => s.id === supplierId
        ? { ...s, serviceSearch: (s.serviceSearch || []).map((cc, i) => (i === idx ? { ...(cc as ServiceSearchCondition), status } : cc)) }
        : s),
    }));
  };
  const saveCond = (supplierId: string, idx: number) => {
    if (!draft) return;
    updateStore(st => ({
      ...st,
      suppliers: st.suppliers.map(s => s.id === supplierId
        ? { ...s, serviceSearch: (s.serviceSearch || []).map((cc, i) => (i === idx ? { ...(cc as ServiceSearchCondition), ...(draft as ServiceSearchCondition) } : cc)) }
        : s),
    }));
    closeRow();
  };
  const deleteCond = (supplierId: string, idx: number) => {
    // ТЗ v1.28.1: без архива — удаляем сразу и с концами, с простым подтверждением
    if (!window.confirm('Удалить условие проценки безвозвратно? Согласны?')) return;
    updateStore(st => ({
      ...st,
      suppliers: st.suppliers.map(s => s.id === supplierId
        ? { ...s, serviceSearch: (s.serviceSearch || []).filter((_, i) => i !== idx) }
        : s),
    }));
    closeRow();
  };
  const whList = (s: SupplierRow): WhLoc[] => ((s as unknown as { warehouse_locations?: WhLoc[] }).warehouse_locations) || [];
  const whVerified = (s: SupplierRow, name?: string) => !!name && whList(s).some(w => (w.city || '') === name && !!w.verified);

  // ТЗ v1.24.6: сортировка по умолчанию — чем новее, тем выше
  const dateOf = (c: Cond): number => { const t = c.updatedAt || c.createdAt || ''; return t ? new Date(t).getTime() : 0; };
  const dateStr = (c: Cond): string => {
    const t = dateOf(c); if (!t) return '';
    const d = new Date(t);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const sortedList = [...list].sort((a, b) => dateOf(b.c) - dateOf(a.c));


  // ── ТЗ v1.28.0: список складов (зеркало warehouse_locations) ──
  type WhLoc2 = { id?: string; city?: string; address?: string; skuCount?: number; verified?: boolean; status?: string };
  const whListOf = (s: SupplierRow): WhLoc2[] => ((s as unknown as { warehouseLocations?: WhLoc2[] }).warehouseLocations)
    || ((s as unknown as { warehouse_locations?: WhLoc2[] }).warehouse_locations) || [];
  const whStatus = (w: WhLoc2): string => w.status || (w.verified ? 'Проверен' : 'Новый');
  const whRows: Array<{ s: SupplierRow; w: WhLoc2; idx: number; key: string }> = [];
  suppliers.forEach(s => whListOf(s).forEach((w, i) => whRows.push({ s, w, idx: i, key: `${s.id}:${i}` })));
  const whCities = Array.from(new Set(whRows.map(r => r.w.city).filter(Boolean) as string[]));
  const whFiltered = whRows.filter(({ s, w }) => {
    if (fSupplier2 && s.id !== fSupplier2) return false;
    if (fCity2 && w.city !== fCity2) return false;
    if (fType2 && s.type !== fType2) return false;
    if (fResp2 && s.responsibleId !== fResp2) return false;
    if (fWhStatus !== 'Все' && whStatus(w) !== fWhStatus) return false;
    if (q2) {
      const hay = `${s.tradeName} ${w.city} ${w.address || ''}`.toLowerCase();
      if (!hay.includes(q2.trim().toLowerCase())) return false;
    }
    return true;
  });
  const whCnt = (st: string) => whRows.filter(r => whStatus(r.w) === st).length;
  const patchWh = (supplierId: string, idx: number, patch: Partial<WhLoc2>) => {
    updateStore(st => ({
      ...st,
      suppliers: st.suppliers.map(s => {
        if (s.id !== supplierId) return s;
        const src = whListOf(s);
        const nextList = src.map((w, i) => (i === idx ? { ...w, ...patch } : w));
        const ns = { ...s } as Record<string, unknown>;
        if (ns['warehouseLocations']) ns['warehouseLocations'] = nextList;
        if (ns['warehouse_locations']) ns['warehouse_locations'] = nextList;
        if (!ns['warehouseLocations'] && !ns['warehouse_locations']) ns['warehouseLocations'] = nextList;
        return ns as unknown as SupplierRow;
      }),
    }));
  };
  const changeWhStatus = (supplierId: string, idx: number, w: WhLoc2, st: string) => {
    if (whStatus(w) === st) return;
    // ТЗ v1.28.1: зеркало карточки — заморозка с подтверждением и каскадом условий в «Удаление»
    if (st === 'Заморожен') {
      if (!window.confirm(`Заморозить склад «${w.city || ''}»? Все привязанные условия проценки получат статус «Удаление». Продолжить?`)) return;
    } else if (!window.confirm(`Сменить статус склада «${w.city || ''}» на «${st}»?`)) return;
    patchWh(supplierId, idx, { status: st, verified: st === 'Проверен' });
    if (st === 'Заморожен' && w.city) {
      updateStore(st2 => ({ ...st2, suppliers: st2.suppliers.map(s => s.id === supplierId
        ? { ...s, serviceSearch: (s.serviceSearch || []).map(c => (c.warehouseName || '') === w.city ? { ...c, status: 'Удаление' } : c) }
        : s) }));
    }
  };
  // ТЗ v1.28.1: удаление склада — только с вводом слова «удалить» (зеркало «Поставщики → Склад»)
  const deleteWh = (supplierId: string, idx: number, city?: string) => {
    if (window.prompt(`Удалить склад «${city || ''}» безвозвратно? Для подтверждения введите слово: удалить`) !== 'удалить') return;
    updateStore(st => ({ ...st, suppliers: st.suppliers.map(s => s.id === supplierId
      ? { ...s, warehouseLocations: whListOf(s).filter((_, i) => i !== idx) as WarehouseLocation[] }
      : s) }));
  };
  const whAllSel = whFiltered.length > 0 && whFiltered.every(r => whSelected.has(r.key));
  const toggleWhAll = () => setWhSelected(whAllSel ? new Set() : new Set(whFiltered.map(r => r.key)));
  const exportWhWord = () => {
    const exp = whFiltered.filter(r => whSelected.has(r.key));
    if (!exp.length) return;
    const esc = (v?: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;font-size:12px}</style></head><body>
      <h2>Список складов (проценка)</h2>
      <table><tr><th>Поставщик</th><th>Склад</th><th>Адрес</th><th>SKU</th><th>Статус</th></tr>
      ${exp.map(({ s, w }) => `<tr><td>${esc(s.tradeName)}</td><td>${esc(w.city)}</td><td>${esc(w.address)}</td><td>${esc(w.skuCount)}</td><td>${esc(whStatus(w))}</td></tr>`).join('')}
      </table></body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
    a.download = 'spisok-skladov.doc';
    a.click();
  };

  const toggleSelect = (key: string) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const allSel = list.length > 0 && list.every(r => selected.has(r.key));
  const toggleAll = () => setSelected(allSel ? new Set() : new Set(list.map(r => r.key)));

  const exportWord = () => {
    const exp = list.filter(r => selected.has(r.key));
    if (!exp.length) return;
    const esc = (v?: string) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;font-size:12px}</style></head><body>
      <h2>Условия сервиса проценки (DBS)</h2>
      <table><tr><th>Поставщик</th><th>Склад</th><th>Город</th><th>График доставки</th><th>Срок поставки</th><th>Условия доставки</th><th>Статус</th></tr>
      ${exp.map(({ s, c }) => `<tr><td>${esc(s.tradeName)}</td><td>${esc(c.warehouseName)}</td><td>${esc(c.city)}</td><td>${esc(c.deliverySchedule)}</td><td>${esc(c.deliveryTime)}</td><td>${esc(c.orderUnloadSchedule)}</td><td>${esc(c.status || 'Новое')}</td></tr>`).join('')}
      </table></body></html>`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + html], { type: 'application/msword' }));
    a.download = 'usloviya-procenki.doc';
    a.click();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="actions-bar flex items-center justify-start flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={() => setView('cond')} className={`action-btn text-xs py-1.5 px-3 ${view === 'cond' ? 'bg-gray-200' : ''}`}>Условия проценки</button>
          <button onClick={() => setView('wh')} className={`action-btn text-xs py-1.5 px-3 ${view === 'wh' ? 'bg-gray-200' : ''}`}>Список складов</button>
        </div>
      </div>

      {view === 'cond' && (<>
{/* ТЗ v1.24.8: сводка в белой подложке, как «Сводка по базе лидов» */}
      {(() => {
        const all = rows;
        const cnt = (st: string) => all.filter(r => (r.c.status || 'Новое') === st).length;
        const withTk = all.filter(r => tkOn(r.c)).length;
        const stat = (label: string, value: number) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4 min-w-[170px] flex-1">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
        );
        return (
          <div className="card-base p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">Сводка по сервису проценки</h3>
            <div className="flex flex-wrap gap-3">
              {stat('Условий загружено', cnt('Загружено'))}
              {stat('Новых', cnt('Новое'))}
              {stat('Есть изменения', cnt('Есть изменения'))}
              {stat('На удаление', cnt('Удаление'))}
              <div className="bg-white border border-gray-200 rounded-xl p-4 min-w-[260px] flex-[2]">
                <p className="text-xs text-gray-500 mb-2">Условия доставки</p>
                <div className="flex items-center justify-between text-sm">
                  <span>Есть доставка</span>
                  <span className="text-sm font-bold bg-green-50 text-green-700 border border-green-200 rounded-lg px-2.5 py-0.5">{all.length - withTk}</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span>Нет доставки (ТК)</span>
                  <span className="text-sm font-bold bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-lg px-2.5 py-0.5">{withTk}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ТЗ v1.24.5: поиск и все фильтры — в ОДНУ строку */}
      <div className="card-base p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="form-input text-xs pl-8 w-full" placeholder="Поиск: поставщик, город, склад, условия…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className="form-input text-xs py-1.5 w-auto" value={fSupplier} onChange={e => setFSupplier(e.target.value)}>
            <option value="">Все поставщики</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
          </select>
          <select className="form-input text-xs py-1.5 w-auto" value={fCity} onChange={e => setFCity(e.target.value)}>
            <option value="">Все города</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input text-xs py-1.5 w-auto" value={fType} onChange={e => setFType(e.target.value)}>
            <option value="">Все типы</option>
            {(store.settings.supplierTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-input text-xs py-1.5 w-auto" value={fResp} onChange={e => setFResp(e.target.value)}>
            <option value="">Все ответственные</option>
            {respUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {STATUS_FILTERS.map(st => (
            <button key={st} onClick={() => setFStatus(st)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${fStatus === st ? 'bg-brand-black text-white border-brand-black font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>{st}</button>
          ))}
          <button onClick={() => setFTk(v => v === 'off' ? 'with' : v === 'with' ? 'without' : 'off')}
            className={`text-[11px] px-2.5 py-1 rounded-full border font-bold transition-colors ${fTk !== 'off' ? 'bg-yellow-300 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:border-yellow-400'}`}
            title="Фильтр ТК: нажали — только с ТК, ещё раз — только без ТК, ещё раз — выкл">ТК{fTk === 'with' ? ': с' : fTk === 'without' ? ': без' : ''}</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['Все', 'DBS', 'MARKET', 'MEDIA'] as const).map(sv => (
            <button key={sv} onClick={() => setFService(sv)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${fService === sv ? 'bg-red-600 border-red-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>{sv}</button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <span className="text-gray-500">Выбрано: {selected.size}</span>
          <button onClick={() => {
            if (!selected.size) return;
            if (!window.confirm(`Удалить выбранные условия (${selected.size}) безвозвратно? Согласны?`)) return;
            updateStore(st => ({ ...st, suppliers: st.suppliers.map(s => ({ ...s, serviceSearch: (s.serviceSearch || []).filter((_, i) => !selected.has(`${s.id}:${i}`)) })) }));
            setSelected(new Set());
          }} className="bg-white border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg px-3 py-1.5 inline-flex items-center gap-1 transition-colors">
            <Trash2 size={13} /> Удалить отмеченные
          </button>
          <button onClick={exportWord} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1 ml-auto">
            <FileDown size={13} /> Выгрузить в Word
          </button>
        </div>
      )}

      <div className="card-base overflow-hidden">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gray-mid">
                <th className="table-header w-8"><input type="checkbox" checked={allSel} onChange={toggleAll} /></th>
                <th className="table-header">Поставщик</th>
                <th className="table-header">Сервисы продаж</th>
                <th className="table-header">Склад поставщика</th>
                <th className="table-header">Город</th>
                <th className="table-header">График доставки</th>
                <th className="table-header">Срок поставки</th>
                <th className="table-header">Условия доставки</th>
                <th className="table-header">Статус</th>
                <th className="table-header w-10 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={9}>Условия проценки не найдены{tab === 'archived' ? ' в архиве' : ''}.</td></tr>
              )}
              {sortedList.map(({ s, c, idx, key }) => {
                const open = expanded === key;
                const dlist = days(c.deliverySchedule);
                const whs = whList(s);
                return (
                  <Fragment key={key}>
                    <tr onClick={() => (open ? closeRow() : openRow(key, c))}
                      className={`border-b border-brand-gray-mid transition-colors ${open ? 'bg-gray-50' : 'hover:bg-gray-50 cursor-pointer'}`}>
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(key)} onChange={() => toggleSelect(key)} />
                      </td>
                      <td className="table-cell">
                        <Link to={`/suppliers/${s.id}`} onClick={e => e.stopPropagation()} className="text-red-700 hover:underline font-medium">{s.tradeName}</Link>
                      </td>
                      <td className="table-cell">
                        <div className="flex flex-wrap gap-1">
                          {(((s as unknown as { services?: string[] }).services) || []).map(sv => (
                            <span key={sv} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{sv}</span>
                          ))}
                          {!((s as unknown as { services?: string[] }).services || []).length && <span className="text-xs text-gray-400">—</span>}
                        </div>
                      </td>
                      <td className="table-cell">{c.warehouseName || '—'}</td>
                      <td className="table-cell">{c.city || '—'}</td>
                      <td className="table-cell">
                        <div className="flex gap-1">
                          {DAYS.map(d => (
                            <span key={d} className={`w-6 h-6 text-[10px] flex items-center justify-center rounded-md border ${dlist.includes(d) ? 'bg-green-600 border-green-600 text-white font-semibold' : 'bg-white border-gray-200 text-gray-400'}`}>{d}</span>
                          ))}
                        </div>
                      </td>
                      {/* ТЗ v1.24.5: ТК перед сроком поставки */}
                      <td className="table-cell text-xs">
                        <span className="inline-flex items-center gap-1.5 flex-wrap">
                          {tkOn(c) && <span className="w-6 h-6 text-[9px] font-bold flex items-center justify-center rounded-md bg-yellow-300 border border-yellow-400 text-gray-900" title="ТК — доставка по согласованию">ТК</span>}
                          {c.deliveryTime || '—'}
                        </span>
                      </td>
                      <td className="table-cell text-xs max-w-[240px] truncate" title={c.orderUnloadSchedule}>{c.orderUnloadSchedule || '—'}</td>
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${chipCls(c.status)}`}>{c.status || 'Новое'}</span>
                          <span title={dateStr(c) ? `Условие создано: ${dateStr(c)}` : 'Дата создания не зафиксирована'} className="text-gray-300 hover:text-gray-500 cursor-help transition-colors inline-flex">
                            <History size={13} />
                          </span>
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-b border-brand-gray-mid bg-gray-50">
                        <td colSpan={9} className="px-4 py-4">
                          {!editMode ? (
                            <>
                              <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
                                <p className="text-sm font-bold text-gray-900">Город: {c.city || '—'}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${whVerified(s, c.warehouseName) ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                                    Склад проверен: {whVerified(s, c.warehouseName) ? 'Да' : 'Нет'}
                                  </span>
                                  {STATUS_FILTERS.filter(x => x !== 'Все').map(sx => (
                                    <button key={sx} type="button" onClick={e => { e.stopPropagation(); setStatus(s.id, idx, sx); }}
                                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${(c.status || 'Новое') === sx
                                        ? (sx === 'Загружено' ? 'bg-green-50 border-green-300 text-green-700 font-semibold'
                                          : sx === 'Есть изменения' ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold'
                                          : sx === 'Удаление' ? 'bg-gray-200 border-gray-300 text-gray-600 font-semibold'
                                          : 'bg-blue-50 border-blue-300 text-blue-700 font-semibold')
                                        : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>{sx}</button>
                                  ))}
                                  <button type="button" title="Редактировать" onClick={() => { setDraft({ ...(c as object) } as Cond); setEditMode(true); }}
                                    className="w-7 h-7 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300 flex items-center justify-center transition-colors"><Pencil size={13} /></button>
                                  <button type="button" title="Удалить" onClick={() => deleteCond(s.id, idx)}
                                    className="w-7 h-7 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300 flex items-center justify-center transition-colors"><Trash2 size={13} /></button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-3 text-xs">
                                <div className="space-y-3">
                                  <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Склад поставщика</p><p className="text-gray-800 mt-0.5">{c.warehouseName || '—'}</p></div>
                                  <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Email</p><p className="text-gray-800 mt-0.5">{c.email || '—'}</p></div>
                                  <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Условия возврата товара</p><p className="text-gray-800 mt-0.5">{c.returnConditions || '—'}</p></div>
                                </div>
                                <div className="space-y-3">
                                  <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Представитель</p><p className="text-gray-800 mt-0.5">{c.representative || '—'}</p></div>
                                  <div><p className="text-[10px] uppercase tracking-wide text-gray-400">График доставки</p><p className="text-gray-800 mt-0.5">{c.deliverySchedule || '—'}</p></div>
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wide text-gray-400">Срок поставки до выбранного города</p>
                                    <p className="text-gray-800 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                      {tkOn(c) && <span className="w-7 h-7 text-[10px] font-bold flex items-center justify-center rounded-lg bg-yellow-300 border border-yellow-400 text-gray-900">ТК</span>}
                                      {c.deliveryTime || '—'}
                                    </p>
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Контакты</p><p className="text-gray-800 mt-0.5">{c.contacts || '—'}</p></div>
                                  <div><p className="text-[10px] uppercase tracking-wide text-gray-400">Условия доставки</p><p className="text-gray-800 mt-0.5">{c.orderUnloadSchedule || '—'}</p></div>
                                </div>
                              </div>
                            </>
                          ) : (
                            /* ТЗ v1.24.5: редактор — как в анкете (2 колонки, тот же порядок строк) */
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-xs">
                                <div className="space-y-3">
                                  <div>
                                    <label className={lblCls}>Город показов</label>
                                    <select className={inCls + ' w-full'} value={draft?.city || ''} onChange={e => setDraft(d => d && { ...d, city: e.target.value })}>
                                      <option value="">—</option>
                                      {Array.from(new Set([...(cities || []), ...(draft?.city ? [draft.city] : [])])).map(ct => <option key={ct} value={ct}>{ct}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className={lblCls}>Представитель</label>
                                    <input className={inCls + ' w-full'} value={draft?.representative || ''} onChange={e => setDraft(d => d && { ...d, representative: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className={lblCls}>Email</label>
                                    <input className={inCls + ' w-full'} value={draft?.email || ''} onChange={e => setDraft(d => d && { ...d, email: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className={lblCls}>Условия доставки</label>
                                    <input className={inCls + ' w-full'} value={draft?.orderUnloadSchedule || ''} onChange={e => setDraft(d => d && { ...d, orderUnloadSchedule: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className={lblCls}>Срок поставки до выбранного города</label>
                                    <div className="flex gap-1.5 mb-2">
                                      <button type="button" onClick={() => setDraft(d => d && { ...d, orderUnloadSchedule: tkOn(d) ? String(d.orderUnloadSchedule || '').replace(TK_TEXT, '').trim() : [String(d.orderUnloadSchedule || '').trim(), TK_TEXT].filter(Boolean).join(' ') })}
                                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold ${tkOn(draft || undefined) ? 'bg-yellow-300 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:border-yellow-400'}`}>ТК</button>
                                      {['Сегодня', 'Завтра'].map(v => (
                                        <button key={v} type="button" onClick={() => setDraft(d => d && { ...d, deliveryTime: v })}
                                          className={`px-2.5 py-1.5 rounded-full border text-[11px] ${(draft?.deliveryTime || '').toLowerCase() === v.toLowerCase() ? 'bg-brand-black text-white' : 'bg-white border-gray-200 text-gray-500'}`}>{v}</button>
                                      ))}
                                    </div>
                                    <input className={inCls + ' w-full'} value={draft?.deliveryTime || ''} onChange={e => setDraft(d => d && { ...d, deliveryTime: e.target.value })} placeholder="2-3 дня" />
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <label className={lblCls}>Склад поставщика</label>
                                    <select className={inCls + ' w-full'} value={draft?.warehouseName || ''} onChange={e => setDraft(d => d && { ...d, warehouseName: e.target.value })}>
                                      <option value="">—</option>
                                      {Array.from(new Set([...whs.map(w => w.city || ''), ...(draft?.warehouseName ? [draft.warehouseName] : [])])).filter(Boolean).map(wn => <option key={wn} value={wn}>{wn}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className={lblCls}>Контакты</label>
                                    <input className={inCls + ' w-full'} value={draft?.contacts || ''} onChange={e => setDraft(d => d && { ...d, contacts: e.target.value })} />
                                  </div>
                                  <div>
                                    <label className={lblCls}>График доставки</label>
                                    <div className="flex gap-1 pt-1">
                                      {DAYS.map(d => {
                                        const cur = days(draft?.deliverySchedule);
                                        const on = cur.includes(d);
                                        return (
                                          <button key={d} type="button"
                                            onClick={() => setDraft(dd => dd && { ...dd, deliverySchedule: on ? cur.filter(x => x !== d).join(', ') : [...cur, d].join(', ') })}
                                            className={`w-9 h-9 rounded-lg border text-[11px] font-medium ${on ? 'bg-red-50 border-red-400 text-red-700' : 'bg-white border-gray-200 text-gray-500'}`}>{d}</button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  <div>
                                    <label className={lblCls}>Условия возврата товара</label>
                                    <input className={inCls + ' w-full'} list="return-presets" value={draft?.returnConditions || ''} onChange={e => setDraft(d => d && { ...d, returnConditions: e.target.value })} />
                                    <datalist id="return-presets">{RETURN_PRESETS.map(r => <option key={r} value={r} />)}</datalist>
                                  </div>
                                </div>
                              </div>
                              <div className="mt-4 flex justify-end gap-2">
                                <button onClick={() => setEditMode(false)} className="btn-secondary text-xs py-2 px-4">Отмена</button>
                                <button onClick={() => saveCond(s.id, idx)} className="bg-brand-black hover:opacity-90 text-white text-xs font-semibold rounded-xl px-4 py-2 inline-flex items-center gap-1.5 transition-opacity"><Save size={14} /> Сохранить</button>
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400">Показано условий: {list.length} из {rows.length}</p>
      </>)}
      {view === 'wh' && (<>
      {/* Сводка по складам */}
      <div className="card-base p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-900">Сводка по складам</h3>
        <div className="flex flex-wrap gap-3">
          {/* ТЗ v1.28.1: замороженные склады в статистике не участвуют (как в «Поставщики → Склад») */}
          {([['Новых', whCnt('Новый')], ['Проверено', whCnt('Проверен')]] as const).map(([lb, v]) => (
            <div key={lb} className="bg-white border border-gray-200 rounded-xl p-4 min-w-[170px] flex-1">
              <p className="text-xs text-gray-500">{lb}</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{v}</p>
            </div>
          ))}
          <div className="bg-white border border-gray-200 rounded-xl p-4 min-w-[200px] flex-1">
            <p className="text-xs text-gray-500">Всего складов</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{whRows.length - whCnt('Заморожен')}</p>
          </div>
        </div>
      </div>

      {/* Поиск и фильтры */}
      <div className="card-base p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="form-input text-xs pl-8 w-full" placeholder="Поиск: поставщик, склад, адрес…" value={q2} onChange={e => setQ2(e.target.value)} />
          </div>
          <select className="form-input text-xs py-1.5 w-auto" value={fSupplier2} onChange={e => setFSupplier2(e.target.value)}>
            <option value="">Все поставщики</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
          </select>
          <select className="form-input text-xs py-1.5 w-auto" value={fType2} onChange={e => setFType2(e.target.value)}>
            <option value="">Все типы</option>
            {(store.settings.supplierTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-input text-xs py-1.5 w-auto" value={fResp2} onChange={e => setFResp2(e.target.value)}>
            <option value="">Все ответственные</option>
            {respUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {(['Все', 'Новый', 'Проверен', 'Заморожен'] as const).map(st => (
            <button key={st} onClick={() => setFWhStatus(st)}
              className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${fWhStatus === st ? 'bg-brand-black text-white border-brand-black font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:border-red-300'}`}>
              {st === 'Новый' ? 'Новые' : st === 'Проверен' ? 'проверено' : st === 'Заморожен' ? 'заморожено' : 'Все'}
            </button>
          ))}
        </div>
      </div>

      {whSelected.size > 0 && (
        <div className="flex items-center gap-2 text-xs bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
          <span className="text-gray-500">Выбрано: {whSelected.size}</span>
          <button onClick={exportWhWord} className="btn-primary text-xs py-1.5 px-3 inline-flex items-center gap-1 ml-auto">
            <FileDown size={13} /> Скачать в Word
          </button>
        </div>
      )}

      {/* Таблица складов */}
      <div className="card-base overflow-hidden">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gray-mid">
                <th className="table-header w-8"><input type="checkbox" checked={whAllSel} onChange={toggleWhAll} /></th>
                <th className="table-header">Поставщик</th>
                <th className="table-header">Город (название) склада</th>
                <th className="table-header">Адрес склада</th>
                <th className="table-header">SKU</th>
                <th className="table-header">Статус</th>
              </tr>
            </thead>
            <tbody>
              {whFiltered.length === 0 && (
                <tr><td className="table-cell text-gray-400 text-center py-8" colSpan={7}>Склады не найдены.</td></tr>
              )}
              {whFiltered.map(({ s, w, idx, key }) => {
                const open = whExp === key;
                return (
                  <Fragment key={key}>
                    <tr onClick={() => { if (open) { setWhExp(null); setWhDraft(null); } else { setWhExp(key); setWhDraft({ city: w.city, address: w.address, skuCount: w.skuCount }); } }}
                      className={`border-b border-brand-gray-mid transition-colors ${open ? 'bg-gray-50' : 'hover:bg-gray-50 cursor-pointer'}`}>
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={whSelected.has(key)} onChange={() => setWhSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; })} />
                      </td>
                      <td className="table-cell"><Link to={`/suppliers/${s.id}`} onClick={e => e.stopPropagation()} className="text-red-700 hover:underline font-medium">{s.tradeName}</Link></td>
                      <td className="table-cell font-medium">{w.city || '—'}</td>
                      <td className="table-cell text-xs text-gray-600 max-w-[260px] truncate" title={w.address}>{w.address || '—'}</td>
                      <td className="table-cell text-xs">{Number(w.skuCount || 0).toLocaleString('ru-RU')}</td>
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <select className="form-input text-xs py-1 w-auto" value={whStatus(w)} onChange={e => changeWhStatus(s.id, idx, w, e.target.value)}>
                          {(['Новый', 'Проверен', 'Заморожен'] as const).map(st => <option key={st} value={st}>{st}</option>)}
                        </select>
                      </td>
                      <td className="table-cell text-right" onClick={e => e.stopPropagation()}>
                        <button type="button" title="Удалить склад" onClick={e => { e.stopPropagation(); deleteWh(s.id, idx, w.city); }}
                          className="w-7 h-7 rounded-full bg-white border border-gray-200 text-gray-400 hover:text-red-600 hover:border-red-300 inline-flex items-center justify-center transition-colors align-middle">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                    {open && whDraft && (
                      <tr className="border-b border-brand-gray-mid bg-gray-50">
                        <td colSpan={7} className="px-4 py-3">
                          <div className="flex flex-wrap items-end gap-2 text-xs">
                            <div className="min-w-[180px]"><label className={lblCls}>Город (название) склада</label>
                              <input className={inCls + ' w-full'} value={whDraft.city || ''} onChange={e => setWhDraft(d => d && { ...d, city: e.target.value })} /></div>
                            <div className="flex-1 min-w-[260px]"><label className={lblCls}>Адрес склада</label>
                              <input className={inCls + ' w-full'} value={whDraft.address || ''} onChange={e => setWhDraft(d => d && { ...d, address: e.target.value })} /></div>
                            <div className="w-32"><label className={lblCls}>SKU</label>
                              <input className={inCls + ' w-full'} type="number" min="0" value={whDraft.skuCount ?? 0} onChange={e => setWhDraft(d => d && { ...d, skuCount: parseInt(e.target.value) || 0 })} /></div>
                            <button onClick={() => { patchWh(s.id, idx, { ...whDraft }); setWhExp(null); setWhDraft(null); }}
                              className="bg-brand-black hover:opacity-90 text-white text-xs font-semibold rounded-xl px-4 py-2 inline-flex items-center gap-1.5 transition-opacity"><Save size={14} /> Сохранить</button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-gray-400">Показано складов: {whFiltered.length} из {whRows.length}</p>
      </>)}

    </div>
  );
}
