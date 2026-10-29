import { useState, useMemo, useEffect } from 'react';
import CitySelect from '@/components/features/CitySelect';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getStore, updateStore, useStoreVersion, getContactPrefs } from '@/lib/store';
import { generateId, exportToCSV, formatDate } from '@/lib/utils';
import { getCurrentUser, canExport, canDelete, isAdmin, canSeeSupplier } from '@/lib/auth';
import { isArchiveStatus, findDuplicate } from '@/lib/dedupe';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import StatusBadge from '@/components/features/StatusBadge';
import ImportModal from '@/components/features/ImportModal';
import type { Supplier, Task } from '@/types';
import {ROLE_TYPES, COMPANY_SCORE_COLORS, SYSTEM_TASK_TYPE} from '@/constants';
import { Play, Plus, Download, Upload, Trash2, RotateCcw, Search, X, Edit2, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import TagInput from '@/components/features/TagInput';
import ContactPrefIcon from '@/components/features/ContactPrefIcons';
import StatusChangeModal from '@/components/features/StatusChangeModal';

/** Склонение «склад» для колонки Склады/SKU. */
const whPl = (n: number) =>
  n % 10 === 1 && n % 100 !== 11 ? 'склад' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'склада' : 'складов');

const IMPORT_FIELDS = ['tradeName', 'type', 'city', 'inn', 'contactName', 'phone', 'email', 'status', 'companyScore', 'source'];

function ScoreBadge({ score }: { score: number }) {
  const n = Math.min(10, Math.max(0, Math.round(score)));
  const cfg = COMPANY_SCORE_COLORS[n] || COMPANY_SCORE_COLORS[0];
  return (
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold" style={{ background: cfg.bg, color: cfg.text }}>
      {cfg.label}
    </span>
  );
}

// ТЗ 1.8: системные цвета категорий поставщиков (A/B/C)
const CAT_STYLE_MAP: Record<'A' | 'B' | 'C', { background: string; color: string }> = {
  A: { background: 'rgb(209, 250, 229)', color: 'rgb(6, 95, 70)' },
  B: { background: 'rgb(239, 246, 255)', color: 'rgb(30, 64, 175)' },
  C: { background: 'rgb(254, 243, 199)', color: 'rgb(180, 83, 9)' },
};

