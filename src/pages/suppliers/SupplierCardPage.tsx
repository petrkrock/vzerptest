import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getStore, updateStore, makeHistoryEntry, useStoreVersion, getContactPrefs } from '@/lib/store';
import { generateId, formatDate, formatDateTime } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth';
import StatusBadge from '@/components/features/StatusBadge';
import HistoryTab from '@/components/features/HistoryTab';
import ScoringTab from '@/components/features/ScoringTab';
import { fetchCheckoCompany } from '@/services/checko'; // этап 1.8 — API скоринг Checko

// ТЗ 1.8: системные цвета категорий поставщиков (A/B/C)
const CAT_STYLE_MAP: Record<'A' | 'B' | 'C', { background: string; color: string }> = {
  A: { background: 'rgb(209, 250, 229)', color: 'rgb(6, 95, 70)' },
  B: { background: 'rgb(239, 246, 255)', color: 'rgb(30, 64, 175)' },
  C: { background: 'rgb(254, 243, 199)', color: 'rgb(180, 83, 9)' },
};
import RequisitesTab from '@/components/features/RequisitesTab';
import TagInput from '@/components/features/TagInput';
import CitySelect from '@/components/features/CitySelect';
import type { Supplier, ServiceSearchCondition, ScoreData, RequisitesData, Task, WarehouseLocation, WarehouseStatus, HistoryEntry } from '@/types';
import {ROLE_TYPES, SYSTEM_TASK_TYPE, DEFAULT_SUPPLIER_GREETING, DEFAULT_TASK_TYPES} from '@/constants';
import { ArrowLeft, Save, Edit2, X, Plus, Trash2, Calendar, CheckCircle, Link2, Copy, RotateCcw, Pencil, ChevronDown } from 'lucide-react';
import ResponsibleSelect from '@/components/features/ResponsibleSelect';
import { toast } from 'sonner';
import ContactPrefIcon from '@/components/features/ContactPrefIcons';

const TABS = ['Анкета', 'Склад', 'Сервис проценки (DBS)', 'Скоринг', 'Дополнительно', 'История'];
const SS_FIELDS: { key: keyof ServiceSearchCondition; label: string }[] = [
  { key: 'city', label: 'Город показов' }, { key: 'warehouseName', label: 'Склад поставщика' },
  { key: 'representative', label: 'Представитель' }, { key: 'contacts', label: 'Контакты' },
  { key: 'email', label: 'Email' }, { key: 'deliverySchedule', label: 'График доставки' },
  { key: 'orderUnloadSchedule', label: 'Условия доставки' },
  { key: 'returnConditions', label: 'Условия возврата товара' },
  { key: 'deliveryTime', label: 'Срок поставки до выбранного города' }, // v_1.9
];

// v_1.9: срок поставки — две быстрые кнопки (Сегодня/Завтра) или свой ввод, можно только одно
function DeliveryTimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="flex gap-1.5 mb-1.5">
        <button type="button" onClick={() => onChange(value.toLowerCase() === 'сегодня' ? '' : 'Сегодня')}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${value.toLowerCase() === 'сегодня' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:bg-brand-gray'}`}>Сегодня</button>
        <button type="button" onClick={() => onChange(value.toLowerCase() === 'завтра' ? '' : 'Завтра')}
          className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${value.toLowerCase() === 'завтра' ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:bg-brand-gray'}`}>Завтра</button>
      </div>
      <input className="form-input text-xs" value={value} onChange={e => onChange(e.target.value)} placeholder="например: 2 дня" />
    </div>
  );
}

