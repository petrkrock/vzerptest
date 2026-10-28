import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStore, updateStore, useStoreVersion, getContactPrefs } from '@/lib/store';
import { generateId, formatDate } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth';
import HistoryTab from '@/components/features/HistoryTab';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import type { HistoryEntry, Task, Ticket } from '@/types';
import {TICKET_STATUSES, TICKET_STATUS_COLORS, TICKET_TYPES} from '@/constants';
import { ArrowLeft, CheckCircle2, CircleSlash, Send, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import ContactPrefIcon from '@/components/features/ContactPrefIcons';

const [T_NEW, T_FORM, T_PROG, T_SENT, T_DONE, T_UNSOLVED] = TICKET_STATUSES;
const TERMINAL_T: string[] = [T_SENT, T_DONE, T_UNSOLVED];
const curStatus = (t: Ticket) =>
  t.status === 'Новая' ? T_NEW : t.status === 'Новый с сайта' ? T_FORM :
  TICKET_STATUSES.includes(t.status as typeof TICKET_STATUSES[number]) ? t.status : T_PROG;
const statusColor = (s: string) => TICKET_STATUS_COLORS[s] || { bg: '#F3F4F6', text: '#374151' };

export default function TicketCardPage() {
  useStoreVersion();
  const { id } = useParams();
  const navigate = useNavigate();
  const [, forceUpdate] = useState(0);
  const [confirm, setConfirm] = useState<{ msg: string; action: () => void } | null>(null);
  const [editForm, setEditForm] = useState<Partial<Ticket> | null>(null);

  const store = getStore();
  const ticket = store.tickets.find(t => t.id === id);

  if (!ticket) return <div className="p-10 text-center text-gray-400">Обращение не найдено</div>;
  const status = curStatus(ticket);

  function entry(field: string, oldV?: string, newV?: string, comment?: string): HistoryEntry {
    const u = getCurrentUser()!;
    return { id: generateId(), date: new Date().toISOString(), field, oldValue: oldV, newValue: newV, comment, userId: u.id, userName: u.name };
  }

  function ask(msg: string, action: () => void) { setConfirm({ msg, action }); }

  function setStatus(s: string) {
    ask(`Вы уверены? Статус обращения будет изменён на «${s}».`, () => {
      updateStore(st => ({ ...st, tickets: st.tickets.map(t => t.id === id ? { ...t, status: s as Ticket['status'], updatedAt: new Date().toISOString(), history: [...t.history, entry('status', status, s)] } : t) }));
      toast.success(`Статус: ${s}`);
    });
  }

  function createTask() {
    if (ticket!.taskId) { toast.error('Задача уже создана из этого обращения'); return; }
    ask('Вы уверены? Будет создана задача «От поддержки», обращение получит статус «Отправлен в задачи» (архив).', () => {
      const t = ticket!; const u = getCurrentUser()!; const now = new Date().toISOString();
      const contact = [t.contactName, t.contactPhone, t.contactEmail].filter(Boolean).join(' · ') || 'Без контакта';
      const desc = [`Контакт: ${contact}`, `Тип обращения: ${t.type || '—'}`, `Способ связи: ${t.contactPref || '—'}`, '', t.text || ''].join('\n');
      const task: Task = {
        id: generateId(), entityType: 'ticket', entityId: t.id, entityName: t.contactName || 'Обращение',
        title: 'От поддержки', description: desc,
        dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
        createdAt: now, updatedAt: now, createdBy: u.id, responsibleId: u.id, responsibleName: u.name,
        history: [entry('created', undefined, undefined, `Создана из обращения (${u.name})`)],
      };
      updateStore(s => ({
        ...s, tasks: [...s.tasks, task],
        tickets: s.tickets.map(x => x.id === t.id ? { ...x, taskId: task.id, status: T_SENT as Ticket['status'], updatedAt: now, history: [...x.history, entry('status', status, T_SENT, `Отправлено в задачи (${u.name})`)] } : x),
      }));
      forceUpdate(n => n + 1);
      toast.success('Задача создана, обращение отправлено в архив');
    });
  }

  const c = statusColor(status);
  return (
    <div className="space-y-4 animate-fade-in max-w-3xl">
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-fade-in">
            <h3 className="text-base font-semibold text-brand-black mb-2">Вы уверены?</h3>
            <p className="text-sm text-gray-500 mb-5">{confirm.msg}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirm(null)} className="btn-secondary text-sm">Нет</button>
              <button onClick={() => { confirm.action(); setConfirm(null); }} className="text-sm px-4 py-2 rounded-xl font-medium bg-brand-black text-white hover:bg-gray-800 transition-colors">Да</button>
            </div>
          </div>
        </div>
      )}
      <button onClick={() => navigate('/support')} className="text-sm text-gray-500 hover:text-brand-black flex items-center gap-1"><ArrowLeft size={14} /> Назад к списку</button>

      <div className="card-base p-5 rounded-2xl border-l-4" style={{ borderLeftColor: c.text }}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{ticket.type || 'Обращение'}</span>
              <h1 className="text-lg font-bold text-brand-black">{ticket.contactName || 'Без контакта'}</h1>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">Создано {formatDate(ticket.createdAt)}{ticket.fromApi ? ' · с формы сайта' : ''}</p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: c.bg, color: c.text }}>{status}</span>
        </div>

        {editForm ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-xs">
          <div><label className="form-label">Имя контакта</label><input className="form-input" value={editForm.contactName || ''} onChange={e => setEditForm(f => ({ ...(f || {}), contactName: e.target.value }))} /></div>
          <div><label className="form-label">Телефон</label><input className="form-input" value={editForm.contactPhone || ''} onChange={e => setEditForm(f => ({ ...(f || {}), contactPhone: e.target.value }))} /></div>
          <div><label className="form-label">Email</label><input className="form-input" value={editForm.contactEmail || ''} onChange={e => setEditForm(f => ({ ...(f || {}), contactEmail: e.target.value }))} /></div>
          <div><label className="form-label">Тип обращения</label>
            <select className="form-input" value={editForm.type || ticket.type} onChange={e => setEditForm(f => ({ ...(f || {}), type: e.target.value }))}>
              {((getStore().settings.ticketTypes || []).length ? getStore().settings.ticketTypes! : [...TICKET_TYPES]).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2"><label className="form-label">Способ связи</label>
            <div className="flex flex-wrap gap-1.5 py-1">
              {getContactPrefs().map(cp => { const on = (editForm.contactPrefs || []).includes(cp); return (
                <button key={cp} type="button" onClick={() => setEditForm(f => ({ ...(f || {}), contactPrefs: on ? (f?.contactPrefs || []).filter(x => x !== cp) : [...(f?.contactPrefs || []), cp] }))} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}>{cp}</button>
              ); })}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 text-xs text-gray-600">
          <div><p className="text-gray-400 mb-0.5">Телефон</p><p>{ticket.contactPhone || '—'}</p></div>
          <div><p className="text-gray-400 mb-0.5">Email</p><p>{ticket.contactEmail || '—'}</p></div>
          <div><p className="text-gray-400 mb-0.5">Способ связи</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {((ticket.contactPrefs && ticket.contactPrefs.length ? ticket.contactPrefs : ticket.contactPref ? [ticket.contactPref] : [])).map(cp => (
                <span key={cp} className="flex items-center gap-1 text-xs bg-brand-gray px-2 py-0.5 rounded-full"><ContactPrefIcon name={cp} />{cp}</span>
              ))}
              {!ticket.contactPrefs?.length && !ticket.contactPref && <p>—</p>}
            </div>
          </div>
        </div>
      )}

        <div className="mt-4">
          <label className="form-label">Ответственный</label>
          <ResponsibleSelect value={ticket.responsibleId} onChange={(rid, rname) => {
            updateStore(s => ({ ...s, tickets: s.tickets.map(t => t.id === id ? { ...t, responsibleId: rid, responsibleName: rname, updatedAt: new Date().toISOString(), history: [...t.history, entry('responsible', ticket.responsibleName, rname)] } : t) }));
            forceUpdate(n => n + 1);
            toast.success('Ответственный обновлён');
          }} />
        </div>

        <div className="mt-4">
          <p className="form-label">Текст обращения</p>
          {editForm ? (
            <textarea className="form-input min-h-[110px] resize-none" value={editForm.text || ''} onChange={e => setEditForm(f => ({ ...(f || {}), text: e.target.value }))} />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap bg-brand-gray rounded-xl p-3">{ticket.text || '—'}</p>
          )}
        </div>

        {!TERMINAL_T.includes(status) && (
          <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-gray-100">
            {(status === T_NEW || status === T_FORM) && <button onClick={() => setStatus(T_PROG)} className="text-xs px-3 py-1.5 rounded-lg border border-brand-gray-mid text-gray-600 hover:bg-brand-gray transition-colors min-h-[32px]">Решаю</button>}
            <button onClick={() => setStatus(T_DONE)} className="text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-700 hover:text-white hover:border-green-700 transition-colors min-h-[32px] flex items-center gap-1"><CheckCircle2 size={12} /> Закрыть обращение (Решено)</button>
            <button onClick={() => setStatus(T_UNSOLVED)} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-700 hover:text-white hover:border-gray-700 transition-colors min-h-[32px] flex items-center gap-1"><CircleSlash size={12} /> Закрыть обращение (Без решения)</button>
            {!ticket.taskId && <button onClick={createTask} className="text-xs px-3 py-1.5 rounded-lg bg-brand-black text-white hover:bg-gray-800 transition-colors min-h-[32px] flex items-center gap-1"><Send size={12} /> Отправить в задачи</button>}
          </div>
        )}
        {ticket.taskId && <p className="text-xs text-blue-600 mt-3 flex items-center gap-1"><Send size={11} /> Из этого обращения создана задача в разделе «Задачи»</p>}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
          {editForm ? (
            <>
              <button onClick={() => {
                const now = new Date().toISOString();
                updateStore(s => ({ ...s, tickets: s.tickets.map(x => x.id === id ? { ...x, contactName: editForm.contactName, contactPhone: editForm.contactPhone, contactEmail: editForm.contactEmail, type: editForm.type || x.type, contactPrefs: editForm.contactPrefs, text: editForm.text ?? x.text, responsibleId: editForm.responsibleId, responsibleName: editForm.responsibleName, updatedAt: now, history: [...x.history, entry('edited', undefined, undefined, 'Обращение отредактировано')] } : x) }));
                setEditForm(null); forceUpdate(n => n + 1); toast.success('Обращение обновлено');
              }} className="text-xs px-4 py-2 rounded-xl bg-brand-black text-white hover:bg-gray-800 transition-colors">Сохранить</button>
              <button onClick={() => setEditForm(null)} className="text-xs px-4 py-2 rounded-xl border border-brand-gray-mid text-gray-500">Отмена</button>
            </>
          ) : (
            <button onClick={() => setEditForm({ contactName: ticket.contactName, contactPhone: ticket.contactPhone, contactEmail: ticket.contactEmail, type: ticket.type, contactPrefs: ticket.contactPrefs, text: ticket.text, responsibleId: ticket.responsibleId, responsibleName: ticket.responsibleName })} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 bg-white hover:bg-gray-100 transition-colors flex items-center gap-1"><Edit2 size={12} /> Изменить</button>
          )}
        </div>
      </div>

      <HistoryTab history={ticket.history} />
    </div>
  );
}