export default function SuppliersPage() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const navigate = useNavigate();
  const [, forceUpdate] = useState(0);
  const store = getStore();
  const u = getCurrentUser();
  const activeServices = store.settings.supplierServices || []; // SupplierService не имеет deletedAt (мягкое удаление не поддержано)
  const activeProductGroups = (store.settings.productGroups || []).filter(g => !g.deletedAt).map(g => g.name);

  const [search, setSearch] = useState('');
  // ТЗ: подгрузка списка «Показать ещё»
  const [listLimit, setListLimit] = useState(50);
  const [noScoringOnly, setNoScoringOnly] = useState(false); // ТЗ 1.8: фильтр «не прошли скоринг»
  // ТЗ 1.8: фильтры-кружки категорий A/B/C и мультивыбор сервисов — по умолчанию ВЫКЛ (показываем все),
  // клик ВКЛЮЧАЕТ фильтр (можно несколько); пустая выборка = фильтр не применяется
  const [catSel, setCatSel] = useState<Array<'A' | 'B' | 'C'>>([]);
  const [servicesSel, setServicesSel] = useState<string[]>([]);
  // ТЗ 1.8: сколько компаний без данных скоринга (кнопка в поиске видна только при наличии таких)
  // ТЗ 1.8: сколько компаний без данных скоринга; архив/дубли не учитываем
  const noScoringCount = store.suppliers.filter(s => !s.deletedAt && s.status !== 'АРХИВ' && s.status !== 'Архив дублей'
    && !(s.scoring && (s.scoring.apiLoaded || s.scoring.revenue || s.scoring.annualRevenue))).length;
  const [listShown, setListShown] = useState(50);
  const [urlParams] = useSearchParams();
  const [filterStatus, setFilterStatus] = useState(urlParams.get('status') || ''); // v_1.9: ?status= из дашборда
  const [filterService, setFilterService] = useState('');
  const [filterCity, setFilterCity] = useState('');
    const [filterResponsible, setFilterResponsible] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [filterStm, setFilterStm] = useState(false);
  // Восстановлено (были потеряны объявления — фильтры «СКЛАД –» и «СМ –» падали
  // с ReferenceError при клике): логика фильтрации и кнопки ниже уже существовали.
  const [whFilter, setWhFilter] = useState(0); // 0 выкл | 1 только БЕЗ данных (бордер красный) | 2 только С данными (бордер зелёный)
  const [smFilter, setSmFilter] = useState(0);
  // Модальное окно смены статуса из таблицы
  const [statusModal, setStatusModal] = useState<{ id: string; status: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formError, setFormError] = useState(''); // ТЗ 1.8: ошибка валидации в модалке (окно не закрывается)
  const [newForm, setNewForm] = useState<Partial<Supplier>>({ type: 'Поставщик/склад', status: 'Лид CRM', companyScore: 5, productGroups: [], ownBrands: [], services: ['DBS'] }); // ТЗ 1.8: сервис продаж по умолчанию — DBS
  const [massStatus, setMassStatus] = useState('');
  const [massResponsible, setMassResponsible] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskType, setTaskType] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskResp, setTaskResp] = useState('');
  const [sortScore, setSortScore] = useState<'none' | 'asc' | 'desc'>('none');
  const [sortDate, setSortDate] = useState<'none' | 'asc' | 'desc'>('none');

  const supplierTypes = useMemo(() => store.settings.supplierTypes || ['Поставщик/склад', 'Производитель/бренд'], [store.settings.supplierTypes]);
  const activeSources = useMemo(() => (store.settings.sources || []).filter(s => !s.deletedAt), [store.settings.sources]);
  const supplierStatuses = useMemo(() => store.settings.statuses.filter(s => s.entityTypes.includes('supplier')).map(s => s.name), [store.settings.statuses]);
  const allServices = useMemo(() => (store.settings.supplierServices || []).map(s => s.name), [store.settings.supplierServices]);

  const { list: suppliers, statusCounts } = useMemo(() => {
    let list = store.suppliers.filter(s => showArchived ? !!s.deletedAt : !s.deletedAt);
    if (filterStm) list = list.filter(s => (s.ownBrands || []).length > 0); // есть СТМ
    if (whFilter === 1) list = list.filter(s => !(s.warehouseLocations || []).filter(w => w.status !== 'Заморожен').length && !s.warehouseCount); // только БЕЗ складов
    if (whFilter === 2) list = list.filter(s => (s.warehouseLocations || []).some(w => w.status !== 'Заморожен') || !!s.warehouseCount); // только СО складами
    if (smFilter === 1) list = list.filter(s => !s.serviceAccess?.token); // только БЕЗ ссылки самообслуживания
    if (smFilter === 2) list = list.filter(s => Boolean(s.serviceAccess?.token)); // только СО ссылкой
    list = list.filter(s => canSeeSupplier(s)); // фильтры типов/городов менеджера (ТЗ п.2Б)
    // ТЗ 1.8: только компании без данных скоринга
    // ТЗ 1.8: только компании без данных скоринга (архив и дубли не попадают)
    if (noScoringOnly) list = list.filter(s => !s.deletedAt && s.status !== 'АРХИВ' && s.status !== 'Архив дублей'
      && !(s.scoring && (s.scoring.apiLoaded || s.scoring.revenue || s.scoring.annualRevenue)));
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s =>
        s.tradeName.toLowerCase().includes(q) ||
        (s.inn || '').includes(q) ||
        s.phone.includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.contactName.toLowerCase().includes(q) ||
        (s.services || []).some(t => t.toLowerCase().includes(q))
      );
    }
    // Счётчики строк по статусам (до применения фильтра статуса) — для кнопок-фильтров
    const statusCounts: Record<string, number> = {};
    for (const x of list) statusCounts[x.status] = (statusCounts[x.status] || 0) + 1;
    // ТЗ 1.8: «Все» — все статусы КРОМЕ «Активный»; «Активный» — только активные
    if (filterStatus === '') list = list.filter(s => s.status !== 'Активный');
    else list = list.filter(s => s.status === filterStatus);
    // ТЗ 1.8: категории — фильтр ВКЛ только для выбранных кружков (пусто = все)
    if (catSel.length) list = list.filter(s => catSel.includes(s.category ?? 'C'));
    // ТЗ 1.8: сервисы — мультивыбор; поставщик проходит, если есть хотя бы один выбранный сервис
    if (servicesSel.length) list = list.filter(s => (s.services || []).some(x => servicesSel.includes(x)));
    if (filterCity) list = list.filter(s => s.city === filterCity);
        if (filterType) list = list.filter(s => s.type === filterType);
    if (filterResponsible === '__none__') list = list.filter(s => !s.responsibleId);
    else if (filterResponsible) list = list.filter(s => s.responsibleId === filterResponsible);

    if (sortScore === 'desc') list = [...list].sort((a, b) => (b.companyScore || 0) - (a.companyScore || 0));
    else if (sortScore === 'asc') list = [...list].sort((a, b) => (a.companyScore || 0) - (b.companyScore || 0));
    else if (sortDate === 'asc') list = [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    else list = list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { list, statusCounts };
  }, [store.suppliers, search, filterStatus, filterCity, filterType, showArchived, filterStm, whFilter, smFilter, sortScore, sortDate, filterResponsible, noScoringOnly, catSel, servicesSel]);
  useEffect(() => { setListShown(listLimit); }, [suppliers]); // сброс подгрузки при смене фильтров/поиска


  const cityList = store.settings.cities || [];
  const cities = useMemo(() => [...new Set(store.suppliers.map(s => s.city).filter(Boolean))], [store.suppliers]);

  function toggleSelect(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  function toggleAll() { setSelected(selected.length === suppliers.length ? [] : suppliers.map(s => s.id)); }
  function cycleSortScore() { setSortScore(v => v === 'none' ? 'desc' : v === 'desc' ? 'asc' : 'none'); setSortDate('none'); }
  function cycleSortDate() { setSortDate(v => v === 'none' ? 'desc' : v === 'desc' ? 'asc' : 'none'); setSortScore('none'); }

  function handleDelete(ids: string[]) {
    if (!canDelete()) { toast.error('Удаление доступно только администратору'); return; }
    if (!confirm(`Удалить ${ids.length} запись(-ей)?`)) return;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => ids.includes(sup.id) ? { ...sup, deletedAt: new Date().toISOString() } : sup) }));
    setSelected([]); forceUpdate(n => n + 1); toast.success('Удалено');
  }
  function handleRestore(ids: string[]) {
    if (!canDelete()) { toast.error('Восстановление доступно только администратору'); return; }
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => ids.includes(sup.id) ? { ...sup, deletedAt: undefined } : sup) }));
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
      entityType: 'suppliers',
      entityName: 'Поставщики (' + selected.length + ')',
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
      entityKind: 'suppliers',
      entityIds: [...selected],
      history: [{ id: generateId(), date: now, field: 'created', newValue: 'Задача создана из Поставщики', userId: u?.id || '', userName: u?.name || '' }],
    };
    updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
    setShowTaskForm(false); setTaskType(''); setTaskDesc(''); setTaskResp('');
    toast.success('Задача создана');
  }