function ProductGroupSelect({ selected, onChange, groups }: { selected: string[]; onChange: (v: string[]) => void; groups: string[] }) {
  function toggle(name: string) { if (selected.includes(name)) onChange(selected.filter(s => s !== name)); else onChange([...selected, name]); }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {groups.map(g => <button key={g} type="button" onClick={() => toggle(g)} className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selected.includes(g) ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-600 hover:border-gray-400'}`}>{g}</button>)}
      {groups.length === 0 && <span className="text-xs text-gray-400">Нет групп. Настройки → Группы товаров</span>}
    </div>
  );
}

export default function SupplierCardPage() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const { id } = useParams();
  const navigate = useNavigate();

  const [tab, setTab] = useState('Анкета');
  const [editing, setEditing] = useState(false);
  const [, forceUpdate] = useState(0);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', dueDate: new Date().toISOString().split('T')[0], description: '', priority: 3 });
  const [statusComment, setStatusComment] = useState('');
  const [newServiceSearch, setNewServiceSearch] = useState(false);
  const [ssForm, setSsForm] = useState<Partial<ServiceSearchCondition>>({});
  const [editingSsId, setEditingSsId] = useState<string | null>(null);
  const [editingSsForm, setEditingSsForm] = useState<Partial<ServiceSearchCondition>>({});
  const [formState, setFormState] = useState<Supplier | null>(null);
  const [newWarehouse, setNewWarehouse] = useState(false);
  const [whForm, setWhForm] = useState({ city: '', address: '', skuCount: 0, verified: false });

  const cityList = getStore().settings.cities || [];
  const initialStore = getStore();
  const supplierTypes = initialStore.settings.supplierTypes || ['Поставщик/склад', 'Производитель/бренд'];
  const activeSources = (initialStore.settings.sources || []).filter(s => !s.deletedAt);
  const activeProductGroups = (initialStore.settings.productGroups || []).filter(g => !g.deletedAt).map(g => g.name);
  const activeSupplierServices = (initialStore.settings.supplierServices || []).map(s => s.name);
  const supplierStatuses = initialStore.settings.statuses.filter(s => s.entityTypes.includes('supplier')).map(s => s.name);

  const freshSupplierMaybe = getStore().suppliers.find(s => s.id === id);
  const [pinDraft, setPinDraft] = useState(freshSupplierMaybe?.serviceAccess?.pin || '');
  const [whDelete, setWhDelete] = useState<{ locId: string; city: string } | null>(null);
  const [whDeleteText, setWhDeleteText] = useState('');
  const checkoKey = getStore().settings.checkoApiKey || '';
  const checkoEnabled = !!getStore().settings.checkoApiEnabled && !!checkoKey.trim();
  useEffect(() => {
    if (!checkoEnabled || !freshSupplierMaybe?.inn) return;
    const sdata = freshSupplierMaybe?.scoring;
    if (sdata?.apiLoaded && sdata?.apiLoadedAt) return; // успешно загружено — автоповтора нет
    runScoring(); // при ошибке ничего не сохранится → эффект не перезапустится сам
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshSupplierMaybe?.inn, checkoEnabled]);
  const [ssFilterStatus, setSsFilterStatus] = useState('');
  const [editingWhId, setEditingWhId] = useState<string | null>(null);
  const [whEditForm, setWhEditForm] = useState({ city: '', skuCount: 0, address: '' }); // ТЗ v1.25.0: +адрес
  const [ssFilterCity, setSsFilterCity] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [priceEmailEdit, setPriceEmailEdit] = useState(false);
  const [priceEmailDraft, setPriceEmailDraft] = useState('');
  const form: Supplier = formState || (freshSupplierMaybe ? { ...freshSupplierMaybe } : {} as Supplier);
  const setForm = (updater: Supplier | ((prev: Supplier) => Supplier)) => {
    setFormState(prev => {
      const base = prev || (freshSupplierMaybe ? { ...freshSupplierMaybe } : {} as Supplier);
      return typeof updater === 'function' ? updater(base) : updater;
    });
  };

  if (!freshSupplierMaybe) {
    return <div className="text-center py-20"><p className="text-gray-400 mb-4">Поставщик не найден</p><button onClick={() => navigate('/suppliers')} className="btn-secondary">← Назад</button></div>;
  }
  // v1.35.3: после guard freshSupplier гарантированно есть — TS сужает тип для всего ниже.
  const freshSupplier = freshSupplierMaybe;

  const warehouseLocations: WarehouseLocation[] = freshSupplier.warehouseLocations || [];
  const totalWarehouses = warehouseLocations.length || freshSupplier.warehouseCount || 0;
  const totalCities = new Set(warehouseLocations.map(w => w.city)).size;
  const totalSKU = warehouseLocations.reduce((sum, w) => sum + w.skuCount, 0) || freshSupplier.skuCount || 0;

  function saveForm() {
    const u = getCurrentUser()!;
    // ТЗ 1.8: ИНН — только цифры, строго 10 или 12 разрядов
    const innClean = (form.inn || '').replace(/\D/g, '');
    if (!/^\d{10}$|^\d{12}$/.test(innClean)) { toast.error('ИНН должен содержать 10 или 12 цифр (только цифры)'); return; }
    if ((form.inn || '') !== innClean) setForm(f => ({ ...f, inn: innClean }));
    const now = new Date().toISOString();
    const history = [...freshSupplier.history];
        // ТЗ: перевод из «Активного» в любой другой статус — только с обязательным
    // комментарием и подтверждением; комментарий наследуется в историю.
    if (form.status !== freshSupplier.status && /актив/i.test(freshSupplier.status) && !/актив/i.test(form.status)) {
      if (!statusComment.trim()) { toast.error('Смена статуса «' + freshSupplier.status + '» → «' + form.status + '»: комментарий обязателен.'); return; }
      if (!confirm('Сменить статус с «' + freshSupplier.status + '» на «' + form.status + '»?')) return;
    }
if (form.status !== freshSupplier.status) history.push(makeHistoryEntry('status', freshSupplier.status, form.status, statusComment, u.id, u.name));
    if (form.tradeName !== freshSupplier.tradeName) history.push(makeHistoryEntry('tradeName', freshSupplier.tradeName, form.tradeName, undefined, u.id, u.name));
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...form, category: form.category ?? 'C', history, updatedAt: now } : sup) }));
    setEditing(false); setStatusComment(''); setFormState(null); forceUpdate(n => n + 1); toast.success('Карточка сохранена');
    // ТЗ 1.8: активация невозможна без заполненного скоринга
    if (form.status !== freshSupplier.status && /актив/i.test(form.status) && !/актив/i.test(freshSupplier.status)) {
      if (!hasScoring(freshSupplier.scoring)) { toast.error('Невозможно активировать: заполните данные скоринга поставщика'); return; }
      offerActivationTask(freshSupplier.tradeName || '');
    }
  }

  // ТЗ 1.8: скоринг считается заполненным, если есть API-загрузка или выручка/оборот
  function hasScoring(x?: ScoreData): boolean {
    return !!x && !!(x.apiLoaded || x.revenue || x.annualRevenue);
  }


  /** Автозадача «Ждет активации» — общая для кнопки «Активировать», смены статуса в анкете и массовой смены. */
  function offerActivationTask(name: string) {
    const u = getCurrentUser(); const now = new Date().toISOString();
    if (!confirm(`Создать задачу «${SYSTEM_TASK_TYPE}» для поставщика «${name}»?\nОтветственным будет назначен: ${u?.name || ''}.`)) return;
    const task: Task = {
      id: generateId(), entityType: 'supplier', entityId: id!, entityName: name,
      title: SYSTEM_TASK_TYPE, description: `Автозадача после активации поставщика «${name}».`,
      dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 0,
      createdAt: now, updatedAt: now, createdBy: u?.id || '', responsibleId: u?.id, responsibleName: u?.name,
      history: [{ id: generateId(), date: now, field: 'created', comment: `Автозадача создана при активации поставщика (${u?.name || ''})`, userId: u?.id || '', userName: u?.name || '' }],
    };
    updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
    toast.success('Задача создана и отправлена в новые');
  }

  function handleActivate() {
    // ТЗ 1.8: без заполненного скоринга активация невозможна
    if (!hasScoring(freshSupplier.scoring)) { toast.error('Невозможно активировать: заполните данные скоринга поставщика'); return; }
    if (!confirm('Активировать поставщика на платформе?')) return;
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const name = freshSupplier?.tradeName || '';
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, status: 'Активный', updatedAt: now, history: [...sup.history, makeHistoryEntry('status', sup.status, 'Активный', 'Активирован на платформе', u.id, u.name)] } : sup) }));
    forceUpdate(n => n + 1); toast.success('Поставщик активирован на платформе!');
    // Автозадача «Ждет активации»: предлагаем сразу после активации, ответственный — создатель
    if (confirm(`Создать задачу «${SYSTEM_TASK_TYPE}» для поставщика «${name}»?\nОтветственным будет назначен: ${u.name}.`)) {
      const task: Task = {
        id: generateId(), entityType: 'supplier', entityId: id, entityName: name,
        title: SYSTEM_TASK_TYPE, description: `Автозадача после активации поставщика «${name}».`,
        dueDate: now.split('T')[0], taskStatus: 'Новая', completed: false, priority: 3,
        createdAt: now, updatedAt: now, createdBy: u.id, responsibleId: u.id, responsibleName: u.name,
        history: [{ id: generateId(), date: now, field: 'created', comment: `Автозадача создана при активации поставщика (${u.name})`, userId: u.id, userName: u.name }],
      };
      updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
      toast.success('Задача создана и отправлена в новые');
    }
  }

  // ТЗ 1.8: категория ставится АВТОМАТИЧЕСКИ по выручке (стр. 2110) относительно порогов настроек
  function autoCategory(revenue?: number): 'A' | 'B' | 'C' {
    const t = getStore().settings.supplierCategoryTurnover || { A: 50000000, B: 30000000, C: 10000000 };
    if (revenue && revenue >= t.A) return 'A';
    if (revenue && revenue >= t.B) return 'B';
    return 'C';
  }

  function saveScoring(data: ScoreData) {
    const u = getCurrentUser()!;
    const category = autoCategory(data.revenue);
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, scoring: data, category, updatedAt: new Date().toISOString(), history: [...sup.history, makeHistoryEntry('scoring', undefined, 'Обновлено', undefined, u.id, u.name)] } : sup) }));
    forceUpdate(n => n + 1);
  }

    // ── Этап 1.8: скоринг через Checko API ──
  // АВТОЗАПУСК — один раз при появлении ИНН в базе (apiLoaded не даёт повторов).
  // При неудаче автозапуск НЕ повторяется — повторный запрос — кнопка «Скоринг» во вкладке.
  const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'; // этап 1.8: в демо-режиме API не вызывается

  async function runScoring(manual = false) {
    if (DEMO_MODE) { toast('Демо-режим: запрос к Checko API отключён'); return; }
    if (!checkoEnabled) { toast.error('API Checko отключён — включите ключ в Настройки → API'); return; }
    if (!freshSupplier?.inn) { toast.error('ИНН не заполнен'); return; }
    if (manual) toast(`Идёт скоринг поставщика по ИНН ${freshSupplier.inn}`, { duration: 4000 });
    try {
      const data = await fetchCheckoCompany(checkoKey, freshSupplier.inn);
      saveScoring(data);
      toast.success(`Скоринг получен: ${data.companyName || 'Checko'} · ${data.year} г.`);
    } catch (e) {
      toast.error('Checko API: ' + (e as Error).message + ' — повторите позже кнопкой «Скоринг» или введите данные вручную');
    }
  }



  function saveRequisites(data: RequisitesData) {
    const u = getCurrentUser()!;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, requisites: data, updatedAt: new Date().toISOString(), history: [...sup.history, makeHistoryEntry('requisites', undefined, 'Обновлено', undefined, u.id, u.name)] } : sup) }));
    forceUpdate(n => n + 1);
  }

  function addWarehouseLocation() {
    if (!whForm.city.trim()) { toast.error('Укажите город'); return; }
    if (!whForm.address?.trim()) { toast.error('Укажите адрес склада'); return; } // ТЗ v1.25.0: адрес обязателен
    if (!freshSupplier.multiWarehouse && (freshSupplier.warehouseLocations || []).length >= 1) {
      toast.error('Мультисклад выключен — нельзя добавить больше 1 склада. Включите «Мультисклад» переключателем слева от кнопки.');
      return;
    }
    const loc: WarehouseLocation = { id: generateId(), city: whForm.city.trim(), address: whForm.address?.trim() || '', skuCount: whForm.skuCount || 0, status: 'Новый', verified: false }; // статус «Новый» ставит система
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, warehouseLocations: [...(sup.warehouseLocations || []), loc], updatedAt: new Date().toISOString() } : sup) }));
    setWhForm({ city: '', address: '', skuCount: 0, verified: false }); setNewWarehouse(false); forceUpdate(n => n + 1); toast.success('Склад добавлен');
  }

  function startEditWarehouse(wl: WarehouseLocation) { setEditingWhId(wl.id); setWhEditForm({ city: wl.city, skuCount: wl.skuCount, address: wl.address || '' }); }
  function saveWarehouseEdit(locId: string) {
    if (!window.confirm('Я согласен и проверил вносимые изменения. Сохранить?')) return;
    const u = getCurrentUser()!;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, warehouseLocations: (sup.warehouseLocations || []).map(w => w.id === locId ? { ...w, city: whEditForm.city.trim() || w.city, skuCount: whEditForm.skuCount || 0, address: whEditForm.address?.trim() || w.address } : w), history: [...sup.history, makeHistoryEntry('warehouseLocations', undefined, `Склад изменён: ${whEditForm.city} (SKU ${whEditForm.skuCount})`, 'Редактирование склада', u.id, u.name)] } : sup) }));
    setEditingWhId(null); forceUpdate(n => n + 1); toast.success('Склад обновлён');
  }

  // Раньше здесь вызывался несуществующий addHistory() — кнопки истории падали
