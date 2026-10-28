import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStore, updateStore, useStoreVersion } from '@/lib/store';
import { generateId, formatDate, isToday, isOverdue } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth';
import HistoryTab from '@/components/features/HistoryTab';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import type { HistoryEntry, Task } from '@/types';
import { TASK_STATUSES, TASK_STATUS_COLORS, DEFAULT_TASK_TYPES, SYSTEM_TASK_TYPE } from '@/constants';
import { ArrowLeft, CheckCircle2, CircleSlash, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

const [ST_NEW, ST_PROGRESS, ST_DONE, ST_UNSOLVED] = TASK_STATUSES;
const TERMINAL: string[] = [ST_DONE, ST_UNSOLVED];
const curStatus = (t: Task) =>
  t.taskStatus && TASK_STATUSES.includes(t.taskStatus) ? t.taskStatus : (t.completed ? ST_DONE : ST_PROGRESS);
const statusColor = (s: string) => TASK_STATUS_COLORS[s] || { bg: '#F3F4F6', text: '#374151' };

export default function TaskCardPage() {
  useStoreVersion();
  const { id } = useParams();
  const navigate = useNavigate();
  const [, forceUpdate] = useState(0);
  const [confirm, setConfirm] = useState<{ msg: string; action: () => void; danger?: boolean } | null>(null);
  const [editForm, setEditForm] = useState<Partial<Task> | null>(null);

  const store = getStore();
  const task = store.tasks.find(t => t.id === id);

  if (!task || task.deletedAt) return <div className="p-10 text-center text-gray-400">Задача не найдена</div>;
  const status = curStatus(task);

  function entry(field: string, oldV?: string, newV?: string, comment?: string): HistoryEntry {
    const u = getCurrentUser()!;
    return { id: generateId(), date: new Date().toISOString(), field, oldValue: oldV, newValue: newV, comment, userId: u.id, userName: u.name };
  }

  function ask(msg: string, action: () => void, danger?: boolean) { setConfirm({ msg, action, danger }); }

  function setStatus(s: string) {
    ask(`Вы уверены? Статус задачи будет изменён на «${s}».`, () => {
      const now = new Date().toISOString();
      updateStore(st => ({
        ...st,
        tasks: st.tasks.map(t => t.id === id ? { ...t, taskStatus: s as Task['taskStatus'], completed: TERMINAL.includes(s), resolvedAt: s === ST_DONE ? now : undefined, updatedAt: now, history: [...t.history || [], entry('taskStatus', status, s)] } : t),
      }));
      forceUpdate(n => n + 1);
      toast.success(`Статус: ${s}`);
    });
  }

  function closeTask(s: string) {
    ask(`Вы уверены? Задача будет закрыта («${s}») и попадёт в архив.`, () => {
      const now = new Date().toISOString();
      updateStore(st => ({
        ...st,
        tasks: st.tasks.map(t => t.id === id ? { ...t, taskStatus: s as Task['taskStatus'], completed: true, resolvedAt: s === ST_DONE ? now : undefined, updatedAt: now, history: [...t.history || [], entry('taskStatus', status, s)] } : t),
      }));
      forceUpdate(n => n + 1);
      toast.success(`Задача закрыта: ${s}`);
    });
  }

  function saveEdit() {
    if (!editForm) return;
    const now = new Date().toISOString();
    const changes: HistoryEntry[] = [];
    const push = (field: string, o?: string, n?: string) => { if ((o || '') !== (n || '')) changes.push(entry(field, o, n)); };
    push('title', task!.title, editForm.title);
    push('description', task!.description, editForm.description);
    push('dueDate', task!.dueDate, editForm.dueDate);
    push('responsible', task!.responsibleName, editForm.responsibleName);
    push('entity', task!.entityName, editForm.entityName);
    updateStore(st => ({
      ...st,
      tasks: st.tasks.map(t => t.id === id ? { ...t, ...editForm, updatedAt: now, history: [...t.history || [], ...changes] } : t),
    }));
    setEditForm(null);
    forceUpdate(n => n + 1);
    toast.success('Задача обновлена');
  }


  const rawTypes = store.settings.taskTypes?.length ? store.settings.taskTypes : DEFAULT_TASK_TYPES;
  const missingSys = [SYSTEM_TASK_TYPE, 'От поддержки'].filter(x => !rawTypes.includes(x));
  const taskTypes = missingSys.length ? [...missingSys, ...rawTypes] : rawTypes;
  const c = statusColor(status);
  const overdue = isOverdue(task.dueDate) && !isToday(task.dueDate) && !TERMINAL.includes(status);

  return (
    <div className="space-y-4 animate-fade-in max-w-3xl">
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-fade-in">
            <h3 className="text-base font-semibold text-brand-black mb-2">Вы уверены?</h3>
            <p className="text-sm text-gray-500 mb-5">{confirm.msg}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirm(null)} className="btn-secondary text-sm">Нет</button>
              <button onClick={() => { confirm.action(); setConfirm(null); }} className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors ${confirm.danger ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-brand-black text-white hover:bg-gray-800'}`}>Да</button>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/tasks')} className="text-sm text-gray-500 hover:text-brand-black flex items-center gap-1"><ArrowLeft size={14} /> Назад к списку</button>
        
      </div>

      <div className={`card-base p-5 rounded-2xl border-l-4 ${overdue ? 'border-red-200 bg-red-50' : ''}`} style={{ borderLeftColor: c.text }}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          {editForm ? (
            <input autoFocus className="form-input text-base font-semibold flex-1 min-w-[200px]" value={editForm.title || ''} onChange={e => setEditForm(f => ({ ...(f || {}), title: e.target.value }))} />
          ) : (
            <h1 className={`text-lg font-bold ${status === ST_DONE ? 'line-through text-gray-400' : 'text-brand-black'}`}>{task.title}</h1>
          )}
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: c.bg, color: c.text }}>{status}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs text-gray-600">
          <div><p className="text-gray-400 mb-0.5">Срок</p><p className={overdue ? 'text-red-600 font-medium' : ''}>{formatDate(task.dueDate)}{overdue && ' · просрочено'}</p></div>
          <div><p className="text-gray-400 mb-0.5">Создана</p><p>{formatDate(task.createdAt)}</p></div>
          <div><p className="text-gray-400 mb-0.5">Привязка</p><p>{task.entityName ? `${task.entityType} · ${task.entityName}` : '—'}</p></div>
        </div>

        <div className="mt-4">
          <label className="form-label">Ответственный</label>
          <ResponsibleSelect value={editForm ? editForm.responsibleId : task.responsibleId} onChange={(rid, rname) => {
            if (editForm) { setEditForm(f => ({ ...(f || {}), responsibleId: rid, responsibleName: rname })); return; }
            updateStore(s => ({ ...s, tasks: s.tasks.map(t => t.id === id ? { ...t, responsibleId: rid, responsibleName: rname, updatedAt: new Date().toISOString(), history: [...t.history || [], entry('responsible', task.responsibleName, rname)] } : t) }));
            forceUpdate(n => n + 1);
            toast.success('Ответственный обновлён');
          }} />
        </div>

        <div className="mt-4">
          <p className="form-label">Описание</p>
          {editForm ? (
            <textarea className="form-input min-h-[90px] resize-none" value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...(f || {}), description: e.target.value }))} />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-brand-gray rounded-xl p-3">{task.description
              ? task.description.split(/(\s+)/).map((part, i) =>
                  part.startsWith('/')
                    ? <a key={i} href={part} className="text-brand-blue underline break-all">{part}</a>
                    : <span key={i}>{part}</span>)
              : '—'}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-100">
          {editForm ? (
            <>
              <button onClick={saveEdit} className="text-xs px-4 py-2 rounded-xl bg-brand-black text-white hover:bg-gray-800 min-h-[32px]">Сохранить</button>
              <button onClick={() => setEditForm(null)} className="text-xs px-4 py-2 rounded-xl border border-brand-gray-mid text-gray-500 min-h-[32px]">Отмена</button>
            </>
          ) : (
            <>
              {!TERMINAL.includes(status) && (
                <>
                  {status === ST_NEW && <button onClick={() => setStatus(ST_PROGRESS)} className="text-xs px-3 py-1.5 rounded-lg border border-brand-gray-mid text-gray-600 hover:bg-brand-gray min-h-[32px]">Решаю</button>}
                  <button onClick={() => closeTask(ST_DONE)} className="text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-700 hover:text-white min-h-[32px] flex items-center gap-1"><CheckCircle2 size={12} /> Закрыть задачу (Решено)</button>
                  <button onClick={() => closeTask(ST_UNSOLVED)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-700 hover:text-white min-h-[32px] flex items-center gap-1"><CircleSlash size={12} /> Закрыть задачу (Без решения)</button>
                </>
              )}
              <button onClick={() => setEditForm({ title: task.title, description: task.description, dueDate: task.dueDate, responsibleId: task.responsibleId, responsibleName: task.responsibleName, entityName: task.entityName })} className="text-xs px-3 py-1.5 rounded-lg border border-brand-gray-mid text-gray-600 hover:bg-brand-gray min-h-[32px] flex items-center gap-1 ml-auto"><Edit2 size={12} /> Изменить</button>
            </>
          )}
        </div>
      </div>

      <HistoryTab history={task.history || []} />
    </div>
  );
}
