import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStore, updateStore, useStoreVersion, getSyncLog, clearSyncLog, getSyncErrors } from '@/lib/store';
import { exportToCSV, formatDateTime } from '@/lib/utils';
import { generateId } from '@/lib/utils';
import { isAdmin, getCurrentUser } from '@/lib/auth';
// v1.34.0: удаление — через транспортный диспетчер синка (свой API).
import { deleteSupplier, deleteBuyer, deleteTask, deleteTicket } from '@/lib/remote';
import { Download, Trash2, Search, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { DbLog, HistoryEntry } from '@/types';

const DB_TABS = ['Поставщики', 'Покупатели', 'Задачи', 'Поддержка', 'Сервис проценки', 'База лидов', 'Логи дублей', 'План/факт', 'Медиа сервис', 'Пользователи', 'Логи синка', 'Логи'];

function addDbLog(action: DbLog['action'], entityType: string, entityIds: string[], details: string) {
  const u = getCurrentUser();
  const log: DbLog = {
    id: generateId(), userId: u?.id || '', userEmail: u?.email || '',
    action, entityType, entityIds, details, createdAt: new Date().toISOString(),
  };
  updateStore(s => ({ ...s, settings: { ...s.settings, dbLogs: [...(s.settings.dbLogs || []), log] } }));
}

type ConfirmState = { ids: string[]; entityType: string; tab: string; step: number; inputVal: string } | null;

export default function DatabasePage() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const navigate = useNavigate();
  const admin = isAdmin();

  useEffect(() => {
    if (!admin) navigate('/dashboard', { replace: true });
  }, [admin, navigate]);

  const [tab, setTab] = useState('Поставщики');
  const [, forceUpdate] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const [showSyncErrors, setShowSyncErrors] = useState(false); // ТЗ v1.23.52: вид «Ошибки»
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [logSearch, setLogSearch] = useState('');
  const [leadBase, setLeadBase] = useState<'buyer' | 'supplier'>('buyer'); // ТЗ: фильтр вкладки «База лидов», по умолчанию покупатели
  const [planBase, setPlanBase] = useState<'buyers' | 'suppliers'>('buyers'); // ТЗ: фильтр вкладки «План/факт» — база планов покупателей/поставщиков

  const store = getStore();

  const tabData = useMemo(() => {
    const q = search.toLowerCase();
    switch (tab) {
      case 'Поставщики': return store.suppliers.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'Покупатели': return store.buyers.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'Задачи': return store.tasks.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'Поддержка': return store.tickets.filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'Сервис проценки': return store.suppliers.flatMap(sup => (sup.history || [])
        .filter((h: HistoryEntry & { timestamp?: string }) => ['service_search', 'serviceSearch', 'serviceAccess', 'warehouseLocations'].includes(String(h.field || '')))
        .map((h: HistoryEntry & { timestamp?: string }) => ({ id: h.id, timestamp: h.timestamp, userName: h.userName, supplierName: sup.tradeName, details: String(h.newValue || h.comment || '') }))
      ).filter(r => !logSearch || JSON.stringify(r).toLowerCase().includes(logSearch.toLowerCase())).sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
      // ТЗ v1.22.2: вкладка «Пользователи» — только безопасные поля (без пароля/access!)
      case 'Пользователи': return (store.settings.users || [])
        .map(u => ({ id: u.id, 'дата создания': (u.createdAt || '').slice(0, 10) || '—', имя: u.name, роль: u.role === 'admin' ? 'Администратор' : 'Менеджер', 'дата блокировки или увольнения': u.firedAt ? u.firedAt.slice(0, 10) : '—' }))
        .filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'Логи синка': return [];
      case 'База лидов': return ((store.settings.leads || []) as unknown as Record<string, unknown>[])
        .filter(l => (l as { type?: string }).type === leadBase)
        .filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'Логи дублей': return [
        ...store.suppliers.filter(s => s.status === 'Архив дублей').map(s => ({ Источник: 'Поставщики', 'Торговое название': s.tradeName, ИНН: s.inn || '', Город: s.city, ФИО: s.contactName, Телефон: s.phone, Email: s.email, Статус: s.status, Дата: s.createdAt })),
        ...store.buyers.filter(b => b.status === 'Архив дублей').map(b => ({ Источник: 'Покупатели', 'Торговое название': b.tradeName, ИНН: b.inn || '', Город: b.city, ФИО: b.contactName, Телефон: b.phone, Email: b.email, Статус: b.status, Дата: b.createdAt })),
        ...((store.settings.leads || []) as { type?: string; status?: string; tradeName?: string; inn?: string; city?: string; contactName?: string; phone?: string; email?: string; createdAt?: string }[])
          .filter(l => l.status === 'Архив дублей')
          .map(l => ({ Источник: l.type === 'buyer' ? 'База лидов (покупатели)' : 'База лидов (поставщики)', 'Торговое название': l.tradeName || '', ИНН: l.inn || '', Город: l.city || '', ФИО: l.contactName || '', Телефон: l.phone || '', Email: l.email || '', Статус: l.status, Дата: l.createdAt || '' })),
      ].filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'План/факт': return ((store.settings.planFact || []) as unknown as Record<string, unknown>[])
        .filter(e => (e as { kind?: string }).kind === planBase)
        .filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'Медиа сервис': return (store.mediaRecords || [])
        .filter(r => !q || JSON.stringify(r).toLowerCase().includes(q));
      case 'Логи': return (store.settings.dbLogs || []).filter(r => !logSearch || JSON.stringify(r).toLowerCase().includes(logSearch.toLowerCase()));
      default: return [];
    }
  }, [tab, store, search, logSearch, leadBase, planBase]);

  const totalPages = Math.max(1, Math.ceil(tabData.length / pageSize));
  const pagedData = tabData.slice((page - 1) * pageSize, page * pageSize);

  function toggleSelect(id: string) { setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }
  function toggleAll() { setSelected(selected.length === pagedData.length ? [] : pagedData.map((r: any) => r.id as string)); }

  function handleExport(ids?: string[]) {
    const toExport = ids ? tabData.filter((r: any) => ids.includes(r.id as string)) : tabData;
    exportToCSV(toExport as Record<string, unknown>[], `db_${tab}_${Date.now()}.csv`);
    addDbLog('EXPORT', tab, toExport.map((r: any) => r.id as string), `Экспорт ${toExport.length} записей из ${tab}`);
    toast.success(`Экспортировано ${toExport.length} записей`);
  }

  function initiateDelete(ids: string[]) { setConfirmState({ ids, entityType: tab, tab, step: 1, inputVal: '' }); }

  function confirmDelete() {
    if (!confirmState) return;
    if (confirmState.step === 1) { setConfirmState({ ...confirmState, step: 2 }); return; }
    if (confirmState.inputVal !== 'УДАЛИТЬ') { toast.error('Введите УДАЛИТЬ для подтверждения'); return; }
    if (!isAdmin()) { toast.error('Недостаточно прав'); setConfirmState(null); return; } // defense in depth

    void doConfirmedDelete();
  }

  async function doConfirmedDelete() {
    if (!confirmState) return;
    const { ids, tab: t } = confirmState;
    const details = `Удалено ${ids.length} записей из ${t}`;

    // This is a *permanent* delete — unlike the soft-delete (archive) actions
    // elsewhere in the app, a row removed only from the local array would
    // simply come back on the next Supabase sync pull, since background sync
    // only ever upserts. Call the real API so it's actually gone server-side
    // too (also gets enforced by admin-only DELETE policies in schema.sql —
    // this call would be rejected outright for a non-admin regardless of
    // what the UI shows).
    if (t !== 'План/факт' && t !== 'Медиа сервис') { // v1.34.0: удаление всегда через API (Supabase вырезан)
      try {
        const deleteFn = t === 'Поставщики' ? deleteSupplier : t === 'Покупатели' ? deleteBuyer : t === 'Задачи' ? deleteTask : deleteTicket;
        await Promise.all(ids.map(id => deleteFn(id)));
      } catch (err) {
        toast.error('Не удалось удалить записи на сервере');
        console.error(err);
        return;
      }
    }

    updateStore(s => {
      const ns = { ...s };
      if (t === 'Поставщики') ns.suppliers = s.suppliers.filter(r => !ids.includes(r.id));
      if (t === 'Покупатели') ns.buyers = s.buyers.filter(r => !ids.includes(r.id));
      if (t === 'Задачи') ns.tasks = s.tasks.filter(r => !ids.includes(r.id));
      if (t === 'Поддержка') ns.tickets = s.tickets.filter(r => !ids.includes(r.id));
      if (t === 'План/факт') ns.settings = { ...s.settings, planFact: (s.settings.planFact || []).filter(r => !ids.includes(r.id)) };
      if (t === 'Медиа сервис') ns.mediaRecords = s.mediaRecords.filter(r => !ids.includes(r.id));
      return ns;
    });
    addDbLog('DELETE', t, ids, details);
    setSelected([]); setConfirmState(null); forceUpdate(n => n + 1);
    toast.success(details);
  }

  const getColumns = () => {
    switch (tab) {
      case 'Поставщики': case 'Покупатели': return ['tradeName', 'type', 'city', 'status', 'phone', 'email', 'inn', 'companyScore', 'createdAt', 'deletedAt'];
      case 'Задачи': return ['title', 'entityType', 'entityName', 'dueDate', 'taskStatus', 'createdAt'];
      case 'Поддержка': return ['subject', 'type', 'status', 'priority', 'contactName', 'contactEmail', 'createdAt'];
      case 'Сервис проценки': return ['timestamp', 'userName', 'supplierName', 'details'];
      // ТЗ v1.22.11: без этого кейса таблица «Пользователи» рендерилась без колонок и строки не были видны
      case 'Пользователи': return ['id', 'дата создания', 'имя', 'роль', 'дата блокировки или увольнения'];
      case 'Логи синка': return ['время', 'операция', 'сущность', 'статус', 'сообщение'];
      case 'База лидов': return ['type', 'subType', 'inn', 'tradeName', 'city', 'contactName', 'status', 'phone', 'email', 'deletedAt'];
      case 'План/факт': return ['startDate', 'endDate', 'cityName', 'filterType', 'serviceIds', 'responsibleName', 'plan', 'report', 'notes', 'createdAt', 'updatedAt', 'deletedAt'];
      case 'Медиа сервис': return ['supplierName', 'adTypeName', 'durationLabel', 'pricePerMonth', 'totalPrice', 'status', 'startDate', 'endDate', 'responsibleName', 'notes', 'createdAt', 'updatedAt', 'deletedAt'];
      case 'Логи дублей': return ['Источник', 'Торговое название', 'ИНН', 'Город', 'ФИО', 'Телефон', 'Email', 'Дата'];
      case 'Логи': return ['userEmail', 'action', 'entityType', 'details', 'createdAt'];
      default: return [];
    }
  };

  const colLabels: Record<string, string> = {
    tradeName: 'Название', type: 'Тип', city: 'Город', status: 'Статус', phone: 'Телефон',
    email: 'Email', inn: 'ИНН', companyScore: 'Оценка', createdAt: 'Создан', deletedAt: 'Удалён',
    title: 'Заголовок', entityType: 'Тип', entityName: 'Объект', dueDate: 'Срок', taskStatus: 'Статус',
    subject: 'Тема', priority: 'Приоритет', contactName: 'Контакт', contactEmail: 'Email',
    userEmail: 'Пользователь', action: 'Действие', details: 'Детали',
    timestamp: 'Дата', userName: 'Пользователь', supplierName: 'Поставщик',
    subType: 'Подтип', comment: 'Комментарий',
    startDate: 'Начало', endDate: 'Окончание', cityName: 'Город', filterType: 'Тип',
    adTypeName: 'Тип рекламы', durationLabel: 'Формат', pricePerMonth: 'Цена/мес', totalPrice: 'Сумма', // v_1.9: медиа-поля (supplierName уже выше)
    serviceIds: 'Сервисы продаж', responsibleName: 'Ответственный', plan: 'План',
    report: 'Отчёт', notes: 'Заметки', updatedAt: 'Изменён',
  };

  const columns = getColumns();
  const isLogTab = tab === 'Логи' || tab === 'Сервис проценки';

  if (!admin) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="actions-bar flex items-center justify-start flex-wrap gap-2">
        <div className="flex gap-2">
          <button onClick={() => handleExport()} className="action-btn text-xs"><Download size={14} /> Выгрузить всё</button>
          {selected.length > 0 && !isLogTab && <button onClick={() => initiateDelete(selected)} className="action-btn text-xs"><Trash2 size={14} /> Удалить ({selected.length})</button>}
        </div>
      </div>

                  <div className={`card-base overflow-hidden ${tab === 'Логи синка' ? 'sync-log-mode' : ''}`}>
        <div className="flex overflow-x-auto border-b border-brand-gray-mid">
          {DB_TABS.map(t => <button key={t} onClick={() => { setTab(t); setSearch(''); setSelected([]); setPage(1); }} className={`tab-button flex-shrink-0 ${tab === t ? 'tab-active' : 'tab-inactive'}`}>{t}</button>)}
        </div>

{tab === 'Логи синка' && (() => {
              const log = (showSyncErrors ? getSyncErrors() : getSyncLog()).slice().reverse();
              const errs = getSyncErrors().length;
              return (
                <div className="sync-log-panel p-4 space-y-3 border-b border-brand-gray-mid">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200 font-medium">{showSyncErrors ? 'История ошибок' : log.length + ' записей'}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${errs ? 'bg-red-50 text-red-700 border-red-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>{errs} ошибок</span>
                    <div className="ml-auto flex gap-2">
                      <button onClick={() => setShowSyncErrors(v => !v)}
                        className={`text-xs py-1.5 px-3 rounded-lg border transition-colors ${showSyncErrors ? 'action-btn-active' : ''}`}>
                        Ошибки ({errs})
                      </button>
                      <button onClick={() => { const payload = showSyncErrors ? { errors: getSyncErrors() } : { log: getSyncLog(), errors: getSyncErrors() }; navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(() => alert('Скопировано — отправьте разработчику')); }}
                        className="btn-secondary text-xs py-1.5 px-3">Скопировать лог</button>
                      <button onClick={() => { if (window.confirm('Очистить лог и историю ошибок синхронизации?')) { clearSyncLog(); setShowSyncErrors(false); } }}
                        className="btn-secondary text-xs py-1.5 px-3">Очистить</button>
                    </div>
                  </div>
                  <div className="table-scroll"><table className="w-full">
                    <thead><tr className="border-b border-brand-gray-mid">
                      <th className="table-header">Время</th><th className="table-header">Операция</th><th className="table-header">Сущность</th><th className="table-header">Статус</th><th className="table-header">Сообщение</th>
                    </tr></thead>
                    <tbody>
                      {log.length === 0 && <tr><td className="table-cell text-gray-400" colSpan={5}>Лог пуст — записи появятся после первого прохода синхронизации.</td></tr>}
                      {log.map(e => (
                        <tr key={e.id} className="border-b border-brand-gray-mid">
                          <td className="table-cell whitespace-nowrap text-xs">{e.ts.slice(11, 19)}</td>
                          <td className="table-cell text-xs">{e.op}{e.kind === 'summary' ? ' (итог)' : ''}</td>
                          <td className="table-cell text-xs">{e.entity}{e.itemId ? ` · ${e.itemId.slice(0, 8)}` : ''}</td>
                          <td className="table-cell"><span className={`text-[11px] px-2 py-0.5 rounded-full border ${e.status === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{e.status === 'ok' ? 'ок' : 'ошибка'}</span></td>
                          <td className="table-cell text-xs text-gray-500 max-w-[420px] truncate" title={e.message}>{e.message || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              );
            })()}

        <div className="p-3 border-b border-brand-gray-mid flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="form-input pl-8 py-1.5 text-xs" placeholder="Поиск по всем полям..." value={isLogTab ? logSearch : search} onChange={e => { if (isLogTab) setLogSearch(e.target.value); else setSearch(e.target.value); setPage(1); }} />
          </div>
          <select className="form-input py-1.5 text-xs w-auto" value={pageSize} onChange={e => { setPageSize(parseInt(e.target.value)); setPage(1); }}>
            {[50, 100, 300, 500, 1000].map(n => <option key={n} value={n}>{n} на стр.</option>)}
          </select>
          {selected.length > 0 && !isLogTab && (
            <>
              <button onClick={() => handleExport(selected)} className="btn-secondary text-xs"><Download size={12} /> Экспорт ({selected.length})</button>
              <button onClick={() => initiateDelete(selected)} className="btn-danger text-xs"><Trash2 size={12} /> Удалить</button>
              <button onClick={() => setSelected([])} className="text-gray-400"><X size={14} /></button>
            </>
          )}
        </div>

        {tab === 'База лидов' && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">База:</span>
          <button onClick={() => setLeadBase('buyer')} className={`btn-secondary text-xs py-1.5 px-3 ${leadBase === 'buyer' ? 'bg-gray-200' : ''}`}>Покупатели</button>
          <button onClick={() => setLeadBase('supplier')} className={`btn-secondary text-xs py-1.5 px-3 ${leadBase === 'supplier' ? 'bg-gray-200' : ''}`}>Поставщики</button>
        </div>
      )}

      {tab === 'План/факт' && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-gray-500">База:</span>
          <button onClick={() => setPlanBase('buyers')} className={`btn-secondary text-xs py-1.5 px-3 ${planBase === 'buyers' ? 'bg-gray-200' : ''}`}>Покупатели</button>
          <button onClick={() => setPlanBase('suppliers')} className={`btn-secondary text-xs py-1.5 px-3 ${planBase === 'suppliers' ? 'bg-gray-200' : ''}`}>Поставщики</button>
        </div>
      )}

      <div className="table-scroll">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-brand-gray-mid bg-brand-gray">
                {!isLogTab && tab !== 'Пользователи' && tab !== 'Логи синка' && <th className="table-header w-10"><input type="checkbox" checked={selected.length === pagedData.length && pagedData.length > 0} onChange={toggleAll} className="rounded" /></th>}
                <th className="table-header text-xs font-semibold text-gray-400">ID</th>
                {columns.map(c => <th key={c} className="table-header text-xs font-semibold text-gray-400">{colLabels[c] || c}</th>)}
              </tr>
            </thead>
            <tbody>
              {pagedData.length === 0 && <tr><td colSpan={columns.length + 2} className="text-center py-10 text-gray-400">Записей не найдено</td></tr>}
              {pagedData.map((row) => {
                const isDeleted = !!row['deletedAt'];
                return (
                  <tr key={row['id'] as string} className={`border-b border-brand-gray-mid hover:bg-brand-gray ${isDeleted ? 'opacity-50' : ''}`}>
                    {!isLogTab && tab !== 'Пользователи' && tab !== 'Логи синка' && (
                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(row['id'] as string)} onChange={() => toggleSelect(row['id'] as string)} className="rounded" />
                      </td>
                    )}
                    <td className="table-cell font-mono text-gray-300" title={row['id'] as string}>
                      {(row['id'] as string)?.slice(0, 8)}…
                      {isDeleted && <span className="ml-1 text-red-400 text-xs">DEL</span>}
                    </td>
                    {columns.map(c => (
                      <td key={c} className="table-cell max-w-[200px] truncate">
                        {c === 'createdAt' || c === 'deletedAt' || c === 'dueDate'
                          ? (row[c] ? formatDateTime(row[c] as string) : '—')
                          : String(row[c] ?? '—').slice(0, 60)
                        }
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-3 border-t border-brand-gray-mid flex items-center justify-between text-xs text-gray-500">
          <span>Показано {Math.min((page - 1) * pageSize + 1, tabData.length)}–{Math.min(page * pageSize, tabData.length)} из {tabData.length}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded border border-brand-gray-mid disabled:opacity-40 hover:bg-brand-gray">«</button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border border-brand-gray-mid disabled:opacity-40 hover:bg-brand-gray">‹</button>
            <span className="px-3 py-1">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border border-brand-gray-mid disabled:opacity-40 hover:bg-brand-gray">›</button>
            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded border border-brand-gray-mid disabled:opacity-40 hover:bg-brand-gray">»</button>
          </div>
        </div>
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="card-base w-full max-w-md p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"><AlertTriangle size={20} className="text-brand-red" /></div>
              <div><h3 className="font-semibold text-brand-black">Подтверждение удаления</h3><p className="text-xs text-gray-500">{confirmState.entityType}</p></div>
            </div>
            {confirmState.step === 1 ? (
              <>
                <p className="text-sm text-gray-700 mb-4">Вы уверены, что хотите удалить <b>{confirmState.ids.length}</b> запись(-ей)?<br /><span className="text-red-600 font-medium">Это действие необратимо.</span></p>
                <div className="flex gap-2 justify-end"><button onClick={() => setConfirmState(null)} className="btn-secondary">Отмена</button><button onClick={confirmDelete} className="btn-danger">Продолжить →</button></div>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700 mb-3">Введите <b className="text-brand-red">УДАЛИТЬ</b> для подтверждения:</p>
                <input className="form-input mb-4" placeholder="УДАЛИТЬ" value={confirmState.inputVal} onChange={e => setConfirmState({ ...confirmState, inputVal: e.target.value })} autoFocus />
                <div className="flex gap-2 justify-end"><button onClick={() => setConfirmState(null)} className="btn-secondary">Отмена</button><button onClick={confirmDelete} disabled={confirmState.inputVal !== 'УДАЛИТЬ'} className="btn-danger disabled:opacity-50"><Trash2 size={14} /> Удалить навсегда</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
