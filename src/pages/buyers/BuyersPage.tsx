import { useState, useMemo, useEffect } from 'react';

// ТЗ 1.8: системные цвета категорий покупателей (A/B/C)
const BUYER_CAT_STYLE: Record<'A' | 'B' | 'C', { background: string; color: string }> = {
  A: { background: 'rgb(209, 250, 229)', color: 'rgb(6, 95, 70)' },
  B: { background: 'rgb(239, 246, 255)', color: 'rgb(30, 64, 175)' },
  C: { background: 'rgb(254, 243, 199)', color: 'rgb(180, 83, 9)' },
};
import CitySelect from '@/components/features/CitySelect';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getStore, updateStore, useStoreVersion, getContactPrefs } from '@/lib/store';
import { generateId, exportToCSV, formatDate } from '@/lib/utils';
import { getCurrentUser, canExport, canDelete, isAdmin, canSeeBuyer, canSeeManagerCity } from '@/lib/auth';
import { isArchiveStatus, findDuplicate } from '@/lib/dedupe';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import StatusBadge from '@/components/features/StatusBadge';
import ImportModal from '@/components/features/ImportModal';
import type { Buyer, Task } from '@/types';
import {ROLE_TYPES, SYSTEM_TASK_TYPE, COMPANY_SCORE_COLORS} from '@/constants';
import { Play, Plus, Download, Upload, Trash2, RotateCcw, Search, X, Edit2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import ContactPrefIcon from '@/components/features/ContactPrefIcons';
import StatusChangeModal from '@/components/features/StatusChangeModal';

const IMPORT_FIELDS = ['tradeName', 'type', 'city', 'inn', 'contactName', 'phone', 'email', 'status', 'source', 'comment'];


function ScoreBadge({ score }: { score: number }) {
  const n = Math.min(10, Math.max(0, Math.round(score)));
  const cfg = COMPANY_SCORE_COLORS[n] || COMPANY_SCORE_COLORS[0];
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold" style={{ background: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  );
}

export default function BuyersPage() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const navigate = useNavigate();
  const [catSel, setCatSel] = useState<Array<'A' | 'B' | 'C'>>([]); // ТЗ 1.8: фильтр-кружки категорий (по умолчанию ВЫКЛ, клик включает)
const [, forceUpdate] = useState(0);
  const store = getStore();
  const u = getCurrentUser();

  const [search, setSearch] = useState('');
  // ТЗ: подгрузка списка «Показать ещё»
  const [listLimit, setListLimit] = useState(50);
  const [listShown, setListShown] = useState(50);
  // Модальное окно смены статуса из таблицы
  const [statusModal, setStatusModal] = useState<{ id: string; status: string } | null>(null);
  const [urlParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState(urlParams.get('status') || ''); // v_1.9: ?status= из дашборда
  const [filterResponsible, setFilterResponsible] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState<Partial<Buyer>>({ type: 'магазин', status: 'Лид CRM', companyScore: 5, history: [] });
  const [massStatus, setMassStatus] = useState('');
  const [massResponsible, setMassResponsible] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskType, setTaskType] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskResp, setTaskResp] = useState('');
  const [sortDate, setSortDate] = useState<'none' | 'asc' | 'desc'>('none');

  const buyerTypes = useMemo(() => store.settings.buyerTypes || ['магазин', 'СТО', 'организация'], [store.settings.buyerTypes]);
  const activeSources = useMemo(() => (store.settings.sources || []).filter(s => !s.deletedAt), [store.settings.sources]);
  const buyerStatuses = useMemo(() => store.settings.statuses
    .filter(s => s.entityTypes.includes('buyer'))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99)) // порядок воронки как у поставщиков
    .map(s => s.name), [store.settings.statuses]);

  const { list: buyers, statusCounts } = useMemo(() => {
    let list = store.buyers.filter(b => showArchived ? !!b.deletedAt : !b.deletedAt);
    list = list.filter(b => canSeeBuyer(b) && canSeeManagerCity(b.city)); // фильтры типов/городов менеджера + города МОП (ТЗ п.2В, v1.21.6)
    if (filterResponsible === '__none__') list = list.filter(b => !b.responsibleId);
    else if (filterResponsible) list = list.filter(b => b.responsibleId === filterResponsible);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(b => b.tradeName.toLowerCase().includes(q) || (b.inn || '').includes(q) || b.phone.includes(q) || b.email.toLowerCase().includes(q) || b.contactName.toLowerCase().includes(q));
    }
    // Счётчики строк по статусам (до применения фильтра статуса) — для кнопок-фильтров
    const statusCounts: Record<string, number> = {};
    for (const x of list) statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
    // ТЗ 1.8: «Все» — все статусы КРОМЕ «Активный»; «Активный» — только активные
    if (filterStatus === '') list = list.filter(b => b.status !== 'Активный');
    else list = list.filter(b => b.status === filterStatus);
    // ТЗ 1.8: категории — фильтр ВКЛ только для выбранных кружков (пусто = все)
    if (catSel.length) list = list.filter(b => catSel.includes(b.category ?? 'C'));
    if (filterCity) list = list.filter(b => b.city === filterCity);
    if (filterType) list = list.filter(b => b.type === filterType);

    if (sortDate === 'asc') list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    else list = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { list, statusCounts };
  }, [store.buyers, search, filterStatus, filterCity, filterType, showArchived, sortDate, filterResponsible, catSel]);
  useEffect(() => { setListShown(listLimit); }, [buyers]); // сброс подгрузки при смене фильтров/поиска


  const cityList = store.settings.cities || [];
  const cities = useMemo(() => [...new Set(store.buyers.map(b => b.city).filter(Boolean))], [store.buyers]);

  function toggleSelect(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  function toggleAll() { setSelected(selected.length === buyers.length ? [] : buyers.map(b => b.id)); }
  function cycleSortDate() { setSortDate(v => v === 'none' ? 'desc' : v === 'desc' ? 'asc' : 'none'); }

  function handleDelete(ids: string[]) {
    if (!canDelete()) { toast.error('Удаление доступно только администратору'); return; }
    if (!confirm(`Удалить ${ids.length} запись(-ей)?`)) return;
    updateStore(s => ({ ...s, buyers: s.buyers.map(b => ids.includes(b.id) ? { ...b, deletedAt: new Date().toISOString() } : b) }));
    setSelected([]); forceUpdate(n => n + 1); toast.success('Удалено');
  }
  function handleRestore(ids: string[]) {
    if (!canDelete()) { toast.error('Восстановление доступно только администратору'); return; }
    updateStore(s => ({ ...s, buyers: s.buyers.map(b => ids.includes(b.id) ? { ...b, deletedAt: undefined } : b) }));
    setSelected([]); forceUpdate(n => n + 1); toast.success('Восстановлено');
  }
  
  /** ТЗ: массовая задача по отмеченным записям + ссылка на файл выбранных в описании */
  function createTaskFromSelection() {
    if (!selected.length) return;
    const u = getCurrentUser();
    const respUser = (store.settings.users || []).find(x => x.id === (taskResp || u?.id)) || u;
    const now = new Date().toISOString();
    const taskId = generateId();
    const type = taskType || (store.settings.taskTypes || [])[0] || 'Обратная связь';
    const task: Task = {
      id: taskId,
      entityType: 'buyers',
      entityName: 'Покупатели (' + selected.length + ')',
      title: type,
      description: (taskDesc.trim() || 'Работа со списком') + '\n—\nСкачать файл со списком (доступно только в панели CRM): /entity-export/' + taskId,
      dueDate: now.split('T')[0],
      taskStatus: 'Новая',
      completed: false,
      priority: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: u?.id,
      responsibleId: respUser?.id,
      responsibleName: respUser?.name,
      entityKind: 'buyers',
      entityIds: [...selected],
      history: [{ id: generateId(), date: now, field: 'created', newValue: 'Задача создана из Покупатели', userId: u?.id || '', userName: u?.name || '' }],
    };
    updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
    setShowTaskForm(false); setTaskType(''); setTaskDesc(''); setTaskResp('');
    toast.success('Задача создана');
  }

function handleMassStatus() {
    if (!massStatus || !selected.length) return;
    // ТЗ: если среди выбранных есть «Активные» и новый статус не «Активный» —
    // комментарий обязателен + подтверждение.
    const affected = store.buyers.filter(x => selected.includes(x.id) && /актив/i.test(x.status) && !/актив/i.test(massStatus));
    let massComment = '';
    if (affected.length) {
      massComment = window.prompt(`Среди выбранных ${affected.length} покупателей в статусе «Активный». Причина смены статуса (обязательно):`) || '';
      if (!massComment.trim()) { toast.error('Комментарий обязателен — статус не изменён'); return; }
      if (!confirm(`Сменить статус у ${affected.length} «Активных» покупателей на «${massStatus}»?`)) return;
    }

    // ТЗ: архивные статусы требуют подтверждения фразой «согласен»
    if (isArchiveStatus(massStatus) && window.prompt('Перевод в архив. Введите фразу «согласен» для подтверждения:')?.trim().toLowerCase() !== 'согласен') {
      toast.error('Подтверждение фразой «согласен» обязательно — статус не изменён'); return;
    }
    if (!confirm(`Изменить статус у ${selected.length} записей на "${massStatus}"?`)) return;
    const u = getCurrentUser()!;
    updateStore(s => ({
      ...s, buyers: s.buyers.map(b => !selected.includes(b.id) ? b : {
        ...b, status: massStatus, updatedAt: new Date().toISOString(),
        deletedAt: isArchiveStatus(massStatus) ? new Date().toISOString() : b.deletedAt,
        history: [...b.history, { id: generateId(), date: new Date().toISOString(), field: 'status', oldValue: b.status, newValue: massStatus, userId: u.id, userName: u.name, comment: massComment }],
      }),
    }));
    // Автозадачи для массово активированных (та же функция, что у кнопки «Активировать»)
    const activated = store.buyers.filter(x => selected.includes(x.id) && /актив/i.test(massStatus) && !/актив/i.test(x.status));
    if (activated.length && confirm(`Создать задачи «${SYSTEM_TASK_TYPE}» для ${activated.length} активированных покупателей?\nОтветственным будет назначен: ${u.name}.`)) {
      const nowT = new Date().toISOString();
      const tasks: Task[] = activated.map(x => ({
        id: generateId(), entityType: 'buyer', entityId: x.id, entityName: x.tradeName,
        title: SYSTEM_TASK_TYPE, description: `Автозадача после активации «${x.tradeName}».`,
        dueDate: nowT.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
        createdAt: nowT, updatedAt: nowT, createdBy: u.id, responsibleId: u.id, responsibleName: u.name,
        history: [{ id: generateId(), date: nowT, field: 'created', comment: `Автозадача создана при активации (${u.name})`, userId: u.id, userName: u.name }],
      }));
      updateStore(s => ({ ...s, tasks: [...s.tasks, ...tasks] }));
      toast.success(`Создано задач: ${activated.length}`);
    }
    setSelected([]); setMassStatus(''); forceUpdate(n => n + 1); toast.success('Статус изменён');
  }

  /** Массовая смена ответственного (ТЗ): выбранные галочками + подтверждение. */
  function handleMassResponsible() {
    // Пакетная смена ответственного — только администратор (ТЗ): защита даже при
    // прямом вызове из консоли, а не только скрытии кнопок в UI.
    if (!isAdmin()) { toast.error('Массовую смену ответственного может выполнять только администратор'); return; }
    if (!massResponsible || !selected.length) { toast.error('Выберите ответственного'); return; }
    const user = store.settings.users.find(u => u.id === massResponsible);
    if (!user) return;
    if (!confirm(`Назначить ответственным «${user.name}» для ${selected.length} записей?`)) return;
    const now = new Date().toISOString();
    updateStore(s => ({
      ...s,
      buyers: s.buyers.map(x => !selected.includes(x.id) ? x : { ...x, responsibleId: user.id, responsibleName: user.name, updatedAt: now }),
    }));
    setSelected([]); setMassResponsible('');
    forceUpdate(n => n + 1);
    toast.success('Ответственный назначен');
  }
  function handleExport() {
    const toExport = selected.length > 0 ? buyers.filter(b => selected.includes(b.id)) : buyers;
    exportToCSV(toExport.map(b => ({
      'Название': b.tradeName, 'Тип': b.type, 'Город': b.city, 'ИНН': b.inn || '',
      'Контакт': b.contactName, 'Телефон': b.phone, 'Email': b.email,
      'Статус': b.status, 'Источник': b.source || '',
      'Кол-во точек': b.locationsCount ?? b.locationCount ?? '', 'Дата создания': b.createdAt,
    })), `buyers_${Date.now()}.csv`);
  }
  function handleImport(rows: Record<string, string>[]) {
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const newBuyers: Buyer[] = rows.map(r => ({
      id: generateId(), type: r['type'] || 'магазин',
      tradeName: r['tradeName'] || r['Название'] || 'Без названия',
      city: r['city'] || r['Город'] || '', address: r['address'] || '', inn: r['inn'] || r['ИНН'] || '',
      contactRole: (r['contactRole'] as Buyer['contactRole']) || 'менеджер',
      contactName: r['contactName'] || r['Контакт'] || '',
      phone: r['phone'] || r['Телефон'] || '', email: r['email'] || r['Email'] || '',
      status: r['status'] || r['Статус'] || 'Лид CRM',
      companyScore: parseInt(r['companyScore'] || '5') || 5,
      history: [{ id: generateId(), date: now, field: 'created', newValue: 'Импорт', userId: u.id, userName: u.name }],
      createdAt: now, updatedAt: now, createdBy: u.id,
    }));
    // ТЗ: дубль по ИНН/телефону/email → «Архив дублей» + архив
    const existing = getStore().buyers;
    const checked = newBuyers.map(nb => {
      const dup = findDuplicate(nb, [...existing, ...newBuyers.filter(x => x.id !== nb.id)]);
      return dup ? { ...nb, status: 'Архив дублей', deletedAt: now } : nb;
    });
    const dups = checked.filter(x => x.status === 'Архив дублей').length;
    updateStore(s => ({ ...s, buyers: [...s.buyers, ...checked] }));
    if (dups) toast.warning(`Импортировано с автопереносом в «Архив дублей»: ${dups}`);
    forceUpdate(n => n + 1);
  }
  function handleAddBuyer(e: React.FormEvent) {
    e.preventDefault();
    const u = getCurrentUser()!; const now = new Date().toISOString();
    // ТЗ 1.8: дубль по ИНН/телефону/email → «Архив дублей» + архив (проверка до сборки объекта)
    const dup = findDuplicate({ id: '', inn: newForm.inn, phone: newForm.phone, email: newForm.email } as Buyer, getStore().buyers);
    const buyer: Buyer = {
      id: generateId(), type: newForm.type || 'магазин',
      tradeName: newForm.tradeName || '', city: newForm.city || '',
      address: newForm.address, website: newForm.website, inn: newForm.inn,
      contactRole: newForm.contactRole || 'менеджер', contactName: newForm.contactName || '',
      phone: newForm.phone || '', email: newForm.email || '', status: dup ? 'Архив дублей' : 'Лид CRM',
      deletedAt: dup ? now : undefined, // ТЗ 1.8: дубль сразу архивируется
      source: newForm.source, contactPref: newForm.contactPref, contactPrefs: newForm.contactPrefs?.length ? newForm.contactPrefs : ['телефон'],
      responsibleId: newForm.responsibleId, responsibleName: newForm.responsibleName,
      companyScore: newForm.companyScore || 5,
        category: newForm.category ?? 'C', // ТЗ 1.8 — по умолчанию категория C
      locationsCount: newForm.locationsCount, comment: newForm.comment,
      history: [{ id: generateId(), date: now, field: 'created', newValue: 'Лид CRM', comment: 'Создан вручную', userId: u.id, userName: u.name }],
      createdAt: now, updatedAt: now, createdBy: u.id,
    };
    const finalBuyer = dup ? { ...buyer, status: 'Архив дублей' as string, deletedAt: now } : buyer;
    updateStore(s => ({ ...s, buyers: [...s.buyers, finalBuyer] }));
    if (dup) toast.warning(`Найден дубль: «${dup.tradeName}». Карточка перенесена в «Архив дублей».`);
    setShowAddForm(false); setNewForm({ type: 'магазин', status: 'Лид CRM', companyScore: 5, history: [] });
    forceUpdate(n => n + 1); toast.success('Покупатель добавлен');
    navigate(`/buyers/${buyer.id}`);
  }


  /** Быстрая активация из таблицы — то же действие, что «Активировать на платформе» в карточке. */
  function quickActivate(id: string, name: string, currentStatus: string) {
    if (currentStatus === 'Активный') return;
    if (!confirm('Активировать покупателя на платформе?')) return;
    const u = getCurrentUser(); const now = new Date().toISOString();
    updateStore(s => ({
      ...s,
      buyers: s.buyers.map(x => x.id === id ? { ...x, status: 'Активный', updatedAt: now, history: [...x.history, { id: generateId(), date: now, field: 'status', oldValue: currentStatus, newValue: 'Активный', comment: 'Активирован на платформе (быстрое действие)', userId: u?.id || '', userName: u?.name || '' }] } : x),
    }));
    forceUpdate(n => n + 1);
    toast.success('Покупатель активирован на платформе!');
    if (confirm(`Создать задачу «${SYSTEM_TASK_TYPE}» для покупателя «${name}»?\nОтветственным будет назначен: ${u?.name || ''}.`)) {
      const task: Task = {
        id: generateId(), entityType: 'buyer', entityId: id, entityName: name,
        title: SYSTEM_TASK_TYPE, description: `Автозадача после активации покупателя «${name}».`,
        dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
        createdAt: now, updatedAt: now, createdBy: u?.id || '', responsibleId: u?.id, responsibleName: u?.name,
        history: [{ id: generateId(), date: now, field: 'created', comment: `Автозадача создана при активации покупателя (${u?.name || ''})`, userId: u?.id || '', userName: u?.name || '' }],
      };
      updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
      toast.success('Задача создана и отправлена в новые');
    }
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="actions-bar flex items-center justify-start flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          {canExport() && (<><button onClick={() => setShowImport(true)} className="action-btn text-xs"><Upload size={14} /> Импорт</button><button onClick={handleExport} className="action-btn text-xs"><Download size={14} /> Экспорт{selected.length > 0 ? ` (${selected.length})` : ''}</button></>)}
          <button onClick={() => setShowAddForm(v => !v)} className="action-btn"><Plus size={16} /> Добавить</button>
        </div>
      </div>

      {showAddForm && (
        <div className="card-base p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-4"><h2 className="section-title">Новый покупатель</h2><button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button></div>
          <form onSubmit={handleAddBuyer}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div><label className="form-label">Тип</label><select className="form-input" value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))}>{buyerTypes.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="form-label">Ответственный</label><ResponsibleSelect value={newForm.responsibleId} onChange={(id, name) => setNewForm(f => ({ ...f, responsibleId: id, responsibleName: name }))} /></div>
              <div><label className="form-label">Торговое название *</label><input required className="form-input" value={newForm.tradeName || ''} onChange={e => setNewForm(f => ({ ...f, tradeName: e.target.value }))} /></div>
              <div><label className="form-label">Город *</label><CitySelect required cities={cityList} value={newForm.city || ''} onChange={v => setNewForm(f => ({ ...f, city: v }))} /></div>
              <div><label className="form-label">ИНН/ОГРНИП</label><input className="form-input" value={newForm.inn || ''} onChange={e => setNewForm(f => ({ ...f, inn: e.target.value }))} /></div>
              <div><label className="form-label">Роль</label><select className="form-input" value={newForm.contactRole || 'менеджер'} onChange={e => setNewForm(f => ({ ...f, contactRole: e.target.value as Buyer['contactRole'] }))}>{ROLE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="form-label">ФИО *</label><input required className="form-input" value={newForm.contactName || ''} onChange={e => setNewForm(f => ({ ...f, contactName: e.target.value }))} /></div>
              <div><label className="form-label">Телефон *</label><input required className="form-input" value={newForm.phone || ''} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><label className="form-label">Email *</label><input required type="email" className="form-input" value={newForm.email || ''} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><label className="form-label">Источник</label><select className="form-input" value={newForm.source || ''} onChange={e => setNewForm(f => ({ ...f, source: e.target.value }))}><option value="">—</option>{activeSources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
                <div className="sm:col-span-2"><label className="form-label">Связь</label>
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {getContactPrefs().map(cp => { const on = (newForm.contactPrefs || []).includes(cp); return (
                      <button key={cp} type="button" onClick={() => setNewForm(f => ({ ...f, contactPrefs: on ? (f.contactPrefs || []).filter(x => x !== cp) : [...(f.contactPrefs || []), cp] }))} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}>{cp}</button>
                    ); })}
                  </div>
                </div>
                <div><label className="form-label">Адрес</label><input className="form-input" value={newForm.address || ''} onChange={e => setNewForm(f => ({ ...f, address: e.target.value }))} /></div>
                <div><label className="form-label">Сайт</label><input className="form-input" placeholder="https://…" value={newForm.website || ''} onChange={e => setNewForm(f => ({ ...f, website: e.target.value }))} /></div>
                <div><label className="form-label">Кол-во точек</label><input type="number" min="0" className="form-input" value={newForm.locationsCount ?? ''} onChange={e => setNewForm(f => ({ ...f, locationsCount: parseInt(e.target.value) || undefined }))} /></div>
                <div><label className="form-label">Категория (A-B-C)</label>
                <select className="form-input" value={newForm.category ?? 'C'} onChange={e => setNewForm(f => ({ ...f, category: e.target.value as 'A' | 'B' | 'C' }))}>
                  {/* ТЗ 1.8: комментарии категорий — из настроек (Источники → Категории покупателей) */}
                  {(['A', 'B', 'C'] as const).map(c => {
                    const comments = getStore().settings.buyerCategoryComment || { A: '1 500 000 и больше', B: '500 000 – 1 500 000', C: '50 000 – 500 000' };
                    return <option key={c} value={c}>{c} — {comments[c]}</option>;
                  })}
                </select></div>
                <div className="sm:col-span-2"><label className="form-label">Комментарий</label><textarea className="form-input min-h-[60px] resize-none" value={newForm.comment || ''} onChange={e => setNewForm(f => ({ ...f, comment: e.target.value }))} /></div>
              
            </div>
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Отмена</button><button type="submit" className="btn-primary">Сохранить и открыть карточку</button></div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="card-base p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="form-input pl-8 py-1.5 text-xs" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
</div>
          <select className="form-input py-1.5 text-xs w-auto" value={filterResponsible} onChange={e => setFilterResponsible(e.target.value)}>
            <option value="">Все ответственные</option>
            <option value="__none__">Без ответственного</option>
            {store.settings.users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="form-input py-1.5 text-xs w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}><option value="">Все типы</option>{buyerTypes.map(t => <option key={t}>{t}</option>)}</select>
          <select className="form-input py-1.5 text-xs w-auto" value={filterCity} onChange={e => setFilterCity(e.target.value)}><option value="">Все города</option>{cities.map(c => <option key={c}>{c}</option>)}</select>
          <button onClick={() => setShowArchived(v => !v)} className={`btn-secondary text-xs py-1.5 ${showArchived ? 'bg-gray-200' : ''}`}>{showArchived ? 'Скрыть архив' : 'Архив'}</button>
        </div>
        {/* Status pills */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilterStatus('')} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterStatus === '' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>Все</button>
          {/* ТЗ 1.8: «Активный» — отдельная пилюля сразу после «Все», из общего списка исключён; при нажатии — зелёная заливка */}
          <button onClick={() => setFilterStatus(filterStatus === 'Активный' ? '' : 'Активный')}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterStatus === 'Активный' ? 'text-white' : 'border-brand-gray-mid text-gray-500'}`}
            style={filterStatus === 'Активный' ? { background: 'rgb(22 163 74 / var(--tw-bg-opacity, 1))', borderColor: 'rgb(22 163 74 / var(--tw-bg-opacity, 1))' } : undefined}>
            Активный <span className="ml-1 font-semibold">{statusCounts['Активный'] || 0}</span>
          </button>
          {/* ТЗ 1.8: архивные пилюли видны только когда нажата кнопка «Архив» (showArchived) */}
          {buyerStatuses.filter(s => s !== 'Активный' && (showArchived || (s !== 'АРХИВ' && s !== 'Архив дублей'))).map(s => <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterStatus === s ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>{s} <span className="ml-1 font-semibold">{statusCounts[s] || 0}</span></button>)}
          {/* ТЗ 1.8: фильтр по категории — кружки A/B/C, по умолчанию ВЫКЛ (показываем все), клик ВКЛЮЧАЕТ (можно несколько) */}
          {(['A', 'B', 'C'] as const).map(c => (
            <button key={c} onClick={() => setCatSel(o => o.includes(c) ? o.filter(x => x !== c) : [...o, c])}
              className={`inline-flex items-center justify-center rounded-full text-[11px] font-bold transition-colors ${catSel.includes(c) ? 'bg-brand-black text-white' : 'border border-brand-gray-mid text-gray-400'}`}
              style={{ width: 22, height: 22 }} title={`Категория ${c}`}>{c}</button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="card-base p-3 flex flex-wrap items-center gap-2 bg-blue-50 border-blue-200 animate-fade-in">
          <span className="text-xs font-medium text-blue-700">Выбрано: {selected.length}</span>
          <select className="form-input py-1 text-xs w-auto" value={massStatus} onChange={e => setMassStatus(e.target.value)}><option value="">Статус...</option>{buyerStatuses.map(s => <option key={s}>{s}</option>)}</select>
          <button onClick={handleMassStatus} disabled={!massStatus} className="action-btn action-btn-md text-xs py-1">Применить</button>
          <button onClick={() => { setShowTaskForm(true); setTaskType(''); setTaskDesc(''); setTaskResp(''); }} className="action-btn action-btn-md text-xs py-1">Создать задачу</button>
          {/* Пакетная смена ответственного — только администратор (ТЗ) */}
          {isAdmin() && (
            <>
              <select className="form-input py-1 text-xs w-auto" value={massResponsible} onChange={e => setMassResponsible(e.target.value)}>
                <option value="">Ответственный...</option>
                {store.settings.users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <button onClick={handleMassResponsible} disabled={!massResponsible} className="action-btn action-btn-md text-xs py-1">Сменить ответственного</button>
            </>
          )}
          {canExport() && <button onClick={handleExport} className="action-btn action-btn-md text-xs py-1"><Download size={12} /> Экспорт</button>}
          {canDelete() && (!showArchived ? <button onClick={() => handleDelete(selected)} className="action-btn action-btn-md text-xs py-1"><Trash2 size={12} /> Перенести в архив</button> : <button onClick={() => handleRestore(selected)} className="action-btn action-btn-md text-xs py-1"><RotateCcw size={12} /> Восстановить</button>)}
          <button onClick={() => setSelected([])} className="text-xs text-gray-400 ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="card-base overflow-hidden">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gray-mid">
                <th className="table-header w-10"><input type="checkbox" checked={selected.length === buyers.length && buyers.length > 0} onChange={toggleAll} className="rounded" /></th>
                <th className="table-header">Название</th>
                <th className="table-header hidden sm:table-cell">Тип</th>
                <th className="table-header hidden md:table-cell">Город</th>
                <th className="table-header">Контакт</th>
                <th className="table-header">Статус</th>
              <th className="table-header hidden xl:table-cell">Категория</th>
                <th className="table-header hidden lg:table-cell cursor-pointer select-none whitespace-nowrap" onClick={cycleSortDate}>
                  <span className="flex items-center gap-1">
                    Создан
                    {sortDate === 'asc' ? <ChevronUp size={12} /> : sortDate === 'desc' ? <ChevronDown size={12} /> : <span className="text-gray-300">↕</span>}
                  </span>
                </th>
                <th className="table-header w-14"></th>
              </tr>
            </thead>
            <tbody>
              {buyers.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-gray-400 text-sm">Записей не найдено</td></tr>}
              {buyers.slice(0, listShown).map(b => (
                <tr key={b.id} className={`table-row ${b.deletedAt ? 'opacity-50' : ''}`} onClick={() => navigate(`/buyers/${b.id}`)}>
                  <td className="table-cell" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.includes(b.id)} onChange={() => toggleSelect(b.id)} className="rounded" /></td>
                  {/* v1.30.98: постоянный ID под названием */}
                  <td className="table-cell font-medium">{b.tradeName}{!b.responsibleId && <span className="text-brand-red ml-0.5" title="Нет ответственного — запись видна всем менеджерам">*</span>}<p className="text-[10px] font-mono text-gray-400 font-normal mt-0.5" title={`Внутренний ID: ${b.id}`}>{b.publicId || b.id}</p></td>
                  <td className="table-cell hidden sm:table-cell text-xs text-gray-500">{b.type}</td>
                  <td className="table-cell hidden md:table-cell text-xs">{b.city}</td>
                  <td className="table-cell">
                    <div className="text-xs"><p className="font-medium">{b.contactName}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
                        {(b.contactPrefs || []).map(cp => (
                          <button key={cp} title={`Копировать: ${cp}`} onClick={() => {
                            const val = (cp.toLowerCase().includes('почт') || cp.toLowerCase().includes('email')) ? (b.email || '') : (b.phone || '');
                            if (val) navigator.clipboard.writeText(val).then(() => toast.success(`Скопировано: ${cp}`));
                            else toast.error('Нет данных для копирования');
                          } } className="text-[10px] text-gray-500 bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded transition-colors">{cp}</button>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="table-cell" onClick={e => { e.stopPropagation(); setStatusModal({ id: b.id, status: b.status }); }}>
                    <span className="cursor-pointer hover:opacity-75 transition-opacity" title="Сменить статус"><StatusBadge status={b.status} /></span>
                  </td>
                  <td className="table-cell hidden xl:table-cell"><span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold" style={BUYER_CAT_STYLE[b.category ?? 'C']} title={b.category ?? 'C'}>{b.category ?? 'C'}</span></td>
                  <td className="table-cell hidden lg:table-cell text-xs text-gray-400">{formatDate(b.createdAt)}{(b.responsibleName || ((store.settings.users || []).find(u => u.id === b.responsibleId)?.name || '')) && <div className="text-[10px] text-gray-400">{b.responsibleName || (store.settings.users || []).find(u => u.id === b.responsibleId)?.name}</div>}</td>
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    {/* ТЗ 1.8: горизонтально; «плей» в зелёном круге — только для НЕактивных; редактирование последним */}
                    <div className="flex items-center gap-1 justify-end">
                      {b.status !== 'Активный' && (
                        <button onClick={() => quickActivate(b.id, b.tradeName, b.status)} title="Активировать на платформе"
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                          style={{ background: 'rgb(209, 250, 229)', color: 'rgb(6, 95, 70)' }}>
                          <Play size={14} />
                        </button>
                      )}
                      <button onClick={() => navigate(`/buyers/${b.id}`)} className="p-1 text-gray-400 hover:text-brand-black transition-colors" title="Редактировать"><Edit2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* ТЗ: подгрузка «Показать ещё» + выбор размера страницы */}
        {buyers.length > listShown && (
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setListShown(v => v + listLimit)} className="btn-secondary text-xs">Показать ещё · осталось {buyers.length - listShown}</button>
            <select className="form-input h-6 py-0 text-[11px] w-auto" value={listLimit} onChange={e => { const n = Number(e.target.value); setListLimit(n); setListShown(n); }} title="Записей на страницу">
              {[50, 100, 300, 500, 1000].map(n => <option key={n} value={n}>{n}/стр.</option>)}
            </select>
          </div>
        )}
      </div>
            {/* Модалка «Создать задачу» по отмеченным */}
      {showTaskForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-base w-full max-w-lg p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Создать задачу ({selected.length} покупателей)</h3>
              <button onClick={() => setShowTaskForm(false)} className="text-gray-400 hover:text-brand-red">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label">Тип задачи</label>
                <select className="form-input" value={taskType} onChange={e => setTaskType(e.target.value)}>
                  {(store.settings.taskTypes || []).map(tt => <option key={tt} value={tt}>{tt}</option>)}
                </select>
              </div>
              <div>
                <label className="form-label">Исполнитель</label>
                <select className="form-input" value={taskResp} onChange={e => setTaskResp(e.target.value)}>
                  <option value="">{u?.name || 'Я'}</option>
                  {(store.settings.users || []).filter(ux => ux.status === 'active').map(ux => <option key={ux.id} value={ux.id}>{ux.name}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">Описание</label>
                <textarea className="form-input min-h-[90px]" placeholder="Что будем делать со списком..." value={taskDesc} onChange={e => setTaskDesc(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={createTaskFromSelection} className="btn-primary text-xs">Создать задачу</button>
              <button onClick={() => setShowTaskForm(false)} className="btn-secondary text-xs">Отмена</button>
            </div>
          </div>
        </div>
      )}

{showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} entityLabel="покупателей" sampleFields={IMPORT_FIELDS} />}
      {statusModal && (
        <StatusChangeModal
          entityType="buyer"
          initial={statusModal.status}
          onClose={() => setStatusModal(null)}
          onSave={(st, comment, archive) => {
            const u = getCurrentUser(); const now = new Date().toISOString();
            updateStore(s => ({
              ...s,
              buyers: s.buyers.map(x => x.id === statusModal.id ? {
                ...x, status: st as (typeof x)['status'], updatedAt: now, deletedAt: archive ? now : x.deletedAt,
                history: [...x.history, { id: generateId(), date: now, field: 'status', oldValue: statusModal.status, newValue: st, comment: comment || undefined, userId: u?.id || '', userName: u?.name || '' }],
              } : x),
            }));
            setStatusModal(null); forceUpdate(n => n + 1); toast.success(`Статус: ${st}`);
            // Активация через модалку = то же действие, что кнопка «+»: предлагаем автозадачу
            if (st === 'Активный' && statusModal.status !== 'Активный') {
              const b2 = getStore().buyers.find(x => x.id === statusModal.id);
              const nm = b2?.tradeName || '';
              if (confirm(`Создать задачу «${SYSTEM_TASK_TYPE}» для покупателя «${nm}»?\nОтветственным будет назначен: ${u?.name || ''}.`)) {
                const task: Task = {
                  id: generateId(), entityType: 'buyer', entityId: statusModal.id, entityName: nm,
                  title: SYSTEM_TASK_TYPE, description: `Автозадача после активации покупателя «${nm}».`,
                  dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
                  createdAt: now, updatedAt: now, createdBy: u?.id || '', responsibleId: u?.id, responsibleName: u?.name,
                  history: [{ id: generateId(), date: now, field: 'created', comment: `Автозадача создана при активации покупателя (${u?.name || ''})`, userId: u?.id || '', userName: u?.name || '' }],
                };
                updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
                toast.success('Задача создана и отправлена в новые');
              }
            }
          }}
        />
      )}
    </div>
  );
}
