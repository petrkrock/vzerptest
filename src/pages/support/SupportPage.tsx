import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStore, updateStore, useStoreVersion, getContactPrefs } from '@/lib/store';
import { generateId, formatDate } from '@/lib/utils';
import { getCurrentUser, canDelete, canSeeTicket } from '@/lib/auth';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import type { DbLog, HistoryEntry, Task, Ticket } from '@/types';
import {TICKET_STATUSES, TICKET_STATUS_COLORS, TICKET_TYPES} from '@/constants';
import { FileDown, Plus, Trash2, Search, X, Calendar, History, CheckCircle2, CircleSlash, User, Send, Archive, Edit2, Store, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import ContactPrefIcon from '@/components/features/ContactPrefIcons';

// Системные статусы (6): «Отправлен в задачи» — архивный, ставится кнопкой действия.
const [T_NEW, T_FORM, T_PROG, T_SENT, T_DONE, T_UNSOLVED] = TICKET_STATUSES;
const TERMINAL_T: string[] = [T_SENT, T_DONE, T_UNSOLVED];

function curStatus(t: Ticket): string {
  if (t.status === 'Новая') return T_NEW;
  if (t.status === 'Новый с сайта') return T_FORM;
  if (t.status && TICKET_STATUSES.includes(t.status as typeof TICKET_STATUSES[number])) return t.status;
  return T_PROG;
}
const statusColor = (s: string) => TICKET_STATUS_COLORS[s] || { bg: '#F3F4F6', text: '#374151' };
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function makeEntry(field: string, oldValue: string | undefined, newValue: string | undefined, comment: string | undefined, userId: string, userName: string): HistoryEntry {
  return { id: generateId(), date: new Date().toISOString(), field, oldValue, newValue, comment, userId, userName };
}

export default function SupportPage() {
  useStoreVersion();
  const navigate = useNavigate();
  const [, forceUpdate] = useState(0);
  const store = getStore();
  const ticketTypes: string[] = (store.settings.ticketTypes || []).length ? store.settings.ticketTypes! : [...TICKET_TYPES];

  const liveTickets = store.tickets.filter(t => !t.deletedAt && canSeeTicket(t));

  const [search, setSearch] = useState('');
  // ТЗ: подгрузка списка «Показать ещё»
  const [listLimit, setListLimit] = useState(50);
  const [listShown, setListShown] = useState(50);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSent, setFilterSent] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [filterType, setFilterType] = useState('');
  const [filterResponsible, setFilterResponsible] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  // От кого: два варианта ввода
  const [fromMode, setFromMode] = useState<'manual' | 'list'>('manual');
  const [fromKind, setFromKind] = useState<'' | 'supplier' | 'buyer'>('');
  const [fromQuery, setFromQuery] = useState('');
  const [fromEntity, setFromEntity] = useState('');
  const [newForm, setNewForm] = useState<Partial<Ticket>>({ type: ticketTypes[0] || 'Вопрос', status: T_NEW, priority: 0, subject: '', history: [] });
  // Редактирование обращения (как в задачах)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Ticket>>({});
  const [confirmAction, setConfirmAction] = useState<{ msg: string; action: () => void; danger?: boolean } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);

  const tickets = useMemo(() => {
    let list = liveTickets;
    if (search) { const q = search.toLowerCase(); list = list.filter(t => (t.text || '').toLowerCase().includes(q) || (t.contactName || '').toLowerCase().includes(q) || (t.contactPhone || '').includes(q)); }
    if (filterStatus) list = list.filter(t => curStatus(t) === filterStatus);
    else if (filterSent) list = list.filter(t => curStatus(t) === T_SENT || !!t.taskId);
    else if (showArchive) list = list.filter(t => TERMINAL_T.includes(curStatus(t)));
    else list = list.filter(t => !TERMINAL_T.includes(curStatus(t)));
    if (filterType) list = list.filter(t => t.type === filterType);
    if (filterResponsible === '__none__') list = list.filter(t => !t.responsibleId);
    else if (filterResponsible) list = list.filter(t => t.responsibleId === filterResponsible);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.tickets, search, filterStatus, filterSent, showArchive, filterType, filterResponsible]);
  useEffect(() => { setListShown(listLimit); }, [tickets]); // сброс подгрузки при смене фильтров/поиска


  // Открытые (не TERMINAL) обращения по каждому типу — для кнопок-фильтров.
  // Закрытые (TERMINAL) в количество не попадают.
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tp of ticketTypes) counts[tp] = 0;
    for (const t of liveTickets) {
      if (!TERMINAL_T.includes(curStatus(t))) counts[t.type] = (counts[t.type] || 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTickets, ticketTypes]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    TICKET_STATUSES.forEach(s => { counts[s] = liveTickets.filter(t => curStatus(t) === s).length; });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.tickets]);

  const sentCount = liveTickets.filter(t => curStatus(t) === T_SENT || !!t.taskId).length;
  const activeCount = liveTickets.filter(t => !TERMINAL_T.includes(curStatus(t))).length;

  // Список для выбора: сначала кнопка Поставщик/Покупатель, потом поиск
  const pickList = useMemo(() => {
    const q = fromQuery.trim().toLowerCase();
    const src = fromKind === 'supplier' ? store.suppliers.filter(s => !s.deletedAt)
      : fromKind === 'buyer' ? store.buyers.filter(b => !b.deletedAt) : [];
    return q ? src.filter(x => (x.tradeName || '').toLowerCase().includes(q) || (x.inn || '').includes(q)) : src;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromKind, fromQuery, store.suppliers, store.buyers]);

  function toggleSelect(id: string) { setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }
  function askConfirm(msg: string, action: () => void, danger?: boolean) { setConfirmAction({ msg, action, danger }); }

  function applyStatus(id: string, status: string, comment?: string) {
    const u = getCurrentUser(); const now = new Date().toISOString();
    updateStore(s => ({
      ...s,
      tickets: s.tickets.map(t => t.id === id ? { ...t, status: status as Ticket['status'], updatedAt: now, history: [...t.history, makeEntry('status', curStatus(t), status, comment, u?.id || '', u?.name || '')] } : t),
    }));
    forceUpdate(n => n + 1);
  }

  function setTicketStatus(id: string, status: string) {
    const target = liveTickets.find(t => t.id === id);
    if (!target || curStatus(target) === status) return;
    askConfirm(`Вы уверены? Статус обращения будет изменён на «${status}».`, () => {
      applyStatus(id, status);
      toast.success(`Статус: ${status}`);
    });
  }

  function closeTicket(id: string, status: string) {
    const target = liveTickets.find(t => t.id === id);
    if (!target || TERMINAL_T.includes(curStatus(target))) return;
    askConfirm(`Вы уверены? Обращение будет закрыто («${status}») и попадёт в архив.`, () => {
      applyStatus(id, status);
      toast.success(`Обращение закрыто: ${status}`);
    });
  }

  function massClose(status: string) {
    const ids = selected.filter(id => { const t = liveTickets.find(x => x.id === id); return t && !TERMINAL_T.includes(curStatus(t)); });
    if (!ids.length) { toast.error('Выбранные обращения уже в архиве'); return; }
    askConfirm(`Вы уверены? Будет закрыто обращений: ${ids.length} («${status}», архив).`, () => {
      const u = getCurrentUser(); const now = new Date().toISOString();
      updateStore(s => ({
        ...s,
        tickets: s.tickets.map(t => ids.includes(t.id) ? { ...t, status: status as Ticket['status'], updatedAt: now, history: [...t.history, makeEntry('status', curStatus(t), status, 'Массовое закрытие', u?.id || '', u?.name || '')] } : t),
      }));
      setSelected([]); forceUpdate(n => n + 1); toast.success(`Закрыто обращений: ${ids.length}`);
    });
  }

  // v_1.9: выгрузка выбранных обращений в Word (.doc)
  function exportWord() {
    const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = tickets.filter(t => selected.includes(t.id));
    const parts: string[] = [];
    parts.push('<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:15pt}h2{font-size:12pt;margin:10pt 0 4pt}p{margin:3pt 0;white-space:pre-wrap}div.item{border-bottom:1pt solid #999;padding-bottom:5pt;margin-bottom:8pt}span.meta{color:#555;font-size:9pt}</style></head><body>');
    parts.push(`<h1>Обращения в поддержку</h1><p><span class="meta">Дата выгрузки: ${new Date().toISOString().slice(0, 10)} · Записей: ${rows.length}</span></p>`);
    rows.forEach(t => {
      parts.push('<div class="item">');
      parts.push(`<h2>${esc(t.subject)}</h2>`);
      parts.push(`<p><span class="meta">Тип: ${esc(t.type)} · Статус: ${esc(t.status)} · ${esc(t.contactName || '—')} · ${esc(t.contactPhone || '')} ${esc(t.contactEmail || '')} · Создано: ${esc((t.createdAt || '').slice(0, 10))}</span></p>`);
      parts.push(`<p>${esc(t.text)}</p>`);
      parts.push('</div>');
    });
    parts.push('</body></html>');
    const blob = new Blob(['\ufeff' + parts.join('')], { type: 'application/msword;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `обращения_поддержка_${new Date().toISOString().slice(0, 10)}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

function deleteSelected() {
    if (!canDelete()) { toast.error('Удаление доступно только администратору'); return; }
    const ids = selected;
    if (!ids.length) return;
    const titles = liveTickets.filter(t => ids.includes(t.id)).map(t => `${t.contactName || '—'}: ${(t.text || '').slice(0, 40)}`).join('; ');
    askConfirm(`Вы уверены? Обращений в корзине: ${ids.length}. Удаление мягкое — записи останутся в базе и попадут в журнал «Логи».`, () => {
      const u = getCurrentUser(); const now = new Date().toISOString();
      const log: DbLog = {
        id: generateId(), userId: u?.id || '', userEmail: u?.email || '',
        action: 'DELETE', entityType: 'ticket', entityIds: ids,
        details: `Мягкое удаление обращений (${ids.length}): ${titles.slice(0, 300)}`, createdAt: now,
      };
      updateStore(s => ({
        ...s,
        tickets: s.tickets.map(t => ids.includes(t.id) ? { ...t, deletedAt: now, updatedAt: now, history: [...t.history, makeEntry('deleted', undefined, undefined, 'Обращение удалено (мягкое удаление)', u?.id || '', u?.name || '')] } : t),
        settings: { ...s.settings, dbLogs: [...(s.settings.dbLogs || []), log] },
      }));
      setSelected([]); forceUpdate(n => n + 1); toast.success('Обращения удалены (журнал «Логи»)');
    }, true);
  }

  /** «Отправить в задачи»: создаёт задачу и ставит обращению архивный статус «Отправлен в задачи».
   *  В описание задачи — что есть: имя/телефон/email, тип, способ связи, текст. */
  function createTaskFromTicket(t: Ticket) {
    if (t.taskId) { toast.error('Задача уже создана из этого обращения'); return; }
    askConfirm('Вы уверены? Будет создана задача «От поддержки», обращение получит статус «Отправлен в задачи» (архив).', () => {
      const u = getCurrentUser()!; const now = new Date().toISOString();
      const contact = [t.contactName, t.contactPhone, t.contactEmail].filter(Boolean).join(' · ') || 'Без контакта';
      const desc = [
        `Контакт: ${contact}`,
        `Тип обращения: ${t.type || '—'}`,
        `Способ связи: ${(t.contactPrefs && t.contactPrefs.length ? t.contactPrefs : t.contactPref ? [t.contactPref] : []).join(', ') || '—'}`,
        '',
        t.text || '',
      ].join('\n');
      const task: Task = {
        id: generateId(), entityType: 'ticket', entityId: t.id, entityName: t.contactName || 'Обращение',
        title: 'От поддержки', description: desc,
        dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
        createdAt: now, updatedAt: now, createdBy: u.id, responsibleId: u.id, responsibleName: u.name,
        history: [makeEntry('created', undefined, undefined, `Создана из обращения (${u.name})`, u.id, u.name)],
      };
      updateStore(s => ({
        ...s,
        tasks: [...s.tasks, task],
        tickets: s.tickets.map(x => x.id === t.id ? { ...x, taskId: task.id, status: T_SENT as Ticket['status'], updatedAt: now, history: [...x.history, makeEntry('status', curStatus(x), T_SENT, `Отправлено в задачи (${u.name})`, u.id, u.name)] } : x),
      }));
      forceUpdate(n => n + 1); toast.success('Задача «От поддержки» создана, обращение отправлено в архив');
    });
  }

  // ── Редактирование обращения (как в задачах) ──
  function openEdit(t: Ticket) {
    setEditingId(t.id);
    setEditForm({ contactName: t.contactName, contactPhone: t.contactPhone, contactEmail: t.contactEmail, type: t.type, contactPref: t.contactPref, text: t.text, responsibleId: t.responsibleId, responsibleName: t.responsibleName });
  }

  function saveEdit(id: string) {
    const u = getCurrentUser(); const old = liveTickets.find(t => t.id === id);
    if (!old) return;
    const now = new Date().toISOString();
    const changes: HistoryEntry[] = [];
    const push = (field: string, oldV: string | undefined, newV: string | undefined) => {
      if ((oldV || '') !== (newV || '')) changes.push(makeEntry(field, oldV || undefined, newV || undefined, undefined, u?.id || '', u?.name || ''));
    };
    push('contact', old.contactName, editForm.contactName);
    push('contactPhone', old.contactPhone, editForm.contactPhone);
    push('contactEmail', old.contactEmail, editForm.contactEmail);
    push('type', old.type, editForm.type);
    push('contactPref', old.contactPref, editForm.contactPref);
    push('contactPrefs', (old.contactPrefs || []).join(', '), (editForm.contactPrefs || []).join(', '));
    push('text', old.text, editForm.text);
    push('responsible', old.responsibleName, editForm.responsibleName);
    updateStore(s => ({
      ...s,
      tickets: s.tickets.map(t => t.id === id ? { ...t, ...editForm, updatedAt: now, history: [...t.history, ...changes] } : t),
    }));
    setEditingId(null); setEditForm({});
    forceUpdate(n => n + 1); toast.success('Обращение обновлено');
  }

  function pickFromEntity(kind: 'supplier' | 'buyer', id: string) {
    setFromEntity(`${kind}:${id}`);
    const src = kind === 'supplier' ? store.suppliers.find(s => s.id === id) : store.buyers.find(b => b.id === id);
    if (src) setNewForm(f => ({ ...f, contactName: src.tradeName || '', contactPhone: src.phone || '', contactEmail: src.email || '' }));
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const ticket: Ticket = {
      id: generateId(), type: newForm.type || ticketTypes[0] || 'Вопрос', status: T_NEW as Ticket['status'],
      priority: 0, subject: '', text: newForm.text || '',
      contactName: newForm.contactName || '', contactPhone: newForm.contactPhone || '', contactEmail: newForm.contactEmail || '',
      contactPref: newForm.contactPref || undefined,
      contactPrefs: newForm.contactPrefs || [],
      responsibleId: newForm.responsibleId, responsibleName: newForm.responsibleName,
      fromApi: false, createdAt: now, updatedAt: now, createdBy: u.id,
      history: [makeEntry('created', undefined, undefined, 'Обращение создано', u.id, u.name)],
    };
    updateStore(s => ({ ...s, tickets: [...s.tickets, ticket] }));
    setShowAddForm(false);
    setNewForm({ type: ticketTypes[0] || 'Вопрос', status: T_NEW, priority: 0, subject: '', history: [] });
    setFromMode('manual'); setFromKind(''); setFromQuery(''); setFromEntity('');
    forceUpdate(n => n + 1); toast.success('Обращение создано');
    navigate(`/support/${ticket.id}`);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-fade-in">
            <h3 className="text-base font-semibold text-brand-black mb-2">Вы уверены?</h3>
            <p className="text-sm text-gray-500 mb-5">{confirmAction.msg}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmAction(null)} className="btn-secondary text-sm">Нет</button>
              <button onClick={() => { confirmAction.action(); setConfirmAction(null); }} className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors ${confirmAction.danger ? 'action-btn-active' : ''}`}>Да</button>
            </div>
          </div>
        </div>
      )}

      <div className="actions-bar flex items-center justify-start flex-wrap gap-2">
        <button onClick={() => setShowAddForm(v => !v)} className="action-btn"><Plus size={16} /> Новое обращение</button>
      </div>

      <div className="flex flex-wrap gap-2 w-full">
        <button onClick={() => { setFilterStatus(''); setFilterSent(false); setShowArchive(false); }} className={`action-btn ${!filterStatus && !filterSent && !showArchive ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>Активные</button>
        <button onClick={() => { setFilterStatus(''); setFilterSent(true); setShowArchive(false); }} className={`flex items-center gap-1 action-btn ${filterSent ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}><Send size={11} /> Отправлен в задачи <b>{sentCount}</b></button>
        <button onClick={() => { setFilterStatus(''); setFilterSent(false); setShowArchive(true); }} className={`flex items-center gap-1 action-btn ${showArchive && !filterStatus ? 'bg-gray-700 text-white border-gray-700' : 'border-brand-gray-mid text-gray-500'}`}><Archive size={11} /> Архив</button>
        {TICKET_STATUSES.filter(s => s !== T_SENT).map(s => {
          const c = statusColor(s);
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)} className="action-btn" style={filterStatus === s ? { background: c.text, color: '#fff', borderColor: c.text } : { background: c.bg, color: c.text, borderColor: 'transparent' }}>
              {s} <span className="font-bold">{statusCounts[s] || 0}</span>
            </button>
          );
        })}
      </div>

      <div className="card-base p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[150px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="form-input pl-8 py-1.5 text-xs" placeholder="Поиск по обращениям..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select className="form-input py-1.5 text-xs w-auto" value={filterResponsible} onChange={e => setFilterResponsible(e.target.value)}><option value="">Все ответственные</option>
            <option value="__none__">Без ответственного</option>{store.settings.users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        </div>
      </div>

      {/* ── Типы обращений ── */}
      <div className="flex flex-wrap gap-2 w-full">
        <button type="button" onClick={() => setFilterType('')} className={`stat-card !p-2 flex items-center justify-between gap-3 flex-1 transition-shadow ${filterType === '' ? 'ring-1 ring-gray-700' : 'hover:shadow-md opacity-90'}`}>
          <span className="text-xs text-gray-500">Все типы</span>
          <span className="text-sm font-bold text-brand-black">{liveTickets.length}</span>
        </button>
        {ticketTypes.map(t => (
          <button key={t} type="button" onClick={() => setFilterType(filterType === t ? '' : t)} className={`stat-card !p-2 flex items-center justify-between gap-3 flex-1 transition-shadow ${filterType === t ? 'ring-1 ring-gray-700' : 'hover:shadow-md opacity-90'}`}>
            <span className="text-xs text-gray-500">{t}</span>
            <span className="text-sm font-bold text-brand-black">{typeCounts[t] || 0}</span>
          </button>
        ))}
      </div>

      {showAddForm && (
        <div className="card-base p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4"><h2 className="section-title">Новое обращение</h2><button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button></div>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setFromMode('manual')} className={`text-xs px-3 py-1.5 rounded-lg border min-h-[36px] ${fromMode === 'manual' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>Ввести вручную</button>
            <button onClick={() => setFromMode('list')} className={`text-xs px-3 py-1.5 rounded-lg border min-h-[36px] ${fromMode === 'list' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>Выбрать из списка</button>
          </div>
          <form onSubmit={handleAdd}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              {fromMode === 'list' ? (
                <div className="sm:col-span-2 space-y-3">
                  {/* Шаг 1: кнопки Поставщик / Покупатель */}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => { setFromKind('supplier'); setFromEntity(''); }} className={`flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl border min-h-[36px] transition-colors ${fromKind === 'supplier' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-600 hover:border-gray-400'}`}><Store size={13} /> Поставщик</button>
                    <button type="button" onClick={() => { setFromKind('buyer'); setFromEntity(''); }} className={`flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl border min-h-[36px] transition-colors ${fromKind === 'buyer' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-600 hover:border-gray-400'}`}><ShoppingCart size={13} /> Покупатель</button>
                  </div>
                  {/* Шаг 2: поиск + выбор */}
                  {fromKind && (
                    <>
                      <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="form-input pl-8" placeholder="Поиск по названию или ИНН..." value={fromQuery} onChange={e => setFromQuery(e.target.value)} /></div>
                      <select required className="form-input" value={fromEntity} onChange={e => { const [k, i2] = e.target.value.split(':'); pickFromEntity(k as 'supplier' | 'buyer', i2); }}>
                        <option value="" disabled>{pickList.length ? `Выберите (${pickList.length})…` : 'Ничего не найдено'}</option>
                        {pickList.map(x => <option key={x.id} value={`${fromKind}:${x.id}`}>{x.tradeName}</option>)}
                      </select>
                    </>
                  )}
                </div>
              ) : (
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><label className="form-label">Имя контакта *</label><input required className="form-input" value={newForm.contactName || ''} onChange={e => setNewForm(f => ({ ...f, contactName: e.target.value }))} /></div>
                  <div><label className="form-label">Телефон</label><input className="form-input" value={newForm.contactPhone || ''} onChange={e => setNewForm(f => ({ ...f, contactPhone: e.target.value }))} /></div>
                  <div><label className="form-label">Email</label><input type="email" className="form-input" value={newForm.contactEmail || ''} onChange={e => setNewForm(f => ({ ...f, contactEmail: e.target.value }))} /></div>
                </div>
              )}
              <div><label className="form-label">Тип обращения</label>
                <select className="form-input" value={newForm.type || ticketTypes[0]} onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))}>
                  {ticketTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="form-label">Ответственный</label><ResponsibleSelect value={newForm.responsibleId} onChange={(id, name) => setNewForm(f => ({ ...f, responsibleId: id, responsibleName: name }))} /></div>
              <div><label className="form-label">Способ связи</label>
                <div className="flex flex-wrap gap-1.5 py-1">
                  {getContactPrefs().map(cp => { const on = (newForm.contactPrefs || []).includes(cp); return (
                    <button key={cp} type="button" onClick={() => setNewForm(f => ({ ...f, contactPrefs: on ? (f.contactPrefs || []).filter(x => x !== cp) : [...(f.contactPrefs || []), cp] }))} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}><ContactPrefIcon name={cp} />{cp}</button>
                  ); })}
                </div>
              </div>
              <div className="sm:col-span-2"><label className="form-label">Текст обращения *</label><textarea required className="form-input min-h-[90px] resize-none" value={newForm.text || ''} onChange={e => setNewForm(f => ({ ...f, text: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Отмена</button><button type="submit" className="btn-primary">Создать обращение</button></div>
          </form>
        </div>
      )}

      {selected.length > 0 && (
        <div className="card-base p-3 flex items-center gap-2 bg-blue-50 border-blue-200 animate-fade-in flex-wrap">
          {/* v_1.9: отметить все + выгрузка в Word */}
          <label className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer select-none">
            <input type="checkbox" className="accent-blue-600" checked={tickets.length > 0 && tickets.every(t => selected.includes(t.id))}
              onChange={() => setSelected(sel => tickets.every(t => sel.includes(t.id)) ? [] : tickets.map(t => t.id))} />
            Отметить все
          </label>
          <span className="text-xs font-medium text-blue-700 border-l border-blue-200 pl-2">Выбрано: {selected.length}</span>
          <button onClick={() => massClose(T_DONE)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800 transition-colors min-h-[36px]"><CheckCircle2 size={12} /> Закрыть (Решено)</button>
          <button onClick={() => massClose(T_UNSOLVED)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors min-h-[36px]"><CircleSlash size={12} /> Закрыть (Без решения)</button>
          {canDelete() && <button onClick={deleteSelected} className="action-btn action-btn-md text-xs py-1.5 min-h-[36px] ml-1"><Trash2 size={12} /> Удалить</button>}
          <button onClick={exportWord} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 transition-colors min-h-[36px] ml-1"><FileDown size={12} /> Выгрузить в Word</button>
          <button onClick={() => setSelected([])} className="text-xs text-gray-400 ml-auto min-h-[36px] px-2"><X size={14} /></button>
        </div>
      )}

      <div className="space-y-2.5">
        {tickets.length === 0 && <div className="card-base p-10 text-center text-gray-400 text-sm">{showArchive ? 'Архив пуст' : 'Обращений нет'}</div>}
        {tickets.slice(0, listShown).map(t => {
          const status = curStatus(t);
          const c = statusColor(status);
          const isTerminal = TERMINAL_T.includes(status);
          const isSelected = selected.includes(t.id);
          const isEditing = editingId === t.id;
          return (
            <div key={t.id} className={`card-base p-4 rounded-2xl transition-shadow hover:shadow-md ${isTerminal ? 'opacity-75' : ''} ${isSelected ? 'ring-2 ring-blue-300' : ''}`} style={{ borderColor: c.text }}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(t.id)} className="mt-1 rounded flex-shrink-0 accent-black" />
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div><label className="form-label">Имя контакта</label><input className="form-input" value={editForm.contactName || ''} onChange={e => setEditForm(f => ({ ...f, contactName: e.target.value }))} /></div>
                        <div><label className="form-label">Телефон</label><input className="form-input" value={editForm.contactPhone || ''} onChange={e => setEditForm(f => ({ ...f, contactPhone: e.target.value }))} /></div>
                        <div><label className="form-label">Email</label><input className="form-input" value={editForm.contactEmail || ''} onChange={e => setEditForm(f => ({ ...f, contactEmail: e.target.value }))} /></div>
                        <div><label className="form-label">Тип обращения</label>
                          <select className="form-input" value={editForm.type || t.type} onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                            {ticketTypes.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </div>
                        <div><label className="form-label">Способ связи</label>
                          <div className="flex flex-wrap gap-1.5 py-1">
                            {getContactPrefs().map(cp => { const on = (editForm.contactPrefs || []).includes(cp); return (
                              <button key={cp} type="button" onClick={() => setEditForm(f => ({ ...f, contactPrefs: on ? (f.contactPrefs || []).filter(x => x !== cp) : [...(f.contactPrefs || []), cp] }))} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}><ContactPrefIcon name={cp} />{cp}</button>
                            ); })}
                          </div>
                        </div>
                        <div><label className="form-label">Ответственный</label><ResponsibleSelect value={editForm.responsibleId} onChange={(id, name) => setEditForm(f => ({ ...f, responsibleId: id, responsibleName: name }))} /></div>
                        <div className="sm:col-span-2"><label className="form-label">Текст обращения</label><textarea className="form-input min-h-[80px] resize-none" value={editForm.text || ''} onChange={e => setEditForm(f => ({ ...f, text: e.target.value }))} /></div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setEditingId(null); setEditForm({}); }} className="btn-secondary text-xs">Отмена</button>
                        <button onClick={() => saveEdit(t.id)} className="btn-primary text-xs">Сохранить</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">{t.type || 'Обращение'}</span>
                          <p className="text-sm font-semibold truncate text-brand-black flex items-center gap-1"><User size={12} className="text-gray-400" />{t.contactName || 'Без контакта'}</p>
                          {(curStatus(t) === T_SENT || t.taskId) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex items-center gap-1 flex-shrink-0"><Send size={9} /> В задачах</span>}
                        </div>
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold flex-shrink-0" style={{ background: c.bg, color: c.text }}>{status}</span>
                      </div>
                      {t.text && <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap leading-relaxed">{t.text}</p>}
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1.5 mt-2">
                        {t.contactPhone && <span className="text-xs text-gray-500">{t.contactPhone}</span>}
                        {t.contactEmail && <span className="text-xs text-gray-500">{t.contactEmail}</span>}
                        {(t.contactPrefs && t.contactPrefs.length ? t.contactPrefs : t.contactPref ? [t.contactPref] : []).map(cp => <span key={cp} className="flex items-center gap-1 text-xs bg-brand-gray text-gray-600 px-2 py-0.5 rounded-full"><ContactPrefIcon name={cp} />{cp}</span>)}
                        {t.responsibleName && <span className="text-xs text-gray-500 px-2 py-0.5 rounded-full bg-white border border-gray-200">Ответственный: {t.responsibleName}</span>}
                        <span className="text-xs text-gray-400 flex items-center gap-1"><Calendar size={11} /> {formatDate(t.createdAt)}</span>
                        {t.history.length > 0 && (
                          <button onClick={() => setOpenHistoryId(openHistoryId === t.id ? null : t.id)} className="text-xs text-gray-400 hover:text-brand-black flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"><History size={12} /> {t.history.length}</button>
                        )}
                        <div className="flex items-center gap-1 ml-auto">
                          <button onClick={() => navigate(`/support/${t.id}`)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors flex items-center gap-1">Карточка</button>
                          <button onClick={() => openEdit(t)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors flex items-center gap-1"><Edit2 size={12} /> Изменить</button>
                        </div>
                      </div>
                      {/* Кнопки действий — слева внизу карточки, как в Задачах */}
                      {!isTerminal && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                          {(status === T_NEW || status === T_FORM) && <button onClick={() => setTicketStatus(t.id, T_PROG)} className="text-xs px-2.5 py-1 rounded-lg border border-brand-gray-mid text-gray-600 hover:bg-brand-gray transition-colors min-h-[28px]">Решаю</button>}
                          <button onClick={() => closeTicket(t.id, T_DONE)} className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-700 hover:text-white hover:border-green-700 transition-colors min-h-[28px] flex items-center gap-1"><CheckCircle2 size={11} /> Закрыть обращение (Решено)</button>
                          <button onClick={() => closeTicket(t.id, T_UNSOLVED)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-700 hover:text-white hover:border-gray-700 transition-colors min-h-[28px] flex items-center gap-1"><CircleSlash size={11} /> Закрыть обращение (Без решения)</button>
                          {!t.taskId && <button onClick={() => createTaskFromTicket(t)} className="text-xs px-2.5 py-1 rounded-lg bg-brand-black text-white hover:bg-gray-800 transition-colors min-h-[28px] flex items-center gap-1"><Send size={11} /> Отправить в задачи</button>}
                        </div>
                      )}
                      {openHistoryId === t.id && (
                        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                          {[...t.history].reverse().map(h => (
                            <div key={h.id} className="text-[11px] text-gray-500">
                              <span className="text-gray-400">{fmtDateTime(h.date)}</span> · <span className="font-medium text-gray-600">{h.userName}</span>{h.newValue ? <> — «{h.newValue}»</> : null}{h.comment && <span className="text-gray-400"> ({h.comment})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      {/* ТЗ: подгрузка «Показать ещё» + выбор размера страницы */}
      {tickets.length > listShown && (
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setListShown(v => v + listLimit)} className="btn-secondary text-xs">Показать ещё · осталось {tickets.length - listShown}</button>
          <select className="form-input h-6 py-0 text-[11px] w-auto" value={listLimit} onChange={e => { const n = Number(e.target.value); setListLimit(n); setListShown(n); }} title="Записей на страницу">
            {[50, 100, 300, 500, 1000].map(n => <option key={n} value={n}>{n}/стр.</option>)}
          </select>
        </div>
      )}
      </div>
    </div>
  );
}
