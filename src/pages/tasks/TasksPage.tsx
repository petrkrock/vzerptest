import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStore, updateStore, useStoreVersion } from '@/lib/store';
import { generateId, formatDate, isToday, isOverdue } from '@/lib/utils';
import { getCurrentUser, canDelete, canSeeTask } from '@/lib/auth';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import type { DbLog, Task, HistoryEntry } from '@/types';
import { TASK_STATUSES, TASK_STATUS_COLORS, DEFAULT_TASK_TYPES, SYSTEM_TASK_TYPE } from '@/constants';
import { FileDown, Plus, Trash2, Search, X, AlertCircle, Calendar, Edit2, History, Archive, CheckCircle2, CircleSlash, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const DEFAULT_ENTITY_LABELS: Record<string, string> = {
  supplier: 'Поставщик', buyer: 'Покупатель', ticket: 'Обращение', none: 'Без привязки',
};

const FIELD_LABELS: Record<string, string> = {
  created: 'Создание', title: 'Тип задачи', description: 'Описание', dueDate: 'Срок',
  responsible: 'Ответственный', entity: 'Привязка', taskStatus: 'Статус',
};

// ── СИСТЕМНЫЕ СТАТУСЫ ЗАДАЧ (новая логика, старая — удалена) ──
// «Новая» — автоматически при создании любой задачи.
// «Решаю» — промежуточный, ставится пользователем.
// «Решено» / «Без решения» — финальные архивные, ставятся КНОПКАМИ ДЕЙСТВИЯ.
const [ST_NEW, ST_PROGRESS, ST_DONE, ST_UNSOLVED] = TASK_STATUSES;
const TERMINAL: string[] = [ST_DONE, ST_UNSOLVED];

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function makeEntry(field: string, oldValue: string | undefined, newValue: string | undefined, comment: string | undefined, userId: string, userName: string): HistoryEntry {
  return { id: generateId(), date: new Date().toISOString(), field, oldValue, newValue, comment, userId, userName };
}

function TaskStatusBadge({ status }: { status: string }) {
  const c = TASK_STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#374151' };
  return <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold" style={{ background: c.bg, color: c.text }}>{status}</span>;
}


/** Нормализация статуса: в системе только 4 статуса; legacy-значения
 *  (кастомные статусы старой логики) отображаются как «Решаю»/«Решено». */
function curStatus(t: Task): string {
  if (t.taskStatus && TASK_STATUSES.includes(t.taskStatus)) return t.taskStatus;
  return t.completed ? ST_DONE : ST_PROGRESS;
}

export default function TasksPage() {
  useStoreVersion();
  const navigate = useNavigate();
  const [, forceUpdate] = useState(0);
  const store = getStore();
  const taskEntityTypes = store.settings.taskEntityTypes || [];
  const entityLabels: Record<string, string> = { ...DEFAULT_ENTITY_LABELS, ...Object.fromEntries(taskEntityTypes.map(t => [t.key, t.label])) };

  // Типы задач — из настроек; дефолтный список — фолбэк; системный тип всегда доступен
  const rawTypes = store.settings.taskTypes?.length ? store.settings.taskTypes : DEFAULT_TASK_TYPES;
  const missingSys = [SYSTEM_TASK_TYPE, 'От поддержки'].filter(x => !rawTypes.includes(x));
  const taskTypes: string[] = missingSys.length ? [...missingSys, ...rawTypes] : rawTypes;

  // Только НЕ удалённые задачи участвуют в списках и счётчиках
  const liveTasks = store.tasks.filter(t => !t.deletedAt && canSeeTask(t)); // фильтры типов/сущностей менеджера (v1.20.9)

  const [search, setSearch] = useState('');
  // ТЗ: подгрузка списка «Показать ещё»
  const [listLimit, setListLimit] = useState(50);
  const [listShown, setListShown] = useState(50);
  const [filterTaskStatus, setFilterTaskStatus] = useState<string>('');
  const [filterTaskType, setFilterTaskType] = useState<string>('');
  const [filterEntityType, setFilterEntityType] = useState<string>('');
  const [filterTime, setFilterTime] = useState<'all' | 'today' | 'overdue'>('all');
  const [filterResponsible, setFilterResponsible] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState<Partial<Task>>({ entityType: 'none', taskStatus: ST_NEW, completed: false, priority: 0, dueDate: new Date().toISOString().split('T')[0], title: '' });
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task>>({});
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ msg: string; action: () => void; danger?: boolean } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const tasks = useMemo(() => {
    let list = liveTasks;
    if (search) { const q = search.toLowerCase(); list = list.filter(t => t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.entityName || '').toLowerCase().includes(q)); }
    // Архив: без фильтра статуса показываем активные (Новая/Решаю) или архив (финальные)
    if (filterTaskStatus) list = list.filter(t => curStatus(t) === filterTaskStatus);
    else if (showArchive) list = list.filter(t => TERMINAL.includes(curStatus(t)));
    else list = list.filter(t => !TERMINAL.includes(curStatus(t)));
    if (filterTaskType) list = list.filter(t => t.title === filterTaskType);
    if (filterEntityType) list = list.filter(t => (t.entityType || 'none') === filterEntityType);
    if (filterTime === 'today') list = list.filter(t => isToday(t.dueDate));
    else if (filterTime === 'overdue') list = list.filter(t => isOverdue(t.dueDate) && !isToday(t.dueDate));
    if (filterResponsible === '__none__') list = list.filter(t => !t.responsibleId);
    else if (filterResponsible) list = list.filter(t => t.responsibleId === filterResponsible);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); // новые задачи сверху
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.tasks, showArchive, search, filterTaskStatus, filterTaskType, filterEntityType, filterTime, filterResponsible]);
  useEffect(() => { setListShown(listLimit); }, [tasks]); // сброс подгрузки при смене фильтров/поиска


  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    TASK_STATUSES.forEach(s => { counts[s] = liveTasks.filter(t => curStatus(t) === s).length; });
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.tasks]);

  // Открытые (не TERMINAL) задачи по каждому типу — для кнопок-фильтров.
  // Закрытые (TERMINAL) в количество не попадают.
  const taskTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tp of taskTypes) counts[tp] = 0;
    for (const t of liveTasks) {
      if (!TERMINAL.includes(curStatus(t))) counts[t.title] = (counts[t.title] || 0) + 1;
    }
    return counts;
  }, [liveTasks, taskTypes]);

  const activeTasks = liveTasks.filter(t => !TERMINAL.includes(curStatus(t)));
  const todayCount = activeTasks.filter(t => isToday(t.dueDate)).length;
  const overdueCount = activeTasks.filter(t => isOverdue(t.dueDate) && !isToday(t.dueDate)).length;

  function toggleSelect(id: string) { setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]); }

  /** Единое подтверждение «Вы уверены? Да/Нет» для КАЖДОГО действия. */
  function askConfirm(msg: string, action: () => void, danger?: boolean) {
    setConfirmAction({ msg, action, danger });
  }

  function applyStatus(id: string, status: string, comment?: string) {
    const u = getCurrentUser();
    const now = new Date().toISOString();
    updateStore(s => ({
      ...s,
      tasks: s.tasks.map(t => {
        if (t.id !== id) return t;
        return {
          ...t,
          taskStatus: status as Task['taskStatus'],
          completed: TERMINAL.includes(status),
          resolvedAt: status === ST_DONE ? now : undefined,
          updatedAt: now,
          history: [...(t.history || []), makeEntry('taskStatus', curStatus(t), status, comment, u?.id || '', u?.name || '')],
        };
      }),
    }));
    forceUpdate(n => n + 1);
  }

  function setTaskStatus(id: string, status: string) {
    const target = liveTasks.find(t => t.id === id);
    if (!target || curStatus(target) === status) return;
    askConfirm(`Вы уверены? Статус задачи будет изменён на «${status}».`, () => {
      applyStatus(id, status);
      toast.success(`Статус: ${status}`);
    });
  }

  /** Кнопки ДЕЙСТВИЯ: «Закрыть задачу (Решено)» / «Закрыть задачу (Без решения)» — финальные архивные. */
  function closeTask(id: string, status: string) {
    const target = liveTasks.find(t => t.id === id);
    if (!target || TERMINAL.includes(curStatus(target))) return;
    askConfirm(`Вы уверены? Задача будет закрыта («${status}») и попадёт в архив.`, () => {
      applyStatus(id, status);
      toast.success(`Задача закрыта: ${status}`);
    });
  }

  function massClose(status: string) {
    if (!selected.length) return;
    const ids = selected.filter(id => { const t = liveTasks.find(x => x.id === id); return t && !TERMINAL.includes(curStatus(t)); });
    if (!ids.length) { toast.error('Выбранные задачи уже в архиве'); return; }
    askConfirm(`Вы уверены? Будет закрыто задач: ${ids.length} («${status}», попадут в архив).`, () => {
      const u = getCurrentUser();
      const now = new Date().toISOString();
      updateStore(s => ({
        ...s,
        tasks: s.tasks.map(t => ids.includes(t.id) ? {
          ...t, taskStatus: status as Task['taskStatus'], completed: true,
          resolvedAt: status === ST_DONE ? now : t.resolvedAt, updatedAt: now,
          history: [...(t.history || []), makeEntry('taskStatus', curStatus(t), status, 'Массовое закрытие', u?.id || '', u?.name || '')],
        } : t),
      }));
      setSelected([]); forceUpdate(n => n + 1); toast.success(`Закрыто задач: ${ids.length} (${status})`);
    });
  }

  /** Безвозвратного удаления НЕТ: мягкое удаление (deletedAt) + запись в журнал Логи. */
  // v_1.9: выгрузка выбранных задач в Word (.doc)
  function exportWord() {
    const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const rows = tasks.filter(t => selected.includes(t.id));
    const parts: string[] = [];
    parts.push('<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt}h1{font-size:15pt}h2{font-size:12pt;margin:10pt 0 4pt}p{margin:3pt 0;white-space:pre-wrap}div.item{border-bottom:1pt solid #999;padding-bottom:5pt;margin-bottom:8pt}span.meta{color:#555;font-size:9pt}</style></head><body>');
    parts.push(`<h1>Задачи</h1><p><span class="meta">Дата выгрузки: ${new Date().toISOString().slice(0, 10)} · Записей: ${rows.length}</span></p>`);
    rows.forEach(t => {
      parts.push('<div class="item">');
      parts.push(`<h2>${esc(t.title)}</h2>`);
      parts.push(`<p><span class="meta">Статус: ${esc(t.taskStatus)} · Тип: ${esc(t.entityType || '—')} · Срок: ${esc(t.dueDate || '—')} · ${esc(t.entityName || '')} · Ответственный: ${esc(t.responsibleName || '—')}</span></p>`);
      parts.push(`<p>${esc(t.description || '')}</p>`);
      parts.push('</div>');
    });
    parts.push('</body></html>');
    const blob = new Blob(['\ufeff' + parts.join('')], { type: 'application/msword;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `задачи_${new Date().toISOString().slice(0, 10)}.doc`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

function deleteSelected() {
    if (!canDelete()) { toast.error('Удаление доступно только администратору'); return; }
    if (!selected.length) return;
    const ids = selected;
    const titles = liveTasks.filter(t => ids.includes(t.id)).map(t => t.title).join(', ');
    askConfirm(`Вы уверены? Задач в корзине: ${ids.length}. Удаление мягкое — задачи останутся в базе и будут записаны в журнал «Логи».`, () => {
      const u = getCurrentUser();
      const now = new Date().toISOString();
      const log: DbLog = {
        id: generateId(), userId: u?.id || '', userEmail: u?.email || '',
        action: 'DELETE', entityType: 'task', entityIds: ids,
        details: `Мягкое удаление задач (${ids.length}): ${titles.slice(0, 300)}`,
        createdAt: now,
      };
      updateStore(s => ({
        ...s,
        tasks: s.tasks.map(t => ids.includes(t.id) ? {
          ...t, deletedAt: now, updatedAt: now,
          history: [...(t.history || []), makeEntry('deleted', undefined, undefined, 'Задача удалена (мягкое удаление)', u?.id || '', u?.name || '')],
        } : t),
        settings: { ...s.settings, dbLogs: [...(s.settings.dbLogs || []), log] },
      }));
      setSelected([]); forceUpdate(n => n + 1); toast.success('Задачи удалены (записано в журнал «Логи»)');
    }, true);
  }

  function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const task: Task = {
      id: generateId(), entityType: newForm.entityType || 'none', entityId: newForm.entityId,
      entityName: newForm.entityName, responsibleId: newForm.responsibleId, responsibleName: newForm.responsibleName,
      title: newForm.title || 'Задача', description: newForm.description,
      dueDate: newForm.dueDate || now.split('T')[0], taskStatus: ST_NEW, completed: false,
      priority: 0, createdAt: now, updatedAt: now, createdBy: u.id,
      history: [makeEntry('created', undefined, undefined, 'Задача создана', u.id, u.name)],
    };
    updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
    setShowAddForm(false); setNewForm({ entityType: 'none', taskStatus: ST_NEW, completed: false, priority: 0, dueDate: new Date().toISOString().split('T')[0], title: '' });
    forceUpdate(n => n + 1); toast.success('Задача добавлена');
  }

  function openEdit(task: Task) {
    setEditingTaskId(task.id);
    setEditForm({ ...task });
  }

  function saveTaskEdit(id: string) {
    const u = getCurrentUser();
    const old = store.tasks.find(t => t.id === id);
    if (!old) return;
    const now = new Date().toISOString();
    const changes: HistoryEntry[] = [];
    const push = (field: string, oldV: string | undefined, newV: string | undefined) => {
      if ((oldV || '') !== (newV || '')) changes.push(makeEntry(field, oldV || undefined, newV || undefined, undefined, u?.id || '', u?.name || ''));
    };
    push('title', old.title, editForm.title);
    push('description', old.description, editForm.description);
    push('dueDate', old.dueDate, editForm.dueDate);
    push('responsible', old.responsibleName, editForm.responsibleName);
    push('entity', old.entityName, editForm.entityName);
    const oldStatus = curStatus(old);
    const newStatus = editForm.taskStatus || oldStatus;
    const statusChanged = oldStatus !== newStatus;

    updateStore(s => ({
      ...s,
      tasks: s.tasks.map(t => {
        if (t.id !== id) return t;
        return {
          ...t,
          ...editForm,
          taskStatus: newStatus as Task['taskStatus'],
          completed: TERMINAL.includes(newStatus),
          resolvedAt: newStatus === ST_DONE ? (t.resolvedAt || now) : undefined,
          updatedAt: now,
          history: [
            ...(t.history || []),
            ...changes,
            ...(statusChanged ? [makeEntry('taskStatus', oldStatus, newStatus, undefined, u?.id || '', u?.name || '')] : []),
          ],
        };
      }),
    }));
    setEditingTaskId(null); setEditForm({});
    forceUpdate(n => n + 1); toast.success('Задача обновлена');
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ── Модальное подтверждение: «Вы уверены? Да/Нет» ── */}
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
        <button onClick={() => setShowAddForm(v => !v)} className="action-btn"><Plus size={16} /> Новая задача</button>
      </div>

      {/* ── Статусы-фильтры (системные, со счётчиками) ── */}
      <div className="flex flex-wrap gap-2 w-full">
        <button onClick={() => { setFilterTaskStatus(''); setShowArchive(false); }} className={`action-btn ${!filterTaskStatus && !showArchive ? 'action-btn-active' : ''}`}>Активные</button>
        <button onClick={() => { setFilterTaskStatus(''); setShowArchive(true); }} className={`action-btn ${showArchive && !filterTaskStatus ? 'bg-gray-700 text-white border-gray-700' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}><Archive size={12} /> Архив</button>
        {TASK_STATUSES.map(s => {
          const c = TASK_STATUS_COLORS[s];
          return (
            <button key={s} onClick={() => setFilterTaskStatus(filterTaskStatus === s ? '' : s)} className="action-btn" style={filterTaskStatus === s ? { background: c.text, color: '#fff', borderColor: c.text } : { background: c.bg, color: c.text, borderColor: 'transparent' }}>
              {s} <span className="font-bold">{statusCounts[s] || 0}</span>
            </button>
          );
        })}
      </div>


      {/* ── Фильтры — одна строка, как во всех разделах ── */}
      <div className="card-base p-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[150px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="form-input pl-8 py-1.5 text-xs" placeholder="Поиск по задачам..." value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select className="form-input py-1.5 text-xs w-auto" value={filterEntityType} onChange={e => setFilterEntityType(e.target.value)}>
            <option value="">Все типы сущностей</option>
            {Object.entries(entityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className="form-input py-1.5 text-xs w-auto" value={filterResponsible} onChange={e => setFilterResponsible(e.target.value)}><option value="">Все ответственные</option>
            <option value="__none__">Без ответственного</option>{store.settings.users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          {(['all', 'today', 'overdue'] as const).map(k => <button key={k} onClick={() => setFilterTime(filterTime === k ? 'all' : k)} className={`text-xs px-3 py-1.5 rounded-full border min-h-[36px] transition-colors ${filterTime === k ? 'action-btn-active' : ''}`}>{k === 'all' ? 'Все' : k === 'today' ? `Сегодня (${todayCount})` : `Просрочено (${overdueCount})`}</button>)}
        </div>
      </div>

      {/* ── Типы задач ── */}
      <div className="flex flex-wrap gap-2 w-full">
        <button type="button" onClick={() => setFilterTaskType('')} className={`stat-card !p-2 flex items-center justify-between gap-3 flex-1 transition-shadow ${filterTaskType === '' ? 'ring-1 ring-gray-700' : 'hover:shadow-md opacity-90'}`}>
          <span className="text-xs text-gray-500">Все типы задач</span>
          <span className="text-sm font-bold text-brand-black">{liveTasks.length}</span>
        </button>
        {taskTypes.map(t => (
          <button key={t} type="button" onClick={() => setFilterTaskType(filterTaskType === t ? '' : t)} className={`stat-card !p-2 flex items-center justify-between gap-3 flex-1 transition-shadow ${filterTaskType === t ? 'ring-1 ring-gray-700' : 'hover:shadow-md opacity-90'}`}>
            <span className="text-xs text-gray-500">{t}</span>
            <span className="text-sm font-bold text-brand-black">{taskTypeCounts[t] || 0}</span>
          </button>
        ))}
      </div>



      {showAddForm && (
        <div className="card-base p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4"><h2 className="section-title">Новая задача</h2><button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button></div>
          <form onSubmit={handleAddTask}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div className="sm:col-span-2">
                <label className="form-label">Тип задачи *</label>
                <select required className="form-input" value={newForm.title || ''} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}>
                  <option value="" disabled>Выберите тип…</option>
                  {taskTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="form-label">Ответственный</label><ResponsibleSelect value={newForm.responsibleId} onChange={(id, name) => setNewForm(f => ({ ...f, responsibleId: id, responsibleName: name }))} /></div>
              <div><label className="form-label">Срок выполнения *</label><input required type="date" className="form-input" value={newForm.dueDate || ''} onChange={e => setNewForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
              <div><label className="form-label">Тип сущности</label>
                <select className="form-input" value={newForm.entityType || 'none'} onChange={e => setNewForm(f => ({ ...f, entityType: e.target.value }))}>
                  {Object.entries(entityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {newForm.entityType !== 'none' && <div><label className="form-label">Привязка (название)</label><input className="form-input" placeholder="Название компании..." value={newForm.entityName || ''} onChange={e => setNewForm(f => ({ ...f, entityName: e.target.value }))} /></div>}
              <div className="sm:col-span-2"><label className="form-label">Описание</label><textarea className="form-input min-h-[80px] resize-none" value={newForm.description || ''} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Отмена</button><button type="submit" className="btn-primary">Добавить</button></div>
          </form>
        </div>
      )}

      {/* ── Массовые действия: закрыть (Решено) / (Без решения) → удалить ── */}
      {selected.length > 0 && (
        <div className="card-base p-3 flex items-center gap-2 bg-blue-50 border-blue-200 animate-fade-in flex-wrap">
          {/* v_1.9: отметить все + выгрузка в Word */}
          <label className="flex items-center gap-1.5 text-xs text-blue-700 cursor-pointer select-none">
            <input type="checkbox" className="accent-blue-600" checked={tasks.length > 0 && tasks.every(t => selected.includes(t.id))}
              onChange={() => setSelected(sel => tasks.every(t => sel.includes(t.id)) ? [] : tasks.map(t => t.id))} />
            Отметить все
          </label>
          <span className="text-xs font-medium text-blue-700 border-l border-blue-200 pl-2">Выбрано: {selected.length}</span>
          <button onClick={() => massClose(ST_DONE)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800 transition-colors min-h-[36px]"><CheckCircle2 size={12} /> Закрыть (Решено)</button>
          <button onClick={() => massClose(ST_UNSOLVED)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-gray-600 text-white hover:bg-gray-700 transition-colors min-h-[36px]"><CircleSlash size={12} /> Закрыть (Без решения)</button>
          {canDelete() && <button onClick={deleteSelected} className="action-btn action-btn-md text-xs py-1.5 min-h-[36px] ml-1"><Trash2 size={12} /> Удалить</button>}
          <button onClick={exportWord} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-white border border-blue-300 text-blue-700 hover:bg-blue-100 transition-colors min-h-[36px] ml-1"><FileDown size={12} /> Выгрузить в Word</button>
          <button onClick={() => setSelected([])} className="text-xs text-gray-400 ml-auto min-h-[36px] px-2"><X size={14} /></button>
        </div>
      )}

      <div className="space-y-2.5">
        {tasks.length === 0 && <div className="card-base p-10 text-center text-gray-400 text-sm">{showArchive ? 'Архив пуст' : 'Задач нет'}</div>}
        {tasks.slice(0, listShown).map(task => {
          const status = curStatus(task);
          const c = TASK_STATUS_COLORS[status] || { bg: '#F3F4F6', text: '#374151' };
          const isTerminal = TERMINAL.includes(status);
          const overdue = isOverdue(task.dueDate) && !isToday(task.dueDate) && !isTerminal;
          const todayTask = isToday(task.dueDate) && !isTerminal;
          const isSelected = selected.includes(task.id);
          const isEditing = editingTaskId === task.id;
          const editTypes = taskTypes.includes(editForm.title || '') ? taskTypes : [editForm.title || '', ...taskTypes];
          return (
            <div key={task.id} className={`card-base p-4 rounded-2xl transition-shadow hover:shadow-md ${isTerminal ? 'opacity-75' : ''} ${isSelected ? 'ring-2 ring-blue-300' : ''}`} style={{ borderColor: c.text }}>
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(task.id)} className="mt-1 rounded flex-shrink-0 accent-black" />
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="form-label">Тип задачи *</label>
                          <select className="form-input" value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}>
                            {editTypes.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="form-label">Описание</label>
                          <textarea className="form-input min-h-[70px] resize-none" value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                        </div>
                        <div><label className="form-label">Срок выполнения</label><input type="date" className="form-input" value={editForm.dueDate || ''} onChange={e => setEditForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
                        <div><label className="form-label">Ответственный</label><ResponsibleSelect value={editForm.responsibleId} onChange={(id, name) => setEditForm(f => ({ ...f, responsibleId: id, responsibleName: name }))} /></div>
                        <div><label className="form-label">Статус</label>
                          <select className="form-input" value={editForm.taskStatus || status} onChange={e => setEditForm(f => ({ ...f, taskStatus: e.target.value as Task['taskStatus'] }))}>
                            {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div><label className="form-label">Тип сущности</label>
                          <select className="form-input" value={editForm.entityType || 'none'} onChange={e => setEditForm(f => ({ ...f, entityType: e.target.value }))}>
                            {Object.entries(entityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        {editForm.entityType !== 'none' && <div><label className="form-label">Привязка (название)</label><input className="form-input" value={editForm.entityName || ''} onChange={e => setEditForm(f => ({ ...f, entityName: e.target.value }))} /></div>}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => { setEditingTaskId(null); setEditForm({}); }} className="btn-secondary text-xs">Отмена</button>
                        <button onClick={() => saveTaskEdit(task.id)} className="btn-primary text-xs">Сохранить</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className={`text-sm font-semibold truncate ${status === ST_DONE ? 'line-through text-gray-400' : 'text-brand-black'}`}>{task.title}</p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          <TaskStatusBadge status={status} />
                          {status === ST_DONE && task.resolvedAt && <span className="text-[10px] text-gray-400">Решено: {fmtDateTime(task.resolvedAt)}</span>}
                        </div>
                      </div>
                      {task.description && (
                        <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap leading-relaxed">
                          {task.description.split(/(\s+)/).map((part, i) =>
                            /^https?:\/\/.+/.test(part) ? (
                              <a key={i} href={part} target="_blank" rel="noreferrer" className="text-brand-blue underline hover:no-underline">{part}</a>
                            ) : part
                          )}
                        </p>
                      )}
                      <div className="flex items-center flex-wrap gap-x-2 gap-y-1.5 mt-2">
                        {task.entityName && <span className="text-xs bg-brand-gray text-gray-600 px-2 py-0.5 rounded-full">{entityLabels[task.entityType] || task.entityType} · {task.entityName}</span>}
                        <span className={`text-xs flex items-center gap-1 ${overdue ? 'text-red-500 font-medium' : todayTask ? 'text-yellow-600' : 'text-gray-400'}`}>
                          {overdue ? <AlertCircle size={11} /> : <Calendar size={11} />}
                          {formatDate(task.dueDate)}{overdue && ' · просрочено'}{todayTask && ' · сегодня'}
                        </span>
                        {task.responsibleName && <span className="text-xs text-gray-500 px-2 py-0.5 rounded-full bg-white border border-gray-200">Ответственный: {task.responsibleName}</span>}
                        <div className="flex items-center gap-1 ml-auto">
                          {(task.history || []).length > 0 && (
                            <button onClick={() => setOpenHistoryId(openHistoryId === task.id ? null : task.id)} className="text-xs text-gray-400 hover:text-brand-black flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                              <History size={12} /> {task.history!.length}
                            </button>
                          )}
                          <button onClick={() => navigate(`/tasks/${task.id}`)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors flex items-center gap-1"><ExternalLink size={12} /> Карточка</button>
                          <button onClick={() => openEdit(task)} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors flex items-center gap-1"><Edit2 size={12} /> Изменить</button>
                        </div>
                      </div>
                      {openHistoryId === task.id && (
                        <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                          {[...(task.history || [])].reverse().map(h => (
                            <div key={h.id} className="text-[11px] text-gray-500">
                              <span className="text-gray-400">{fmtDateTime(h.date)}</span> · <span className="font-medium text-gray-600">{h.userName}</span> · {FIELD_LABELS[h.field] || h.field}
                              {h.field !== 'created' && h.newValue !== undefined && <> — {h.oldValue ? `"${h.oldValue}" → ` : ''}"{h.newValue}"</>}
                              {h.comment && <span className="text-gray-400"> ({h.comment})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Действия: «Решаю» + КНОПКИ ЗАКРЫТИЯ (финальные архивные статусы) */}
                      {!isTerminal && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2.5 border-t border-gray-100">
                          {status === ST_NEW && (
                            <button onClick={() => setTaskStatus(task.id, ST_PROGRESS)} className="text-xs px-2.5 py-1 rounded-lg border border-brand-gray-mid text-gray-600 hover:bg-brand-gray transition-colors min-h-[28px]">Решаю</button>
                          )}
                          <button onClick={() => closeTask(task.id, ST_DONE)} className="text-xs px-2.5 py-1 rounded-lg border border-green-200 text-green-700 hover:bg-green-700 hover:text-white hover:border-green-700 transition-colors min-h-[28px] flex items-center gap-1"><CheckCircle2 size={11} /> Закрыть задачу (Решено)</button>
                          <button onClick={() => closeTask(task.id, ST_UNSOLVED)} className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-700 hover:text-white hover:border-gray-700 transition-colors min-h-[28px] flex items-center gap-1"><CircleSlash size={11} /> Закрыть задачу (Без решения)</button>
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
      {tasks.length > listShown && (
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setListShown(v => v + listLimit)} className="btn-secondary text-xs">Показать ещё · осталось {tasks.length - listShown}</button>
          <select className="form-input h-6 py-0 text-[11px] w-auto" value={listLimit} onChange={e => { const n = Number(e.target.value); setListLimit(n); setListShown(n); }} title="Записей на страницу">
            {[50, 100, 300, 500, 1000].map(n => <option key={n} value={n}>{n}/стр.</option>)}
          </select>
        </div>
      )}
      </div>
    </div>
  );
}
