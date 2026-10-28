import { useNavigate } from 'react-router-dom';
import { useState, useMemo, useEffect } from 'react';
import { Plus, Upload, Download, Search, Edit2, X, Play } from 'lucide-react';
import { toast } from 'sonner';
import { getStore, updateStore, useStoreVersion } from '@/lib/store';
import { getCurrentUser, canExport } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import { isArchiveStatus, findDuplicate } from '@/lib/dedupe';
import type { Lead } from '@/types';

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/** Автодетект дублей (ТЗ): поиск по ВСЕМ базам — лиды, поставщики, покупатели —
 * по любому из двух полей: ТЕЛЕФОН или Email. Совпадение → «Архив дублей» + архив.
 * Архивные записи (статусы «АРХИВ»/«Архив дублей» и deletedAt) в поиске не участвуют. */
function resolveLeadStatus(lead: Lead, leads: Lead[]): { status: string; deletedAt?: string } {
  const { suppliers, buyers } = getStore();
  const combined = [
    ...leads,
    ...suppliers.map(s => ({ id: s.id, phone: s.phone, email: s.email, status: s.status, deletedAt: s.deletedAt })),
    ...buyers.map(b => ({ id: b.id, phone: b.phone, email: b.email, status: b.status, deletedAt: b.deletedAt })),
  ];
  const dup = findDuplicate(
    { id: lead.id, phone: lead.phone, email: lead.email, status: lead.status, deletedAt: lead.deletedAt },
    combined,
  );
  if (dup) return { status: 'Архив дублей', deletedAt: new Date().toISOString() };
  return { status: lead.status || 'ЛИД' };
}

export default function LeadsPage() {
  useStoreVersion();
  const store = getStore();
  const user = getCurrentUser();

  const navigate = useNavigate();
  const [base, setBase] = useState<{ supplier: boolean; buyer: boolean }>({ supplier: false, buyer: true }); // ТЗ: по умолчанию «Покупатели»
  const [query, setQuery] = useState('');
  // ТЗ: подгрузка списка «Показать ещё»
  const [listLimit, setListLimit] = useState(50);
  const [listShown, setListShown] = useState(50);
  const [filterType, setFilterType] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [massStatus, setMassStatus] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskType, setTaskType] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskResp, setTaskResp] = useState(''); // исполнитель задачи (по умолчанию — текущий пользователь)
  const [statusModalChoice, setStatusModalChoice] = useState('');