function handleMassStatus() {
    if (!massStatus || !selected.length) return;
    // ТЗ 1.8: массовая активация без скоринга запрещена — отсеиваем таких, если все без скоринга — стоп
    if (/актив/i.test(massStatus)) {
      const noScoring = store.suppliers.filter(x => selected.includes(x.id) && !/актив/i.test(x.status) && !(x.scoring && (x.scoring.apiLoaded || x.scoring.revenue || x.scoring.annualRevenue)));
      if (noScoring.length === selected.length) { toast.error('Невозможно активировать: заполните данные скоринга поставщиков'); return; }
      if (noScoring.length) {
        toast(`Без скоринга (не активируются): ${noScoring.length} шт.`);
        setSelected(sel => sel.filter(id => !noScoring.some(x => x.id === id)));
        return;
      }
    }
    // ТЗ: если среди выбранных есть «Активные» и новый статус не «Активный» —
    // комментарий обязателен + подтверждение.
    const affected = store.suppliers.filter(x => selected.includes(x.id) && /актив/i.test(x.status) && !/актив/i.test(massStatus));
    let massComment = '';
    if (affected.length) {
      massComment = window.prompt(`Среди выбранных ${affected.length} поставщиков в статусе «Активный». Причина смены статуса (обязательно):`) || '';
      if (!massComment.trim()) { toast.error('Комментарий обязателен — статус не изменён'); return; }
      if (!confirm(`Сменить статус у ${affected.length} «Активных» поставщиков на «${massStatus}»?`)) return;
    }

    // ТЗ: архивные статусы требуют подтверждения фразой «согласен»
    if (isArchiveStatus(massStatus) && window.prompt('Перевод в архив. Введите фразу «согласен» для подтверждения:')?.trim().toLowerCase() !== 'согласен') {
      toast.error('Подтверждение фразой «согласен» обязательно — статус не изменён'); return;
    }
    if (!confirm(`Изменить статус у ${selected.length} записей на "${massStatus}"?`)) return;
    const u = getCurrentUser()!;
    updateStore(s => ({
      ...s, suppliers: s.suppliers.map(sup => !selected.includes(sup.id) ? sup : {
        ...sup, status: massStatus, updatedAt: new Date().toISOString(),
        deletedAt: isArchiveStatus(massStatus) ? new Date().toISOString() : sup.deletedAt,
        history: [...sup.history, { id: generateId(), date: new Date().toISOString(), field: 'status', oldValue: sup.status, newValue: massStatus, userId: u.id, userName: u.name, comment: massComment }],
      }),
    }));
    // Автозадачи для массово активированных (та же функция, что у кнопки «Активировать»)
    const activated = store.suppliers.filter(x => selected.includes(x.id) && /актив/i.test(massStatus) && !/актив/i.test(x.status));
    if (activated.length && confirm(`Создать задачи «${SYSTEM_TASK_TYPE}» для ${activated.length} активированных поставщиков?\nОтветственным будет назначен: ${u.name}.`)) {
      const nowT = new Date().toISOString();
      const tasks: Task[] = activated.map(x => ({
        id: generateId(), entityType: 'supplier', entityId: x.id, entityName: x.tradeName,
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
      suppliers: s.suppliers.map(x => !selected.includes(x.id) ? x : { ...x, responsibleId: user.id, responsibleName: user.name, updatedAt: now }),
    }));
    setSelected([]); setMassResponsible('');
    forceUpdate(n => n + 1);
    toast.success('Ответственный назначен');
  }
  function handleExport() {
    const toExport = selected.length > 0 ? suppliers.filter(s => selected.includes(s.id)) : suppliers;
    exportToCSV(toExport.map(s => ({
      'Название': s.tradeName, 'Тип': s.type, 'Город': s.city, 'ИНН': s.inn || '',
      'Контакт': s.contactName, 'Телефон': s.phone, 'Email': s.email,
      'Статус': s.status, 'Категория': s.category ?? 'C', 'Сервисы': (s.services || []).join(', '),
      'Источник': s.source || '', 'Дата создания': s.createdAt,
    })), `suppliers_${Date.now()}.csv`);
  }
  function handleImport(rows: Record<string, string>[]) {
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const newSuppliers: Supplier[] = rows.map(r => ({
      id: generateId(), type: r['type'] || 'Поставщик/склад',
      tradeName: r['tradeName'] || r['Название'] || 'Без названия',
      city: r['city'] || r['Город'] || '', inn: r['inn'] || r['ИНН'] || '',
      contactRole: (r['contactRole'] as Supplier['contactRole']) || 'менеджер',
      contactName: r['contactName'] || r['Контакт'] || '',
      phone: r['phone'] || r['Телефон'] || '', email: r['email'] || r['Email'] || '',
      productGroups: [], ownBrands: '',
      status: r['status'] || r['Статус'] || 'Лид CRM',
      companyScore: parseInt(r['companyScore'] || '5') || 5,
      history: [{ id: generateId(), date: now, field: 'created', newValue: 'Импорт', userId: u.id, userName: u.name }],
      createdAt: now, updatedAt: now, createdBy: u.id,
    }));
    // ТЗ: дубль по ИНН/телефону/email → «Архив дублей» + архив
    const existing = getStore().suppliers;
    const checked = newSuppliers.map(ns => {
      const dup = findDuplicate(ns, [...existing, ...newSuppliers.filter(x => x.id !== ns.id)]);
      return dup ? { ...ns, status: 'Архив дублей', deletedAt: now } : ns;
    });
    const dups = checked.filter(x => x.status === 'Архив дублей').length;
    updateStore(s => ({ ...s, suppliers: [...s.suppliers, ...checked] }));
    if (dups) toast.warning(`Импортировано с автопереносом в «Архив дублей»: ${dups}`);
    forceUpdate(n => n + 1);
  }
  function handleAddSupplier(e: React.FormEvent) {
    e.preventDefault();
    const u = getCurrentUser()!; const now = new Date().toISOString();
    // ТЗ 1.8: ИНН обязателен, только цифры, строго 10 или 12 разрядов
    const innC = (newForm.inn || '').replace(/\D/g, '');
    if (!/^\d{10}$|^\d{12}$/.test(innC)) { setFormError('ИНН должен содержать 10 или 12 цифр (только цифры)'); return; }
    if (store.suppliers.some(x => x.inn === innC)) { setFormError('Поставщик с таким ИНН уже существует в базе'); return; }
    setFormError('');
    setNewForm(f => ({ ...f, inn: innC }));
    const supplier: Supplier = {
      id: generateId(), type: newForm.type || 'Поставщик/склад',
      tradeName: newForm.tradeName || '', city: newForm.city || '',
      website: newForm.website, priceEmail: newForm.priceEmail || '', inn: newForm.inn,
      contactRole: newForm.contactRole || 'менеджер', contactName: newForm.contactName || '',
      phone: newForm.phone || '', email: newForm.email || '', status: 'Лид CRM',
      source: newForm.source, contactPref: newForm.contactPref,
      contactPrefs: newForm.contactPrefs?.length ? newForm.contactPrefs : ['телефон'],
      responsibleId: newForm.responsibleId, responsibleName: newForm.responsibleName,
      companyScore: newForm.companyScore || 5,
        category: newForm.category ?? 'C', // ТЗ 1.8 — по умолчанию категория C
      comment: newForm.comment,
      services: newForm.services || [], productGroups: newForm.productGroups || [], ownBrands: newForm.ownBrands || [],
      history: [{ id: generateId(), date: now, field: 'created', newValue: 'Лид CRM', userId: u.id, userName: u.name }],
      createdAt: now, updatedAt: now, createdBy: u.id,
    };
    // ТЗ: дубль по ИНН/телефону/email → «Архив дублей» + архив
    const dup = findDuplicate(supplier, getStore().suppliers);
    const finalSupplier = dup ? { ...supplier, status: 'Архив дублей' as string, deletedAt: now } : supplier;
    updateStore(s => ({ ...s, suppliers: [...s.suppliers, finalSupplier] }));
    if (dup) toast.warning(`Найден дубль: «${dup.tradeName}». Карточка перенесена в «Архив дублей».`);
    setShowAddForm(false); setNewForm({ type: 'Поставщик/склад', status: 'Лид CRM', companyScore: 5, productGroups: [], ownBrands: [], services: ['DBS'] }); // ТЗ 1.8: сервис продаж по умолчанию — DBS
    forceUpdate(n => n + 1); toast.success('Поставщик добавлен');
    navigate(`/suppliers/${supplier.id}`);
  }

  const scoreArrow = sortScore === 'desc' ? ' ↓' : sortScore === 'asc' ? ' ↑' : '';

  /** Быстрая активация из таблицы — то же действие, что «Активировать на платформе» в карточке:
   *  смена статуса + предложение автозадачи «Ждет активации». */
  function quickActivate(id: string, name: string, currentStatus: string) {
    if (currentStatus === 'Активный') return;
    // ТЗ 1.8: без заполненного скоринга активация невозможна
    const sup0 = getStore().suppliers.find(x => x.id === id);
    if (sup0 && !(sup0.scoring && (sup0.scoring.apiLoaded || sup0.scoring.revenue || sup0.scoring.annualRevenue))) {
      toast.error('Невозможно активировать: заполните данные скоринга поставщика');
      return;
    }
    if (!confirm('Активировать поставщика на платформе?')) return;
    const u = getCurrentUser(); const now = new Date().toISOString();
    updateStore(s => ({
      ...s,
      suppliers: s.suppliers.map(x => x.id === id ? { ...x, status: 'Активный', updatedAt: now, history: [...x.history, { id: generateId(), date: now, field: 'status', oldValue: currentStatus, newValue: 'Активный', comment: 'Активирован на платформе (быстрое действие)', userId: u?.id || '', userName: u?.name || '' }] } : x),
    }));
    forceUpdate(n => n + 1);
    toast.success('Поставщик активирован на платформе!');
    if (confirm(`Создать задачу «${SYSTEM_TASK_TYPE}» для поставщика «${name}»?\nОтветственным будет назначен: ${u?.name || ''}.`)) {
      const task: Task = {
        id: generateId(), entityType: 'supplier', entityId: id, entityName: name,
        title: SYSTEM_TASK_TYPE, description: `Автозадача после активации поставщика «${name}».`,
        dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
        createdAt: now, updatedAt: now, createdBy: u?.id || '', responsibleId: u?.id, responsibleName: u?.name,
        history: [{ id: generateId(), date: now, field: 'created', comment: `Автозадача создана при активации поставщика (${u?.name || ''})`, userId: u?.id || '', userName: u?.name || '' }],
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
          <div className="flex items-center justify-between mb-4"><h2 className="section-title">Новый поставщик</h2><button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-brand-red"><X size={18} /></button></div>
          <form onSubmit={handleAddSupplier}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
              <div><label className="form-label">Тип</label><select className="form-input" value={newForm.type} onChange={e => setNewForm(f => ({ ...f, type: e.target.value }))}>{supplierTypes.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="form-label">Торговое название *</label><input required className="form-input" value={newForm.tradeName || ''} onChange={e => setNewForm(f => ({ ...f, tradeName: e.target.value }))} /></div>
              <div><label className="form-label">Город ЦС *</label><CitySelect required cities={cityList} value={newForm.city || ''} onChange={v => setNewForm(f => ({ ...f, city: v }))} /></div>
              <div><label className="form-label">ИНН *</label><input className="form-input" required value={newForm.inn || ''} onChange={e => setNewForm(f => ({ ...f, inn: e.target.value }))} style={{ borderColor: !(newForm.inn || '') ? undefined : (/^\d{10}$|^\d{12}$/.test((newForm.inn || '').replace(/\D/g, '')) ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)') }} /></div>
              <div><label className="form-label">Ответственный</label><ResponsibleSelect value={newForm.responsibleId} onChange={(id, name) => setNewForm(f => ({ ...f, responsibleId: id, responsibleName: name }))} /></div>
              <div><label className="form-label">Роль</label><select className="form-input" value={newForm.contactRole || 'менеджер'} onChange={e => setNewForm(f => ({ ...f, contactRole: e.target.value as Supplier['contactRole'] }))}>{ROLE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
              <div><label className="form-label">ФИО *</label><input required className="form-input" value={newForm.contactName || ''} onChange={e => setNewForm(f => ({ ...f, contactName: e.target.value }))} /></div>
              <div><label className="form-label">Телефон *</label><input required className="form-input" value={newForm.phone || ''} onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))} /></div>
              <div><label className="form-label">Email *</label><input required type="email" className="form-input" value={newForm.email || ''} onChange={e => setNewForm(f => ({ ...f, email: e.target.value }))} /></div><div><label className="form-label">Email отправки прайсов</label><input className="form-input" type="email" placeholder="price@example.ru" value={newForm.priceEmail || ''} onChange={e => setNewForm(f => ({ ...f, priceEmail: e.target.value }))} /></div>
              <div><label className="form-label">Источник</label><select className="form-input" value={newForm.source || ''} onChange={e => setNewForm(f => ({ ...f, source: e.target.value }))}><option value="">—</option>{activeSources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select></div>
              <div className="sm:col-span-2"><label className="form-label">Связь</label>
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {getContactPrefs().map(cp => { const on = (newForm.contactPrefs || []).includes(cp); return (
                      <button key={cp} type="button" onClick={() => setNewForm(f => ({ ...f, contactPrefs: on ? (f.contactPrefs || []).filter(x => x !== cp) : [...(f.contactPrefs || []), cp] }))} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}><ContactPrefIcon name={cp} />{cp}</button>
                    ); })}
                  </div>
                </div>

                <div><label className="form-label">Сайт</label><input className="form-input" placeholder="https://…" value={newForm.website || ''} onChange={e => setNewForm(f => ({ ...f, website: e.target.value }))} /></div>
                
                <div className="sm:col-span-2"><label className="form-label">Комментарий</label><textarea className="form-input min-h-[60px] resize-none" value={newForm.comment || ''} onChange={e => setNewForm(f => ({ ...f, comment: e.target.value }))} /></div>
                <div className="sm:col-span-2"><label className="form-label">Сервисы продаж</label>
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {activeServices.map(sv => { const on = (newForm.services || []).includes(sv.name); return (
                      <button key={sv.id} type="button" onClick={() => setNewForm(f => ({ ...f, services: on ? (f.services || []).filter(x => x !== sv.name) : [...(f.services || []), sv.name] }))} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}>{sv.name}</button>
                    ); })}
                  </div>
                </div>
                <div className="sm:col-span-2"><label className="form-label">Основные группы товаров</label>
                  <div className="flex flex-wrap gap-1.5 py-1">
                    {activeProductGroups.map(g => { const on = (newForm.productGroups || []).includes(g); return (
                      <button key={g} type="button" onClick={() => setNewForm(f => ({ ...f, productGroups: on ? (f.productGroups || []).filter(x => x !== g) : [...(f.productGroups || []), g] }))} className={`text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}>{g}</button>
                    ); })}
                  </div>
                </div>
                <div className="sm:col-span-2"><label className="form-label">Собственные бренды (СТМ)</label><TagInput tags={newForm.ownBrands || []} onChange={v => setNewForm(f => ({ ...f, ownBrands: v }))} placeholder="Введите бренд и нажмите Enter..." /></div>
              <div><label className="form-label">Категория (A-B-C)</label>
                {/* ТЗ 1.8: категория ставится АВТОМАТИЧЕСКИ по скорингу (выручка 2110) — ручной выбор невозможен */}
                <div className="flex items-center gap-1.5 py-2">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-full border-2 border-transparent text-sm font-bold" style={CAT_STYLE_MAP[newForm.category ?? 'C']} title="Категория C — по умолчанию; пересчитается автоматически после скоринга">{newForm.category ?? 'C'}</span>
                </div></div>
            </div>
            <div className="flex gap-2 justify-end"><button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary">Отмена</button><button type="submit" className="btn-primary">Сохранить и открыть карточку</button></div>
              {formError && <p className="text-xs text-red-600 mt-2">{formError}</p>}
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="card-base p-3 space-y-2">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[160px]"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="form-input pl-8 py-1.5 text-xs" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} />
            {/* ТЗ 1.8: красная кнопка прямо в поиске — только если есть компании без скоринга */}
            {noScoringCount > 0 && (
              <button onClick={() => setNoScoringOnly(v => !v)}
                className={`absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors ${noScoringOnly ? 'bg-red-600 text-white' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                title="Показать только компании без данных скоринга">
                Не прошли скоринг{noScoringOnly ? ' ✕' : ''}
              </button>
            )}
          </div>
          <select className="form-input py-1.5 text-xs w-auto" value={filterType} onChange={e => setFilterType(e.target.value)}><option value="">Все типы</option>{supplierTypes.map(t => <option key={t}>{t}</option>)}</select>
          <select className="form-input py-1.5 text-xs w-auto" value={filterCity} onChange={e => setFilterCity(e.target.value)}><option value="">Все города</option>{cities.map(c => <option key={c}>{c}</option>)}</select>
          <select className="form-input py-1.5 text-xs w-auto" value={filterResponsible} onChange={e => setFilterResponsible(e.target.value)}><option value="">Все ответственные</option>
            <option value="__none__">Без ответственного</option>{store.settings.users.filter(u => u.status === 'active').map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <button onClick={() => setFilterStm(v => !v)} className={`btn-secondary text-xs py-1.5 ${filterStm ? 'bg-gray-200' : ''}`}>{filterStm ? 'СТМ ✓' : 'СТМ'}</button>
          <button onClick={() => setSmFilter(v => (v + 1) % 3)} className={`btn-secondary text-xs py-1.5 flex items-center gap-1.5 ${smFilter === 1 ? 'border-red-500 text-red-600' : smFilter === 2 ? 'border-green-500 text-green-600' : ''}`}>ЛК <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title="1-й клик — без ссылки, 2-й — со ссылкой, 3-й — сброс" /></button>
          <button onClick={() => setWhFilter(v => (v + 1) % 3)} className={`btn-secondary text-xs py-1.5 flex items-center gap-1.5 ${whFilter === 1 ? 'border-red-500 text-red-600' : whFilter === 2 ? 'border-green-500 text-green-600' : ''}`}>СКЛАД <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="1-й клик — без складов, 2-й — со складами, 3-й — сброс" /></button>
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
          {supplierStatuses.filter(s => s !== 'Активный' && (showArchived || (s !== 'АРХИВ' && s !== 'Архив дублей'))).map(s => <button key={s} onClick={() => setFilterStatus(filterStatus === s ? '' : s)} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${filterStatus === s ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>{s} <span className="ml-1 font-semibold">{statusCounts[s] || 0}</span></button>)}
          {/* ТЗ 1.8: фильтр по категории — кружки A/B/C, по умолчанию ВЫКЛ (показываем все), клик ВКЛЮЧАЕТ (можно несколько) */}
          {(['A', 'B', 'C'] as const).map(c => (
            <button key={c} onClick={() => setCatSel(o => o.includes(c) ? o.filter(x => x !== c) : [...o, c])}
              className={`inline-flex items-center justify-center rounded-full text-[11px] font-bold transition-colors ${catSel.includes(c) ? 'bg-brand-black text-white' : 'border border-brand-gray-mid text-gray-400'}`}
              style={{ width: 22, height: 22 }} title={`Категория ${c}`}>{c}</button>
          ))}
        </div>
        {/* ТЗ 1.8: фильтр сервисов — мультивыбор пилюлями, без метки «Сервис:» */}
        {allServices.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <button onClick={() => setServicesSel([])} className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${servicesSel.length === 0 ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>Все</button>
            {allServices.map(svc => (
              <button key={svc} onClick={() => setServicesSel(o => o.includes(svc) ? o.filter(x => x !== svc) : [...o, svc])}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${servicesSel.includes(svc) ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>{svc}</button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="card-base p-3 flex flex-wrap items-center gap-2 bg-blue-50 border-blue-200 animate-fade-in">
          <span className="text-xs font-medium text-blue-700">Выбрано: {selected.length}</span>
          <select className="form-input py-1 text-xs w-auto" value={massStatus} onChange={e => setMassStatus(e.target.value)}><option value="">Статус...</option>{supplierStatuses.map(s => <option key={s}>{s}</option>)}</select>
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
          {canDelete() && (!showArchived
            ? <button onClick={() => handleDelete(selected)} className="action-btn action-btn-md text-xs py-1"><Trash2 size={12} /> Перенести в архив</button>
            : <button onClick={() => handleRestore(selected)} className="action-btn action-btn-md text-xs py-1"><RotateCcw size={12} /> Восстановить</button>
          )}
          <button onClick={() => setSelected([])} className="text-xs text-gray-400 ml-auto"><X size={14} /></button>
        </div>
      )}

      <div className="card-base overflow-hidden">
        <div className="table-scroll">
          <table className="w-full">
            <thead>
              <tr className="border-b border-brand-gray-mid">
                <th className="table-header w-10"><input type="checkbox" checked={selected.length === suppliers.length && suppliers.length > 0} onChange={toggleAll} className="rounded" /></th>
                <th className="table-header">Название</th>
                <th className="table-header hidden sm:table-cell">Тип</th>
                <th className="table-header hidden md:table-cell">Город</th>
                <th className="table-header">Контакт</th>
                <th className="table-header">Статус</th>
                <th className="table-header hidden xl:table-cell">Сервисы</th>
              <th className="table-header hidden xl:table-cell">Склады / SKU</th>
                <th className="table-header hidden xl:table-cell">Категория</th>
                <th className="table-header hidden lg:table-cell cursor-pointer select-none whitespace-nowrap" onClick={cycleSortDate}>
                  <span className="flex items-center gap-1">Создан{sortDate === 'asc' ? <ChevronUp size={12} /> : sortDate === 'desc' ? <ChevronDown size={12} /> : <span className="text-gray-300">↕</span>}</span>
                </th>
                <th className="table-header w-14"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-gray-400 text-sm">Записей не найдено</td></tr>}
              {suppliers.slice(0, listShown).map(s => (
                <tr key={s.id} className={`table-row ${s.deletedAt ? 'opacity-50' : ''}`} onClick={() => navigate(`/suppliers/${s.id}`)}>
                  <td className="table-cell" onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggleSelect(s.id)} className="rounded" /></td>
                  {/* v1.30.98: постоянный ID под названием (публичный, как в 1.31.18) */}
                  <td className="table-cell font-medium">{s.tradeName}{!s.responsibleId && <span className="text-brand-red ml-0.5" title="Нет ответственного — запись видна всем менеджерам">*</span>}<p className="text-[10px] font-mono text-gray-400 font-normal mt-0.5" title={`Внутренний ID: ${s.id}`}>{s.publicId || s.id}</p></td>
                  <td className="table-cell hidden sm:table-cell text-xs text-gray-500">{s.type}</td>
                  <td className="table-cell hidden md:table-cell text-xs">{s.city}</td>
                  <td className="table-cell">
                    <div className="text-xs"><p className="font-medium">{s.contactName}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
                        {(s.contactPrefs || []).map(cp => (
                          <button key={cp} title={`Копировать: ${cp}`} onClick={() => {
                            const val = (cp.toLowerCase().includes('почт') || cp.toLowerCase().includes('email')) ? (s.email || '') : (s.phone || '');
                            if (val) navigator.clipboard.writeText(val).then(() => toast.success(`Скопировано: ${cp}`));
                            else toast.error('Нет данных для копирования');
                          } } className="text-[10px] text-gray-500 bg-gray-100 hover:bg-gray-200 px-1.5 py-0.5 rounded transition-colors">{cp}</button>
                        ))}
                      </div>
                    </div>
                  </td>
                  <td className="table-cell" onClick={e => { e.stopPropagation(); setStatusModal({ id: s.id, status: s.status }); }}>
                    <span className="cursor-pointer hover:opacity-75 transition-opacity" title="Сменить статус"><StatusBadge status={s.status} /></span>
                  </td>
                  <td className="table-cell hidden xl:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {(s.services || []).map(svc => (
                        <span key={svc} className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded font-medium">{svc}</span>
                      ))}
                    </div>
                  </td>
                  <td className="table-cell hidden xl:table-cell text-xs text-gray-600 whitespace-nowrap">
                    {(() => {
                      // Замороженные склады не считаются существующими
                      const activeWh = (s.warehouseLocations || []).filter(w => w.status !== 'Заморожен');
                      const wh = s.warehouseCount || activeWh.length;
                      const sku = s.skuCount || activeWh.reduce((a, w) => a + (w.skuCount || 0), 0);
                      const hasStm = (s.ownBrands || []).length > 0;
                      const hasService = Boolean(s.serviceAccess?.token);
                      // Точки всегда: синяя = нет ссылки самообслуживания (фильтр «СМ –»),
                      // красная = нет складов (фильтр «СКЛАД –»). Обе, если нет того и другого.
                      return (
                        <div className="flex flex-wrap items-center gap-1">
                          {!hasService && <span className="inline-block w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" title="Ссылка самообслуживания не создана (фильтр «СМ –»)" />}
                          {wh === 0 && <span className="inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Склады не созданы (фильтр «СКЛАД –»)" />}
                          {wh > 0 && <span className="text-[11px] bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-medium">{wh} {whPl(wh)}</span>}
                          {sku > 0 && <span className="text-[11px] bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-medium">{sku.toLocaleString('ru-RU')} SKU</span>}
                          {hasStm && <span className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="СТМ заполнено" />}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="table-cell hidden xl:table-cell text-center">
                    <div className="inline-flex items-center gap-1">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold" style={CAT_STYLE_MAP[s.category ?? 'C']} title={s.category ?? 'C'}>{s.category ?? 'C'}</span>
                      {/* ТЗ 1.8: «!» показываем только если данных скоринга нет (заполнено — ничего не показываем), размер = размеру категории */}
                      {!(s.scoring && (s.scoring.apiLoaded || s.scoring.revenue || s.scoring.annualRevenue)) && (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-600 text-xs font-bold" title="Данные скоринга не заполнены">!</span>
                      )}
                    </div>
                  </td>
                  <td className="table-cell hidden lg:table-cell text-xs text-gray-400">{formatDate(s.createdAt)}{(s.responsibleName || ((store.settings.users || []).find(u => u.id === s.responsibleId)?.name || '')) && <div className="text-[10px] text-gray-400">{s.responsibleName || (store.settings.users || []).find(u => u.id === s.responsibleId)?.name}</div>}</td>
                  <td className="table-cell" onClick={e => e.stopPropagation()}>
                    {/* ТЗ 1.8: горизонтально; «плей» в зелёном круге — только для НЕактивных; редактирование последним */}
                    <div className="flex items-center gap-1 justify-end">
                      {s.status !== 'Активный' && (
                        <button onClick={() => quickActivate(s.id, s.tradeName, s.status)}
                          title={(s.scoring && (s.scoring.apiLoaded || s.scoring.revenue || s.scoring.annualRevenue)) ? 'Активировать на платформе' : 'Заполните данные скоринга для активации'}
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                          style={(s.scoring && (s.scoring.apiLoaded || s.scoring.revenue || s.scoring.annualRevenue))
                            ? { background: 'rgb(209, 250, 229)', color: 'rgb(6, 95, 70)' }
                            : { background: 'rgb(229, 231, 235)', color: 'rgb(156, 163, 175)', cursor: 'not-allowed' }}>
                          <Play size={14} />
                        </button>
                      )}
                      <button onClick={() => navigate(`/suppliers/${s.id}`)} className="p-1 text-gray-400 hover:text-brand-black transition-colors" title="Редактировать"><Edit2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* ТЗ: подгрузка «Показать ещё» + выбор размера страницы */}
        {suppliers.length > listShown && (
          <div className="flex items-center justify-between pt-1">
            <button onClick={() => setListShown(v => v + listLimit)} className="btn-secondary text-xs">Показать ещё · осталось {suppliers.length - listShown}</button>
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
              <h3 className="section-title">Создать задачу ({selected.length} поставщиков)</h3>
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

{showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImport} entityLabel="поставщиков" sampleFields={IMPORT_FIELDS} />}
      {statusModal && (
        <StatusChangeModal
          entityType="supplier"
          initial={statusModal.status}
          onClose={() => setStatusModal(null)}
          onSave={(st, comment, archive) => {
            // ТЗ 1.8: активация через смену статуса невозможна без заполненного скоринга
            if (st === 'Активный' && statusModal.status !== 'Активный') {
              const tg = getStore().suppliers.find(x => x.id === statusModal.id);
              if (tg && !(tg.scoring && (tg.scoring.apiLoaded || tg.scoring.revenue || tg.scoring.annualRevenue))) {
                toast.error('Невозможно активировать: заполните данные скоринга поставщика');
                setStatusModal(null);
                return;
              }
            }
            const u = getCurrentUser(); const now = new Date().toISOString();
            updateStore(s => ({
              ...s,
              suppliers: s.suppliers.map(x => x.id === statusModal.id ? {
                ...x, status: st as (typeof x)['status'], updatedAt: now, deletedAt: archive ? now : x.deletedAt,
                history: [...x.history, { id: generateId(), date: now, field: 'status', oldValue: statusModal.status, newValue: st, comment: comment || undefined, userId: u?.id || '', userName: u?.name || '' }],
              } : x),
            }));
            setStatusModal(null); forceUpdate(n => n + 1); toast.success(`Статус: ${st}`);
            // Активация через модалку = то же действие, что кнопка «+»: предлагаем автозадачу
            if (st === 'Активный' && statusModal.status !== 'Активный') {
              const sup2 = getStore().suppliers.find(x => x.id === statusModal.id);
              const nm = sup2?.tradeName || '';
              if (confirm(`Создать задачу «${SYSTEM_TASK_TYPE}» для поставщика «${nm}»?\nОтветственным будет назначен: ${u?.name || ''}.`)) {
                const task: Task = {
                  id: generateId(), entityType: 'supplier', entityId: statusModal.id, entityName: nm,
                  title: SYSTEM_TASK_TYPE, description: `Автозадача после активации поставщика «${nm}».`,
                  dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
                  createdAt: now, updatedAt: now, createdBy: u?.id || '', responsibleId: u?.id, responsibleName: u?.name,
                  history: [{ id: generateId(), date: now, field: 'created', comment: `Автозадача создана при активации поставщика (${u?.name || ''})`, userId: u?.id || '', userName: u?.name || '' }],
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
