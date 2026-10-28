import { useState } from 'react';

// ТЗ 1.8: системные цвета категорий (A/B/C)
const BUYER_CAT_STYLE: Record<'A' | 'B' | 'C', { background: string; color: string }> = {
  A: { background: 'rgb(209, 250, 229)', color: 'rgb(6, 95, 70)' },
  B: { background: 'rgb(239, 246, 255)', color: 'rgb(30, 64, 175)' },
  C: { background: 'rgb(254, 243, 199)', color: 'rgb(180, 83, 9)' },
};
import { useParams, useNavigate } from 'react-router-dom';
import { getStore, updateStore, makeHistoryEntry, useStoreVersion, getContactPrefs } from '@/lib/store';
import { generateId, formatDate, formatDateTime } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth';
import CitySelect from '@/components/features/CitySelect';
import StatusBadge from '@/components/features/StatusBadge';
import HistoryTab from '@/components/features/HistoryTab';
import RequisitesTab from '@/components/features/RequisitesTab';
import type {Buyer, RequisitesData, Task} from '@/types';
import {ROLE_TYPES, SYSTEM_TASK_TYPE, DEFAULT_TASK_TYPES} from '@/constants';
import { ArrowLeft, Save, Edit2, X, CheckCircle, Calendar, Plus } from 'lucide-react';
import ContactPrefIcon from '@/components/features/ContactPrefIcons';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import { toast } from 'sonner';

const TABS = ['Анкета', 'История', 'Дополнительно'];