const [rowStatus, setRowStatus] = useState<{ id: string; name: string } | null>(null); // ТЗ 1.8: смена статуса строки по клику
const [rowStatusChoice, setRowStatusChoice] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<Lead>({ id: '', type: 'supplier', tradeName: '', inn: '', subType: '', city: '', contactName: '', status: 'ЛИД', phone: '', email: '', comment: '', createdAt: '' });

  const statuses = useMemo(() => (store.settings.statuses || []).filter(s => s.entityTypes.includes('lead')).sort((a, b) => (a.order ?? 99) - (b.order ?? 99)), [store.settings.statuses]);
  // ТЗ v1.21.5: у менеджера с заданной базой лидов — весь раздел показывает только её.
  const allLeads = (store.settings.leads || []).filter(x => !(user?.role === 'manager' && user.leadsBase) || x.type === (user.leadsBase === 'buyers' ? 'buyer' : 'supplier'));

  const activeTypes = base.supplier && !base.buyer ? (store.settings as any).supplierTypes || []
    : base.buyer && !base.supplier ? (store.settings as any).buyerTypes || []
    : [...((store.settings as any).supplierTypes || []), ...((store.settings as any).buyerTypes || [])];

  const isArchived = (x: Lead) => Boolean(x.deletedAt) || isArchiveStatus(x.status);
  const list = useMemo(() => {
    // ТЗ: «Архив» показывает ТОЛЬКО архивные записи, живые — только без архива
    let l = allLeads.filter(x => (showArchived ? isArchived(x) : !isArchived(x)) && ((base.supplier && x.type === 'supplier') || (base.buyer && x.type === 'buyer')));
    const q = query.toLowerCase();
    if (q) l = l.filter(x => [x.tradeName, x.city, x.contactName, x.phone, x.email, x.comment].some(v => (v || '').toLowerCase().includes(q)));
    if (filterType) l = l.filter(x => x.type === filterType);
    if (filterCity) l = l.filter(x => x.city === filterCity);
    if (filterStatus) l = l.filter(x => x.status === filterStatus);
    return l;
  }, [allLeads, base, query, filterType, filterCity, filterStatus, showArchived]);
  useEffect(() => { setListShown(listLimit); }, [list]); // сброс подгрузки при смене фильтров/поиска


  const cities = useMemo(() => Array.from(new Set(allLeads.map(l => l.city).filter(Boolean))).sort(), [allLeads]);
  // ТЗ 1.8: считаем всех по типу базы; архивные/удалённые — только для архивных статусов (пилюли «Архив дублей»/«АРХИВ»)
  const statusCounts: Record<string, number> = {};
  for (const x of allLeads.filter(x => ((base.supplier && x.type === 'supplier') || (base.buyer && x.type === 'buyer')) && (!x.deletedAt && !isArchiveStatus(x.status)))) {
    statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
  }
  for (const x of allLeads.filter(x => ((base.supplier && x.type === 'supplier') || (base.buyer && x.type === 'buyer')) && (x.deletedAt || isArchiveStatus(x.status)))) {
    statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
  }

    // ТЗ 1.8: создать покупателя/поставщика из лида; лид уходит в «Архив дублей»
  function convertFromLead(l: Lead) {
    const now = new Date().toISOString();
    const u = getCurrentUser();
    const newId = generateId();
    if (l.type === 'supplier') {
      updateStore(s => ({ ...s, suppliers: [...s.suppliers, {
        id: newId, tradeName: l.tradeName, inn: l.inn, type: (l as { subType?: string }).subType || 'Поставщик/склад', city: l.city,
        contactName: l.contactName, phone: l.phone, email: l.email, comment: l.comment,
        status: 'Лид CRM', responsibleId: u?.id, services: ['DBS'], productGroups: [], ownBrands: [],
        companyScore: 5, category: 'C', history: [], createdAt: now, updatedAt: now,
      } as unknown as (typeof s.suppliers)[number]] }));
      navigate(`/suppliers/${newId}`);
    } else {
      updateStore(s => ({ ...s, buyers: [...s.buyers, {
        id: newId, tradeName: l.tradeName, inn: l.inn, type: (l as { subType?: string }).subType || 'СТО', city: l.city,
        contactName: l.contactName, phone: l.phone, email: l.email, comment: l.comment,
        status: 'Лид CRM', responsibleId: u?.id, companyScore: 5, category: 'C', history: [], createdAt: now, updatedAt: now,
      } as unknown as (typeof s.buyers)[number]] }));
      navigate(`/buyers/${newId}`);
    }
    commit(allLeads.map(x => x.id === l.id ? { ...x, status: 'Архив дублей', updatedAt: now, deletedAt: now } : x));
    toast.success(`${l.type === 'supplier' ? 'Поставщик' : 'Покупатель'} создан из лида — лид в архиве дублей`);
  }