// с ReferenceError. Паттерн тот же, что в карточке покупателя: запись в history[] поставщика.
function pushSupplierHistory(entry: HistoryEntry) {
  updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id
    ? { ...sup, history: [...(sup.history || []), entry] } : sup) }));
}

function setWarehouseStatus(locId: string, status: WarehouseStatus) {
    if (status === 'Проверен' && !window.confirm('Вы подтверждаете, что склад проверен?')) return;
    // ТЗ v1.28.1: заморозка — с подтверждением и каскадом: все условия склада → «Удаление»
    const whCity = (freshSupplier.warehouseLocations || []).find(w => w.id === locId)?.city;
    if (status === 'Заморожен' && !window.confirm(`Заморозить склад «${whCity || ''}»? Все привязанные условия проценки получат статус «Удаление». Продолжить?`)) return;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? {
      ...sup,
      warehouseLocations: (sup.warehouseLocations || []).map(w => w.id === locId ? { ...w, status, verified: status === 'Проверен' } : w),
      serviceSearch: (status === 'Заморожен' && whCity) ? (sup.serviceSearch || []).map(c => (c.warehouseName || '') === whCity ? { ...c, status: 'Удаление' } : c) : sup.serviceSearch,
      updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '',
    } : sup) }));
    pushSupplierHistory(makeHistoryEntry('warehouseLocations', undefined, `Статус склада: ${status}`, 'Проверка склада', getCurrentUser()?.id || '', getCurrentUser()?.name || ''));
    forceUpdate(n => n + 1);
  }



  function removeWarehouseLocation(locId: string, city: string) {
    // Удаление склада — только с подтверждением: нужно набрать слово «удалить»
    setWhDelete({ locId, city });
    setWhDeleteText('');
  }

  function confirmRemoveWarehouse() {
    if (!whDelete) return;
    if (whDeleteText.trim().toLowerCase() !== 'удалить') { toast.error('Наберите слово «удалить» для подтверждения'); return; }
    const locId = whDelete.locId;
    setWhDelete(null);
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, warehouseLocations: (sup.warehouseLocations || []).filter(w => w.id !== locId), updatedAt: new Date().toISOString() } : sup) }));
    forceUpdate(n => n + 1);
    toast.success('Склад удалён');
    return;
    if (!confirm('Удалить этот склад?')) return;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, warehouseLocations: (sup.warehouseLocations || []).filter(w => w.id !== locId), updatedAt: new Date().toISOString() } : sup) }));
    forceUpdate(n => n + 1);
  }

  function genToken() { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(''); }
  function patchServiceAccess(patch: Partial<NonNullable<Supplier['serviceAccess']>>, comment: string) {
    const current: NonNullable<Supplier['serviceAccess']> = freshSupplier.serviceAccess || { token: genToken(), enabled: true, createdAt: new Date().toISOString() };
    const next = { ...current, ...patch };
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, serviceAccess: next, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) }));
    pushSupplierHistory(makeHistoryEntry('serviceAccess', JSON.stringify(freshSupplier.serviceAccess || null), JSON.stringify(next), comment, getCurrentUser()?.id || '', getCurrentUser()?.name || ''));
    forceUpdate(n => n + 1);
  }

  function addToAllCities() {
    const cities = cityList;
    if (!cities.length) { toast.error('Список доступных городов пуст — заполните его в Настройки → Типы и города'); return; }
    if ((freshSupplier.warehouseLocations || []).length === 0) { toast.error('Сначала добавьте хотя бы один склад'); return; }
    const existing = new Set((freshSupplier.serviceSearch || []).map(c => (c.city || '').toLowerCase()));
    const template = {
      id: '', // присваивается на каждый город ниже
      status: 'Загружено' as const, // условие добавлено менеджером в CRM → сразу на платформе
      createdAt: '', updatedAt: '',
      city: '', warehouseName: ssForm.warehouseName || '', representative: ssForm.representative || '',
      contacts: ssForm.contacts || '', email: ssForm.email || '', deliverySchedule: ssForm.deliverySchedule || '',
      orderUnloadSchedule: ssForm.orderUnloadSchedule || '', returnConditions: ssForm.returnConditions || '',
      officialWarehouse: ssForm.officialWarehouse || '',
    };
    const additions = cities.filter(c => !existing.has(c.toLowerCase())).map(c => ({ ...template, id: generateId(), city: c, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    if (!additions.length) { toast.info('Все доступные города уже добавлены'); return; }
    const nextList = [...(freshSupplier.serviceSearch || []), ...additions];
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, serviceSearch: nextList, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) }));
    pushSupplierHistory(makeHistoryEntry('serviceSearch', undefined, `Добавлено условий для городов: ${additions.map(a => a.city).join(', ')}`, `Одно условие на ${additions.length} городов`, getCurrentUser()?.id || '', getCurrentUser()?.name || ''));
    toast.success(`Добавлено условий: ${additions.length}`);
    forceUpdate(n => n + 1);
  }

  function renderSsField(f: { key: string; label: string }, state: Record<string, unknown>, setter: (fn: (prev: Record<string, unknown>) => Record<string, unknown>) => void) {
    const val = String(state[f.key] ?? '');
    const set = (v: string) => setter(prev => ({ ...prev, [f.key]: v }));
    if (f.key === 'deliveryTime') {
      // ТЗ v1.24.3: кнопка ТК — зеркало ЛК: дописывает/убирает фразу в «Условиях доставки» (orderUnloadSchedule)
      const TK_TEXT = 'Условия доставки по согласованию!';
      const tkOn = String(state['orderUnloadSchedule'] ?? '').includes(TK_TEXT);
      return (
        <div className="space-y-1.5">
          <button type="button"
            onClick={() => setter(prev => ({ ...prev, orderUnloadSchedule: tkOn
              ? String(prev['orderUnloadSchedule'] ?? '').replace(TK_TEXT, '').replace(/\s{2,}/g, ' ').trim()
              : [String(prev['orderUnloadSchedule'] ?? '').trim(), TK_TEXT].filter(Boolean).join(' ') }))}
            className={`text-[11px] px-2.5 py-1 rounded-lg border font-bold transition-colors ${tkOn ? 'bg-yellow-300 border-yellow-400 text-gray-900' : 'bg-white border-gray-200 text-gray-500 hover:border-yellow-400'}`}>
            ТК
          </button>
          <DeliveryTimeInput value={val} onChange={set} />
        </div>
      );
    }
    if (f.key === 'city') {
      // Guard: карточка открыта по битой ссылке или стор ещё пуст (первый pull) —
  // показываем «не найдено» вместо красного экрана ErrorBoundary.
  if (!freshSupplier) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="card-base p-6 text-center">
          <h2 className="text-lg font-bold mb-2">Поставщик не найден</h2>
          <p className="text-sm text-gray-500">Запись отсутствует в базе. Возможно, она ещё не подгрузилась — обновите страницу через несколько секунд, либо проверьте ссылку.</p>
          <button onClick={() => window.history.back()} className="btn-secondary text-xs mt-4">Назад</button>
        </div>
      </div>
    );
  }
  return (<select className="form-input text-xs" value={val} onChange={e => set(e.target.value)}>
        <option value="">Выберите город...</option>
        {cityList.map(c => <option key={c} value={c}>{c}</option>)}
      </select>);
    }
    if (f.key === 'warehouseName' || f.key === 'officialWarehouse') {
      return (<select className="form-input text-xs" value={val} onChange={e => set(e.target.value)}>
        <option value="">Выберите склад...</option>
        {(freshSupplier.warehouseLocations || []).map(w => <option key={w.id} value={w.city}>{w.city}{w.verified ? ' ✓' : ''}</option>)}
      </select>);
    }
    if (f.key === 'returnConditions') {
      return (<>
        <input className="form-input text-xs" list="vz-return-opts" placeholder="Выберите или введите свой вариант" value={val} onChange={e => set(e.target.value)} />
        <datalist id="vz-return-opts"><option value="Возврат без комиссии" /><option value="Возврат с комиссией" /><option value="Нет возврата" /></datalist>
      </>);
    }
    if (f.key === 'deliverySchedule') {
      const days = val.split(',').map(x => x.trim()).filter(Boolean); // ТЗ v1.23.33: ЛК пишет дни через «, » — без trim плашки не подсвечивались
      return (<div className="flex flex-wrap gap-1">{['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map(d => (
        <button key={d} type="button" onClick={() => set(days.includes(d) ? days.filter(x => x !== d).join(',') : [...days, d].join(','))}
          className={`w-8 h-7 text-[10px] rounded-md border transition-colors ${days.includes(d) ? 'bg-red-50 border-red-300 text-red-700 font-semibold' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>{d}</button>
      ))}</div>);
    }
    return <input className="form-input text-xs" value={val} onChange={e => set(e.target.value)} />;
  }

  function setConditionStatus(condId: string, status: 'Новое' | 'Загружено' | 'Есть изменения' | 'Удаление') { // ТЗ v1.23.28
    if (!window.confirm(`Установить условию статус «${status}»?`)) return;
    const u = getCurrentUser()!;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, serviceSearch: (sup.serviceSearch || []).map(c => c.id === condId ? { ...c, status, updatedAt: new Date().toISOString() } : c), history: [...sup.history, makeHistoryEntry('service_search', undefined, `Статус условия → ${status}`, undefined, u.id, u.name)] } : sup) }));
    forceUpdate(n => n + 1); toast.success('Статус обновлён');
  }

  function addServiceSearch() {
    if ((freshSupplier.warehouseLocations || []).length === 0) { toast.error('Сначала добавьте хотя бы один склад'); return; }
    if (!ssForm.city) { toast.error('Укажите город'); return; }
    const condition: ServiceSearchCondition = { id: generateId(), status: 'Загружено' as const, city: ssForm.city || '', warehouseName: ssForm.warehouseName || '', representative: ssForm.representative || '', contacts: ssForm.contacts || '', email: ssForm.email || '', deliverySchedule: ssForm.deliverySchedule || '', orderUnloadSchedule: ssForm.orderUnloadSchedule || '', returnConditions: ssForm.returnConditions || '', officialWarehouse: ssForm.officialWarehouse || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    const u = getCurrentUser()!;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, serviceSearch: [...(sup.serviceSearch || []), condition], history: [...sup.history, makeHistoryEntry('service_search', undefined, `Добавлен: ${condition.city}`, undefined, u.id, u.name)] } : sup) }));
    setSsForm({}); setNewServiceSearch(false); forceUpdate(n => n + 1); toast.success('Условие добавлено');
  }

  function saveEditSs() {
    if (!editingSsId) return;
    const u = getCurrentUser()!;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, serviceSearch: (sup.serviceSearch || []).map(c => c.id === editingSsId ? { ...c, ...editingSsForm, updatedAt: new Date().toISOString() } : c), history: [...sup.history, makeHistoryEntry('service_search', undefined, `Изменён: ${editingSsForm.city || ''}`, undefined, u.id, u.name)] } : sup) }));
    setEditingSsId(null); setEditingSsForm({}); forceUpdate(n => n + 1); toast.success('Условие обновлено');
  }

  function deleteServiceSearch(ssId: string) {
    if (!confirm('Удалить условие?')) return;
    updateStore(s => ({ ...s, suppliers: s.suppliers.map(sup => sup.id === id ? { ...sup, serviceSearch: (sup.serviceSearch || []).filter(c => c.id !== ssId) } : sup) }));
    forceUpdate(n => n + 1);
  }

  function createTask(e: React.FormEvent) {
    e.preventDefault();
    const u = getCurrentUser()!; const now = new Date().toISOString();
    const task: Task = { id: generateId(), entityType: 'supplier', entityId: id, entityName: freshSupplier?.tradeName, title: taskForm.title, description: taskForm.description, dueDate: taskForm.dueDate, taskStatus: 'Новая', completed: false, priority: taskForm.priority, createdAt: now, updatedAt: now, createdBy: u.id };
    updateStore(s => ({ ...s, tasks: [...s.tasks, task] }));
    setShowTaskForm(false); setTaskForm({ title: '', dueDate: new Date().toISOString().split('T')[0], description: '', priority: 3 });
    forceUpdate(n => n + 1); toast.success('Задача создана');
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => navigate('/suppliers')} className="btn-secondary text-xs"><ArrowLeft size={14} /> Назад</button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="page-title truncate">{freshSupplier.tradeName}</h1>
            <StatusBadge status={freshSupplier.status} size="md" />
          </div>
          <p className="text-xs text-gray-400 mt-1">{freshSupplier.type} · {freshSupplier.city} · Создан: {formatDate(freshSupplier.createdAt)} · Обновлён: {formatDateTime(freshSupplier.updatedAt)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {freshSupplier.status !== 'Активный' && <button onClick={handleActivate} className="btn-activate"><CheckCircle size={16} /> Активировать на платформе</button>}
          <button onClick={() => setShowTaskForm(v => !v)} className="btn-secondary text-sm"><Calendar size={15} /> Задача</button>
                    
          {!editing ? <button onClick={() => { setFormState({ ...freshSupplier }); setEditing(true); }} className="btn-primary"><Edit2 size={16} /> Редактировать</button> : <><button onClick={saveForm} className="btn-primary"><Save size={16} /> Сохранить</button><button onClick={() => { setFormState(null); setEditing(false); }} className="btn-secondary"><X size={16} /> Отмена</button></>}
        </div>
      </div>

      {showTaskForm && (
        <div className="card-base p-4 border-yellow-200 bg-yellow-50 animate-fade-in">
          <div className="flex items-center justify-between mb-3"><h3 className="text-sm font-semibold">Новая задача: {freshSupplier.tradeName}</h3><button onClick={() => setShowTaskForm(false)} className="text-gray-400 hover:text-brand-red"><X size={16} /></button></div>
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
              {(() => { const sa = freshSupplier.serviceAccess; return (
<div className="card-base mb-4 overflow-hidden">
                <button onClick={() => setLinkOpen(o => !o)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors">
                  <span className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Link2 size={17} className="text-brand-red" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="section-title block">ЛК поставщика</span>
                    <span className="text-[11px] text-gray-400 block truncate">
                      {sa?.enabled ? `Самообслуживание активно${sa?.pin ? ' · PIN-код установлен' : ''}` : 'Доступ не выдан — поставщик не может заполнять данные самостоятельно'}
                    </span>
                  </span>
                  <span className={`text-gray-400 transition-transform duration-200 ${linkOpen ? 'rotate-180' : ''}`}><ChevronDown size={16} /></span>
                </button>
                {linkOpen && (
                  <div className="px-4 pb-4 pt-3 border-t border-brand-gray-mid animate-fade-in">
                    <p className="text-xs text-gray-400 mb-3">По ссылке поставщик сам заполняет склады и условия сервиса поиска. Защита — секретный токен{sa?.pin ? ' + PIN-код' : ''}.</p>
                    {sa?.enabled ? (
                      <>
                        <div className="flex items-stretch gap-2 mb-3">
                          <div className="flex-1 min-w-0 flex items-center gap-2 bg-gray-50 border border-brand-gray-mid rounded-lg px-3">
                            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" title="Доступ активен" />
                            <input readOnly className="w-full bg-transparent text-xs py-2.5 outline-none text-brand-black truncate" value={`${window.location.origin}/s/${sa.token}`} onFocus={e => (e.target as HTMLInputElement).select()} />
                          </div>
                          <button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/s/${sa.token}`); toast.success('Ссылка скопирована'); }} className="btn-secondary text-xs flex items-center gap-1 whitespace-nowrap"><Copy size={12} /> Копировать</button>
                          <a href={`/s/${sa.token}`} target="_blank" rel="noreferrer" className="btn-primary text-xs flex items-center whitespace-nowrap">Открыть</a>
                        </div>
                        <div className="rounded-lg border border-brand-gray-mid p-3 mb-3 bg-gray-50/50">
                          <p className="text-[11px] font-semibold text-gray-500 mb-2 uppercase tracking-wide">Безопасность</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <input className="form-input text-xs w-32 !border-red-300 !bg-red-50/40 focus:!border-red-500" placeholder="PIN *" value={pinDraft} maxLength={6} onChange={e => setPinDraft(e.target.value.replace(/\D/g, ''))} />
                            <button onClick={() => {
                              const pin = pinDraft.trim();
                              // v1.35.3: подпись «обязателен · 4–6 цифр» раньше не проверялась —
                              // можно было сохранить 1–3 цифры или пустым (пустой даже удалял PIN).
                              if (!/^\d{4,6}$/.test(pin)) { toast.error('PIN: 4–6 цифр'); return; }
                              const phrase = window.prompt('Для смены PIN введите слово: сменить');
                              if (phrase === null) return;
                              if (phrase.trim().toLowerCase() !== 'сменить') { toast.error('Фраза не совпала — PIN не изменён'); return; }
                              patchServiceAccess({ pin }, 'PIN самообслуживания обновлён');
                              toast.success('PIN сохранён');
                            }} className="btn-secondary text-xs">Сменить PIN</button>
                            <span className="text-[10px] font-semibold text-red-600">PIN-код обязателен к заполнению · 4–6 цифр</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button onClick={() => {
                            const phrase = window.prompt('Перевыпуск убьёт текущую ссылку. Введите слово: перевыпустить');
                            if (phrase === null) return;
                            if (phrase.trim().toLowerCase() !== 'перевыпустить') { toast.error('Фраза не совпала — ссылка не перевыпущена'); return; }
                            patchServiceAccess({ token: genToken(), enabled: true }, 'Ссылка самообслуживания перевыпущена');
                            toast.success('Ссылка перевыпущена, старая недействительна');
                          }} className="btn-secondary text-xs flex items-center gap-1"><RotateCcw size={12} /> Перевыпустить ссылку</button>
                  <button onClick={() => {
                    const link = `${window.location.origin}/s/${freshSupplier.serviceAccess?.token || ''}`;
                    const pin = freshSupplier.serviceAccess?.pin || '—';
                    const tpl = getStore().settings.greetings?.supplier || DEFAULT_SUPPLIER_GREETING;
                    const text = tpl.replace('{tradeName}', freshSupplier.tradeName || '').replace('{link}', link).replace('{pin}', pin);
                    navigator.clipboard.writeText(text).then(() => {
                      toast.success('Приветствие скопировано');
                      if (freshSupplier.status !== 'Приветствие' && window.confirm('Сменить статус поставщика на «Приветствие»?')) {
                        updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, status: 'Приветствие', updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) }));
                        pushSupplierHistory(makeHistoryEntry('status', freshSupplier.status, 'Приветствие', 'Смена статуса после копирования приветствия', getCurrentUser()?.id || '', getCurrentUser()?.name || ''));
                        forceUpdate(n => n + 1);
                      }
                    });
                  }} className="btn-secondary text-xs">Копировать приветствие</button>
                          <button onClick={() => {
                            const phrase = window.prompt('Для отключения доступа введите слово: отключить');
                            if (phrase === null) return;
                            if (phrase.trim().toLowerCase() !== 'отключить') { toast.error('Фраза не совпала — доступ НЕ отключён'); return; }
                            patchServiceAccess({ enabled: false }, 'Доступ поставщика отключён');
                            // Косяки ч.3: при отключении ЛК удаляем связанные склады и условия проценки
                            updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, warehouseLocations: [], serviceSearch: [], warehouseCount: 0, skuCount: 0, updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) }));
                            pushSupplierHistory(makeHistoryEntry('warehouseLocations', JSON.stringify(freshSupplier.warehouseLocations || []), '[]', 'Удаление складов при отключении доступа', getCurrentUser()?.id || '', getCurrentUser()?.name || ''));
                            pushSupplierHistory(makeHistoryEntry('serviceSearch', JSON.stringify(freshSupplier.serviceSearch || []), '[]', 'Удаление условий сервиса проценки при отключении доступа', getCurrentUser()?.id || '', getCurrentUser()?.name || ''));
                            forceUpdate(n => n + 1);
                            toast.success('Доступ отключён, склады и условия удалены');
                          }} className="text-xs text-red-600 hover:underline ml-auto">Отключить доступ</button>
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-3">
                        <p className="text-xs text-gray-400 mb-3 max-w-md mx-auto">Поставщик получит персональную ссылку с секретным токеном и сможет сам заполнить склады и условия сервиса поиска.</p>
                        <button onClick={() => patchServiceAccess({ enabled: true }, 'Выдана ссылка самообслуживания')} className="btn-primary text-xs flex items-center gap-1 mx-auto"><Link2 size={12} /> Выдать ссылку</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              ); })()}
              {editing && (
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-md">
                  <label className="form-label text-blue-700">Изменить статус</label>
                  <div className="flex gap-2 flex-wrap">
                    <select className="form-input w-auto" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>{supplierStatuses.map(s => <option key={s}>{s}</option>)}</select>
                    <input className="form-input flex-1 min-w-[200px]" placeholder="Комментарий к изменению..." value={statusComment} onChange={e => setStatusComment(e.target.value)} />
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { key: 'tradeName', label: 'Торговое название' }, { key: 'city', label: 'Город ЦС' },
                  { key: 'website', label: 'Сайт' },
                  { key: 'inn', label: 'ИНН' }, { key: 'contactName', label: 'ФИО' },
                ].map(field => (
                  <div key={field.key}>
                    <label className="form-label">{field.label}</label>
                    {editing && field.key === 'city' ? (
                      <CitySelect cities={cityList} value={(form as unknown as Record<string, string | undefined>).city || ''} onChange={v => setForm(f => ({ ...f, city: v }))} />
                    ) : editing ? <input className="form-input" value={(form as unknown as Record<string, string | undefined>)[field.key] || ''} onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))} /> : <p className="text-sm text-brand-black py-2">{(freshSupplier as unknown as Record<string, string | undefined>)[field.key] || <span className="text-gray-300">—</span>}</p>}
                  </div>
                ))}
                <div>
                  <label className="form-label">Телефон</label>
                  {editing ? <input className="form-input" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /> : freshSupplier.phone ? <a href={`tel:${freshSupplier.phone}`} className="text-sm text-blue-600 hover:underline py-2 block">{freshSupplier.phone}</a> : <p className="text-sm text-gray-300 py-2">—</p>}
                </div>
                <div>
                  <label className="form-label">Email</label>
                  {editing ? <input type="email" className="form-input" value={form.email || ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /> : freshSupplier.email ? <a href={`mailto:${freshSupplier.email}`} className="text-sm text-blue-600 hover:underline py-2 block">{freshSupplier.email}</a> : <p className="text-sm text-gray-300 py-2">—</p>}
                </div>
                <div><label className="form-label">Тип</label>{editing ? <select className="form-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>{supplierTypes.map(t => <option key={t}>{t}</option>)}</select> : <p className="text-sm text-brand-black py-2">{freshSupplier.type}</p>}</div>
                <div><label className="form-label">Роль</label>{editing ? <select className="form-input" value={form.contactRole} onChange={e => setForm(f => ({ ...f, contactRole: e.target.value as Supplier['contactRole'] }))}>{ROLE_TYPES.map(t => <option key={t}>{t}</option>)}</select> : <p className="text-sm text-brand-black py-2">{freshSupplier.contactRole}</p>}</div>
                <div><label className="form-label">Источник</label>{editing ? <select className="form-input" value={form.source || ''} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}><option value="">—</option>{activeSources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}</select> : <p className="text-sm text-brand-black py-2">{freshSupplier.source || '—'}</p>}</div>
                <div><label className="form-label">Связь</label>{editing ? (
                    <div className="flex flex-wrap gap-1.5 py-1">
                      {getContactPrefs().map(cp => { const on = (form.contactPrefs || []).includes(cp); return (
                        <button key={cp} type="button" onClick={() => setForm(f => ({ ...f, contactPrefs: on ? (f.contactPrefs || []).filter(x => x !== cp) : [...(f.contactPrefs || []), cp] }))} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-colors ${on ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500 hover:border-gray-400'}`}><ContactPrefIcon name={cp} />{cp}</button>
                      ); })}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1.5 py-2">
                      {(freshSupplier.contactPrefs || []).length ? freshSupplier.contactPrefs!.map(cp => <span key={cp} className="flex items-center gap-1 text-xs bg-brand-gray px-2 py-0.5 rounded-full"><ContactPrefIcon name={cp} />{cp}</span>) : <p className="text-sm text-brand-black">{freshSupplier.contactPref || '—'}</p>}
                    </div>
                  )}</div>
                <div>
                  <label className="form-label">Категория (A-B-C)</label>
                  {/* ТЗ 1.8: категория ТОЛЬКО автоматическая (по выручке 2110 из скоринга) — ручной выбор невозможен */}
                  <div className="py-2">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold" style={CAT_STYLE_MAP[freshSupplier.category ?? 'C']} title="Категория ставится автоматически по выручке (стр. 2110)">{freshSupplier.category ?? 'C'}</span>
                  </div>
                </div>
                <div>
                  <label className="form-label">Ответственный</label>
                  {editing ? (
                    <ResponsibleSelect value={form.responsibleId} onChange={(id, name) => setForm(f => ({ ...f, responsibleId: id, responsibleName: name }))} />
                  ) : (
                    <p className="text-sm text-brand-black py-2">{freshSupplier.responsibleName || <span className="text-gray-300">—</span>}</p>
                  )}
                </div>
                {/* Сервисы продаж */}
                <div>
                  <label className="form-label">Сервисы продаж</label>
                  {editing ? (
                    <select className="form-input" value="" onChange={e => { const v = e.target.value; if (v && !(form.services || []).includes(v)) setForm(f => ({ ...f, services: [...(f.services || []), v] })); }}>
                      <option value="">Добавить сервис...</option>
                      {activeSupplierServices.filter(s => !(form.services || []).includes(s)).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {((editing ? form.services : freshSupplier.services) || []).map(s => (
                      <span key={s} className="inline-flex items-center gap-1 text-xs bg-blue-50 border border-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {s}
                        {editing && <button type="button" onClick={() => setForm(f => ({ ...f, services: (f.services || []).filter(x => x !== s) }))} className="text-blue-400 hover:text-brand-red"><X size={10} /></button>}
                      </span>
                    ))}
                    {!editing && ((freshSupplier.services || []).length === 0) && <span className="text-gray-300 text-sm">—</span>}
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="form-label">Комментарий</label>
                  {editing ? <textarea className="form-input min-h-[80px] resize-none" value={form.comment || ''} onChange={e => setForm(f => ({ ...f, comment: e.target.value }))} /> : <p className="text-sm text-brand-black py-2">{freshSupplier.comment || '—'}</p>}
                </div>
              </div>
            {/* v1.30.39: ЭДО — поля перенесены на верхний уровень Supplier */}
            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-semibold text-gray-500 w-32">ЭДО</span>
                        {editing ? (
                          <>
                            <select className="form-input text-xs w-48" value={String((form as Supplier).edoOperator || '')} onChange={e => setForm(f => ({ ...f, edoOperator: e.target.value }))}>
                              <option value="">— Оператор ЭДО —</option>
                              {(getStore().settings.edoOperators || []).map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <input className="form-input text-[11px] flex-1 min-w-[200px]" placeholder="Идентификатор ЭДО" value={String((form as Supplier).edoToken || '')} onChange={e => setForm(f => ({ ...f, edoToken: e.target.value }))} />
                          </>
                        ) : (
                          <span className="text-sm text-gray-800">{freshSupplier.edoOperator || '—'}{freshSupplier.edoToken ? <span className="text-[10px] text-gray-500 break-all"> · Идентификатор: {freshSupplier.edoToken}</span> : null}</span>
                        )}
                      </div>
          
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="form-label">Основные группы товаров</label>
                  {editing ? (
                    <ProductGroupSelect selected={form.productGroups || []} onChange={tags => setForm(f => ({ ...f, productGroups: tags }))} groups={activeProductGroups} />
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-1 py-1">
                      {(freshSupplier.productGroups || []).length === 0 ? <span className="text-gray-300 text-sm">—</span> : (freshSupplier.productGroups || []).map(g => <span key={g} className="text-xs bg-brand-gray border border-brand-gray-mid px-2 py-0.5 rounded-full">{g}</span>)}
                    </div>
                  )}
                </div>
                <div>
                  <label className="form-label">Собственные бренды (СТМ)</label>
                  <TagInput tags={editing ? form.ownBrands : freshSupplier.ownBrands} onChange={tags => setForm(f => ({ ...f, ownBrands: tags }))} disabled={!editing} placeholder="Введите бренд и нажмите Enter..." />
                </div>
              </div>
            </div>
          )}

          {tab === 'Склад' && (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-4">
                <div className="stat-card text-center"><p className="text-xs text-gray-500">Всего складов</p><p className="text-2xl font-bold text-brand-black">{totalWarehouses}</p></div>
                <div className="stat-card text-center"><p className="text-xs text-gray-500">Городов</p><p className="text-2xl font-bold text-brand-black">{totalCities}</p></div>
                <div className="stat-card text-center"><p className="text-xs text-gray-500">Всего SKU</p><p className="text-2xl font-bold text-brand-black">{totalSKU.toLocaleString('ru')}</p></div>
                <div className="stat-card text-center"><p className="text-xs text-gray-500">Email отправки прайсов</p>
                  {priceEmailEdit ? (
                    <div className="flex items-center gap-1.5 justify-center mt-1">
                      <input className="form-input text-xs w-44" placeholder="price@example.ru" value={priceEmailDraft} onChange={e => setPriceEmailDraft(e.target.value)} />
                      <button type="button" onClick={() => { updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, priceEmail: priceEmailDraft.trim(), updatedAt: new Date().toISOString(), updatedBy: getCurrentUser()?.name || '' } : x) })); pushSupplierHistory(makeHistoryEntry('priceEmail', freshSupplier.priceEmail || '', priceEmailDraft.trim(), 'Email отправки прайсов изменён', getCurrentUser()?.id || '', getCurrentUser()?.name || '')); forceUpdate(n => n + 1); setPriceEmailEdit(false); toast.success('Сохранено'); }}
                        className="btn-primary text-xs">Сохранить</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 justify-center mt-1">
                      <p className="text-sm font-bold text-brand-black truncate max-w-[170px]">{freshSupplier.priceEmail || '—'}</p>
                      <button type="button" onClick={() => { setPriceEmailDraft(freshSupplier.priceEmail || ''); setPriceEmailEdit(true); }}
                        className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors">
                        <Pencil size={10} /> Редактировать
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div>
                
            <div className="flex items-center justify-between mb-2">
                  <h3 className="section-title">Склады по городам</h3>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none mr-1" title="Включает возможность добавлять несколько складов">
                      <input type="checkbox" className="toggle" checked={Boolean(freshSupplier.multiWarehouse)} onChange={e => {
                        updateStore(s => ({ ...s, suppliers: s.suppliers.map(x => x.id === id ? { ...x, multiWarehouse: e.target.checked, updatedAt: new Date().toISOString() } : x) }));
                        forceUpdate(n => n + 1);
                      }} />
                      Мультисклад
                    </label>
                    <button onClick={() => setNewWarehouse(v => !v)} className="btn-primary text-xs"><Plus size={13} /> Добавить склад</button>
                  </div>
                </div>
                {newWarehouse && (
                  <div className="card-base p-3 bg-blue-50 border-blue-200 mb-3 animate-fade-in">
                    <div className="flex gap-3 flex-wrap items-end">
                      <div className="flex-1 min-w-[140px]"><label className="form-label">Город (название) склада *</label><input className="form-input" placeholder="Город (название) склада" value={whForm.city} onChange={e => setWhForm(f => ({ ...f, city: e.target.value }))} /></div>
                      <div className="flex-[2] min-w-[220px]"><label className="form-label">Адрес склада</label><input className="form-input" placeholder="Адрес склада" value={whForm.address || ''} onChange={e => setWhForm(f => ({ ...f, address: e.target.value }))} /></div>
                      <div className="w-32"><label className="form-label">SKU</label><input type="number" min="0" className="form-input" value={whForm.skuCount} onChange={e => setWhForm(f => ({ ...f, skuCount: parseInt(e.target.value) || 0 }))} /></div>
                      
                      <div className="flex gap-2"><button onClick={addWarehouseLocation} className="btn-primary text-xs"><Plus size={12} /> Добавить</button><button onClick={() => setNewWarehouse(false)} className="btn-secondary text-xs">Отмена</button></div>
                    </div>
                  </div>
                )}
                <div className="overflow-hidden rounded-lg border border-brand-gray-mid">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-brand-gray-mid bg-brand-gray"><th className="table-header text-left">Город (название) склада</th>
                    <th className="table-header text-left">Адрес склада</th><th className="table-header text-right">SKU</th><th className="table-header">Склад подтвержден</th><th className="table-header w-10"></th></tr></thead>
                    <tbody>
                      {warehouseLocations.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-gray-400 text-xs">Нет складов. Добавьте первый.</td></tr>}
                      {warehouseLocations.map(wl => (
                        <tr key={wl.id} className={`border-b border-brand-gray-mid last:border-0 hover:bg-brand-gray ${wl.status === 'Заморожен' ? 'opacity-50 bg-gray-50' : ''}`}>
                          {editingWhId === wl.id ? (<>
                            <td className="table-cell"><input className="form-input text-xs" value={whEditForm.city} onChange={e => setWhEditForm(f => ({ ...f, city: e.target.value }))} /></td>
                            <td className="table-cell"><input className="form-input text-xs w-56" placeholder="Адрес склада" value={whEditForm.address} onChange={e => setWhEditForm(f => ({ ...f, address: e.target.value }))} /></td>
                            <td className="table-cell text-right"><input type="number" min="0" className="form-input text-xs w-24 text-right" value={whEditForm.skuCount} onChange={e => setWhEditForm(f => ({ ...f, skuCount: parseInt(e.target.value) || 0 }))} /></td>
                          </>) : (<>
                            <td className="table-cell font-medium">{wl.city}</td>
                            <td className="table-cell text-xs text-gray-600">{wl.address || '—'}</td>
                            <td className="table-cell text-right text-xs text-gray-600">{wl.skuCount.toLocaleString('ru')}</td>
                          </>)}
                          <td className="table-cell">
                            <span className={`text-xs font-medium mr-2 ${wl.status === 'Проверен' ? 'text-green-600' : 'text-gray-400'}`}>{wl.status === 'Проверен' ? 'Да' : 'Нет'}</span>
                            <select className="form-input text-xs w-32" value={wl.status || 'Новый'} onChange={e => setWarehouseStatus(wl.id, e.target.value as WarehouseStatus)}>
                              <option value="Новый">Новый</option><option value="Проверен">Проверен</option><option value="Заморожен">Заморожен</option>
                            </select>
                          </td>
                          <td className="table-cell">
                            <span className="flex gap-1 justify-end">
                              {editingWhId === wl.id ? (<>
                                <button onClick={() => saveWarehouseEdit(wl.id)} className="p-1 text-green-600" title="Сохранить"><Save size={13} /></button>
                                <button onClick={() => setEditingWhId(null)} className="p-1 text-gray-300 hover:text-gray-500"><X size={13} /></button>
                              </>) : (
                                <button onClick={() => startEditWarehouse(wl)} className="p-1 text-gray-300 hover:text-blue-600" title="Редактировать"><Pencil size={13} /></button>
                              )}
                              <button onClick={() => removeWarehouseLocation(wl.id, wl.city)} className="p-1 text-gray-300 hover:text-brand-red"><Trash2 size={13} /></button>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'Скоринг' && <ScoringTab scoring={freshSupplier.scoring || {}} inn={freshSupplier.inn} onSave={saveScoring} onRescore={() => runScoring(true)} />}

          {tab === 'Сервис проценки (DBS)' && (
            <div className="space-y-4">

            {(() => {
              const covered = new Set((freshSupplier.serviceSearch || []).map(c => (c.city || '').toLowerCase()));
              return (
                <div className="card-base p-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-2 text-sm">
                    <span className="text-gray-500">Доступно городов: <b className="text-brand-black">{cityList.length}</b></span>
                    <span className="text-gray-500">Условий: <b className="text-brand-black">{(freshSupplier.serviceSearch || []).length}</b></span>
                    <span className="text-gray-500">Охвачено городов: <b className="text-brand-black">{covered.size}</b></span>
                    <button onClick={addToAllCities} className="btn-secondary text-xs ml-auto" title="Создать по условию на каждый доступный город, которого ещё нет">Во все доступные города</button>
                  </div>
                  {cityList.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {cityList.map(c => (
                        <span key={c} className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border ${covered.has(c.toLowerCase()) ? 'bg-green-50 border-green-200 text-green-700' : 'bg-brand-gray border-brand-gray-mid text-gray-500'}`}>
                          {c}{covered.has(c.toLowerCase()) && ' ✓'}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">Список городов пуст — заполните его в Настройки → Типы и города</p>
                  )}
                </div>
              );
            })()}
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="section-title mr-auto">Условия сервиса проценки</h3>
                <select className="form-input text-xs w-auto py-1.5" value={ssFilterStatus} onChange={e => setSsFilterStatus(e.target.value)}>
                  <option value="">Статус: все</option>
                  <option>Новое</option>
                  <option>Загружено</option>
                  <option>Есть изменения</option>
                  <option>Удаление</option>
                </select>
                <select className="form-input text-xs w-auto py-1.5" value={ssFilterCity} onChange={e => setSsFilterCity(e.target.value)}>
                  <option value="">Город: все</option>
                  {cityList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button onClick={() => { setNewServiceSearch(true); setSsForm({}); }} className="btn-primary text-xs"><Plus size={14} /> Добавить условие</button>
              </div>
              {newServiceSearch && (
                <div className="card-base p-4 border-blue-200 bg-blue-50 animate-fade-in">
                  <div className="flex items-center justify-between mb-3"><h4 className="text-sm font-semibold">Новое условие</h4><button onClick={() => setNewServiceSearch(false)} className="text-gray-400 hover:text-brand-red"><X size={16} /></button></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {SS_FIELDS.map(f => <div key={f.key}><label className="form-label text-xs">{f.label}{f.key === 'city' && ' *'}</label>{renderSsField(f, ssForm, setSsForm)}</div>)}
                  </div>
                  <div className="flex gap-2 justify-end mt-3"><button onClick={() => setNewServiceSearch(false)} className="btn-secondary text-xs">Отмена</button><button onClick={addServiceSearch} className="btn-primary text-xs"><Save size={12} /> Сохранить</button></div>
                </div>
              )}
              {(freshSupplier.serviceSearch || []).length === 0 && !newServiceSearch && <p className="text-center text-gray-400 py-8 text-sm">Условий нет.</p>}
              {(freshSupplier.serviceSearch || []).filter(cond => (!ssFilterStatus || (cond.status || 'Новое') === ssFilterStatus) && (!ssFilterCity || cond.city === ssFilterCity)).map(cond => (
                <div key={cond.id} className="card-base p-4">
                  {editingSsId === cond.id ? (
                    <div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        {SS_FIELDS.map(f => <div key={f.key}><label className="form-label text-xs">{f.label}</label>{renderSsField(f, editingSsForm, setEditingSsForm)}</div>)}
                      </div>
                      <div className="flex gap-2 justify-end"><button onClick={() => setEditingSsId(null)} className="btn-secondary text-xs">Отмена</button><button onClick={saveEditSs} className="btn-primary text-xs"><Save size={12} /> Сохранить</button></div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-3">
                        <h4 className="text-sm font-semibold">Город: {cond.city}</h4>
                        <div className="flex items-center gap-2">
                        {(() => { const wh = (freshSupplier.warehouseLocations || []).find(w => w.city.toLowerCase() === (cond.warehouseName || '').toLowerCase()); return (
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${wh?.verified ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
                            Склад проверен: {wh?.verified ? 'Да' : 'Нет'}
                          </span>
                        ); })()}
                          <span className="flex flex-wrap gap-1">
                            {(['Новое', 'Загружено', 'Есть изменения', 'Удаление'] as const).map(st => ( // ТЗ v1.23.29
                              <button key={st} onClick={() => setConditionStatus(cond.id, st)}
                                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${(cond.status || 'Новое') === st
                                  ? st === 'Новое' ? 'bg-blue-50 border-blue-300 text-blue-700 font-semibold'
                                  : st === 'Загружено' ? 'bg-green-50 border-green-300 text-green-700 font-semibold'
                                  : st === 'Есть изменения' ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold'
                                  : 'bg-gray-200 border-gray-300 text-gray-600 font-semibold'
                                  : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'}`}>{st}</button>
                            ))}
                          </span>
                          <span className="flex gap-1">
                            <button onClick={() => { setEditingSsId(cond.id); setEditingSsForm({ ...cond }); }} className="p-1 text-gray-400 hover:text-brand-black"><Edit2 size={14} /></button>
                            <button onClick={() => deleteServiceSearch(cond.id)} className="p-1 text-gray-300 hover:text-brand-red"><Trash2 size={14} /></button>
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {SS_FIELDS.filter(f => f.key !== 'city').map(f => (
                          <div key={f.key}>
                            <p className="text-xs text-gray-500">{f.label}</p>
                            {f.key === 'deliveryTime' ? (
                              /* ТЗ v1.24.6: ТК в просмотре, как в ЛК/Проценке */
                              <p className="text-xs font-medium flex items-center gap-1.5 flex-wrap">
                                {String((cond as { orderUnloadSchedule?: string }).orderUnloadSchedule || '').includes('Условия доставки по согласованию!') && (
                                  <span className="w-6 h-6 text-[9px] font-bold flex items-center justify-center rounded-md bg-yellow-300 border border-yellow-400 text-gray-900" title="ТК — доставка по согласованию">ТК</span>
                                )}
                                {(cond as { deliveryTime?: string }).deliveryTime || '—'}
                              </p>
                            ) : (
                              <p className="text-xs font-medium">{(cond as unknown as Record<string, string | undefined>)[f.key as string] || '—'}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {tab === 'История' && <HistoryTab history={freshSupplier.history} />}

          {tab === 'Дополнительно' && (
            <div className="space-y-4">
              <div><label className="form-label">Дополнительные контакты</label>{editing ? <textarea className="form-input min-h-[100px] resize-none" value={form.additionalContacts || ''} onChange={e => setForm(f => ({ ...f, additionalContacts: e.target.value }))} /> : <p className="text-sm text-brand-black py-2 whitespace-pre-wrap">{freshSupplier.additionalContacts || '—'}</p>}</div>
              <div><label className="form-label">Доп. комментарии</label>{editing ? <textarea className="form-input min-h-[100px] resize-none" value={form.additionalComment || ''} onChange={e => setForm(f => ({ ...f, additionalComment: e.target.value }))} /> : <p className="text-sm text-brand-black py-2 whitespace-pre-wrap">{freshSupplier.additionalComment || '—'}</p>}</div>
            </div>
          )}
        </div>
      </div>
      {whDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4 animate-fade-in">
            <h3 className="text-base font-semibold text-brand-black mb-2">Удаление склада</h3>
            <p className="text-sm text-gray-500 mb-4">Склад «{whDelete.city}» будет удалён. Это действие нельзя отменить. Для подтверждения наберите слово <b>удалить</b>:</p>
            <input autoFocus className="form-input mb-4" placeholder="удалить" value={whDeleteText} onChange={e => setWhDeleteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmRemoveWarehouse(); }} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setWhDelete(null)} className="btn-secondary text-sm">Отмена</button>
              <button onClick={confirmRemoveWarehouse} className="text-sm px-4 py-2 rounded-xl font-medium bg-red-600 text-white hover:bg-red-700 transition-colors">Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
