import { Fragment, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStore, updateStore, useStoreVersion } from '@/lib/store';
import { apiFilesUploadFile } from '@/lib/api';
import { generateId, formatDate } from '@/lib/utils';
import { isAdmin, canSeeMedia, getCurrentUser } from '@/lib/auth';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import type { MediaRecord, MediaDurationOption, MarketNewsItem, MediaContract } from '@/types';
import {Plus, Search, X, Edit2, Trash2, AlertTriangle, Clock, ChevronDown, ChevronUp, Save, History} from 'lucide-react';
import { toast } from 'sonner';

function isEndingSoon(endDate: string): boolean {
  const diff = (new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 14;
}
function daysLeft(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}
function getDurationText(startDate: string, endDate: string): string {
  const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 0) return '—';
  const months = Math.round(days / 30.44);
  return months === 0 ? `${days} дн.` : `${months} мес.`;
}

export default function MediaPage() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const navigate = useNavigate();
  const [, forceUpdate] = useState(0);
  const store = getStore();

  const [search, setSearch] = useState('');
  const [filterAdType, setFilterAdType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterResponsible, setFilterResponsible] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
// v_1.9: удаление через модалку «Введите УДАЛИТЬ» → автостатус «Аннулирован»
const [deleteId, setDeleteId] = useState<string | null>(null);
const [deleteWord, setDeleteWord] = useState('');

  // Expandable rows state
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [historyRecordId, setHistoryRecordId] = useState<string | null>(null); // v1.30.61: просмотр истории записи
  // v1.30.62: раздел «Договора»
  // v1.30.69: вид «Новости рынка»
  const [view, setView] = useState<'placements' | 'contracts' | 'news'>('placements');
  const [showNewsForm, setShowNewsForm] = useState(false);
  const [editingNewsId, setEditingNewsId] = useState<string | null>(null);
  const [mnSupplierId, setMnSupplierId] = useState('');
  const [mnTitle, setMnTitle] = useState('');
  const [mnLink, setMnLink] = useState('');
  const [mnText, setMnText] = useState('');
  const [mnImage, setMnImage] = useState('');
  const [mnStatus, setMnStatus] = useState<'Новая' | 'Опубликована' | 'Аннулирована'>('Новая');
  const [mnDate, setMnDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mnBusy, setMnBusy] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [mcSupplierId, setMcSupplierId] = useState('');
  const [mcNo, setMcNo] = useState('');
  const [mcDate, setMcDate] = useState('');
  const [mcStatus, setMcStatus] = useState<'Новый' | 'Активный' | 'Не активный'>('Новый');
  const [historyContractId, setHistoryContractId] = useState<string | null>(null);
  // v1.30.63: материал размещения (описание + файлы-картинки)
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [materialDescBuffer, setMaterialDescBuffer] = useState('');
  const [materialFilesBuffer, setMaterialFilesBuffer] = useState<string[]>([]);
  const [materialBusy, setMaterialBusy] = useState(false);

  // v1.30.62: активный (или последний) договор поставщика — подставляется в размещение автоматически
  function autoContract(supplierId: string) {
    const list = (store.settings.mediaContracts || []).filter(c => c.supplierId === supplierId);
    if (!list.length) return null;
    return list.find(c => c.status === 'Активный' && c.contractNo) || list.find(c => c.status === 'Активный') || [...list].sort((a, b) => String(b.contractDate).localeCompare(String(a.contractDate)))[0];
  }
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [notesBuffer, setNotesBuffer] = useState('');

  const mediaAdTypes = store.settings.mediaAdTypes || [];
  const mediaStatuses = store.settings.mediaStatuses || [];
  const activeSuppliers = store.suppliers.filter(s => !s.deletedAt);

  type FormState = Partial<MediaRecord> & { _selectedAdTypeId?: string };
  const emptyForm = (): FormState => ({
    supplierId: '', supplierName: '',
    adTypeId: '', adTypeName: '',
    durationOptionId: '', durationLabel: '',
    pricePerMonth: 0, totalPrice: 0,
    status: mediaStatuses[0]?.name || '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '', notes: '', expandedNotes: '',
    _selectedAdTypeId: '',
  });
  const [form, setForm] = useState<FormState>(emptyForm());

  // Get duration options for selected ad type
  const selectedAdType = mediaAdTypes.find(t => t.id === form.adTypeId);
  const durationOptions: MediaDurationOption[] = selectedAdType?.durationOptions || [];

  const records = useMemo(() => {
    let list = (store.mediaRecords || []).filter(r => showArchived ? !!r.deletedAt : !r.deletedAt).filter(canSeeMedia); // фильтры форматов/длительности/статусов менеджера (v1.20.9)
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r => r.supplierName.toLowerCase().includes(q) || r.adTypeName.toLowerCase().includes(q) || r.status.toLowerCase().includes(q));
    }
    if (filterAdType) list = list.filter(r => r.adTypeId === filterAdType);
    if (filterStatus) list = list.filter(r => r.status === filterStatus);
    if (filterResponsible === '__none__') list = list.filter(r => !r.responsibleId);
    else if (filterResponsible) list = list.filter(r => r.responsibleId === filterResponsible);
    if (filterDateFrom) list = list.filter(r => r.endDate >= filterDateFrom);
    if (filterDateTo) list = list.filter(r => r.startDate <= filterDateTo);
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [store.mediaRecords, search, filterAdType, filterStatus, filterDateFrom, filterDateTo, showArchived, filterResponsible]);

  function openAdd() { setEditingId(null); setForm(emptyForm()); setShowForm(true); }
  function openEdit(record: MediaRecord) { setEditingId(record.id); setForm({ ...record }); setShowForm(true); }

  function handleSupplierChange(supplierId: string) {
    const sup = activeSuppliers.find(s => s.id === supplierId);
    setForm(f => ({ ...f, supplierId, supplierName: sup?.tradeName || '' }));
  }

  function handleAdTypeChange(adTypeId: string) {
    const at = mediaAdTypes.find(t => t.id === adTypeId);
    setForm(f => ({ ...f, adTypeId, adTypeName: at?.name || '', durationOptionId: '', durationLabel: '', pricePerMonth: at?.pricePerMonth || 0, totalPrice: 0 }));
  }

  function handleDurationChange(optId: string) {
    const at = mediaAdTypes.find(t => t.id === form.adTypeId);
    const opt = at?.durationOptions.find(o => o.id === optId);
    if (!opt) return;
    // Auto-set end date
    const start = form.startDate ? new Date(form.startDate) : new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + opt.periodMonths);
    setForm(f => ({
      ...f,
      durationOptionId: optId,
      durationLabel: opt.periodLabel,
      pricePerMonth: at?.pricePerMonth || 0,
      totalPrice: opt.totalPrice,
      // v1.30.67: скидка по тарифу — для показа в таблице
      discount: opt.discount || 0,
      endDate: end.toISOString().split('T')[0],
    }));
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplierId) { toast.error('Выберите рекламодателя'); return; }
    // v_1.9: тип рекламы необязателен — пустой допустим
    // v1.30.49: даты обязательны только при статусе «Опубликовано»
    if (form.status === 'Опубликовано' && !form.startDate) { toast.error('Укажите дату начала'); return; }
    if (form.status === 'Опубликовано' && !form.endDate) { toast.error('Укажите дату окончания'); return; }
    const now = new Date().toISOString();
    const { _selectedAdTypeId: _unused, ...rest } = form;
    // v1.30.62: договор поставщика подставляется автоматически
    const ac = autoContract(form.supplierId || '');
    // v1.30.67: без договора размещение создать невозможно
    if (!ac) { toast.error('У поставщика нет договора — создайте его в разделе «Договора»'); return; }
    const restWithContract = { ...rest, contractNo: ac.contractNo, contractDate: ac.contractDate } as MediaRecord;
    // v1.30.61: фиксируем изменения в истории записи
    const histEntry = { at: now, by: getCurrentUser()?.name || '—', action: editingId ? 'Размещение изменено' : 'Размещение создано' };
    if (editingId) {
      updateStore(s => ({ ...s, mediaRecords: (s.mediaRecords || []).map(r => r.id === editingId ? { ...r, ...restWithContract, updatedAt: now, history: [...(r.history || []), histEntry].slice(-200) } : r) }));
      toast.success('Размещение обновлено');
    } else {
      const record: MediaRecord = { ...restWithContract, ...(form.adTypeId ? {} : { adTypeId: '', adTypeName: '—' }), id: generateId(), createdAt: now, updatedAt: now, history: [histEntry] }; // v_1.9: без типа рекламы
      updateStore(s => ({ ...s, mediaRecords: [...(s.mediaRecords || []), record] }));
      toast.success('Размещение добавлено');
    }
    setShowForm(false); setEditingId(null); forceUpdate(n => n + 1);
  }

  // v1.30.62: CRUD договоров размещений
  function openContractForm(c?: MediaContract) {
    if (c) {
      setEditingContractId(c.id); setMcSupplierId(c.supplierId); setMcNo(c.contractNo); setMcDate(c.contractDate); setMcStatus(c.status);
    } else {
      setEditingContractId(null); setMcSupplierId(''); setMcNo(''); setMcDate(''); setMcStatus('Новый');
    }
    setShowContractForm(true);
  }
  function saveContract() {
    if (!mcSupplierId) { toast.error('Выберите поставщика'); return; }
    if (!mcNo.trim()) { toast.error('Введите номер договора'); return; }
    if (!mcDate) { toast.error('Укажите дату договора'); return; }
    const now = new Date().toISOString();
    const by = getCurrentUser()?.name || '—';
    if (editingContractId) {
      updateStore(s => ({ ...s, settings: { ...s.settings, mediaContracts: (s.settings.mediaContracts || []).map(c => c.id === editingContractId ? { ...c, supplierId: mcSupplierId, contractNo: mcNo.trim(), contractDate: mcDate, status: mcStatus, updatedAt: now, history: [...(c.history || []), { at: now, by, action: 'Договор изменён' }].slice(-200) } : c) } }));
      toast.success('Договор обновлён');
    } else {
      const nc: MediaContract = { id: generateId(), supplierId: mcSupplierId, contractNo: mcNo.trim(), contractDate: mcDate, status: mcStatus, createdAt: now, history: [{ at: now, by, action: 'Договор создан' }] };
      updateStore(s => ({ ...s, settings: { ...s.settings, mediaContracts: [...(s.settings.mediaContracts || []), nc] } }));
      toast.success('Договор добавлен');
    }
    setShowContractForm(false); setEditingContractId(null);
  }
  function deleteContract(id: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, mediaContracts: (s.settings.mediaContracts || []).filter(c => c.id !== id) } }));
    toast.success('Договор удалён');
  }

  // v1.30.69: новости рынка
  function openNewsForm(n?: MarketNewsItem) {
    if (n) {
      setEditingNewsId(n.id); setMnSupplierId(n.supplierId); setMnTitle(n.title); setMnLink(n.link || ''); setMnText(n.text || ''); setMnImage(n.imageUrl || ''); setMnStatus(n.status); setMnDate(n.date || new Date().toISOString().slice(0, 10));
    } else {
      setEditingNewsId(null); setMnSupplierId(''); setMnTitle(''); setMnLink(''); setMnText(''); setMnImage(''); setMnStatus('Новая'); setMnDate(new Date().toISOString().slice(0, 10));
    }
    setShowNewsForm(true);
  }
  async function uploadNewsImage(file: File) {
        setMnBusy(true);
    try {
      setMnImage(await apiFilesUploadFile(file));
    } finally { setMnBusy(false); }
  }
  function saveNews() {
    if (!editingNewsId && !mnSupplierId) { toast.error('Выберите поставщика'); return; }
    if (!mnTitle.trim()) { toast.error('Введите заголовок'); return; }
    if (!mnDate) { toast.error('Укажите дату'); return; }
    if (editingNewsId) {
      updateStore(s => ({ ...s, settings: { ...s.settings, marketNews: (s.settings.marketNews || []).map(n => n.id === editingNewsId ? { ...n, title: mnTitle.trim(), link: mnLink.trim(), text: mnText, imageUrl: mnImage, status: mnStatus, date: mnDate } : n) } }));
      toast.success('Новость обновлена');
    } else {
      const nn: MarketNewsItem = { id: generateId(), supplierId: mnSupplierId, title: mnTitle.trim(), link: mnLink.trim(), text: mnText, imageUrl: mnImage, status: mnStatus, date: mnDate, createdAt: new Date().toISOString() };
      updateStore(s => ({ ...s, settings: { ...s.settings, marketNews: [nn, ...(s.settings.marketNews || [])] } }));
      toast.success('Новость добавлена');
    }
    setShowNewsForm(false); setEditingNewsId(null);
  }
  function deleteNews(id: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, marketNews: (s.settings.marketNews || []).filter(n => n.id !== id) } }));
    toast.success('Новость удалена');
  }
  // v1.30.63: материал размещения
  function startEditMaterial(r: MediaRecord) {
    setEditingMaterialId(r.id);
    setMaterialDescBuffer(r.material?.description || '');
    setMaterialFilesBuffer([...(r.material?.files || [])]);
  }
  async function uploadMaterialFile(file: File, recordId: string) {
        setMaterialBusy(true);
    try {
      const uploadedUrl = await apiFilesUploadFile(file);
      setMaterialFilesBuffer(prev => [...prev, uploadedUrl]);
    } finally { setMaterialBusy(false); }
  }
  function saveMaterial(recordId: string) {
    const now = new Date().toISOString();
    updateStore(s => ({
      ...s,
      mediaRecords: (s.mediaRecords || []).map(r => r.id === recordId ? {
        ...r,
        material: { description: materialDescBuffer, files: materialFilesBuffer },
        updatedAt: now,
        history: [...(r.history || []), { at: now, by: getCurrentUser()?.name || '—', action: 'Материал обновлён' }].slice(-200),
      } : r),
    }));
    setEditingMaterialId(null);
    toast.success('Материал сохранён');
  }  function handleDelete(id: string) {
    if (!isAdmin()) { toast.error('Удаление доступно только администратору'); return; }
    // v_1.9: «Опубликовано» — удаление невозможно
    const rec = (store.mediaRecords || []).find(r => r.id === id);
    if (rec && rec.status === 'Опубликовано') { toast.error('В статусе «Опубликовано» удаление невозможно'); return; }
    setDeleteId(id); setDeleteWord('');
  }

  function confirmDelete() {
    if (!deleteId) return;
    if (deleteWord.trim() !== 'УДАЛИТЬ') { toast.error('Введите слово УДАЛИТЬ для подтверждения'); return; }
    const now = new Date().toISOString();
    // v_1.9: запись НЕ удаляется — ставится автостатус «Аннулирован»
    updateStore(s => ({ ...s, mediaRecords: (s.mediaRecords || []).map(r => r.id === deleteId ? { ...r, status: 'Отменено', updatedAt: now, history: [...(r.history || []), { at: now, by: getCurrentUser()?.name || '—', action: 'Размещение аннулировано' }].slice(-200) } : r) }));
    setDeleteId(null); setDeleteWord('');
    forceUpdate(n => n + 1);
    toast.success('Размещение аннулировано');
  }

  function handleDeleteLegacy(id: string) {
    if (!isAdmin()) { toast.error('Удаление доступно только администратору'); return; }
    if (!confirm('Удалить запись о размещении?')) return;
    updateStore(s => ({ ...s, mediaRecords: (s.mediaRecords || []).map(r => r.id === id ? { ...r, deletedAt: new Date().toISOString() } : r) }));
    forceUpdate(n => n + 1); toast.success('Удалено');
  }

  function toggleRow(id: string) {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    if (editingNotesId === id) setEditingNotesId(null);
  }

  function startEditNotes(record: MediaRecord) {
    setEditingNotesId(record.id);
    setNotesBuffer(record.expandedNotes || '');
  }

  function saveNotes(id: string) {
    updateStore(s => ({ ...s, mediaRecords: (s.mediaRecords || []).map(r => r.id === id ? { ...r, expandedNotes: notesBuffer, updatedAt: new Date().toISOString() } : r) }));
    setEditingNotesId(null); forceUpdate(n => n + 1); toast.success('Заметки сохранены');
  }

  function getStatusStyle(statusName: string) {
    const ms = mediaStatuses.find(s => s.name === statusName);
    return ms ? { background: ms.bgColor, color: ms.textColor } : { background: '#F3F4F6', color: '#374151' };
  }

  const endingSoonCount = records.filter(r => !r.deletedAt && r.status !== 'Анулирован' && isEndingSoon(r.endDate)).length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="actions-bar flex items-center justify-start flex-wrap gap-2">
        {/* v1.30.66: единый дизайн кнопок, порядок: Размещения / Договора / Добавить размещение / Добавить договор / Архив */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => { setView('placements'); setShowArchived(false); }} className={`action-btn text-xs ${view === 'placements' && !showArchived ? '!border-red-600 !text-red-600' : ''}`}>Размещения</button>
          {/* v1.30.69: Новости рынка */}
          <button onClick={() => setView('news')} className={`action-btn text-xs ${view === 'news' ? '!border-red-600 !text-red-600' : ''}`}>Новости</button>
          <button onClick={() => setView('contracts')} className={`action-btn text-xs ${view === 'contracts' ? '!border-red-600 !text-red-600' : ''}`}>Договора</button>
          <button onClick={openAdd} className="action-btn text-xs"><Plus size={14} /> Добавить размещение</button>
          <button onClick={() => { setView('contracts'); openContractForm(); }} className="action-btn text-xs"><Plus size={14} /> Добавить договор</button>
          <button onClick={() => setShowArchived(v => !v)} className={`action-btn text-xs ${showArchived ? '!border-red-600 !text-red-600' : ''}`}>Архив</button>
        </div>
      </div>

      {/* v1.30.62: переключение разделов */}
      {view === 'placements' && (<>
      {endingSoonCount > 0 && (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-700">Заканчивается срок размещения</p>
            <p className="text-xs text-red-600">{endingSoonCount} размещение(-ий) заканчивается в течение 14 дней</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-base p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="form-input pl-8 py-1.5 text-xs" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="form-input py-1.5 text-xs w-auto" value={filterResponsible} onChange={e => setFilterResponsible(e.target.value)}><option value="">Все ответственные</option>
            <option value="__none__">Без ответственного</option>{store.settings.users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <select className="form-input py-1.5 text-xs w-auto" value={filterAdType} onChange={e => setFilterAdType(e.target.value)}>
            <option value="">Все типы</option>
            {mediaAdTypes.filter(t => t.enabled !== false).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400">с:</span>
            <input type="date" className="form-input py-1.5 text-xs w-auto" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
            <span className="text-xs text-gray-400">по:</span>
            <input type="date" className="form-input py-1.5 text-xs w-auto" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
          </div>
          {(search || filterAdType || filterStatus || filterDateFrom || filterDateTo) && (
            <button onClick={() => { setSearch(''); setFilterAdType(''); setFilterStatus(''); setFilterDateFrom(''); setFilterDateTo(''); }} className="text-xs text-brand-red flex items-center gap-1">
              <X size={12} /> Сбросить
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilterStatus('')} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterStatus === '' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>Все</button>
          {mediaStatuses.map(s => (
            <button key={s.id} onClick={() => setFilterStatus(filterStatus === s.name ? '' : s.name)}
              className="text-xs px-2 py-0.5 rounded-full border transition-colors"
              style={filterStatus === s.name ? { background: s.textColor, color: '#fff', borderColor: s.textColor } : { background: s.bgColor, color: s.textColor, borderColor: 'transparent' }}>
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="card-base overflow-hidden">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gray-mid">
                <th className="table-header w-8"></th>
                <th className="table-header">Рекламодатель</th>
                <th className="table-header hidden md:table-cell">Тип рекламы</th>
                <th className="table-header hidden lg:table-cell">Тариф</th>
                <th className="table-header">Статус</th>
                <th className="table-header hidden sm:table-cell">Длит.</th>
                <th className="table-header hidden sm:table-cell">Период</th>
                {/* v1.30.61: дата создания записи */}
                <th className="table-header hidden md:table-cell">Создан</th>
                <th className="table-header w-20"></th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">Размещений не найдено</td></tr>
              )}
              {records.map(r => {
                const ending = !r.deletedAt && r.status !== 'Анулирован' && isEndingSoon(r.endDate);
                const dl = daysLeft(r.endDate);
                const isExpanded = expandedRows[r.id];
                const isEditingNotes = editingNotesId === r.id;

                return (
                  <Fragment key={r.id}>
                    <tr
                      className={`border-b border-brand-gray-mid hover:bg-brand-gray transition-colors ${ending ? 'bg-red-50 border-l-4 border-l-red-400' : ''} ${r.deletedAt ? 'opacity-50' : ''}`}>
                      {/* Expand toggle */}
                      <td className="table-cell">
                        <button onClick={() => toggleRow(r.id)} className="p-1 text-gray-400 hover:text-brand-black rounded" title="Открыть карточку">
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </td>

                      <td className="table-cell font-medium">
                        <div>
                          <button onClick={() => navigate(`/suppliers/${r.supplierId}`)} className="text-blue-600 hover:underline text-sm font-medium">{r.supplierName}</button>
                          {ending && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Clock size={10} className="text-red-500" />
                              <span className="text-xs text-red-600 font-medium">{dl <= 0 ? 'Истёк!' : `${dl} дн.`}</span>
                            </div>
                          )}
                          {r.notes && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[140px]">{r.notes}</p>}
                        </div>
                      </td>

                      {/* v1.30.66: договор второй строкой под типом рекламы */}
                      <td className="table-cell hidden md:table-cell text-xs">
                        <span className="font-medium text-brand-black">{r.adTypeName}</span>
                        {(() => {
                          const mc = (store.settings.mediaContracts || []).find(c => c.supplierId === r.supplierId && c.contractNo && (!r.contractNo || c.contractNo === r.contractNo)) || autoContract(r.supplierId || '');
                          if (!mc) return null;
                          return <p className="text-[11px] text-gray-400 mt-0.5">Договор: № {mc.contractNo} от {String(mc.contractDate).split('-').reverse().join('.')}</p>;
                        })()}
                      </td>

                      {/* v1.30.61: тариф одной строкой, итоговая сумма выделена */}
                      <td className="table-cell hidden lg:table-cell text-xs text-gray-500 whitespace-nowrap">
                        {r.durationLabel && r.pricePerMonth ? (
                          <span>{r.durationLabel} · {r.pricePerMonth.toLocaleString('ru')} ₽/мес.</span>
                        ) : <span className="text-gray-300">—</span>}
                        {/* v1.30.67: скидка, если есть */}
                        {r.discount ? <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 whitespace-nowrap">−{r.discount}%</span> : null}
                        {r.totalPrice ? <b className="ml-1 bg-yellow-100 text-gray-900 rounded px-1.5 py-0.5 tabular-nums">{r.totalPrice.toLocaleString('ru')} ₽</b> : null}
                      </td>

                      <td className="table-cell">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap" style={getStatusStyle(r.status)}>{r.status}</span>
                      </td>

                      <td className="table-cell hidden sm:table-cell text-xs text-gray-600">
                        {r.durationLabel || getDurationText(r.startDate, r.endDate)}
                      </td>

                      <td className="table-cell hidden sm:table-cell text-xs">
                        <div className="whitespace-nowrap">
                          <span>{formatDate(r.startDate)}</span>
                          <span className="text-gray-400 mx-1">—</span>
                          <span className={ending ? 'text-red-600 font-medium' : ''}>{formatDate(r.endDate)}</span>
                          {r.responsibleName && <div className="text-[10px] text-gray-400">{r.responsibleName}</div>}
                        </div>
                      </td>

                      {/* v1.30.61: дата создания */}
                      <td className="table-cell hidden md:table-cell text-[11px] text-gray-500 whitespace-nowrap">
                        {r.createdAt ? String(r.createdAt).slice(0, 10).split('-').reverse().join('.') : '—'}
                      </td>

                      <td className="table-cell" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          {/* v1.30.61: история изменений записи */}
                          <button onClick={() => setHistoryRecordId(r.id)} className="p-1 text-gray-400 hover:text-brand-red" title="История изменений"><History size={13} /></button>
                          <button onClick={() => openEdit(r)} className="p-1 text-gray-400 hover:text-brand-black" title="Редактировать"><Edit2 size={14} /></button>
                          {isAdmin() && !r.deletedAt && <button onClick={() => handleDelete(r.id)} className="p-1 text-gray-300 hover:text-brand-red" title="Удалить"><Trash2 size={14} /></button>}
                        </div>
                      </td>
                    </tr>

                    {/* Expanded row */}
                    {isExpanded && (
                      <tr key={`${r.id}-expanded`} className="border-b border-brand-gray-mid bg-gray-50">
                        <td colSpan={8} className="px-4 py-4">
                          {/* v1.30.64: карточка двумя колонками — сводка слева, материал справа */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                            <div className="space-y-3">
                            {/* Summary info */}

                            {/* Expanded notes */}
                            <div className="bg-white rounded-lg border border-brand-gray-mid p-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-gray-700">Заметки по размещению</p>
                                {!isEditingNotes
                                  ? <button onClick={() => startEditNotes(r)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Edit2 size={11} /> Редактировать</button>
                                  : <div className="flex gap-1">
                                    <button onClick={() => saveNotes(r.id)} className="text-xs bg-brand-red text-white px-2 py-0.5 rounded flex items-center gap-1"><Save size={11} /> Сохранить</button>
                                    <button onClick={() => setEditingNotesId(null)} className="text-xs text-gray-400 px-2 py-0.5 rounded border border-brand-gray-mid">Отмена</button>
                                  </div>
                                }
                              </div>
                              {isEditingNotes ? (
                                <textarea
                                  className="form-input text-xs min-h-[100px] resize-y w-full"
                                  placeholder="Введите подробные заметки: условия договора, контактное лицо, статус переговоров..."
                                  value={notesBuffer}
                                  onChange={e => setNotesBuffer(e.target.value)}
                                  autoFocus
                                />
                              ) : (
                                <p className="text-xs text-gray-600 whitespace-pre-wrap min-h-[40px]">
                                  {r.expandedNotes || <span className="text-gray-300 italic">Заметок нет. Нажмите «Редактировать» чтобы добавить.</span>}
                                </p>
                              )}
                            </div>

                            </div>
                            <div>
                            {/* v1.30.63: материал размещения */}
                            <div className="bg-white rounded-lg border border-brand-gray-mid p-3">
                              <p className="text-xs font-semibold text-gray-500 mb-1">Материал</p>
                              {editingMaterialId === r.id ? (
                                <div className="space-y-2">
                                  <textarea className="form-input text-xs" rows={2} value={materialDescBuffer} onChange={e => setMaterialDescBuffer(e.target.value)} placeholder="Описание материала" />
                                  <div className="flex flex-wrap gap-2 items-center">
                                    {materialFilesBuffer.map((u, fi) => (
                                      <span key={fi} className="relative inline-block">
                                        <img src={u} alt="" className="h-14 w-14 object-cover rounded-lg border border-gray-200" />
                                        <button type="button" onClick={() => setMaterialFilesBuffer(prev => prev.filter((_, x) => x !== fi))} className="absolute -top-1 -right-1 bg-white rounded-full border border-gray-200 text-gray-400 hover:text-red-600"><X size={11} /></button>
                                      </span>
                                    ))}
                                    <label className={`text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 cursor-pointer ${materialBusy ? 'opacity-50' : 'hover:bg-gray-200'}`}>
                                      {materialBusy ? 'Загрузка…' : '+ Файл'}
                                      <input type="file" accept="image/*" className="hidden" disabled={materialBusy} onChange={e => { const f = e.target.files?.[0]; if (f) uploadMaterialFile(f, r.id); e.target.value = ''; }} />
                                    </label>
                                  </div>
                                  <div className="flex gap-1">
                                    <button onClick={() => saveMaterial(r.id)} className="text-xs bg-brand-red text-white px-2 py-0.5 rounded flex items-center gap-1"><Save size={11} /> Сохранить</button>
                                    <button onClick={() => setEditingMaterialId(null)} className="text-xs text-gray-400 px-2 py-0.5 rounded border border-brand-gray-mid">Отмена</button>
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  {r.material?.description ? <p className="text-xs text-gray-600 whitespace-pre-wrap">{r.material.description}</p> : <p className="text-xs text-gray-300 italic">Материал не добавлен.</p>}
                                  {r.material?.files?.length ? (
                                    <div className="flex flex-wrap gap-2 mt-1.5">
                                      {r.material.files.map((u, fi) => <a key={fi} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="h-14 w-14 object-cover rounded-lg border border-gray-200" /></a>)}
                                    </div>
                                  ) : null}
                                  <button onClick={() => startEditMaterial(r)} className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1.5"><Edit2 size={11} /> {r.material ? 'Изменить' : 'Добавить'}</button>
                                </div>
                              )}
                            </div>
                            </div>
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

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/50 overflow-y-auto">
          <div className="card-base w-full max-w-xl my-8 animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-brand-gray-mid">
              <h2 className="section-title">{editingId ? 'Редактировать размещение' : 'Новое размещение'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="form-label">Рекламодатель (поставщик) *</label>
                <select className="form-input" value={form.supplierId || ''} onChange={e => handleSupplierChange(e.target.value)} required>
                  <option value="">Выберите поставщика...</option>
                  {activeSuppliers.map(s => <option key={s.id} value={s.id}>{s.tradeName} · {s.city}</option>)}
                </select>
              </div>

              <div>
                <label className="form-label">Тип рекламы</label>
                {/* v_1.9: тип рекламы необязателен */}
                <select className="form-input" value={form.adTypeId || ''} onChange={e => handleAdTypeChange(e.target.value)}>
                  <option value="">Выберите...</option>
                  {/* v1.30.49: только название */}
                  {mediaAdTypes.filter(t => t.enabled !== false).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {/* v1.30.63: описание выбранного формата */}
                {selectedAdType?.description ? <p className="text-[11px] text-gray-400 mt-1 leading-snug">{selectedAdType.description}</p> : null}
              </div>

              {selectedAdType && (
                <div>
                  <label className="form-label">Тарифы и срок размещения *</label>
                  <select className="form-input" value={form.durationOptionId || ''} onChange={e => handleDurationChange(e.target.value)}>
                    <option value="">Выберите срок...</option>
                    {durationOptions.filter(o => o.enabled !== false).map(opt => (
                      <option key={opt.id} value={opt.id}>
                        {opt.periodLabel} — {opt.discount > 0 ? `скидка ${opt.discount}%` : 'без скидки'} — {opt.totalPrice.toLocaleString('ru')} ₽{opt.bonus ? ` + ${opt.bonus}` : ''}
                      </option>
                    ))}
                  </select>
                  {form.durationOptionId && (
                    <p className="text-xs text-brand-red mt-1 font-medium">
                      Итого: {form.totalPrice?.toLocaleString('ru')} ₽ · {form.pricePerMonth?.toLocaleString('ru')} ₽/мес.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="form-label">Статус *</label>
                <select className="form-input" value={form.status || ''} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} required>
                  <option value="">Выберите...</option>
                  {mediaStatuses.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* v1.30.49: даты обязательны только при статусе «Опубликовано» */}
                <div>
                  <label className="form-label">Дата начала{form.status === 'Опубликовано' ? ' *' : ''}</label>
                  <input type="date" required={form.status === 'Опубликовано'} className="form-input" value={form.startDate || ''} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div>
                  <label className="form-label">Дата окончания{form.status === 'Опубликовано' ? ' *' : ''}</label>
                  <input type="date" required={form.status === 'Опубликовано'} className="form-input" value={form.endDate || ''} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
              </div>

              {/* v1.30.62: договор поставщика подставляется автоматически (из раздела «Договора») */}
              {(() => {
                const ac = autoContract(form.supplierId || '');
                if (ac) return <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">Договор: № <b className="text-gray-900">{ac.contractNo}</b> от {String(ac.contractDate).split('-').reverse().join('.')} <span className="text-gray-400">({ac.status})</span></p>;
                if (form.supplierId) return <p className="text-xs text-gray-400">Договор не найден — создайте в разделе «Договора».</p>;
                return null;
              })()}

              <div>
                <label className="form-label">Краткая заметка (отображается в списке)</label>
                <input className="form-input" placeholder="Краткое примечание..." value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
              <div>
                <label className="form-label">Ответственный</label>
                <ResponsibleSelect value={form.responsibleId} onChange={(id, name) => setForm(f => ({ ...f, responsibleId: id, responsibleName: name }))} />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-brand-gray-mid">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Отмена</button>
                <button type="submit" className="btn-primary">{editingId ? 'Сохранить' : 'Добавить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* v_1.9: подтверждение удаления — ввести УДАЛИТЬ, запись аннулируется */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
            <h3 className="section-title mb-2">Удаление размещения</h3>
            <p className="text-xs text-gray-500 mb-3">Запись не будет удалена — ей будет присвоен статус <b>«Аннулирован»</b>. Для подтверждения введите слово <b>УДАЛИТЬ</b>:</p>
            <input className="form-input mb-4" value={deleteWord} onChange={e => setDeleteWord(e.target.value)} placeholder="УДАЛИТЬ" autoFocus />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="btn-secondary text-xs">Отмена</button>
              <button onClick={confirmDelete} disabled={deleteWord.trim() !== 'УДАЛИТЬ'}
                className="btn-primary text-xs disabled:opacity-40">Подтвердить</button>
            </div>
          </div>
        </div>
      )}

      </>)}

      {/* ═══ НОВОСТИ РЫНКА (v1.30.69) ═══ */}
      {view === 'news' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => openNewsForm()} className="btn-secondary text-xs"><Plus size={14} /> Добавить новость</button>
          </div>
          {showNewsForm && (
            <div className="card-base p-4 space-y-3">
              <h3 className="section-title">{editingNewsId ? 'Редактирование новости' : 'Новая новость'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {!editingNewsId && (
                  <div>
                    <label className="form-label text-xs">Поставщик *</label>
                    <select className="form-input text-xs" value={mnSupplierId} onChange={e => setMnSupplierId(e.target.value)}>
                      <option value="">Выберите...</option>
                      {store.suppliers.filter(s => !s.deletedAt).map(s => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
                    </select>
                  </div>
                )}
                <div><label className="form-label text-xs">Заголовок *</label><input className="form-input text-xs" value={mnTitle} onChange={e => setMnTitle(e.target.value)} /></div>
                <div><label className="form-label text-xs">Ссылка</label><input className="form-input text-xs" value={mnLink} onChange={e => setMnLink(e.target.value)} placeholder="https://" /></div>
                <div><label className="form-label text-xs">Дата</label><input type="date" className="form-input text-xs" value={mnDate} onChange={e => setMnDate(e.target.value)} /></div>
                <div>
                  <label className="form-label text-xs">Статус</label>
                  <select className="form-input text-xs" value={mnStatus} onChange={e => setMnStatus(e.target.value as 'Новая' | 'Опубликована' | 'Аннулирована')}>
                    {(['Новая', 'Опубликована', 'Аннулирована'] as const).map(st => <option key={st}>{st}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2"><label className="form-label text-xs">Текст</label><textarea className="form-input text-xs" rows={2} value={mnText} onChange={e => setMnText(e.target.value)} /></div>
                <div>
                  <label className="form-label text-xs">Материал (картинка)</label>
                  <div className="flex items-center gap-2">
                    {mnImage ? <img src={mnImage} alt="" className="h-10 w-10 object-cover rounded-lg border border-gray-200" /> : null}
                    <label className={`text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 cursor-pointer ${mnBusy ? 'opacity-50' : 'hover:bg-gray-200'}`}>
                      {mnBusy ? 'Загрузка…' : mnImage ? 'Заменить' : 'Загрузить'}
                      <input type="file" accept="image/*" className="hidden" disabled={mnBusy} onChange={e => { const f = e.target.files?.[0]; if (f) uploadNewsImage(f); e.target.value = ''; }} />
                    </label>
                    {mnImage && <button type="button" onClick={() => setMnImage('')} className="text-xs text-gray-400 hover:text-red-600">Убрать</button>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveNews} className="btn-primary text-xs"><Save size={13} /> {editingNewsId ? 'Сохранить' : 'Добавить'}</button>
                <button onClick={() => setShowNewsForm(false)} className="btn-secondary text-xs">Отмена</button>
              </div>
            </div>
          )}
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Поставщик</th>
                    <th className="table-header">Заголовок</th>
                    <th className="table-header">Ссылка</th>
                    <th className="table-header">Текст</th>
                    <th className="table-header">Материал</th>
                    <th className="table-header">Статус</th>
                    <th className="table-header">Дата</th>
                    <th className="table-header w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {(store.settings.marketNews || []).map(n => (
                    <tr key={n.id} className="border-t border-gray-100">
                      <td className="table-cell font-medium">{store.suppliers.find(s => s.id === n.supplierId)?.tradeName || '—'}</td>
                      <td className="table-cell">{n.title}</td>
                      <td className="table-cell">{n.link ? <a href={n.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs break-all">{n.link}</a> : '—'}</td>
                      <td className="table-cell text-xs text-gray-500 max-w-[200px]"><p className="line-clamp-2 whitespace-pre-wrap">{n.text || '—'}</p></td>
                      <td className="table-cell">{n.imageUrl ? <a href={n.imageUrl} target="_blank" rel="noreferrer"><img src={n.imageUrl} alt="" className="h-10 w-10 object-cover rounded-lg border border-gray-200" /></a> : '—'}</td>
                      <td className="table-cell">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${n.status === 'Опубликована' ? 'bg-green-100 text-green-700' : n.status === 'Новая' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{n.status}</span>
                      </td>
                      <td className="table-cell whitespace-nowrap">{n.date ? String(n.date).split('-').reverse().join('.') : '—'}</td>
                      <td className="table-cell">
                        <div className="flex gap-1">
                          <button onClick={() => openNewsForm(n)} className="p-1 text-gray-400 hover:text-brand-black" title="Редактировать"><Edit2 size={14} /></button>
                          <button onClick={() => deleteNews(n.id)} className="p-1 text-gray-400 hover:text-red-600" title="Удалить"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(store.settings.marketNews || []).length && <p className="text-xs text-gray-400 text-center py-8">Новостей нет.</p>}
            </div>
          </div>
        </div>
      )}

      {/* ═══ ДОГОВОРА (v1.30.62) ═══ */}
      {view === 'contracts' && (
        <div className="space-y-4">
          {showContractForm && (
            <div className="card-base p-4 space-y-3">
              <h3 className="section-title">{editingContractId ? 'Редактирование договора' : 'Новый договор'}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="form-label text-xs">Поставщик *</label>
                  <select className="form-input text-xs" value={mcSupplierId} onChange={e => setMcSupplierId(e.target.value)}>
                    <option value="">Выберите...</option>
                    {store.suppliers.filter(s => !s.deletedAt).map(s => <option key={s.id} value={s.id}>{s.tradeName}</option>)}
                  </select>
                </div>
                <div><label className="form-label text-xs">№ договора *</label><input className="form-input text-xs" value={mcNo} onChange={e => setMcNo(e.target.value)} placeholder="напр. 15-А" /></div>
                <div><label className="form-label text-xs">Дата *</label><input type="date" className="form-input text-xs" value={mcDate} onChange={e => setMcDate(e.target.value)} /></div>
                <div>
                  <label className="form-label text-xs">Статус *</label>
                  <select className="form-input text-xs" value={mcStatus} onChange={e => setMcStatus(e.target.value as 'Новый' | 'Активный' | 'Не активный')}>
                    {(['Новый', 'Активный', 'Не активный'] as const).map(st => <option key={st}>{st}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveContract} className="btn-primary text-xs"><Save size={13} /> {editingContractId ? 'Сохранить' : 'Добавить'}</button>
                <button onClick={() => setShowContractForm(false)} className="btn-secondary text-xs">Отмена</button>
              </div>
            </div>
          )}
          <div className="card-base overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="table-header">Поставщик</th>
                    <th className="table-header">№ договора</th>
                    <th className="table-header">Дата</th>
                    <th className="table-header">Статус</th>
                    <th className="table-header w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {(store.settings.mediaContracts || []).map(c => (
                    <tr key={c.id} className="border-t border-gray-100">
                      <td className="table-cell font-medium">{store.suppliers.find(s => s.id === c.supplierId)?.tradeName || '—'}</td>
                      <td className="table-cell">{c.contractNo}</td>
                      <td className="table-cell whitespace-nowrap">{c.contractDate ? String(c.contractDate).split('-').reverse().join('.') : '—'}</td>
                      <td className="table-cell">
                        {/* v1.30.92: единый цвет статуса договора (как в ЛК) */}
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${c.status === 'Активный' ? 'bg-green-100 text-green-700' : c.status === 'Новый' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>{c.status === 'Новый' ? 'в работе' : c.status}</span>
                      </td>
                      <td className="table-cell">
                        <div className="flex gap-1">
                          <button onClick={() => setHistoryContractId(c.id)} className="p-1 text-gray-400 hover:text-brand-red" title="История"><History size={13} /></button>
                          <button onClick={() => openContractForm(c)} className="p-1 text-gray-400 hover:text-brand-black" title="Редактировать"><Edit2 size={14} /></button>
                          <button onClick={() => deleteContract(c.id)} className="p-1 text-gray-400 hover:text-red-600" title="Удалить"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(store.settings.mediaContracts || []).length && <p className="text-xs text-gray-400 text-center py-8">Договоры не созданы.</p>}
            </div>
          </div>
        </div>
      )}

      {/* v1.30.62: история изменений договора */}
      {historyContractId && (() => {
        const c = (store.settings.mediaContracts || []).find(x => x.id === historyContractId);
        const entries = [...((c?.history) || [])].reverse();
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setHistoryContractId(null)}>
            <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
              <h3 className="section-title mb-3">История договора</h3>
              {entries.length ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {entries.map((h, i) => (
                    <div key={i} className="text-xs border-b border-gray-100 pb-2">
                      <p className="text-gray-800 font-medium">{h.action}</p>
                      <p className="text-gray-400 mt-0.5">{(() => { const d = String(h.at || ''); return d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}, ${d.slice(11, 16)}` : ''; })()} · {h.by}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-gray-400 py-4 text-center">Истории изменений нет.</p>}
              <div className="flex justify-end pt-3">
                <button type="button" onClick={() => setHistoryContractId(null)} className="btn-secondary text-xs">Закрыть</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* v1.30.61: история изменений записи */}
      {historyRecordId && (() => {
        const rec = (records || []).find(r => r.id === historyRecordId);
        const entries = [...((rec?.history) || [])].reverse();
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setHistoryRecordId(null)}>
            <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-md w-full mx-4 animate-fade-in" onClick={e => e.stopPropagation()}>
              <h3 className="section-title mb-3">История изменений</h3>
              {entries.length ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {entries.map((h, i) => (
                    <div key={i} className="text-xs border-b border-gray-100 pb-2">
                      <p className="text-gray-800 font-medium">{h.action}</p>
                      <p className="text-gray-400 mt-0.5">{(() => { const d = String(h.at || ''); return d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}, ${d.slice(11, 16)}` : ''; })()} · {h.by}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 py-4 text-center">Истории изменений нет.</p>
              )}
              <div className="flex justify-end pt-3">
                <button type="button" onClick={() => setHistoryRecordId(null)} className="btn-secondary text-xs">Закрыть</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