function commit(leads: Lead[]) {
    updateStore(s => ({ ...s, settings: { ...s.settings, leads } }));
  }

  function saveLead(isNew: boolean) {
    if (!form.tradeName.trim()) { toast.error('Торговое название — обязательное поле'); return; }
    if (!form.phone.trim()) { toast.error('Телефон — обязательное поле'); return; }
    if (!form.email.trim()) { toast.error('Email — обязательное поле'); return; }
    // ТЗ: архивные статусы требуют подтверждения фразой «согласен»
    if (isArchiveStatus(form.status) && window.prompt('Перевод в архив. Введите фразу «согласен» для подтверждения:')?.trim().toLowerCase() !== 'согласен') {
      toast.error('Подтверждение фразой «согласен» обязательно — статус не изменён'); return;
    }
    // ТЗ 1.8: автосмена на «Архив дублей» при совпадении ИНН/ОГРНИП/телефона/email с базой покупателей или поставщиков
    const norm = (v?: string) => (v || '').replace(/\D/g, '');
    const lInn = norm(form.inn);
    const lPhone = norm(form.phone);
    const lEmail = (form.email || '').trim().toLowerCase();
    const inBase = (x: { deletedAt?: string; inn?: string; ogrnip?: string; phone?: string; email?: string }) => !x.deletedAt && !!(
      (lInn && lInn.length >= 10 && (norm(x.inn) === lInn || norm(x.ogrnip) === lInn)) ||
      (lPhone && lPhone.length >= 10 && norm(x.phone) === lPhone) ||
      (lEmail && (x.email || '').trim().toLowerCase() === lEmail)
    );
    if (getStore().suppliers.some(inBase) || getStore().buyers.some(inBase)) {
      form.status = 'Архив дублей';
      toast('Совпадение с базой покупателей/поставщиков — лид переведён в «Архив дублей»');
    }
    const now = new Date().toISOString();
    const others = allLeads.filter(l => l.id !== form.id);
    const resolved = resolveLeadStatus(form, others);
    if (isNew) {
      const lead: Lead = { ...form, id: uid(), createdAt: now, createdBy: user?.name, status: resolved.status, deletedAt: resolved.deletedAt ?? (isArchiveStatus(form.status) ? now : undefined) };
      commit([...allLeads, lead]);
      toast.success(resolved.deletedAt ? `Лид добавлен в архив: ${resolved.status}` : 'Лид добавлен');
    } else {
      // архивный статус → deletedAt; разархивация снимает deletedAt
      const deletedAt = resolved.deletedAt ?? (isArchiveStatus(form.status) ? now : undefined);
      commit(allLeads.map(l => l.id === form.id ? { ...form, status: resolved.status, deletedAt, updatedAt: now } : l));
      toast.success('Лид обновлён');
    }
    setShowAdd(false); setEditing(null);
    setForm({ id: '', type: 'supplier', tradeName: '', inn: '', subType: '', city: '', contactName: '', status: 'ЛИД', phone: '', email: '', comment: '', createdAt: '' });
  }

  /** Пакетный перенос в архив (кнопка в панели массовых действий) */
  function archiveSelected() {
    if (!selected.size) return;
    const now = new Date().toISOString();
    commit(allLeads.map(l => selected.has(l.id) ? { ...l, deletedAt: now, status: 'АРХИВ', updatedAt: now } : l));
    toast.success(`${selected.size} лидов перенесено в архив`);
    setSelected(new Set());
  }

  /** Восстановление из архива. Статус «Архив дублей» восстановить НЕЛЬЗЯ (ТЗ). */
  function restoreSelected() {
    if (!selected.size) return;
    const now = new Date().toISOString();
    let skipped = 0;
    commit(allLeads.map(l => {
      if (!selected.has(l.id)) return l;
      if (l.status === 'Архив дублей') { skipped++; return l; }
      return { ...l, deletedAt: undefined, status: 'ЛИД', updatedAt: now };
    }));
    toast.success(`Восстановлено: ${selected.size - skipped}${skipped ? `, пропущено («Архив дублей»): ${skipped}` : ''}`);
    setSelected(new Set());
  }

  function applyMass() {
    if (!massStatus || !selected.size) return;
    // ТЗ: архивные статусы требуют подтверждения фразой «согласен»
    if (isArchiveStatus(massStatus) && window.prompt('Перевод в архив. Введите фразу «согласен» для подтверждения:')?.trim().toLowerCase() !== 'согласен') {
      toast.error('Подтверждение фразой «согласен» обязательно — статус не изменён'); return;
    }
    const now = new Date().toISOString();
    commit(allLeads.map(l => selected.has(l.id) ? { ...l, status: massStatus, updatedAt: now, deletedAt: isArchiveStatus(massStatus) ? now : l.deletedAt } : l));
    toast.success(`Статус «${massStatus}» применён к ${selected.size} лидам`);
    setSelected(new Set()); setMassStatus('');
  }

  /** Создание задачи по выбранным лидам + ссылка на Excel-экспорт в описании */
  function createTaskFromSelection() {
    if (!selected.size) return;
    const u = getCurrentUser();
    const respUser = (store.settings.users || []).find(x => x.id === (taskResp || u?.id)) || u;
    const now = new Date().toISOString();
    const taskId = generateId();
    const type = taskType || (store.settings.taskTypes || [])[0] || 'Обратная связь';
    const task = {
      id: taskId,
      entityType: 'leads',
      entityName: `База лидов (${selected.size} лидов)`,
      title: type,
      description: `${taskDesc.trim() || 'Работа со списком лидов'}\n—\nСкачать Excel со списком (доступно только в панели CRM): /leads-export/${taskId}`,
      dueDate: now.split('T')[0],
      taskStatus: 'Новая' as const,
      completed: false,
      priority: 0,
      createdAt: now,
      updatedAt: now,
      createdBy: u?.id,
      responsibleId: respUser?.id,
      responsibleName: respUser?.name,
      leadIds: Array.from(selected),
      exportKind: 'leads' as const,
      history: [{ id: generateId(), date: now, field: 'created', newValue: 'Задача создана из базы лидов', userId: u?.id || '', userName: u?.name || '' }],
    };
    updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
    setShowTaskForm(false); setTaskType(''); setTaskDesc(''); setTaskResp('');
    toast.success('Задача создана');
    // ТЗ: после создания — предложение сменить статус выбранным лидам
    setStatusModalChoice('');
    setShowStatusModal(true);
  }

  /** Применение статуса к выбранным лидам из пост-задачной модалки */
  function applyStatusAfterTask() {
    if (!statusModalChoice) { toast.error('Выберите статус'); return; }
    const now = new Date().toISOString();
    commit(allLeads.map(l => selected.has(l.id) ? { ...l, status: statusModalChoice, updatedAt: now, deletedAt: isArchiveStatus(statusModalChoice) ? now : l.deletedAt } : l));
    toast.success(`Статус «${statusModalChoice}» применён к ${selected.size} лидам`);
    setSelected(new Set());
    setStatusModalChoice('');
    setShowStatusModal(false);
  }

  function exportCSV() {
    const rows = [['Тип', 'Подтип', 'ИНН/ОГРНИП', 'Торговое название', 'Город', 'ФИО', 'Статус', 'Телефон', 'Email', 'Комментарий']];
    for (const l of list) rows.push([l.type === 'supplier' ? 'Поставщик' : 'Покупатель', l.subType || '', l.inn || '', l.tradeName, l.city, l.contactName, l.status, l.phone, l.email, l.comment]);
    const csv = rows.map(r => r.map(c => `"${String(c || '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
    a.download = 'baza-lidov.csv'; a.click();
  }

  function importCSV(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = String(reader.result).split(/\r?\n/).filter(l => l.trim());
      const added: Lead[] = [...allLeads];
      let count = 0;
      for (const line of lines) {
        const c = line.split(';').map(x => x.replace(/^"|"$/g, '').trim());
        if (c.length < 4 || /торговое/i.test(c[1] || '')) continue;
        const type = /покуп/i.test(c[0] || '') ? 'buyer' : 'supplier';
        // ТЗ: ИНН — системное поле; опорные колонки: Тип;Подтип;ИНН;Торговое название;Город;ФИО;Статус;Телефон;Email;Комментарий
        const lead: Lead = { id: uid(), type, subType: c[1] || '', inn: c[2] || '', tradeName: c[3] || '', city: c[4] || '', contactName: c[5] || '', status: c[6] || 'ЛИД', phone: c[7] || '', email: c[8] || '', comment: c[9] || '', createdAt: new Date().toISOString(), createdBy: user?.name };
        if (!lead.tradeName || !lead.phone || !lead.email) continue;
        const r = resolveLeadStatus(lead, added);
        added.push({ ...lead, status: r.status, deletedAt: r.deletedAt });
        count++;
      }
      commit(added);
      toast.success(`Импортировано лидов: ${count}`);
    };
    reader.readAsText(file);
  }

  const noBase = !base.supplier && !base.buyer;
  const openForm = (l?: Lead) => {
    if (l) { setEditing(l); setForm({ ...l }); } else { setEditing(null); setForm({ id: '', type: base.buyer && !base.supplier ? 'buyer' : 'supplier', tradeName: '', inn: '', subType: '', city: '', contactName: '', status: 'ЛИД', phone: '', email: '', comment: '', createdAt: '' }); }
    setShowAdd(true);
  };

  return (
    <div className="space-y-4">
      {/* v1.31.5: без вложенного контейнера — padding 0, кнопки прямо в панели */}
      <div className="actions-bar flex flex-wrap items-center justify-start gap-2">
          <button onClick={() => setBase({ supplier: false, buyer: true })} className={`action-btn text-xs py-1.5 ${base.buyer ? 'action-btn-active' : ''}`}>Покупатели</button>
          <button onClick={() => setBase({ supplier: true, buyer: false })} className={`action-btn text-xs py-1.5 ${base.supplier ? 'action-btn-active' : ''}`}>Поставщики</button>
          {canExport() && (<button onClick={() => { setShowImport(true); setImportFile(null); }} className="action-btn text-xs py-1.5 flex items-center gap-1.5">
            <Upload size={13} /> Импорт
          </button>)}
          {canExport() && (<button onClick={exportCSV} className="action-btn text-xs py-1.5 flex items-center gap-1.5"><Download size={13} /> Экспорт</button>)}
          <button onClick={() => openForm()} className="action-btn text-xs flex items-center gap-1.5"><Plus size={13} /> Добавить</button>
      </div>

      {/* Мини-аналитика по базе лидов (ТЗ) */}
      {(() => {
        const live = allLeads.filter(x => !isArchived(x));
        const buyers = live.filter(x => x.type === 'buyer');
        const suppliersL = live.filter(x => x.type === 'supplier');
        const bySub = (arr: Lead[]) => {
          const m: Record<string, number> = {};
          for (const x of arr) m[x.subType || 'Без типа'] = (m[x.subType || 'Без типа'] || 0) + 1;
          return Object.entries(m).sort((a, b) => b[1] - a[1]);
        };
        return (
          <div className="card-base p-4">
            <h3 className="section-title mb-3">Сводка по базе лидов</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="stat-card p-3"><p className="text-xs text-gray-500">Всего в базе лидов</p><p className="text-xl font-bold">{live.length}</p></div>
              <div className="stat-card p-3">
                <p className="text-xs text-gray-500">Всего покупателей</p><p className="text-xl font-bold">{buyers.length}</p>
                <div className="mt-1 space-y-0.5">{bySub(buyers).map(([t, n]) => <p key={t} className="text-[11px] text-gray-500 flex justify-between"><span>{t}</span><span className="font-semibold">{n}</span></p>)}</div>
              </div>
              <div className="stat-card p-3">
                <p className="text-xs text-gray-500">Всего поставщиков</p><p className="text-xl font-bold">{suppliersL.length}</p>
                <div className="mt-1 space-y-0.5">{bySub(suppliersL).map(([t, n]) => <p key={t} className="text-[11px] text-gray-500 flex justify-between"><span>{t}</span><span className="font-semibold">{n}</span></p>)}</div>
              </div>
              <div className="stat-card p-3"><p className="text-xs text-gray-500">В архиве</p><p className="text-xl font-bold">{allLeads.filter(isArchived).length}</p></div>
            </div>
          </div>
        );
      })()}

      {/* Поиск и фильтры */}
      <div className="card-base p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="form-input pl-8 text-xs" placeholder="Поиск по названию, городу, ФИО, телефону, email..." value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <select className="form-input py-1.5 text-xs w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">Тип: все</option>
            {activeTypes.map(tp => <option key={tp} value={tp}>{tp}</option>)}
          </select>
          <select className="form-input py-1.5 text-xs w-auto" value={filterCity} onChange={e => setFilterCity(e.target.value)}>
            <option value="">Все города</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={() => setShowArchived(v => !v)} className={`action-btn text-xs py-1.5 ${showArchived ? 'bg-gray-200' : ''}`}>{showArchived ? 'Архив ✓' : 'Архив'}</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilterStatus('')} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterStatus === '' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>Все</button>
          {/* ТЗ 1.8: архивные пилюли («АРХИВ», «Архив дублей») видны только когда нажата кнопка «Архив» */}
          {statuses.filter(s => showArchived || (s.name !== 'АРХИВ' && s.name !== 'Архив дублей')).map(s => (
            <button key={s.id} onClick={() => setFilterStatus(filterStatus === s.name ? '' : s.name)} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterStatus === s.name ? 'text-white border-transparent' : 'border-brand-gray-mid text-gray-500'}`} style={filterStatus === s.name ? { backgroundColor: s.color || '#111' } : {}}>
              {s.name} <span className="ml-1 font-semibold">{statusCounts[s.name] || 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Пакетные действия: в архиве — восстановление, в живых — смена статуса / задача / архив */}
      {selected.size > 0 && (
        <div className="card-base p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">Выбрано: {selected.size}</span>
          {!showArchived && (
            <>
              <select className="form-input py-1.5 text-xs w-auto" value={massStatus} onChange={e => setMassStatus(e.target.value)}>
                <option value="">Сменить статус...</option>
                {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
              <button onClick={applyMass} className="action-btn text-xs">Применить</button>
            </>
          )}
          {!showArchived && (
            <button onClick={() => { setShowTaskForm(true); setTaskType(''); setTaskDesc(''); }} className="action-btn text-xs flex items-center gap-1"><Plus size={12} /> Создать задачу</button>
          )}
          {!showArchived ? (
            <button onClick={archiveSelected} className="action-btn text-xs">Перенести в архив</button>
          ) : (
            <button onClick={restoreSelected} className="action-btn text-xs">Восстановить из архива</button>
          )}
          <button onClick={() => setSelected(new Set())} className="action-btn text-xs">Снять выбор</button>
        </div>
      )}

      {noBase ? (
        <div className="card-base p-10 text-center text-gray-400 text-sm">Выберите базу лидов: «Поставщики» и/или «Покупатели»</div>
      ) : (
        <div className="card-base p-0 overflow-hidden">
          <div className="table-scroll"><table className="w-full">
            <thead><tr className="border-b border-brand-gray-mid">
              <th className="table-header w-8"><input type="checkbox" checked={list.length > 0 && list.every(l => selected.has(l.id))} onChange={e => setSelected(e.target.checked ? new Set(list.map(l => l.id)) : new Set())} /></th>
              <th className="table-header text-left">Тип</th>
              <th className="table-header text-left">Торговое название *</th>
              <th className="table-header text-left">ИНН/ОГРНИП</th>
              <th className="table-header text-left">Город</th>
              <th className="table-header text-left">ФИО</th>
              <th className="table-header text-left">Статус</th>
              <th className="table-header text-left">Телефон *</th>
              <th className="table-header text-left">Email *</th>
              <th className="table-header text-left">Комментарий</th>
              <th className="table-header"></th>
            </tr></thead>
            <tbody>
              {list.slice(0, listShown).map(l => (
                <tr key={l.id} className={`border-b border-brand-gray-mid last:border-0 hover:bg-brand-gray ${l.deletedAt || isArchiveStatus(l.status) ? 'opacity-50' : ''}`}>
                  <td className="table-cell"><input type="checkbox" checked={selected.has(l.id)} onChange={e => { const n = new Set(selected); e.target.checked ? n.add(l.id) : n.delete(l.id); setSelected(n); }} /></td>
                  <td className="table-cell text-xs">{l.type === 'supplier' ? 'Поставщик' : 'Покупатель'}</td>
                  <td className="table-cell font-medium text-xs">{l.tradeName}</td>
                  <td className="table-cell text-xs whitespace-nowrap">{l.inn || '—'}</td>
                  <td className="table-cell text-xs">{l.city}</td>
                  <td className="table-cell text-xs">{l.contactName}</td>
                  <td className="table-cell text-xs" onClick={e => { e.stopPropagation(); setRowStatus({ id: l.id, name: l.status }); setRowStatusChoice(l.status); }} title="Сменить статус">
                    <span className="px-2 py-0.5 rounded-full text-white text-[11px] cursor-pointer hover:opacity-80 transition-opacity" style={{ backgroundColor: statuses.find(s => s.name === l.status)?.color || '#6B7280' }}>{l.status}</span>
                  </td>
                  <td className="table-cell text-xs whitespace-nowrap">{l.phone}</td>
                  <td className="table-cell text-xs">{l.email}</td>
                  <td className="table-cell text-xs max-w-[200px] truncate" title={l.comment}>{l.comment}</td>
                  <td className="table-cell whitespace-nowrap">
                    <div className="flex items-center gap-1 justify-end">
                      {/* ТЗ 1.8: создать покупателя/поставщика из лида — лид уходит в архив дублей */}
                      {/* ТЗ 1.8: доступно только для живых лидов — в архиве кнопка скрыта */}
                      {!isArchiveStatus(l.status) && !l.deletedAt && (
                      <button onClick={() => convertFromLead(l)} title={`Создать ${l.type === 'supplier' ? 'поставщика' : 'покупателя'} и отправить лид в архив`}
                        className="w-7 h-7 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
                        style={{ background: '#03A9F4', color: 'rgb(254 255 255)' }}>
                        <Play size={14} />
                      </button>
                      )}
                      <button onClick={() => openForm(l)} className="p-1 text-gray-400 hover:text-brand-blue" title="Редактировать"><Edit2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={11} className="table-cell text-center text-gray-400 py-8 text-sm">Лиды не найдены</td></tr>}
            </tbody>
          </table></div>
          {/* ТЗ: подгрузка «Показать ещё» + выбор размера страницы */}
          {list.length > listShown && (
            <div className="flex items-center justify-between pt-1">
              <button onClick={() => setListShown(v => v + listLimit)} className="action-btn text-xs">Показать ещё · осталось {list.length - listShown}</button>
              <select className="form-input h-6 py-0 text-[11px] w-auto" value={listLimit} onChange={e => { const n = Number(e.target.value); setListLimit(n); setListShown(n); }} title="Записей на страницу">
                {[50, 100, 300, 500, 1000].map(n => <option key={n} value={n}>{n}/стр.</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Модалка полного импорта (как в Поставщиках/Покупателях) */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-base w-full max-w-lg p-6 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="section-title">Импорт лидов из CSV</h3>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Колонки (разделитель «;»): <b>Тип;Подтип;ИНН;Торговое название;Город;ФИО;Статус;Телефон;Email;Комментарий</b>. Первая строка — заголовок. Обязательные: Торговое название, Телефон, Email.</p>
            <input type="file" accept=".csv" className="form-input text-xs" onChange={e => setImportFile(e.target.files?.[0] || null)} />
            <div className="flex gap-2 mt-4">
              <button onClick={() => { if (importFile) { importCSV(importFile); setShowImport(false); } else toast.error('Выберите файл'); }} className="action-btn text-xs" disabled={!importFile}>Импортировать</button>
              <button onClick={() => setShowImport(false)} className="action-btn text-xs">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Форма добавления/редактирования */}
      {showAdd && (
        <div className="card-base p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">{editing ? 'Редактировать лида' : 'Новый лид'}</h3>
            <button onClick={() => { setShowAdd(false); setEditing(null); }} className="text-gray-400 hover:text-brand-red"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="form-label">Тип</label>
              <select className="form-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as 'supplier' | 'buyer' }))}>
                <option value="supplier">Поставщик</option><option value="buyer">Покупатель</option>
              </select></div>
            <div><label className="form-label">Торговое название *</label><input className="form-input" value={form.tradeName} onChange={e => setForm(f => ({ ...f, tradeName: e.target.value }))} /></div>
            <div><label className="form-label">ИНН/ОГРНИП</label><input className="form-input" value={form.inn || ''} onChange={e => setForm(f => ({ ...f, inn: e.target.value }))} /></div>
            <div><label className="form-label">Тип (из справочника)</label>
              <select className="form-input" value={form.subType || ''} onChange={e => setForm(f => ({ ...f, subType: e.target.value }))}>
                <option value="">— не указан —</option>
                {((form.type === 'buyer' ? (store.settings as any).buyerTypes : (store.settings as any).supplierTypes) || []).map((tp: string) => <option key={tp} value={tp}>{tp}</option>)}
              </select></div>
            <div><label className="form-label">Город</label><input className="form-input" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></div>
            <div><label className="form-label">ФИО</label><input className="form-input" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
            <div><label className="form-label">Статус</label>
              <select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {statuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select></div>
            <div><label className="form-label">Телефон *</label><input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="form-label">Email *</label><input className="form-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div className="sm:col-span-2"><label className="form-label">Комментарий</label><input className="form-input" value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} /></div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => saveLead(!editing)} className="action-btn text-xs">Сохранить</button>
            <button onClick={() => { setShowAdd(false); setEditing(null); }} className="action-btn text-xs">Отмена</button>
          </div>
        </div>
      )}

      {/* Форма создания задачи по выбранным лидам */}
      {showTaskForm && (
        <div className="card-base p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="section-title">Создать задачу ({selected.size} лидов)</h3>
            <button onClick={() => setShowTaskForm(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button>
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
                <option value="">{user?.name || 'Я'}</option>
                {(store.settings.users || []).filter(ux => ux.status === 'active').map(ux => (
                  <option key={ux.id} value={ux.id}>{ux.name}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="form-label">Описание — что будем делать со списком</label>
              <textarea className="form-input min-h-[90px]" placeholder="Например: обзвонить, отправить КП..." value={taskDesc} onChange={e => setTaskDesc(e.target.value)} />
              <p className="text-xs text-gray-400 mt-1">В описание будет добавлена ссылка на Excel со списком (открывается только из панели CRM).</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={createTaskFromSelection} className="action-btn text-xs">Создать задачу</button>
            <button onClick={() => setShowTaskForm(false)} className="action-btn text-xs">Отмена</button>
          </div>
        </div>
      )}

      {/* Пост-задачная модалка: смена статуса выбранным лидам */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card-base p-5 w-full max-w-md animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title">Сменить статус {selected.size} лидов?</h3>
              <button onClick={() => setShowStatusModal(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button>
            </div>
            <p className="text-xs text-gray-500 mb-3">Задача создана. Выберите новый статус для отмеченных лидов и подтвердите.</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {statuses.map(s => (
                <button key={s.id} onClick={() => setStatusModalChoice(s.name)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${statusModalChoice === s.name ? 'text-white border-transparent' : 'border-brand-gray-mid text-gray-500'}`}
                  style={statusModalChoice === s.name ? { backgroundColor: s.color || '#111' } : {}}>
                  {s.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={applyStatusAfterTask} className="action-btn text-xs">Согласен</button>
              <button onClick={() => setShowStatusModal(false)} className="action-btn text-xs">Отмена</button>
            </div>
          </div>
        </div>
      )}
      {/* ТЗ 1.8: смена статуса лида по клику на статус в строке */}
      {rowStatus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRowStatus(null)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="section-title mb-3">Сменить статус</h3>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {statuses.map(s => (
                <button key={s.id} onClick={() => setRowStatusChoice(s.name)}
                  className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors ${rowStatusChoice === s.name ? 'text-white border-transparent' : 'border-brand-gray-mid text-gray-500'}`}
                  style={rowStatusChoice === s.name ? { backgroundColor: s.color || '#111' } : {}}>
                  {s.name}
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRowStatus(null)} className="action-btn text-xs">Отмена</button>
              <button onClick={() => {
                if (!rowStatusChoice) return;
                const now = new Date().toISOString();
                // ТЗ 1.8: как в массовой смене — архивные статусы ставят deletedAt
                commit(allLeads.map(x => x.id === rowStatus.id ? { ...x, status: rowStatusChoice, updatedAt: now, deletedAt: isArchiveStatus(rowStatusChoice) ? now : undefined } : x));
                toast.success(`Статус изменён: ${rowStatusChoice}`);
                setRowStatus(null);
              }} className="action-btn text-xs">Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>


  );
}