export default function BuyerCardPage() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const { id } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState('Анкета');
  const [editing, setEditing] = useState(false);
  const [statusComment, setStatusComment] = useState('');
  const [, forceUpdate] = useState(0);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', dueDate: new Date().toISOString().split('T')[0], description: '', priority: 3 });
  const [formState, setFormState] = useState<Buyer | null>(null);

  const cityList = getStore().settings.cities || [];
  const initialStore = getStore();
  const freshBuyer = getStore().buyers.find(b => b.id === id);
  const buyerTypes = initialStore.settings.buyerTypes || ['магазин', 'СТО', 'организация'];
  const activeSources = (initialStore.settings.sources || []).filter(s => !s.deletedAt);
  const buyerStatuses = initialStore.settings.statuses.filter(s => s.entityTypes.includes('buyer')).map(s => s.name);

  const form: Buyer = formState || (freshBuyer ? { ...freshBuyer } : {} as Buyer);
  const setForm = (updater: Buyer | ((prev: Buyer) => Buyer)) => {
    setFormState(prev => {
      const base = prev || (freshBuyer ? { ...freshBuyer } : {} as Buyer);
      return typeof updater === 'function' ? updater(base) : updater;
    });
  };

  if (!freshBuyer) {
    return <div className="text-center py-20"><p className="text-gray-400 mb-4">Покупатель не найден</p><button onClick={() => navigate('/buyers')} className="btn-secondary">← Назад</button></div>;
  }

  function saveForm() {
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const history = [...freshBuyer!.history];
        // ТЗ: перевод из «Активного» в любой другой статус — только с обязательным
    // комментарием и подтверждением; комментарий наследуется в историю.
    if (form.status !== freshBuyer!.status && /актив/i.test(freshBuyer!.status) && !/актив/i.test(form.status)) {
      if (!statusComment.trim()) { toast.error('Смена статуса «' + freshBuyer!.status + '» → «' + form.status + '»: комментарий обязателен.'); return; }
      if (!confirm('Сменить статус с «' + freshBuyer!.status + '» на «' + form.status + '»?')) return;
    }
if (form.status !== freshBuyer!.status) history.push(makeHistoryEntry('status', freshBuyer!.status, form.status, statusComment, u.id, u.name));
    if (form.tradeName !== freshBuyer!.tradeName) history.push(makeHistoryEntry('tradeName', freshBuyer!.tradeName, form.tradeName, undefined, u.id, u.name));
    updateStore(s => ({ ...s, buyers: s.buyers.map(b => b.id === id ? { ...form, category: form.category ?? 'C', history, updatedAt: now } : b) }));
    setEditing(false); setStatusComment(''); setFormState(null); forceUpdate(n => n + 1); toast.success('Карточка сохранена');
    // Активация через смену статуса в анкете = действие кнопки «Активировать»: предлагаем автозадачу
    if (form.status !== freshBuyer!.status && /актив/i.test(form.status) && !/актив/i.test(freshBuyer!.status)) offerActivationTask(freshBuyer!.tradeName || '');
  }


  /** Автозадача «Ждет активации» — общая для кнопки «Активировать», смены статуса в анкете и массовой смены. */
  function offerActivationTask(name: string) {
    const u = getCurrentUser(); const now = new Date().toISOString();
    if (!confirm(`Создать задачу «${SYSTEM_TASK_TYPE}» для покупателя «${name}»?\nОтветственным будет назначен: ${u?.name || ''}.`)) return;
    const task: Task = {
      id: generateId(), entityType: 'buyer', entityId: id!, entityName: name,
      title: SYSTEM_TASK_TYPE, description: `Автозадача после активации покупателя «${name}».`,
      dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
      createdAt: now, updatedAt: now, createdBy: u?.id || '', responsibleId: u?.id, responsibleName: u?.name,
      history: [{ id: generateId(), date: now, field: 'created', comment: `Автозадача создана при активации покупателя (${u?.name || ''})`, userId: u?.id || '', userName: u?.name || '' }],
    };
    updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
    toast.success('Задача создана и отправлена в новые');
  }

  function handleActivate() {
    if (!confirm('Активировать покупателя на платформе? Статус изменится на "Активный".')) return;
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const name = freshBuyer?.tradeName || '';
    updateStore(s => ({ ...s, buyers: s.buyers.map(b => b.id === id ? { ...b, status: 'Активный', updatedAt: now, history: [...b.history, makeHistoryEntry('status', b.status, 'Активный', 'Активирован на платформе', u.id, u.name)] } : b) }));
    forceUpdate(n => n + 1); toast.success('Покупатель активирован на платформе!');
    // Автозадача «Ждет активации»: предлагаем сразу после активации, ответственный — создатель
    if (confirm(`Создать задачу «${SYSTEM_TASK_TYPE}» для покупателя «${name}»?\nОтветственным будет назначен: ${u.name}.`)) {
      const task: Task = {
        id: generateId(), entityType: 'buyer', entityId: id, entityName: name,
        title: SYSTEM_TASK_TYPE, description: `Автозадача после активации покупателя «${name}».`,
        dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 3,
        createdAt: now, updatedAt: now, createdBy: u.id, responsibleId: u.id, responsibleName: u.name,
        history: [{ id: generateId(), date: now, field: 'created', comment: `Автозадача создана при активации покупателя (${u.name})`, userId: u.id, userName: u.name }],
      };
      updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
      toast.success('Задача создана и отправлена в новые');
    }
  }


  function saveRequisites(data: RequisitesData) {
    const u = getCurrentUser()!;
    updateStore(s => ({ ...s, buyers: s.buyers.map(b => b.id === id ? { ...b, requisites: data, updatedAt: new Date().toISOString(), history: [...b.history, makeHistoryEntry('requisites', undefined, 'Обновлено', undefined, u.id, u.name)] } : b) }));
    forceUpdate(n => n + 1);
  }

  function createTask(e: React.FormEvent) {
    e.preventDefault();
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const task: Task = { id: generateId(), entityType: 'buyer', entityId: id, entityName: freshBuyer?.tradeName, title: taskForm.title, description: taskForm.description, dueDate: taskForm.dueDate, taskStatus: 'Новая', completed: false, priority: taskForm.priority, createdAt: now, updatedAt: now, createdBy: u.id };
    updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
    setShowTaskForm(false); setTaskForm({ title: '', dueDate: new Date().toISOString().split('T')[0], description: '', priority: 3 });
    forceUpdate(n => n + 1); toast.success('Задача создана');
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/buyers')} className="btn-secondary text-xs"><ArrowLeft size={14} /> Назад</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title truncate">{freshBuyer.tradeName}</h1>
            <StatusBadge status={freshBuyer.status} size="md" />
          </div>
          <p className="text-xs text-gray-400 mt-1">{freshBuyer.type} · {freshBuyer.city} · Создан: {formatDate(freshBuyer.createdAt)} · Обновлён: {formatDateTime(freshBuyer.updatedAt)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {freshBuyer.status !== 'Активный' && (
            <button onClick={handleActivate} className="btn-activate"><CheckCircle size={16} /> Активировать на платформе</button>
          )}
          <button onClick={() => setShowTaskForm(v => !v)} className="btn-secondary text-sm"><Calendar size={15} /> Задача</button>
          {!editing ? (
            <button onClick={() => { setFormState({ ...freshBuyer }); setEditing(true); }} className="btn-primary"><Edit2 size={16} /> Редактировать</button>
          ) : (
            <><button onClick={saveForm} className="btn-primary"><Save size={16} /> Сохранить</button><button onClick={() => { setFormState(null); setEditing(false); }} className="btn-secondary"><X size={16} /> Отмена</button></>
          )}
        </div>
      </div>

      {showTaskForm && (
        <div className="card-base p-4 border-yellow-200 bg-yellow-50 animate-fade-in">
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold">Новая задача: {freshBuyer.tradeName}</h3><button onClick={() => setShowTaskForm(false)} className="text-gray-400 hover:text-brand-red"><X size={16} /></button></div>
          <form onSubmit={createTask}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="sm:col-span-2"><label className="form-label">Тип задачи *</label><select required className="form-input" value={taskForm.title || ''} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}>
                <option value="" disabled>Выберите тип…</option>
                {(() => {
                  const raw = getStore().settings.taskTypes?.length ? getStore().settings.taskTypes! : DEFAULT_TASK_TYPES;
                  const miss = ['Ждет активации', 'От поддержки'].filter(x => !raw.includes(x));
                  return [...miss, ...raw];
                })().map(t => <option key={t} value={t}>{t}</option>)}
              </select></div>
              <div><label className="form-label">Срок *</label><input required type="date" className="form-input" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
              <div><label className="form-label">Приоритет (0-5)</label><input type="number" min="0" max="5" className="form-input" value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: parseInt(e.target.value) }))} /></div>
              <div><label className="form-label">Описание</label><input className="form-input" value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setShowTaskForm(false)} className="btn-secondary text-xs">Отмена</button><button type="submit" className="btn-primary text-xs"><Plus size={13} /> Создать</button></div>
          </form>
        </div>
      )}

      <div className="card-base overflow-hidden">
        <div className="flex overflow-x-auto border-b border-brand-gray-mid">
          {TABS.map(t => <button key={t} onClick={() => setTab(t)} className={`tab-button flex-shrink-0 ${tab === t ? 'tab-active' : 'tab-inactive'}`}>{t}</button>)}
        </div>
        <div className="p-4 sm:p-6">
          {tab === 'Анкета' && (
            <div className="space-y-6">
              {editing && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-md">
                  <label className="form-label text-blue-700">Изменить статус</label>
                  <div className="flex gap-2 flex-wrap">
                    <select className="form-input w-auto" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                      {buyerStatuses.map(s => <option key={s}>{s}</option>)}
                    </select>
                    <input className="form-input flex-1 min-w-[200px]" placeholder="Комментарий..." value={statusComment} onChange={e => setStatusComment(e.target.value)} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { key: 'tradeName', label: 'Торговое название' },
                  { key: 'city', label: 'Город' },
                  { key: 'address', label: 'Адрес' },
                  { key: 'website', label: 'Сайт' },
                  { key: 'inn', label: 'ИНН/ОГРНИП' },
                  { key: 'contactName', label: 'ФИО' },
                ].map(f => (
                  <div key={f.key}>
                    <label className="form-label">{f.label}</label>
                    {editing && f.key === 'city' ? (
                      <CitySelect cities={cityList} value={(form as unknown as Record<string, string | undefined>).city || ''} onChange={v => setForm(pf => ({ ...pf, city: v }))} />
                    ) : editing ? <input className="form-input" value={(form as unknown as Record<string, string | undefined>)[f.key] || ''} onChange={e => setForm(pf => ({ ...pf, [f.key]: e.target.value }))} /> : <p className="text-sm text-brand-black py-2">{(freshBuyer as unknown as Record<string, string | undefined>)[f.key] || <span className="text-gray-300">—</span>}</p>}
                  </div>
                ))}
                <div>
                  <label className="form-label">Телефон</label>
                  {editing ? <input className="form-input" value={form.phone || ''} onChange={e => setForm(pf => ({ ...pf, phone: e.target.value }))} /> : freshBuyer.phone ? <a href={`tel:${freshBuyer.phone}`} className="text-sm text-blue-600 hover:underline py-2 block">{freshBuyer.phone}</a> : <p className="text-sm text-gray-300 py-2">—</p>}
                </div>
                <div>
                  <label className="form-label">Email</label>
                  {editing ? <input type="email" className="form-input" value={form.email || ''} onChange={e => setForm(pf => ({ ...pf, email: e.target.value }))} /> : freshBuyer.email ? <a href={`mailto:${freshBuyer.email}`} className="text-sm text-blue-600 hover:underline py-2 block">{freshBuyer.email}</a> : <p className="text-sm text-gray-300 py-2">—</p>}
                </div>
                <div><label className="form-label">Тип</label>{editing ? <select className="form-input" value={form.type} onChange={e => setForm(pf => ({ ...pf, type: e.target.value }))}>{buyerTypes.map(t => <option key={t}>{t}</option>)}</select> : <p className="text-sm text-brand-black py-2">{freshBuyer.type}</p>}</div>
                <div><label className="form-label">Роль</label>{editing ? <select className="form-input" value={form.contactRole} onChange={e => setForm(pf => ({ ...pf, contactRole: e.target.value as Buyer['contactRole'] }))}>{ROLE_TYPES.map(t => <option key={t}>{t}</option>)}</select> : <p className="text-sm text-brand-black py-2">{freshBuyer.contactRole}</p>}</div>
                <div>
                  <label className="form-label">Источник</label>
                  {editing ? <select className="form-input" value={form.source || ''} onChange={e => setForm(pf => ({ ...pf, source: e.target.value }))}><option value="">—</option>{activeSources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select> : <p className="text-sm text-brand-black py-2">{freshBuyer.source || '—'}</p>}
                </div>
                <div><label className="form-label">Связь</label>{editing ? (
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {getContactPrefs().map(cp => { const on = (form.contactPrefs || []).includes(cp); return (
                      <button key={cp} type="button" onClick={() => setForm(pf => ({ ...pf, contactPrefs: on ? (pf.contactPrefs || []).filter(x => x !== cp) : [...(pf.contactPrefs || []), cp] }))} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}><ContactPrefIcon name={cp} />{cp}</button>
                    ); })}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5 py-2">
                    {(freshBuyer.contactPrefs || []).length ? freshBuyer.contactPrefs!.map(cp => <span key={cp} className="flex items-center gap-1 text-xs bg-brand-gray px-2 py-0.5 rounded-full"><ContactPrefIcon name={cp} />{cp}</span>) : <p className="text-sm text-brand-black">{freshBuyer.contactPref || '—'}</p>}
                  </div>
                )}</div>
                <div>
                  <label className="form-label">Кол-во точек</label>
                  {editing ? <input type="number" min="0" className="form-input" value={form.locationCount || ''} onChange={e => setForm(pf => ({ ...pf, locationCount: parseInt(e.target.value) || undefined }))} /> : <p className="text-sm text-brand-black py-2">{freshBuyer.locationCount ?? '—'}</p>}
                </div>
                <div>
                  <label className="form-label">Категория (A-B-C)</label>
                  {editing ? (
                    // ТЗ 1.8: выпадающий список категорий, выбор одной, по умолчанию C
                    <select className="form-input" value={form.category ?? 'C'} onChange={e => setForm(pf => ({ ...pf, category: e.target.value as 'A' | 'B' | 'C' }))}>
                      {/* ТЗ 1.8: комментарии категорий — из настроек (Источники → Категории покупателей) */}
                      {(['A', 'B', 'C'] as const).map(c => {
                        const comments = getStore().settings.buyerCategoryComment || { A: '1 500 000 и больше', B: '500 000 – 1 500 000', C: '50 000 – 500 000' };
                        return <option key={c} value={c}>{c} — {comments[c]}</option>;
                      })}
                    </select>
                  ) : (
                    <div className="py-2">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold" style={BUYER_CAT_STYLE[freshBuyer.category ?? 'C']}>{freshBuyer.category ?? 'C'}</span>
                    </div>
                  )}
                </div>
                <div>
                  <label className="form-label">Ответственный</label>
                  {editing ? (
                    <ResponsibleSelect value={form.responsibleId} onChange={(id, name) => setForm(pf => ({ ...pf, responsibleId: id, responsibleName: name }))} />
                  ) : (
                    <p className="text-sm text-brand-black py-2">{freshBuyer.responsibleName || <span className="text-gray-300">—</span>}</p>
                  )}
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="form-label">Комментарий</label>
                  {editing ? <textarea className="form-input min-h-[80px] resize-none" value={form.comment || ''} onChange={e => setForm(pf => ({ ...pf, comment: e.target.value }))} /> : <p className="text-sm text-brand-black py-2">{freshBuyer.comment || '—'}</p>}
                </div>
              </div>
            </div>
          )}
          {tab === 'История' && <HistoryTab history={freshBuyer.history} />}
          {tab === 'Дополнительно' && (
            <div className="space-y-4">
              <div><label className="form-label">Доп. контакты</label>{editing ? <textarea className="form-input min-h-[100px] resize-none" value={form.additionalContacts || ''} onChange={e => setForm(pf => ({ ...pf, additionalContacts: e.target.value }))} /> : <p className="text-sm text-brand-black py-2 whitespace-pre-wrap">{freshBuyer.additionalContacts || '—'}</p>}</div>
              <div><label className="form-label">Доп. комментарии</label>{editing ? <textarea className="form-input min-h-[100px] resize-none" value={form.additionalComment || ''} onChange={e => setForm(pf => ({ ...pf, additionalComment: e.target.value }))} /> : <p className="text-sm text-brand-black py-2 whitespace-pre-wrap">{freshBuyer.additionalComment || '—'}</p>}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
