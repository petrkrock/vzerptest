import { useState, useEffect } from 'react';
import { getStore, updateStore, useStoreVersion, SYSTEM_CONTACT_PREFS } from '@/lib/store';
import { generateId } from '@/lib/utils';
import { isAdmin, getCurrentUser } from '@/lib/auth';
import { apiUsersCreate, apiUsersUpdate } from '@/lib/api';
import { apiFilesUploadFile } from '@/lib/api';
// v1.32.9: own-режим — домены через свой API.
import { apiDomainsList, apiDomainsCreate, apiDomainsUpdate, apiDomainsDelete } from '@/lib/api';
import { useNavigate, Link } from 'react-router-dom';
import type {AppUser, UserAccess, UserStatus, ProductGroup, Source, TaskEntityType, StatusConfig, SupplierService, MediaAdType, MediaDurationOption, MediaStatus, PublicFormEntityType, FormFieldConfig, FormConfig} from '@/types';
import { EMPTY_ACCESS } from '@/types';
import {MEDIA_SYSTEM_STATUSES, DEFAULT_STATUSES, FORM_FIELD_DEFINITIONS, DEFAULT_FORM_CONSENT, SYSTEM_SUPPLIER_STATUSES, SYSTEM_TASK_STATUSES, SYSTEM_TASK_TYPES, SYSTEM_TICKET_TYPES, SYSTEM_LEAD_STATUSES, TASK_STATUSES, TASK_STATUS_COLORS, DEFAULT_SUPPLIER_GREETING, TICKET_STATUSES, TICKET_STATUS_COLORS} from '@/constants';

// ТЗ 1.8: полный список системных статусов (редактирование/удаление запрещены)
const ALL_SYSTEM_STATUSES = ['Активный', 'Новый с сайта', 'Лид CRM', 'Переговоры', 'Приветствие', 'Проблемный', 'Настройка прайса', 'Архив дублей', 'АРХИВ', 'Лид'];
import {Plus, Save, Trash2, X, Edit2, Users, CheckCircle2, XCircle, Settings2, Package, Megaphone, MapPin, List, Tag, Video, FileEdit, Copy, ExternalLink, Ban, UserX} from 'lucide-react';
import { toast } from 'sonner';

const SETTINGS_TABS = ['Статусы', 'Сервисы', 'Пользователи', 'Уведомления', 'Типы и города', 'Кнопки', 'Товары', 'Источники', 'Задачи', 'Медиа', 'Формы', 'ЛК Поставщик', 'Договора и оферты', 'API']; // v1.29.0: переименование вкладок

const STATUS_SECTIONS = [
  { key: 'supplier', label: 'Поставщики' },
  { key: 'buyer',    label: 'Покупатели' },
  { key: 'task',     label: 'Задачи' },
  { key: 'ticket',   label: 'Поддержка' },
  { key: 'lead',     label: 'База лидов' },
] as const;

const STATUS_PRESETS = [
  { bg: '#EFF6FF', text: '#1D4ED8', name: 'Синий' },
  { bg: '#ECFDF5', text: '#065F46', name: 'Зелёный' },
  { bg: '#FFFBEB', text: '#92400E', name: 'Жёлтый' },
  { bg: '#FEF2F2', text: '#991B1B', name: 'Красный' },
  { bg: '#F5F3FF', text: '#6D28D9', name: 'Фиолетовый' },
  { bg: '#F9FAFB', text: '#374151', name: 'Серый' },
  { bg: '#FFEDD5', text: '#C2410C', name: 'Оранжевый' },
];

const MEDIA_SUB_TABS = ['Форматы и тарифы', 'Статусы медиа'] as const;

/** ЗАПРЕТ УДАЛЕНИЯ СПРАВОЧНИКОВ С СВЯЗЯМИ (ТЗ): если элемент используется в данных —
 *  его можно только переименовать; удаление доступно только для «свободных» элементов. */
function itemInUse(
  kind: 'status' | 'service' | 'user' | 'city' | 'supplierType' | 'buyerType' | 'ticketType' |
        'productGroup' | 'source' | 'taskType' | 'taskEntityType' | 'adType' | 'durationOption' | 'mediaStatus' |
        'contactPref' | 'roleType', // ТЗ v1.22.30
  v: string,
  alt?: string,
): boolean {
  const s = getStore();
  const hit = (...vals: (string | undefined | null)[]) => vals.some(x => x === v || (alt !== undefined && x === alt));
  switch (kind) {
    case 'status':
      return hit(
        ...s.tasks.map(t => t.taskStatus || (t.completed ? 'Решено' : 'Новая')),
        ...s.tickets.map(t => t.status),
        ...s.suppliers.map(x => x.status),
        ...s.buyers.map(x => x.status),
        ...(s.mediaRecords || []).filter(m => !m.deletedAt).map(m => m.status),
      );
    case 'service':
      return hit(
        ...s.suppliers.filter(x => !x.deletedAt).flatMap(x => x.services || []),
        ...(s.settings.planFact || []).map(p => p.filterService),
      );
    case 'user':
      return hit(
        ...s.tasks.flatMap(t => [t.responsibleId, t.createdBy]),
        ...s.tickets.map(t => t.responsibleId),
        ...s.suppliers.filter(x => !x.deletedAt).flatMap(x => [x.responsibleId, x.createdBy]),
        ...s.buyers.filter(x => !x.deletedAt).flatMap(x => [x.responsibleId, x.createdBy]),
        ...(s.mediaRecords || []).filter(m => !m.deletedAt).map(m => m.responsibleId),
        ...(s.settings.planFact || []).map(p => p.responsibleId),
      );
    case 'city':
      return hit(
        ...s.suppliers.filter(x => !x.deletedAt).map(x => x.city),
        ...s.buyers.filter(x => !x.deletedAt).map(x => x.city),
        ...(s.settings.marketVolumes || []).map(m => m.city),
        ...(s.settings.planFact || []).map(p => p.cityName),
      );
    case 'supplierType': return hit(...s.suppliers.filter(x => !x.deletedAt).map(x => x.type));
    case 'buyerType': return hit(...s.buyers.filter(x => !x.deletedAt).map(x => x.type));
    case 'ticketType': return hit(...s.tickets.map(t => t.type));
    case 'productGroup': return hit(...s.suppliers.filter(x => !x.deletedAt).flatMap(x => x.productGroups || []));
    case 'source': return hit(...s.suppliers.filter(x => !x.deletedAt).map(x => x.source), ...s.buyers.filter(x => !x.deletedAt).map(x => x.source));
    case 'taskType': return hit(...s.tasks.map(t => t.title));
    case 'taskEntityType': return hit(...s.tasks.map(t => t.entityType));
    case 'adType': return hit(...(s.mediaRecords || []).filter(m => !m.deletedAt).flatMap(m => [m.adTypeId, m.adTypeName]));
    case 'durationOption': return hit(...(s.mediaRecords || []).filter(m => !m.deletedAt).map(m => m.durationOptionId));
    case 'mediaStatus': return hit(...(s.mediaRecords || []).filter(m => !m.deletedAt).map(m => m.status));
        case 'roleType': // ТЗ v1.22.30: «Должность контакта» в карточках
      return hit(
        ...s.suppliers.filter(x => !x.deletedAt).map(x => x.contactRole),
        ...s.buyers.filter(x => !x.deletedAt).map(x => x.contactRole),
      );
case 'contactPref':
      return hit(
        ...s.suppliers.filter(x => !x.deletedAt).map(x => x.contactPref),
        ...s.buyers.filter(x => !x.deletedAt).map(x => x.contactPref),
        ...s.tickets.filter(t => !t.deletedAt).map(t => t.contactPref),
      );
  }
}

/** Кнопка удаления для списков: с связями — неактивна с подсказкой. */
function GuardedDelete({ inUse, onClick, title }: { inUse: boolean; onClick: () => void; title?: string }) {
  return inUse
    ? <span className="p-1.5 text-gray-200 cursor-not-allowed" title={`${title || 'Элемент'} используется в данных — удалить нельзя, можно только уволить`}><Trash2 size={14} /></span>
    : <button onClick={onClick} className="p-1.5 text-gray-300 hover:text-brand-red rounded"><Trash2 size={14} /></button>;
}

/** Крестик удаления для чипов: с связями — неактивен с подсказкой. */
function ChipDelete({ inUse, onClick }: { inUse: boolean; onClick: () => void }) {
  return inUse
    ? <span className="text-gray-200 ml-1 cursor-not-allowed" title="Используется в данных — удаление запрещено, можно только переименовать"><X size={12} /></span>
    : <button onClick={onClick} className="text-gray-400 hover:text-brand-red ml-1"><X size={12} /></button>;
}

// v1.31.18: дефолтный домен (commerce.domains, host='default') — всегда активен, не удаляется.
const DEFAULT_DOMAIN_ID = '00000000-0000-4000-8000-000000000001';

export default function SettingsPage() {
  useStoreVersion(); // re-render on real-time changes from other users (see src/lib/realtime.ts)
  const navigate = useNavigate();
  const admin = isAdmin();

  useEffect(() => {
    if (!admin) navigate('/dashboard', { replace: true });
  }, [admin, navigate]);

  const [apiEditing, setApiEditing] = useState(false); // этап 1.8
  // v_1.9: переименование типов/городов
  const [renaming, setRenaming] = useState<{ list: 'supplierTypes' | 'buyerTypes' | 'cities'; old: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  function startRename(list: 'supplierTypes' | 'buyerTypes' | 'cities', old: string) { setRenaming({ list, old }); setRenameValue(old); }
  function applyRename() {
    if (!renaming) return;
    const nv = renameValue.trim();
    if (!nv || nv === renaming.old) { setRenaming(null); return; }
    updateStore(s => ({ ...s, settings: { ...s.settings, [renaming.list]: (s.settings[renaming.list] || []).map((x: string) => x === renaming.old ? nv : x) } }));
    forceUpdate(n => n + 1);
    toast.success(`Переименовано: ${renaming.old} → ${nv}`);
    setRenaming(null);
  }
const [apiKeyDraft, setApiKeyDraft] = useState(''); // этап 1.8
const checkoSettings = getStore().settings; // этап 1.8
const checkoEnabled = !!checkoSettings.checkoApiEnabled && !!(checkoSettings.checkoApiKey || '').trim();
const [tab, setTab] = useState('Статусы');
  const [mediaSubTab, setMediaSubTab] = useState<typeof MEDIA_SUB_TABS[number]>('Форматы и тарифы');
  const [, forceUpdate] = useState(0);
  const store = getStore();

  // ── STATUSES ──
  const [statusSection, setStatusSection] = useState<'supplier'|'buyer'|'task'|'ticket'|'lead'>('supplier');
  const [addStatusForm, setAddStatusForm] = useState<{ name: string; bgColor: string; textColor: string } | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [editStatusForm, setEditStatusForm] = useState<{ name: string; bgColor: string; textColor: string }>({ name: '', bgColor: '#F3F4F6', textColor: '#374151' });
  const [newTaskType, setNewTaskType] = useState('');

  function getSectionStatuses(section: string) {
    // ТЗ 1.8: «Активный (системный)» отображается перед «Лид форма» (только порядок показа, данные не меняем)
    const rank = (n: string) => n === 'Активный' ? 0 : n === 'Новый с сайта' ? 1 : 2;
    return store.settings.statuses.filter(s => s.entityTypes.includes(section))
      .sort((a, b) => rank(a.name) - rank(b.name));
  }
  function isDefaultStatus(id: string) { return !!DEFAULT_STATUSES.find(s => s.id === id); }
  function addStatus() {
    if (!addStatusForm?.name.trim()) { toast.error('Введите название статуса'); return; }
    const ns: StatusConfig = { id: generateId(), name: addStatusForm.name.trim(), color: addStatusForm.textColor, bgColor: addStatusForm.bgColor, textColor: addStatusForm.textColor, entityTypes: [statusSection], order: 99 };
    updateStore(s => ({ ...s, settings: { ...s.settings, statuses: [...s.settings.statuses, ns] } }));
    setAddStatusForm(null); forceUpdate(n => n + 1); toast.success('Статус добавлен');
  }
  function saveEditStatus() {
    if (!editingStatusId) return;
    updateStore(s => ({ ...s, settings: { ...s.settings, statuses: s.settings.statuses.map(st => st.id === editingStatusId ? { ...st, name: editStatusForm.name, bgColor: editStatusForm.bgColor, textColor: editStatusForm.textColor, color: editStatusForm.textColor } : st) } }));
    setEditingStatusId(null); forceUpdate(n => n + 1); toast.success('Статус обновлён');
  }
  function deleteStatus(id: string) {
    if (isDefaultStatus(id)) { toast.error('Нельзя удалить системный статус'); return; }
    if (!confirm('Удалить статус?')) return;
    updateStore(s => ({ ...s, settings: { ...s.settings, statuses: s.settings.statuses.filter(st => st.id !== id) } }));
    forceUpdate(n => n + 1);
  }

  // ── SUPPLIER SERVICES ──
  const [newServiceName, setNewServiceName] = useState('');
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [newServicePublic, setNewServicePublic] = useState('');
  const [editServicePublic, setEditServicePublic] = useState('');
  function addService() {
    const name = newServiceName.trim(); if (!name) return;
    if ((store.settings.supplierServices || []).find(s => s.name === name)) { toast.error('Сервис уже существует'); return; }
    updateStore(s => ({ ...s, settings: { ...s.settings, supplierServices: [...(s.settings.supplierServices || []), { id: generateId(), name, publicName: newServicePublic.trim() || undefined, createdAt: new Date().toISOString() }] } }));
    setNewServiceName(''); setNewServicePublic(''); forceUpdate(n => n + 1); toast.success('Сервис добавлен');
  }
  function saveEditService() {
    if (!editingServiceId) return; const name = editServiceName.trim(); if (!name) return;
    // v1.30.100: обновление того же сервиса (дубль при редактировании устранён в store — мердж по id)
    updateStore(s => ({ ...s, settings: { ...s.settings, supplierServices: (s.settings.supplierServices || []).map(sv => sv.id === editingServiceId ? { ...sv, name, publicName: editServicePublic.trim() || undefined } : sv) } }));
    setEditingServiceId(null); setEditServicePublic(''); forceUpdate(n => n + 1); toast.success('Сервис обновлён');
  }
  function deleteService(id: string) {
    if (!confirm('Удалить сервис?')) return;
    updateStore(s => ({ ...s, settings: { ...s.settings, supplierServices: (s.settings.supplierServices || []).filter(sv => sv.id !== id) } }));
    forceUpdate(n => n + 1);
  }

  // ── API KEYS ──

  // ── USERS ──
  // ── USERS (ТЗ «Управление пользователями») ──
  // Разделы, выдаваемые менеджеру. «Настройки» и «База данных» в списке нет
  // принципиально — они доступны только администратору (ТЗ п.3).
  const ALL_PERMS_FALSE: AppUser['permissions'] = { dashboard: true, suppliers: false, buyers: false, tasks: true, support: true, leads: false, media: false, pricing: false, planfact: false, analytics: false, knowledge: true , planfactEdit: false }; // дефолт менеджера (ТЗ v1.21.6): задачи/поддержка/база знаний — включены, медиа — нет
  const PERM_LABELS: Array<{ key: keyof AppUser['permissions']; label: string }> = [
    { key: 'dashboard', label: 'Дашборд' }, { key: 'planfact', label: 'План/Факт' },
    { key: 'suppliers', label: 'Поставщики' }, { key: 'buyers', label: 'Покупатели' },
    { key: 'tasks', label: 'Задачи' }, { key: 'support', label: 'Поддержка' },
    { key: 'leads', label: 'База лидов' }, { key: 'media', label: 'Медиа сервис' },
    { key: 'pricing', label: 'Проценка' },
    { key: 'knowledge', label: 'База знаний' },
  ];
  const [showNewUser, setShowNewUser] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  // По умолчанию у нового менеджера ВСЕ разделы выключены (ТЗ п.2)
  const [userForm, setUserForm] = useState<Partial<AppUser>>({ role: 'manager', status: 'active', permissions: { ...ALL_PERMS_FALSE }, access: { ...EMPTY_ACCESS } });
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<AppUser>>({});

  async function saveUser() {
    const name = (userForm.name || '').trim();
    const email = (userForm.email || '').trim();
    const role = userForm.role || 'manager';
    if (!name || !email) { toast.error('Укажите имя и email'); return; }
    const permissions: AppUser['permissions'] = role === 'admin'
      ? { dashboard: true, suppliers: true, buyers: true, tasks: true, support: true, leads: true, media: true, pricing: true, planfact: true, analytics: true, knowledge: true, planfactEdit: true }
      : { ...ALL_PERMS_FALSE, ...(userForm.permissions || {}) };
    const access: UserAccess = { ...EMPTY_ACCESS, ...(userForm.access || {}) };
    setSavingUser(true);
    try {
      let id = generateId();
      {
        // v1.34.0: вход создаём сразу — POST /auth/users (profiles + bcrypt).
        const password = userForm.password || generateId().slice(0, 12);
        const account = await apiUsersCreate({ email, password, name });
        id = account.id;
        toast.success(`Пользователь создан. Логин: ${email}, пароль: ${password}`, { duration: 15000 });
      }
      const nu: AppUser = {
        id, name, email,
        password: userForm.password || '',
        role, dashboardType: role === 'manager' ? (userForm.dashboardType ?? 'mop') : undefined,
        planfactBase: role === 'manager' ? userForm.planfactBase : undefined,
        leadsBase: role === 'manager' ? userForm.leadsBase : undefined,
        allowedCities: role === 'manager' ? userForm.allowedCities : undefined,
        permissions: applyDashboardSections(role, userForm.dashboardType ?? 'mop', permissions), access, note: (userForm.note || '').trim(), notifyChatId: (userForm.notifyChatId || '').trim(), notifyChannel: userForm.notifyChannel, notifyEmail: (userForm.notifyEmail || '').trim(), status: 'active', createdAt: new Date().toISOString(),
      };
      updateStore(s => ({ ...s, settings: { ...s.settings, users: [...s.settings.users, nu] } }));
      setShowNewUser(false);
      setUserForm({ role: 'manager', status: 'active', permissions: { ...ALL_PERMS_FALSE }, access: { ...EMPTY_ACCESS } });
      forceUpdate(n => n + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать пользователя');
    } finally { setSavingUser(false); }
  }

  function startEditUser(u: AppUser) {
    setEditingUserId(u.id);
    setEditForm({ name: u.name, email: u.email, role: u.role, dashboardType: u.dashboardType, planfactBase: u.planfactBase, leadsBase: u.leadsBase, allowedCities: u.allowedCities, permissions: { ...u.permissions }, access: { ...EMPTY_ACCESS, ...u.access }, password: '', note: u.note || '', notifyChatId: u.notifyChatId || '', notifyChannel: u.notifyChannel, notifyEmail: u.notifyEmail || '' });
  }
  function cancelEditUser() { setEditingUserId(null); setEditForm({}); }

  async function saveEditUser(id: string) {
    const name = (editForm.name || '').trim();
    const email = (editForm.email || '').trim();
    const role = editForm.role || 'manager';
    if (!name || !email) { toast.error('Имя и email обязательны'); return; }
    const permissions: AppUser['permissions'] = role === 'admin'
      ? { dashboard: true, suppliers: true, buyers: true, tasks: true, support: true, leads: true, media: true, pricing: true, planfact: true, analytics: true, knowledge: true, planfactEdit: true }
      : { ...ALL_PERMS_FALSE, ...(editForm.permissions || {}) };
    const access: UserAccess = { ...EMPTY_ACCESS, ...(editForm.access || {}) };
    try {
      if (editForm.password) {
        await apiUsersUpdate(id, { password: editForm.password });
      }
      updateStore(s => ({
        ...s,
        settings: {
          ...s.settings,
          users: s.settings.users.map(u => u.id === id
            ? { ...u, name, email, role, dashboardType: role === 'manager' ? (editForm.dashboardType ?? u.dashboardType ?? 'mop') : undefined,
              planfactBase: role === 'manager' ? (editForm.planfactBase ?? u.planfactBase) : undefined,
              leadsBase: role === 'manager' ? (editForm.leadsBase ?? u.leadsBase) : undefined,
              allowedCities: role === 'manager' ? (editForm.allowedCities ?? u.allowedCities) : undefined,
              permissions: applyDashboardSections(role, editForm.dashboardType ?? u.dashboardType ?? 'mop', permissions), access, note: (editForm.note || '').trim(), notifyChatId: (editForm.notifyChatId || '').trim(), notifyChannel: editForm.notifyChannel, notifyEmail: (editForm.notifyEmail || '').trim(), password: (editForm.password || u.password) }
            : u),
        },
      }));
      setEditingUserId(null); setEditForm({}); forceUpdate(n => n + 1);
      toast.success('Пользователь обновлён');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить');
    }
  }

  /** Статусные кнопки карточки: «Уволить» / «Заблокировать» / «Разблокировать» (ТЗ п.1). */
  function updateUserStatus(id: string, status: UserStatus) {
    const me = getCurrentUser();
    if (id === me?.id) { toast.error('Нельзя изменить статус самому себе'); return; }
    const label = status === 'fired' ? 'Уволить' : status === 'blocked' ? 'Заблокировать' : 'Разблокировать';
    if (!confirm(`${label} пользователя? ${status !== 'active' ? 'Он не сможет войти в систему.' : ''}`)) return;
    // ТЗ v1.22.5: фиксируем дату блокировки/увольнения (снимается при разблокировке)
    updateStore(s => ({ ...s, settings: { ...s.settings, users: s.settings.users.map(u => u.id === id ? { ...u, status, firedAt: status !== 'active' ? new Date().toISOString() : undefined } : u) } }));
    // v1.34.0: бан применяем к входу сразу (обнуление password_hash в profiles).
    apiUsersUpdate(id, { ban_duration: status === 'active' ? 'none' : '876000h' }).catch(
      () => toast.error('Статус сохранён в CRM, но не применён ко входу — проверьте API /auth/users'),
    );
    forceUpdate(n => n + 1);
  }

  function deleteUser(id: string) {
    const targetUser = freshStore.settings.users.find(u => u.id === id);
    if (!targetUser) return;
    const admins = freshStore.settings.users.filter(u => u.role === 'admin');
    if (targetUser.role === 'admin' && admins.length <= 1) {
      toast.error('Нельзя удалить последнего администратора');
      return;
    }
    if (id === getCurrentUser()?.id) {
      toast.error('Нельзя удалить самого себя, пока вы вошли под этим пользователем');
      return;
    }
    if (!confirm('Удалить профиль пользователя из CRM? Логин в Supabase Auth при этом сохранится — при необходимости удалите его отдельно в Supabase Dashboard.')) return;
    updateStore(s => ({ ...s, settings: { ...s.settings, users: s.settings.users.filter(u => u.id !== id) } }));
    forceUpdate(n => n + 1);
  }


  // ── TYPES & CITIES ──
  const [newSupplierType, setNewSupplierType] = useState('');
  const [newBuyerType, setNewBuyerType] = useState('');
  const [newTicketType, setNewTicketType] = useState('');
  const [editingTicketType, setEditingTicketType] = useState<{ old: string; value: string } | null>(null);
  const [newCityName, setNewCityName] = useState('');
  function addSupplierType() { const v = newSupplierType.trim(); if (!v || (store.settings.supplierTypes || []).includes(v)) { toast.error('Тип уже существует'); return; } updateStore(s => ({ ...s, settings: { ...s.settings, supplierTypes: [...(s.settings.supplierTypes || []), v] } })); setNewSupplierType(''); forceUpdate(n => n + 1); }
  function removeSupplierType(v: string) { updateStore(s => ({ ...s, settings: { ...s.settings, supplierTypes: (s.settings.supplierTypes || []).filter(t => t !== v) } })); forceUpdate(n => n + 1); }
  function addBuyerType() { const v = newBuyerType.trim(); if (!v || (store.settings.buyerTypes || []).includes(v)) { toast.error('Тип уже существует'); return; } updateStore(s => ({ ...s, settings: { ...s.settings, buyerTypes: [...(s.settings.buyerTypes || []), v] } })); setNewBuyerType(''); forceUpdate(n => n + 1); }
  function removeBuyerType(v: string) { updateStore(s => ({ ...s, settings: { ...s.settings, buyerTypes: (s.settings.buyerTypes || []).filter(t => t !== v) } })); forceUpdate(n => n + 1); }

  // ── PRODUCT GROUPS ──
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupForm, setEditGroupForm] = useState<Partial<ProductGroup>>({});
  function addProductGroup() { const name = newGroupName.trim(); if (!name) return; const now = new Date().toISOString(); updateStore(s => ({ ...s, settings: { ...s.settings, productGroups: [...(s.settings.productGroups || []), { id: generateId(), name, createdAt: now, updatedAt: now }] } })); setNewGroupName(''); forceUpdate(n => n + 1); toast.success('Группа добавлена'); }
  function saveEditGroup() { if (!editingGroupId) return; updateStore(s => ({ ...s, settings: { ...s.settings, productGroups: (s.settings.productGroups || []).map(g => g.id === editingGroupId ? { ...g, ...editGroupForm, updatedAt: new Date().toISOString() } : g) } })); setEditingGroupId(null); forceUpdate(n => n + 1); }
  function deleteProductGroup(id: string) { updateStore(s => ({ ...s, settings: { ...s.settings, productGroups: (s.settings.productGroups || []).map(g => g.id === id ? { ...g, deletedAt: new Date().toISOString() } : g) } })); forceUpdate(n => n + 1); }

  // ── SOURCES ──
  const [newSourceName, setNewSourceName] = useState('');
  // v1.29.33: справочник операторов ЭДО (Источники)
  const [newEdoOp, setNewEdoOp] = useState('');
  function addEdoOperator() {
    const v = newEdoOp.trim();
    if (!v) return;
    if ((store.settings.edoOperators || []).some(o => o.toLowerCase() === v.toLowerCase())) { toast.error('Оператор уже есть в списке'); return; }
    updateStore(s => ({ ...s, settings: { ...s.settings, edoOperators: [...(s.settings.edoOperators || []), v] } }));
    setNewEdoOp(''); forceUpdate(n => n + 1); toast.success('Оператор ЭДО добавлен');
  }
  function removeEdoOperator(v: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, edoOperators: (s.settings.edoOperators || []).filter(o => o !== v) } }));
    forceUpdate(n => n + 1); toast.success('Оператор ЭДО удалён');
  }
  const [newContactPref, setNewContactPref] = useState('');
  const [newRoleType, setNewRoleType] = useState(''); // ТЗ v1.22.30
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const [editSourceForm, setEditSourceForm] = useState<Partial<Source>>({});
  function addSource() { const name = newSourceName.trim(); if (!name) return; const now = new Date().toISOString(); updateStore(s => ({ ...s, settings: { ...s.settings, sources: [...(s.settings.sources || []), { id: generateId(), name, createdAt: now, updatedAt: now }] } })); setNewSourceName(''); forceUpdate(n => n + 1); toast.success('Источник добавлен'); }
  function saveEditSource() { if (!editingSourceId) return; updateStore(s => ({ ...s, settings: { ...s.settings, sources: (s.settings.sources || []).map(src => src.id === editingSourceId ? { ...src, ...editSourceForm, updatedAt: new Date().toISOString() } : src) } })); setEditingSourceId(null); forceUpdate(n => n + 1); }
  function deleteSource(id: string) { updateStore(s => ({ ...s, settings: { ...s.settings, sources: (s.settings.sources || []).map(src => src.id === id ? { ...src, deletedAt: new Date().toISOString() } : src) } })); forceUpdate(n => n + 1); }

  // ── TASK ENTITY TYPES ──
  const [newTaskEntityKey, setNewTaskEntityKey] = useState('');
  const [newTaskEntityLabel, setNewTaskEntityLabel] = useState('');
  function addTaskEntityType() { const key = newTaskEntityKey.trim(); const label = newTaskEntityLabel.trim(); if (!key || !label) { toast.error('Заполните оба поля'); return; } updateStore(s => ({ ...s, settings: { ...s.settings, taskEntityTypes: [...(s.settings.taskEntityTypes || []), { id: generateId(), key, label }] } })); setNewTaskEntityKey(''); setNewTaskEntityLabel(''); forceUpdate(n => n + 1); }
  function deleteTaskEntityType(id: string) { updateStore(s => ({ ...s, settings: { ...s.settings, taskEntityTypes: (s.settings.taskEntityTypes || []).filter(t => t.id !== id) } })); forceUpdate(n => n + 1); }

  // ── MEDIA: AD TYPES WITH DURATION OPTIONS ──
  const [editingAdTypeId, setEditingAdTypeId] = useState<string | null>(null);
  const [adTypeForm, setAdTypeForm] = useState<Partial<MediaAdType>>({ name: '', spotsCount: 1, pricePerMonth: 0, durationOptions: [] });
  const [showAdTypeForm, setShowAdTypeForm] = useState(false);
  const [expandedAdTypeId, setExpandedAdTypeId] = useState<string | null>(null);
  const [newDurationForm, setNewDurationForm] = useState<Partial<MediaDurationOption>>({ periodLabel: '1 мес.', periodMonths: 1, discount: 0, totalPrice: 0, bonus: '' });
  const [addingDurationForId, setAddingDurationForId] = useState<string | null>(null);

  function saveAdType(e: React.FormEvent) {
    e.preventDefault();
    if (!adTypeForm.name?.trim()) { toast.error('Введите название'); return; }
    const now = new Date().toISOString();
    if (editingAdTypeId) {
      updateStore(s => ({ ...s, settings: { ...s.settings, mediaAdTypes: (s.settings.mediaAdTypes || []).map(t => t.id === editingAdTypeId ? { ...t, ...adTypeForm as MediaAdType } : t) } }));
      toast.success('Формат обновлён');
    } else {
      const nt: MediaAdType = { id: generateId(), name: adTypeForm.name || '', spotsCount: adTypeForm.spotsCount || 1, pricePerMonth: adTypeForm.pricePerMonth || 0, durationOptions: [], createdAt: now };
      updateStore(s => ({ ...s, settings: { ...s.settings, mediaAdTypes: [...(s.settings.mediaAdTypes || []), nt] } }));
      toast.success('Формат добавлен');
    }
    setShowAdTypeForm(false); setEditingAdTypeId(null); setAdTypeForm({ name: '', spotsCount: 1, pricePerMonth: 0, description: '' }); forceUpdate(n => n + 1);
  }

  // ── Типы обращений (добавление / редактирование / удаление) ──
  function addTicketType() {
    const v = newTicketType.trim();
    if (!v) return;
    if ((store.settings.ticketTypes || []).some(t => t.toLowerCase() === v.toLowerCase())) { toast.error('Тип обращения уже существует'); return; }
    updateStore(s => ({ ...s, settings: { ...s.settings, ticketTypes: [...(s.settings.ticketTypes || []), v] } }));
    setNewTicketType(''); forceUpdate(n => n + 1);
  }
  function removeTicketType(v: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, ticketTypes: (s.settings.ticketTypes || []).filter(t => t !== v) } }));
    if (editingTicketType?.old === v) setEditingTicketType(null);
    forceUpdate(n => n + 1);
  }
  function saveTicketTypeEdit() {
    if (!editingTicketType) return;
    const v = editingTicketType.value.trim();
    if (!v) return;
    updateStore(s => ({ ...s, settings: { ...s.settings, ticketTypes: (s.settings.ticketTypes || []).map(t => t === editingTicketType.old ? v : t) } }));
    setEditingTicketType(null); forceUpdate(n => n + 1);
  }

  // ── Города (для выпадающих списков поставщиков/покупателей) ──
  function addCity() {
    const v = newCityName.trim();
    if (!v) return;
    if ((store.settings.cities || []).some(c => c.toLowerCase() === v.toLowerCase())) { toast.error('Город уже есть в списке'); return; }
    updateStore(s => ({ ...s, settings: { ...s.settings, cities: [...(s.settings.cities || []), v].sort((a, b) => a.localeCompare(b, 'ru')) } }));
    setNewCityName(''); forceUpdate(n => n + 1);
  }
  function removeCity(v: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, cities: (s.settings.cities || []).filter(c => c !== v) } }));
    forceUpdate(n => n + 1);
  }

  // v1.30.0: подвкладки «ЛК Поставщик»
  const [lkTab, setLkTab] = useState<'manager' | 'dashboard' | 'banner' | 'news' | 'greeting' | 'links' | 'titul'>('dashboard');
  const [opName, setOpName] = useState('');
  const [opPhone, setOpPhone] = useState('');
  const [opEmail, setOpEmail] = useState('');
  const [opAvatarBusy, setOpAvatarBusy] = useState(false);
  const [opMaxLink, setOpMaxLink] = useState('');
  const [opAvatar, setOpAvatar] = useState('');
  const [opUserId, setOpUserId] = useState('');
  // v1.30.55: договоры оферты
  const [docTab, setDocTab] = useState<'offer'>('offer');
  const [ocName, setOcName] = useState('');
  const [ocEdition, setOcEdition] = useState('');
  const [ocPublishedAt, setOcPublishedAt] = useState('');
  const [ocEffectiveAt, setOcEffectiveAt] = useState('');
  const [ocText, setOcText] = useState('');
  const [editingOcId, setEditingOcId] = useState<string | null>(null);
  const [editingOpId, setEditingOpId] = useState<string | null>(null); // v1.30.92: правка оператора
  // v1.31.11: домены (commerce.domains)
  const [domains, setDomains] = useState<Array<Record<string, unknown>>>([]);
  const [showDomains, setShowDomains] = useState(false);
  const [dmHost, setDmHost] = useState('');
  const [dmName, setDmName] = useState('');
  // v1.32.9/1.34.0: домены через свой API (удаление — атомарно в API, Supabase вырезан).
  async function loadDomains() {
    const data = await apiDomainsList().catch(() => null);
    if (data) setDomains(data as Record<string, unknown>[]);
  }
  async function addDomain() {
    if (!dmHost.trim()) { toast.error('Укажите домен'); return; }
    try {
      await apiDomainsCreate({ host: dmHost.trim().toLowerCase(), name: dmName.trim() });
    } catch (e) {
      toast.error(String((e as Error).message || e)); return;
    }
    setDmHost(''); setDmName(''); loadDomains(); toast.success('Домен добавлен');
  }
  // v1.31.18: дефолтный домен всегда активен — выключать нельзя.
  async function toggleDomain(d: Record<string, unknown>) {
    if (String(d.id) === DEFAULT_DOMAIN_ID) return;
    try {
      await apiDomainsUpdate(String(d.id), { is_active: !d.is_active });
    } catch (e) {
      toast.error(String((e as Error).message || e)); return;
    }
    loadDomains();
  }
  // v1.31.18: удаление домена-арендатора «с концами». Поставщики/покупатели домена
  // перепривязываются на дефолтный (FK domain_id NOT NULL), затем строка домена удаляется
  // — вместе с брендингом ЛК (титул, приветствие, баннер).
  async function deleteDomain(d: Record<string, unknown>) {
    if (String(d.id) === DEFAULT_DOMAIN_ID) return;
    try {
      await apiDomainsDelete(String(d.id));
    } catch (e) {
      toast.error(String((e as Error).message || e)); return;
    }
    loadDomains();
    toast.success(`Домен ${String(d.host)} удалён; его арендаторы перенесены на дефолтный`);
  }
  useEffect(() => { if (showDomains) loadDomains(); }, [showDomains]);
  // v1.31.18: карточка доменов — используется в фокусном режиме (ранний return ниже).
  const domainsCard = (
    <div className="card-base p-4 space-y-3 mb-4">
      <h3 className="section-title">Домены</h3>
      <p className="text-xs text-gray-400">Домены-арендаторы ЛК. Дефолтный домен (default) всегда активен и не удаляется. Удаление домена переносит его поставщиков и покупателей на дефолтный — вместе с брендингом ЛК домена.</p>
      <div className="flex flex-wrap gap-2">
        <input className="form-input text-xs flex-1 min-w-[160px]" placeholder="Домен: lk.partner.pro" value={dmHost} onChange={e => setDmHost(e.target.value)} />
        <input className="form-input text-xs flex-1 min-w-[160px]" placeholder="Название" value={dmName} onChange={e => setDmName(e.target.value)} />
        <button onClick={addDomain} className="action-btn action-btn-md">Добавить</button>
      </div>
      <div className="space-y-1.5">
        {domains.map(d => {
          const isDefault = String(d.id) === DEFAULT_DOMAIN_ID;
          return (
            <div key={String(d.id)} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 text-sm">
              <b className="font-mono text-gray-800">{String(d.host)}</b>
              <span className="text-gray-500">{String(d.name || '')}</span>
              {isDefault && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Дефолтный</span>}
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{d.is_active ? 'Активен' : 'Выключен'}</span>
              <div className="ml-auto flex items-center gap-1">
                {!isDefault && <button onClick={() => toggleDomain(d)} className="text-xs text-gray-500 hover:text-gray-800">{d.is_active ? 'Выключить' : 'Включить'}</button>}
                {/* Дефолтный домен не удаляется; арендаторы удаляемого домена
                    перепривязываются на дефолтный (см. deleteDomain). */}
                {!isDefault && <GuardedDelete inUse={false} onClick={() => deleteDomain(d)} title={`Домен ${String(d.host)}`} />}
              </div>
            </div>
          );
        })}
        {!domains.length && <p className="text-xs text-gray-400">Домены не созданы.</p>}
      </div>
    </div>
  );
  // v1.30.92: новости — редактирование и удаление (модалка)
  const [editingNews, setEditingNews] = useState<{ list: 'p' | 'v'; id: string } | null>(null);
  useState<'manager' | 'dashboard' | 'banner' | 'news' | 'greeting' | 'links'>('dashboard');
  const [lkBannerImg, setLkBannerImg] = useState('');
  const [lkBannerLink, setLkBannerLink] = useState('');
  const [lkNewsTitle, setLkNewsTitle] = useState('');
  const [lkNewsText, setLkNewsText] = useState('');
  const [lkNewsTag, setLkNewsTag] = useState('');
  const [lkNewsLink, setLkNewsLink] = useState('');
  const [lkNewsFull, setLkNewsFull] = useState('');
  // v1.30.92: создание/редактирование новости платформы; новые — без публикации
  function addLkNews() {
    if (!lkNewsTitle.trim() || !lkNewsText.trim()) { toast.error('Заполните заголовок и текст новости'); return; }
    if (editingNews && editingNews.list === 'p') {
      updateStore(s => ({ ...s, settings: { ...s.settings, lkNews: (s.settings.lkNews || []).map(x2 => x2.id === editingNews.id ? { ...x2, title: lkNewsTitle.trim(), tag: lkNewsTag.trim() || undefined, link: lkNewsLink.trim() || undefined, text: lkNewsText.trim(), fullText: lkNewsFull.trim() || undefined } : x2) } }));
      setEditingNews(null); clearNewsForm(); forceUpdate(n2 => n2 + 1); toast.success('Новость обновлена'); return;
    }
    const item = { id: `ln-${Date.now()}`, title: lkNewsTitle.trim(), date: new Date().toLocaleDateString('ru-RU'), text: lkNewsText.trim(), createdAt: new Date().toISOString(), tag: lkNewsTag.trim() || undefined, link: lkNewsLink.trim() || undefined, fullText: lkNewsFull.trim() || undefined, published: false };
    updateStore(s => ({ ...s, settings: { ...s.settings, lkNews: [...(s.settings.lkNews || []), item] } }));
    clearNewsForm(); forceUpdate(n2 => n2 + 1); toast.success('Новость создана — нажмите «Опубликовать» для показа в ЛК');
  }
  function addLkVendorNews() {
    if (!lkNewsTitle.trim() || !lkNewsText.trim()) { toast.error('Заполните заголовок и текст новости'); return; }
    if (editingNews && editingNews.list === 'v') {
      updateStore(s => ({ ...s, settings: { ...s.settings, lkVendorNews: (s.settings.lkVendorNews || []).map(x2 => x2.id === editingNews.id ? { ...x2, title: lkNewsTitle.trim(), tag: lkNewsTag.trim() || undefined, link: lkNewsLink.trim() || undefined, text: lkNewsText.trim(), fullText: lkNewsFull.trim() || undefined } : x2) } }));
      setEditingNews(null); clearNewsForm(); forceUpdate(n2 => n2 + 1); toast.success('Новость обновлена'); return;
    }
    const item = { id: `lv-${Date.now()}`, title: lkNewsTitle.trim(), date: new Date().toLocaleDateString('ru-RU'), text: lkNewsText.trim(), createdAt: new Date().toISOString(), tag: lkNewsTag.trim() || undefined, link: lkNewsLink.trim() || undefined, fullText: lkNewsFull.trim() || undefined, published: false };
    updateStore(s => ({ ...s, settings: { ...s.settings, lkVendorNews: [...(s.settings.lkVendorNews || []), item] } }));
    clearNewsForm(); forceUpdate(n2 => n2 + 1); toast.success('Новость создана — нажмите «Опубликовать» для показа в ЛК');
  }
  function clearNewsForm() { setLkNewsTitle(''); setLkNewsText(''); setLkNewsTag(''); setLkNewsLink(''); setLkNewsFull(''); }
  function openNewsEdit(x2: { id: string; title: string; tag?: string; link?: string; text: string; fullText?: string }, list: 'p' | 'v') {
    setEditingNews({ list, id: x2.id }); setLkNewsTitle(x2.title); setLkNewsTag(x2.tag || ''); setLkNewsLink(x2.link || ''); setLkNewsText(x2.text); setLkNewsFull(x2.fullText || '');
  }
  function toggleNewsPublished(list: 'p' | 'v', id: string) {
    const key = list === 'p' ? 'lkNews' : 'lkVendorNews';
    updateStore(s => ({ ...s, settings: { ...s.settings, [key]: ((s.settings as unknown as Record<string, Array<{ id: string; published?: boolean }>>)[key] || []).map(x2 => x2.id === id ? { ...x2, published: !x2.published } : x2) } }));
    forceUpdate(n2 => n2 + 1);
  }
  function removeLkVendorNews(id: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, lkVendorNews: (s.settings.lkVendorNews || []).filter(x => x.id !== id) } }));
    forceUpdate(n => n + 1); toast.success('Новость удалена');
  }
  function removeLkNews(id: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, lkNews: (s.settings.lkNews || []).filter(x => x.id !== id) } }));
    forceUpdate(n => n + 1); toast.success('Новость удалена');
  }
  async function uploadLkBanner(file: File) {
    // v1.34.0: файлы через свой API (storage Supabase вырезан).
    try {
      const url = await apiFilesUploadFile(file);
      updateStore(s => ({ ...s, settings: { ...s.settings, lkBanner: { image: url, link: s.settings.lkBanner?.link || '' } } }));
      forceUpdate(n => n + 1); toast.success('Баннер загружен');
    } catch (err) { toast.error(`Баннер: ${(err as Error)?.message || 'ошибка загрузки'}`); }
  }

  function addOperator() {
    if (!opName.trim()) { toast.error('Укажите ФИО оператора'); return; }
    if (!opUserId) { toast.error('Выберите пользователя (роль)'); return; }
    const op = { id: `dop-${Date.now()}`, name: opName.trim(), phone: opPhone.trim(), email: opEmail.trim() || undefined, avatar: opAvatar.trim() || undefined, userId: opUserId, maxLink: opMaxLink.trim() || undefined, createdAt: new Date().toISOString() };
    if (editingOpId) {
      updateStore(s => ({ ...s, settings: { ...s.settings, lkOperators: (s.settings.lkOperators || []).map(x2 => x2.id === editingOpId ? { ...x2, name: opName.trim(), phone: opPhone.trim(), email: opEmail.trim() || undefined, avatar: opAvatar || undefined, userId: opUserId, maxLink: opMaxLink.trim() || undefined } : x2) } }));
      setTimeout(() => updateStore(s => ({ ...s })), 300); // v1.30.95: гарантированный push
      setEditingOpId(null); setOpName(''); setOpPhone(''); setOpEmail(''); setOpAvatar(''); setOpUserId(''); setOpMaxLink('');
      forceUpdate(n2 => n2 + 1); toast.success('Оператор обновлён'); return;
    }
    updateStore(s => ({ ...s, settings: { ...s.settings, lkOperators: [...(s.settings.lkOperators || []), op] } }));
    setTimeout(() => updateStore(s => ({ ...s })), 300); // v1.30.95: повторный тик — гарантированный push до F5
    setOpName(''); setOpPhone(''); setOpEmail(''); setOpAvatar(''); setOpUserId(''); setOpMaxLink('');
    forceUpdate(n => n + 1); toast.success('Оператор создан');
  }
  async function uploadOperatorAvatar(file: File) {
    // v1.34.0: файлы через свой API (storage Supabase вырезан).
    setOpAvatarBusy(true);
    try {
      setOpAvatar(await apiFilesUploadFile(file));
      toast.success('Аватар загружен');
    } catch (e) { toast.error('Не удалось загрузить аватар'); }
    finally { setOpAvatarBusy(false); }
  }
  function removeOperator(id: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, lkOperators: (s.settings.lkOperators || []).filter(o => o.id !== id) } }));
    forceUpdate(n => n + 1); toast.success('Оператор удалён');
  }

  // v1.30.55: CRUD договоров оферты; включённым может быть только один
  function saveOfferContract() {
    if (!ocName.trim()) { toast.error('Введите название договора'); return; }
    if (!ocEdition.trim()) { toast.error('Введите редакцию'); return; }
    if (!ocPublishedAt) { toast.error('Укажите дату публикации'); return; }
    if (!ocEffectiveAt) { toast.error('Укажите дату вступления в силу'); return; }
    if (!ocText.trim()) { toast.error('Введите текст договора'); return; }
    const now = new Date().toISOString();
    if (editingOcId) {
      updateStore(s => ({ ...s, settings: { ...s.settings, offerContracts: (s.settings.offerContracts || []).map(c => c.id === editingOcId ? { ...c, name: ocName.trim(), edition: ocEdition.trim(), publishedAt: ocPublishedAt, effectiveAt: ocEffectiveAt, text: ocText, updatedAt: now } : c) } }));
      toast.success('Договор обновлён');
    } else {
      const nc = { id: generateId(), name: ocName.trim(), edition: ocEdition.trim(), publishedAt: ocPublishedAt, effectiveAt: ocEffectiveAt, text: ocText, enabled: !(getStore().settings.offerContracts || []).some(c => c.enabled), createdAt: now };
      updateStore(s => ({ ...s, settings: { ...s.settings, offerContracts: [...(s.settings.offerContracts || []), nc] } }));
      toast.success('Договор создан');
    }
    setOcName(''); setOcEdition(''); setOcPublishedAt(''); setOcEffectiveAt(''); setOcText(''); setEditingOcId(null);
  }
  function enableOfferContract(id: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, offerContracts: (s.settings.offerContracts || []).map(c => ({ ...c, enabled: c.id === id })) } }));
    toast.success('Договор включён');
  }
  function deleteOfferContract(id: string) {
    updateStore(s => ({ ...s, settings: { ...s.settings, offerContracts: (s.settings.offerContracts || []).filter(c => c.id !== id) } }));
    toast.success('Договор удалён');
  }

  function deleteAdType(id: string) {
    // v_1.9: есть связи в размещениях → удаление запрещено, только отключение
    const linked = getStore().mediaRecords.filter(r => r.adTypeId === id).length;
    if (linked > 0) { toast.error(`Тариф используется в ${linked} размещении(ях) — можно только отключить (Вкл/Выкл)`); return; }
    if (!confirm('Удалить формат и все его тарифы?')) return;
    updateStore(s => ({ ...s, settings: { ...s.settings, mediaAdTypes: (s.settings.mediaAdTypes || []).filter(t => t.id !== id) } }));
    forceUpdate(n => n + 1);
  }

  function addDurationOption(adTypeId: string) {
    // v1.30.48: «Срок Мес» обязателен (столбец «Срок *» убран); итого считается автоматически
    if (!newDurationForm.periodMonths || newDurationForm.periodMonths < 1) { toast.error('Введите срок в месяцах'); return; }
    const months = newDurationForm.periodMonths;
    const adType = getStore().settings.mediaAdTypes?.find(t => t.id === adTypeId);
    const computedTotal = Math.max(0, Math.round((adType?.pricePerMonth || 0) * months * (1 - (newDurationForm.discount || 0) / 100)));
    const opt: MediaDurationOption = { id: generateId(), periodLabel: `${months} мес.`, periodMonths: months, discount: newDurationForm.discount || 0, totalPrice: computedTotal, bonus: newDurationForm.bonus || '' };
    updateStore(s => ({ ...s, settings: { ...s.settings, mediaAdTypes: (s.settings.mediaAdTypes || []).map(t => t.id === adTypeId ? { ...t, durationOptions: [...t.durationOptions, opt] } : t) } }));
    setNewDurationForm({ periodLabel: '1 мес.', periodMonths: 1, discount: 0, totalPrice: 0, bonus: '' });
    setAddingDurationForId(null); forceUpdate(n => n + 1); toast.success('Тариф добавлен');
  }

  function deleteDurationOption(adTypeId: string, optId: string) {
    // v_1.9: есть связи в размещениях → удаление запрещено
    if (getStore().mediaRecords.some(r => r.durationOptionId === optId)) { toast.error('Формат используется в размещениях — удаление запрещено'); return; }
    updateStore(s => ({ ...s, settings: { ...s.settings, mediaAdTypes: (s.settings.mediaAdTypes || []).map(t => t.id === adTypeId ? { ...t, durationOptions: t.durationOptions.filter(o => o.id !== optId) } : t) } }));
    forceUpdate(n => n + 1);
  }

  // ── MEDIA: STATUSES ──
  const emptyMediaStatus = (): Partial<MediaStatus> => ({ name: '', bgColor: '#ECFDF5', textColor: '#065F46' });
  const [mediaStatusForm, setMediaStatusForm] = useState<Partial<MediaStatus>>(emptyMediaStatus());
  const [editingMediaStatusId, setEditingMediaStatusId] = useState<string | null>(null);
  const [showMediaStatusForm, setShowMediaStatusForm] = useState(false);
  function saveMediaStatus() {
    const name = mediaStatusForm.name?.trim(); if (!name) { toast.error('Введите название'); return; }
    if (editingMediaStatusId) {
      updateStore(s => ({ ...s, settings: { ...s.settings, mediaStatuses: (s.settings.mediaStatuses || []).map(ms => ms.id === editingMediaStatusId ? { ...ms, ...mediaStatusForm as MediaStatus } : ms) } }));
    } else {
      const ns: MediaStatus = { id: generateId(), name, bgColor: mediaStatusForm.bgColor || '#F3F4F6', textColor: mediaStatusForm.textColor || '#374151', createdAt: new Date().toISOString() };
      updateStore(s => ({ ...s, settings: { ...s.settings, mediaStatuses: [...(s.settings.mediaStatuses || []), ns] } }));
    }
    setShowMediaStatusForm(false); setEditingMediaStatusId(null); setMediaStatusForm(emptyMediaStatus()); forceUpdate(n => n + 1); toast.success('Статус сохранён');
  }
  function deleteMediaStatus(id: string) { if (!confirm('Удалить статус?')) return; updateStore(s => ({ ...s, settings: { ...s.settings, mediaStatuses: (s.settings.mediaStatuses || []).filter(ms => ms.id !== id) } })); forceUpdate(n => n + 1); }

  // ── PUBLIC FORMS (Настройки → Формы) ──
  const [formsSubTab, setFormsSubTab] = useState<PublicFormEntityType>('supplier');
  const FORMS_SUB_TABS: Array<{ key: PublicFormEntityType; label: string }> = [
    { key: 'supplier', label: 'Поставщики' },
    { key: 'buyer', label: 'Покупатели' },
    { key: 'ticket', label: 'Поддержка' },
];

  function updateFormConfig(type: PublicFormEntityType, patch: Partial<FormConfig>) {
    updateStore(s => ({
      ...s,
      settings: {
        ...s.settings,
        forms: { ...s.settings.forms, [type]: { ...s.settings.forms[type], ...patch, updatedAt: new Date().toISOString() } },
      },
    }));
    forceUpdate(n => n + 1);
  }

  function toggleFormField(type: PublicFormEntityType, key: string, included: boolean) {
    const config = getStore().settings.forms[type];
    const fields: FormFieldConfig[] = included
      ? [...config.fields, { key, required: false }]
      : config.fields.filter(f => f.key !== key);
    updateFormConfig(type, { fields });
  }

  function toggleFormFieldRequired(type: PublicFormEntityType, key: string, required: boolean) {
    const config = getStore().settings.forms[type];
    updateFormConfig(type, { fields: config.fields.map(f => f.key === key ? { ...f, required } : f) });
  }

  function copyEmbedCode(type: PublicFormEntityType) {
    const base = window.location.origin;
    const code = `<script src="${base}/embed.js" data-vz-form="${type}" data-vz-base="${base}"></script>`;
    navigator.clipboard.writeText(code).then(
      () => toast.success('Код скопирован'),
      () => toast.error('Не удалось скопировать — выделите и скопируйте вручную'),
    );
  }

  const freshStore = getStore();
  const activeProductGroups = (freshStore.settings.productGroups || []).filter(g => !g.deletedAt);
  const activeSources = (freshStore.settings.sources || []).filter(s => !s.deletedAt);
  const taskEntityTypes = freshStore.settings.taskEntityTypes || [];
  const supplierServices = freshStore.settings.supplierServices || [];
  const mediaAdTypes = freshStore.settings.mediaAdTypes || [];
  const mediaStatuses = freshStore.settings.mediaStatuses || [];

  // ── МОДУЛЬ УВЕДОМЛЕНИЙ (ТЗ): каналы Telegram / MAX / Email ──
  const notif = freshStore.settings.notifications || {
    telegram: { enabled: false, globalChatId: '' },
    max: { enabled: false, globalChatId: '' },
    email: { enabled: false, to: '', from: 'CRM <crm@example.ru>' },
  };
  function saveNotif(channel: 'telegram' | 'max' | 'email', patch: Record<string, unknown>) {
    const next = { ...notif, [channel]: { ...notif[channel], ...patch } };
    updateStore(s => ({ ...s, settings: { ...s.settings, notifications: next } }));
    forceUpdate(n => n + 1);
    toast.success('Настройки уведомлений сохранены');
  }
  const notifChannels = [
    {
      key: 'telegram' as const, title: 'Telegram', enabled: notif.telegram.enabled,
      secretHint: 'Токен бота задаётся в env API (TELEGRAM_BOT_TOKEN). Manage Secrets: TELEGRAM_BOT_TOKEN',
      fields: [{ label: 'Chat ID общего чата', value: notif.telegram.globalChatId, save: (v: string) => saveNotif('telegram', { globalChatId: v }) }],
    },
    {
      key: 'max' as const, title: 'Мессенджер MAX', enabled: notif.max.enabled,
      secretHint: 'Токен бота задаётся в Secrets: MAX_BOT_TOKEN (MasterBot в мессенджере или business.max.ru)',
      fields: [{ label: 'Chat ID чата', value: notif.max.globalChatId, save: (v: string) => saveNotif('max', { globalChatId: v }) }],
    },
    {
      key: 'email' as const, title: 'Email', enabled: notif.email.enabled,
      secretHint: 'API-ключ задаётся в Secrets: RESEND_API_KEY (resend.com)',
      fields: [
        { label: 'Почта получателя', value: notif.email.to, save: (v: string) => saveNotif('email', { to: v }) },
        { label: 'Отправитель (From)', value: notif.email.from, save: (v: string) => saveNotif('email', { from: v }) },
      ],
    },
  ];

  // ── РЕДАКТОР ДОСТУПА К РАЗДЕЛАМ (ТЗ п.2): разделы с поднастройками фильтрации ──
  const supplierTypesList = freshStore.settings.supplierTypes || [];
  const buyerTypesList = freshStore.settings.buyerTypes || [];
  const citiesList = freshStore.settings.cities || [];
  const ticketTypesList = freshStore.settings.ticketTypes || [];
  const FILTER_SECTIONS = [
    { perm: 'suppliers' as const, label: 'Поставщики', dims: [] },
    { perm: 'buyers' as const, label: 'Покупатели', dims: [] },
    { perm: 'support' as const, label: 'Поддержка', dims: [
      { key: 'ticketTypes' as const, label: 'Типы обращений', options: ticketTypesList },
    ] },
    { perm: 'leads' as const, label: 'База лидов', dims: [] },
    { perm: 'planfact' as const, label: 'План/Факт', dims: [] },
    { perm: 'dashboard' as const, label: 'Дашборд', dims: [] },
    { perm: 'tasks' as const, label: 'Задачи', dims: [
      { key: 'taskTypes' as const, label: 'Типы задач', options: freshStore.settings.taskTypes || [] },
      { key: 'taskEntityTypes' as const, label: 'Типы сущностей', options: taskEntityTypes.map(et => et.key) },
    ] },
    { perm: 'media' as const, label: 'Медиа сервис', dims: [] },
    { perm: 'pricing' as const, label: 'Проценка', dims: [] },
    { perm: 'knowledge' as const, label: 'База знаний', dims: [] },
  ];
  // Тип дашборда менеджера определяет доступные разделы (ТЗ v1.21.6): МОП — только покупательские,
  // МОЗ — только поставщические; недоступные блоки скрываем, а права на сохранении принудительно снимаем.
  const DASH_SECTIONS: Record<'mop' | 'moz', Array<keyof AppUser['permissions']>> = {
    mop: ['dashboard', 'planfact', 'buyers', 'tasks', 'support', 'leads', 'knowledge'],
    moz: ['dashboard', 'planfact', 'suppliers', 'tasks', 'support', 'leads', 'media', 'pricing', 'knowledge'],
  };
  const applyDashboardSections = (role: AppUser['role'], dashboardType: 'mop' | 'moz' | undefined, perms: AppUser['permissions']): AppUser['permissions'] => {
    if (role !== 'manager' || !dashboardType) return perms;
    const next = { ...perms };
    (dashboardType === 'mop' ? ['suppliers', 'media', 'pricing'] as const : ['buyers'] as const).forEach(k => { next[k] = false; });
    return next;
  };
  // Порядок блоков «Доступ к разделам» (ТЗ v1.21.0): Дашборд → План/Факт → Поставщики → Покупатели →
  // Задачи → Поддержка → База лидов → Медиа сервис → Аналитика* → База знаний → Настройки* → База данных*
  // (* — доступно только администратору, менеджеру не выдаётся).
  const adminRow = (label: string) => ({ perm: null as null, label, note: 'Доступно только администратору' });
  const sectionByPerm = (p: string) => FILTER_SECTIONS.find(s => s.perm === p)!;
  const ACCESS_FLOW: Array<(typeof FILTER_SECTIONS)[number] | ReturnType<typeof adminRow>> = [
    sectionByPerm('dashboard'), sectionByPerm('planfact'), sectionByPerm('suppliers'), sectionByPerm('buyers'),
    sectionByPerm('tasks'), sectionByPerm('support'), sectionByPerm('leads'), sectionByPerm('media'),
    sectionByPerm('pricing'),
    adminRow('Аналитика'),
    sectionByPerm('knowledge'),
    adminRow('Настройки'),
    adminRow('База данных'),
  ];
  const SIMPLE_PERMS = PERM_LABELS.filter(p => !FILTER_SECTIONS.some(f => f.perm === p.key));

  /** Единый редактор блока «Доступ к разделам» — для формы создания и формы редактирования. */
  const renderAccessEditor = (
    perms: AppUser['permissions'],
    access: UserAccess,
    onPerm: (k: keyof AppUser['permissions'], v: boolean) => void,
    onAccess: (dim: keyof UserAccess, value: string) => void,
    dashboardType?: 'mop' | 'moz',
    onDashboardType?: (t: 'mop' | 'moz') => void,
    planfactBase?: 'buyers' | 'suppliers',
    onPlanfactBase?: (t: 'buyers' | 'suppliers') => void,
    leadsBase?: 'buyers' | 'suppliers',
    onLeadsBase?: (t: 'buyers' | 'suppliers') => void,
    allowedCities?: string[],
    onCities?: (city: string) => void,
  ) => (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">Пустой список фильтра = без ограничений: менеджер видит все позиции раздела.</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {SIMPLE_PERMS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={perms[key]} onChange={e => onPerm(key, e.target.checked)} className="rounded" />
            <span className="text-xs">{label}</span>
          </label>
        ))}
      </div>
      {(dashboardType ? ACCESS_FLOW.filter(b => b.perm === null || DASH_SECTIONS[dashboardType].includes(b.perm)) : ACCESS_FLOW).map(sec => sec.perm === null ? (
        <div key={sec.label} className="border border-brand-gray-mid rounded-lg p-3 bg-gray-50">
          <p className="text-sm font-medium text-gray-500">{sec.label}</p>
          <p className="text-xs text-gray-400 mt-1">{sec.note}</p>
        </div>
      ) : (
        <div key={sec.perm} className="border border-brand-gray-mid rounded-lg p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={perms[sec.perm]} onChange={e => onPerm(sec.perm, e.target.checked)} className="rounded" />
            <span className="text-sm font-medium">{sec.label}</span>
          </label>
          {perms[sec.perm] && (
            <div className="ml-6 mt-2 space-y-2">
              {sec.dims.map(dim => (
                <div key={dim.key}>
                  <p className="text-xs text-gray-500 mb-1">{dim.label}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {dim.options.map(o => (
                      <button key={o} type="button" onClick={() => onAccess(dim.key, o)}
                        className={`text-xs px-2 py-1 rounded-full border ${access[dim.key].includes(o) ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>{o}</button>
                    ))}
                    {dim.options.length === 0 && <span className="text-xs text-gray-400">Справочник пуст — заполните в «Типы и города»</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {sec.perm === 'dashboard' && (
            <div className="ml-6 mt-2 space-y-1.5">
              <p className="text-xs text-gray-500">Тип дашборда менеджера (выбирается один):</p>
              <div className="flex flex-wrap gap-1.5">
                {([['mop', 'Дашборд МОП (продажи — покупатели)'], ['moz', 'Дашборд МОЗ (закупки — поставщики)']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => onDashboardType?.(v)}
                    className={`text-xs px-2 py-1 rounded-full border ${dashboardType === v ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>{l}</button>
                ))}
              </div>
              <Link to={`/dashboard-preview/${dashboardType ?? 'mop'}`} className="inline-block text-xs text-brand-red hover:underline">Предпросмотр дашборда →</Link>
            </div>
          )}
          {sec.perm === 'dashboard' && dashboardType === 'mop' && (
            <div className="ml-6 mt-2 space-y-1.5">
              <p className="text-xs text-gray-500">Выбор доступных городов (пусто = все города):</p>
              <div className="flex flex-wrap gap-1.5">
                {(freshStore.settings.cities || []).map(city => {
                  const on = (allowedCities || []).includes(city);
                  return (
                    <button key={city} type="button" onClick={() => onCities?.(city)}
                      className={`text-xs px-2 py-1 rounded-full border ${on ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>{city}</button>
                  );
                })}
              </div>
            </div>
          )}
          {(sec.perm === 'planfact' || sec.perm === 'leads') && (
            <div className="ml-6 mt-2 space-y-1.5">
              <p className="text-xs text-gray-500">{sec.perm === 'planfact' ? 'Какая база доступна менеджеру (выбирается один):' : 'Чья база лидов (выбирается один):'}</p>
              <div className="flex flex-wrap gap-1.5">
                {([['buyers', 'Покупатели'], ['suppliers', 'Поставщики']] as const).map(([v, l]) => {
                  const val = sec.perm === 'planfact' ? planfactBase : leadsBase;
                  const onCh = sec.perm === 'planfact' ? onPlanfactBase : onLeadsBase;
                  return (
                    <button key={v} type="button" onClick={() => onCh?.(v)}
                      className={`text-xs px-2 py-1 rounded-full border ${val === v ? 'bg-green-50 border-green-300 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>{l}</button>
                  );
                })}
              </div>
            </div>
          )}
          {sec.perm === 'knowledge' && (
            <p className="ml-6 mt-2 text-xs text-gray-500">Доступ к материалам настраивается в самой базе знаний — флажок «доступно менеджеру» у материала.</p>
          )}
        </div>
      ))}
    </div>
  );

  // v1.31.18: фокусный режим «Домены» — остальные пункты меню и все настройки
  // системы не рендерятся; назад — кнопка «← Система».
  if (showDomains) return (
    <div className="space-y-4 animate-fade-in">
      <div className="mb-4">
        <button type="button" onClick={() => setShowDomains(false)} className="action-btn">← Система</button>
      </div>
      {domainsCard}
    </div>
  );

  if (!admin) return null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* v1.31.8: меню категорий */}
      <div className="actions-bar flex items-center justify-start flex-wrap gap-2 mb-4">
        <button type="button" className="action-btn action-btn-active">Система</button>
        {/* v1.31.18: открывает фокусный режим (ранний return); закрывается кнопкой «← Система» */}
        <button type="button" onClick={() => setShowDomains(true)} className="action-btn">Домены</button>
      </div>

      {/* v1.31.18: в фокусном режиме «Домены» рендерится ранний return выше —
          до этой точки доходим только в режиме «Система». */}

      <div className="card-base overflow-hidden">
        <div className="flex overflow-x-auto border-b border-brand-gray-mid">
          {SETTINGS_TABS.map(t => <button key={t} onClick={() => setTab(t)} className={`tab-button flex-shrink-0 ${tab === t ? 'tab-active' : 'tab-inactive'}`}>{t}</button>)}
        </div>
        <div className="p-4 sm:p-6">

          {/* ── STATUSES ── */}
          {tab === 'Статусы' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Добавляйте кастомные статусы. Они появятся во всех карточках и фильтрах.</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_SECTIONS.map(s => <button key={s.key} onClick={() => { setStatusSection(s.key); setAddStatusForm(null); setEditingStatusId(null); }} className={`text-xs px-3 py-1.5 rounded-full border min-h-[36px] transition-colors ${statusSection === s.key ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>{s.label}</button>)}
              </div>
              <div className="flex items-center justify-between">
                <h3 className="section-title">{STATUS_SECTIONS.find(s => s.key === statusSection)?.label} — статусы</h3>
                {(statusSection !== 'task' && statusSection !== 'ticket') && <button onClick={() => setAddStatusForm({ name: '', bgColor: '#EFF6FF', textColor: '#1D4ED8' })} className="btn-primary text-xs"><Plus size={14} /> Добавить</button>}
              </div>
              {addStatusForm && (
                <div className="card-base p-4 border-blue-200 bg-blue-50 animate-fade-in">
                  <h4 className="text-sm font-semibold mb-3">Новый статус</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                    <div><label className="form-label">Название *</label><input className="form-input" value={addStatusForm.name} onChange={e => setAddStatusForm(f => f ? { ...f, name: e.target.value } : null)} /></div>
                    <div><label className="form-label">Фон</label><div className="flex gap-2"><input type="color" className="w-10 h-10 rounded border" value={addStatusForm.bgColor} onChange={e => setAddStatusForm(f => f ? { ...f, bgColor: e.target.value } : null)} /><input className="form-input flex-1" value={addStatusForm.bgColor} onChange={e => setAddStatusForm(f => f ? { ...f, bgColor: e.target.value } : null)} /></div></div>
                    <div><label className="form-label">Цвет текста</label><div className="flex gap-2"><input type="color" className="w-10 h-10 rounded border" value={addStatusForm.textColor} onChange={e => setAddStatusForm(f => f ? { ...f, textColor: e.target.value } : null)} /><input className="form-input flex-1" value={addStatusForm.textColor} onChange={e => setAddStatusForm(f => f ? { ...f, textColor: e.target.value } : null)} /></div></div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-3">{STATUS_PRESETS.map(p => <button key={p.name} onClick={() => setAddStatusForm(f => f ? { ...f, bgColor: p.bg, textColor: p.text } : null)} className="text-xs px-2 py-1 rounded border border-brand-gray-mid" style={{ background: p.bg, color: p.text }}>{p.name}</button>)}</div>
                  {addStatusForm.name && <div className="flex items-center gap-2 mb-3"><span className="text-xs text-gray-500">Превью:</span><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: addStatusForm.bgColor, color: addStatusForm.textColor }}>{addStatusForm.name}</span></div>}
                  <div className="flex gap-2 justify-end"><button onClick={() => setAddStatusForm(null)} className="btn-secondary text-xs">Отмена</button><button onClick={addStatus} className="btn-primary text-xs"><Save size={12} /> Сохранить</button></div>
                </div>
              )}
              <div className="space-y-2">
                {statusSection !== 'task' && statusSection !== 'ticket' && getSectionStatuses(statusSection).length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Нет статусов</p>}
                {statusSection === 'ticket' ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    {TICKET_STATUSES.map(name => (
                      <div key={name} className="flex items-center gap-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: TICKET_STATUS_COLORS[name]?.bg, color: TICKET_STATUS_COLORS[name]?.text }}>{name}</span>
                        <span className="text-xs text-gray-400">системный</span>
                      </div>
                    ))}
                    <p className="text-xs text-gray-400 leading-relaxed">Статусы обращений фиксированы: «Новый запрос» — при создании в CRM, «Новый запрос с формы» — при создании с сайта, «Решаю» — промежуточный, «Решено» и «Без решения» — финальные архивные, ставятся кнопками действия. Системные статусы нельзя удалить или переименовать.</p>
                  </div>
                  <div className="card-base p-4 space-y-3">
                    <h4 className="text-sm font-semibold">Типы обращений</h4>
                    <p className="text-xs text-gray-400">Выпадающий список «Тип обращения» в Поддержке и на форме сайта.</p>
                    <div className="space-y-2">
                      {(freshStore.settings.ticketTypes || []).map((tt, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          {SYSTEM_TICKET_TYPES.includes(tt) ? (
                            <>
                              <span className="form-input text-sm bg-gray-50 text-gray-500 cursor-not-allowed flex-1">{tt}</span>
                              <span className="text-xs text-gray-400 whitespace-nowrap">системный</span>
                            </>
                          ) : (
                            <input className="form-input text-sm" value={tt} onChange={e => {
                              const next = [...(freshStore.settings.ticketTypes || [])];
                              next[idx] = e.target.value;
                              updateStore(s => ({ ...s, settings: { ...s.settings, ticketTypes: next } }));
                              forceUpdate(n => n + 1);
                            }} />
                          )}
                          {!SYSTEM_TICKET_TYPES.includes(tt) && <GuardedDelete inUse={itemInUse('ticketType', tt)} onClick={() => {
                            updateStore(s => ({ ...s, settings: { ...s.settings, ticketTypes: (s.settings.ticketTypes || []).filter((_, i) => i !== idx) } }));
                            forceUpdate(n => n + 1);
                          }} title={tt} />}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input className="form-input text-sm" placeholder="Новый тип обращения" value={newTicketType} onChange={e => setNewTicketType(e.target.value)} />
                      <button onClick={() => {
                        const v = newTicketType.trim();
                        if (!v) { toast.error('Введите название типа'); return; }
                        updateStore(s => ({ ...s, settings: { ...s.settings, ticketTypes: [...(s.settings.ticketTypes || []), v] } }));
                        setNewTicketType(''); forceUpdate(n => n + 1);
                      }} className="btn-primary text-xs"><Plus size={14} /> Добавить</button>
                    </div>
                  </div>
                </div>
              ) : statusSection === 'task' ? (
                <div className="space-y-2">
                  {TASK_STATUSES.map(name => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: TASK_STATUS_COLORS[name].bg, color: TASK_STATUS_COLORS[name].text }}>{name}</span>
                      <span className="text-xs text-gray-400">системный</span>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 leading-relaxed">Статусы задач фиксированы: «Новая» — назначается автоматически при создании любой задачи, «Решаю» — промежуточный (ставится пользователем), «Решено» и «Без решения» — финальные архивные, ставятся кнопками действия. Системные статусы нельзя удалить или переименовать.</p>
                </div>
              ) : getSectionStatuses(statusSection).map(s => (
                  <div key={s.id} className="card-base p-3">
                    {editingStatusId === s.id ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div><input className="form-input" value={editStatusForm.name} onChange={e => setEditStatusForm(f => ({ ...f, name: e.target.value }))} /></div>
                        <div className="flex gap-2"><input type="color" className="w-10 h-10 rounded border" value={editStatusForm.bgColor} onChange={e => setEditStatusForm(f => ({ ...f, bgColor: e.target.value }))} /><input className="form-input flex-1" value={editStatusForm.bgColor} onChange={e => setEditStatusForm(f => ({ ...f, bgColor: e.target.value }))} /></div>
                        <div className="flex gap-2"><input type="color" className="w-10 h-10 rounded border" value={editStatusForm.textColor} onChange={e => setEditStatusForm(f => ({ ...f, textColor: e.target.value }))} /><input className="form-input flex-1" value={editStatusForm.textColor} onChange={e => setEditStatusForm(f => ({ ...f, textColor: e.target.value }))} /></div>
                        <div className="sm:col-span-3 flex gap-2 justify-end"><button onClick={() => setEditingStatusId(null)} className="btn-secondary text-xs">Отмена</button><button onClick={saveEditStatus} className="btn-primary text-xs"><Save size={12} /></button></div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3"><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: s.bgColor, color: s.textColor }}>{s.name}</span>{isDefaultStatus(s.id) && <span className="text-xs text-gray-400">системный</span>}</div>
                        <div className="flex gap-1">{/* ТЗ 1.8: системные статусы нельзя редактировать — можно только добавлять новые */}
                          {!ALL_SYSTEM_STATUSES.includes(s.name) && <button onClick={() => { setEditingStatusId(s.id); setEditStatusForm({ name: s.name, bgColor: s.bgColor, textColor: s.textColor }); }} className="p-1.5 text-gray-400 hover:text-brand-black rounded"><Edit2 size={14} /></button>}{((statusSection !== 'supplier' && statusSection !== 'buyer') || !SYSTEM_SUPPLIER_STATUSES.includes(s.name)) && (statusSection !== 'lead' || !SYSTEM_LEAD_STATUSES.includes(s.name)) && !isDefaultStatus(s.id) && !ALL_SYSTEM_STATUSES.includes(s.name) && <GuardedDelete inUse={itemInUse('status', s.name)} onClick={() => deleteStatus(s.id)} title={s.name} />}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {statusSection === 'task' && (
                <div className="card-base p-4 space-y-3">
                  <h4 className="text-sm font-semibold">Типы задач</h4>
                  <p className="text-xs text-gray-400">Выпадающий список «Тип задачи» при создании и редактировании задачи.</p>
                  <div className="space-y-2">
                    {(freshStore.settings.taskTypes || []).map((tt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {SYSTEM_TASK_TYPES.includes(tt) ? (
                          <>
                            <span className="form-input text-sm bg-gray-50 text-gray-500 cursor-not-allowed flex-1">{tt}</span>
                            <span className="text-xs text-gray-400 whitespace-nowrap">системный</span>
                          </>
                        ) : (
                          <>
                            <input className="form-input text-sm" value={tt} onChange={e => {
                              const next = [...(freshStore.settings.taskTypes || [])];
                              next[idx] = e.target.value;
                              updateStore(s => ({ ...s, settings: { ...s.settings, taskTypes: next } }));
                              forceUpdate(n => n + 1);
                            }} />
                            <GuardedDelete inUse={itemInUse('taskType', tt)} onClick={() => {
                              updateStore(s => ({ ...s, settings: { ...s.settings, taskTypes: (s.settings.taskTypes || []).filter((_, i) => i !== idx) } }));
                              forceUpdate(n => n + 1);
                            }} title={tt} />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input className="form-input text-sm" placeholder="Новый тип задачи" value={newTaskType} onChange={e => setNewTaskType(e.target.value)} />
                    <button onClick={() => {
                      const v = newTaskType.trim();
                      if (!v) { toast.error('Введите название типа'); return; }
                      updateStore(s => ({ ...s, settings: { ...s.settings, taskTypes: [...(s.settings.taskTypes || []), v] } }));
                      setNewTaskType(''); forceUpdate(n => n + 1);
                    }} className="btn-primary text-xs"><Plus size={14} /> Добавить</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── SUPPLIER SERVICES ── */}
          {tab === 'Сервисы' && (
            <div className="space-y-4">
              <h3 className="section-title flex items-center gap-2"><Tag size={16} className="text-brand-red" /> Сервисы продаж (DBS, MARKET, MEDIA и др.)</h3>
              <div className="flex gap-2">
                <input className="form-input flex-1" placeholder="Системное название (DBS, MARKET...)" value={newServiceName} onChange={e => setNewServiceName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addService()} />
                <input className="form-input flex-1" placeholder="Публичное название (для ЛК) — необязательно" value={newServicePublic} onChange={e => setNewServicePublic(e.target.value)} />
                <button onClick={addService} className="btn-primary text-xs"><Plus size={14} /> Добавить</button>
              </div>
              <div className="space-y-2">
                {supplierServices.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Нет сервисов</p>}
                {supplierServices.map((svc: SupplierService) => (
                  <div key={svc.id} className="card-base p-3">
                    {editingServiceId === svc.id ? (
                      <div className="flex gap-2"><input className="form-input flex-1" value={editServiceName} onChange={e => setEditServiceName(e.target.value)} placeholder="Системное название" /><input className="form-input flex-1" value={editServicePublic} onChange={e => setEditServicePublic(e.target.value)} placeholder="Публичное название (для ЛК)" /><button onClick={saveEditService} className="btn-primary text-xs"><Save size={12} /></button><button onClick={() => setEditingServiceId(null)} className="btn-secondary text-xs">Отмена</button></div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded font-semibold">{svc.name}</span>{svc.publicName ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">в ЛК: {svc.publicName}</span> : null}{svc.system && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Системный</span>}
                        <div className="flex gap-1"><button onClick={() => { setEditingServiceId(svc.id); setEditServiceName(svc.name); setEditServicePublic(svc.publicName || ''); }} className="p-1.5 text-gray-400 hover:text-brand-black rounded"><Edit2 size={14} /></button>{!svc.system && <GuardedDelete inUse={itemInUse('service', svc.name)} onClick={() => deleteService(svc.id)} title={svc.name} />}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── USERS ── */}
          {tab === 'Пользователи' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between"><h3 className="section-title flex items-center gap-2"><Users size={16} className="text-brand-red" /> Пользователи</h3><button onClick={() => setShowNewUser(v => !v)} className="btn-primary text-xs"><Plus size={14} /> Добавить</button></div>
              {showNewUser && (
                <div className="card-base p-4 border-blue-200 bg-blue-50 animate-fade-in">
                  <p className="text-xs text-blue-600 bg-blue-100 rounded-lg p-2 mb-3">Создаст реальный вход в систему — сотрудник сможет войти этим email и паролем сразу после создания. Оставьте пароль пустым — сгенерируется автоматически.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                    <div><label className="form-label">Имя *</label><input required className="form-input" value={userForm.name || ''} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><label className="form-label">Email *</label><input required type="email" className="form-input" value={userForm.email || ''} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} /></div>
                  <div><label className="form-label">Комментарий к роли</label><input className="form-input" placeholder="напр. Отдел закупок" value={userForm.note || ''} onChange={e => setUserForm(f => ({ ...f, note: e.target.value }))} /></div>
                  <div><label className="form-label">Chat ID для уведомлений</label><input className="form-input" placeholder="Telegram chat_id менеджера" value={userForm.notifyChatId || ''} onChange={e => setUserForm(f => ({ ...f, notifyChatId: e.target.value }))} /></div>
                  <div><label className="form-label">Канал уведомлений</label>
                  <select className="form-input" value={userForm.notifyChannel || ''} onChange={e => setUserForm(f => ({ ...f, notifyChannel: (e.target.value || undefined) as 'telegram' | 'max' | 'email' | undefined }))}>
                    <option value="">— не получает —</option>
                    <option value="telegram">Telegram</option>
                    <option value="max">MAX</option>
                    <option value="email">Email</option>
                  </select></div>
                  <div><label className="form-label">Почта для уведомлений</label><input className="form-input" placeholder="если канал = Email" value={userForm.notifyEmail || ''} onChange={e => setUserForm(f => ({ ...f, notifyEmail: e.target.value }))} /></div>
                    <div><label className="form-label">Пароль *</label><input className="form-input" value={userForm.password || ''} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder='Сгенерировать автоматически' /></div>
                  </div>
                  <div className="mb-3">
                    <p className="form-label mb-2">Роль *</p>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="new-user-role" checked={(userForm.role || 'manager') === 'admin'} onChange={() => setUserForm(f => ({ ...f, role: 'admin' }))} className="rounded-full" /><span className="text-sm">Админ (полный доступ)</span></label>
                      <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="new-user-role" checked={(userForm.role || 'manager') === 'manager'} onChange={() => setUserForm(f => ({ ...f, role: 'manager' }))} className="rounded-full" /><span className="text-sm">Менеджер (настройка прав ниже)</span></label>
                    </div>
                  </div>
                  {(userForm.role || 'manager') === 'manager' ? (
                    <div className="mb-3"><p className="form-label mb-2">Доступ к разделам</p>{renderAccessEditor(
                      (userForm.permissions || ALL_PERMS_FALSE) as AppUser['permissions'],
                      (userForm.access || EMPTY_ACCESS) as UserAccess,
                      (k, v) => setUserForm(f => ({ ...f, permissions: { ...ALL_PERMS_FALSE, ...(f.permissions || {}), [k]: v } })),
                      (dim, value) => setUserForm(f => { const acc = { ...EMPTY_ACCESS, ...(f.access || {}) }; return { ...f, access: { ...acc, [dim]: acc[dim].includes(value) ? acc[dim].filter(x => x !== value) : [...acc[dim], value] } }; }),
                      userForm.dashboardType,
                      t => setUserForm(f => ({ ...f, dashboardType: t })),
                      userForm.planfactBase,
                      t => setUserForm(f => ({ ...f, planfactBase: t })),
                      userForm.leadsBase,
                      t => setUserForm(f => ({ ...f, leadsBase: t })),
                      userForm.allowedCities,
                      c => setUserForm(f => ({ ...f, allowedCities: (f.allowedCities || []).includes(c) ? (f.allowedCities || []).filter(x => x !== c) : [...(f.allowedCities || []), c] })),
                    )}</div>
                  ) : (
                    <p className="text-xs text-gray-500 mb-3">Администратору доступны все разделы, включая «Настройки» и «Базу данных».</p>
                  )}
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setShowNewUser(false)} disabled={savingUser} className="btn-secondary text-xs">Отмена</button>
                    <button onClick={saveUser} disabled={savingUser} className="btn-primary text-xs"><Save size={12} /> {savingUser ? 'Создание...' : 'Создать'}</button>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {freshStore.settings.users.map(u => (
                  <div key={u.id} className={`card-base p-4 ${u.status !== 'active' ? 'opacity-60' : ''}`}>
                    {editingUserId === u.id ? (
                      <div className="space-y-3 animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div><label className="form-label">Имя *</label><input className="form-input" value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                          <div><label className="form-label">Email *</label><input type="email" className="form-input" value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} /></div>
                          <div><label className="form-label">Комментарий к роли</label><input className="form-input" placeholder="напр. Отдел закупок" value={editForm.note || ''} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} /></div>
                          <div><label className="form-label">Chat ID для уведомлений</label><input className="form-input" placeholder="Telegram chat_id менеджера" value={editForm.notifyChatId || ''} onChange={e => setEditForm(f => ({ ...f, notifyChatId: e.target.value }))} /></div>
                          <div><label className="form-label">Канал уведомлений</label>
                  <select className="form-input" value={editForm.notifyChannel || ''} onChange={e => setEditForm(f => ({ ...f, notifyChannel: (e.target.value || undefined) as 'telegram' | 'max' | 'email' | undefined }))}>
                    <option value="">— не получает —</option>
                    <option value="telegram">Telegram</option>
                    <option value="max">MAX</option>
                    <option value="email">Email</option>
                  </select></div>
                  <div><label className="form-label">Почта для уведомлений</label><input className="form-input" placeholder="если канал = Email" value={editForm.notifyEmail || ''} onChange={e => setEditForm(f => ({ ...f, notifyEmail: e.target.value }))} /></div>
                          <div><label className="form-label">Новый пароль</label><input className="form-input" value={editForm.password || ''} onChange={e => setEditForm(f => ({ ...f, password: e.target.value }))} placeholder="Оставьте пустым, чтобы не менять" /></div>
                        </div>
                        <div>
                          <p className="form-label mb-2">Роль *</p>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name={`edit-role-${u.id}`} checked={(editForm.role || 'manager') === 'admin'} onChange={() => setEditForm(f => ({ ...f, role: 'admin' }))} className="rounded-full" /><span className="text-sm">Админ</span></label>
                            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name={`edit-role-${u.id}`} checked={(editForm.role || 'manager') === 'manager'} onChange={() => setEditForm(f => ({ ...f, role: 'manager' }))} className="rounded-full" /><span className="text-sm">Менеджер</span></label>
                          </div>
                        </div>
                        {(editForm.role || 'manager') === 'manager' ? (
                          <div><p className="form-label mb-2">Доступ к разделам</p>{renderAccessEditor(
                            (editForm.permissions || ALL_PERMS_FALSE) as AppUser['permissions'],
                            (editForm.access || EMPTY_ACCESS) as UserAccess,
                            (k, v) => setEditForm(f => ({ ...f, permissions: { ...ALL_PERMS_FALSE, ...(f.permissions || {}), [k]: v } })),
                            (dim, value) => setEditForm(f => { const acc = { ...EMPTY_ACCESS, ...(f.access || {}) }; return { ...f, access: { ...acc, [dim]: acc[dim].includes(value) ? acc[dim].filter(x => x !== value) : [...acc[dim], value] } }; }),
                            editForm.dashboardType,
                            t => setEditForm(f => ({ ...f, dashboardType: t })),
                            editForm.planfactBase,
                            t => setEditForm(f => ({ ...f, planfactBase: t })),
                            editForm.leadsBase,
                            t => setEditForm(f => ({ ...f, leadsBase: t })),
                            editForm.allowedCities,
                            c => setEditForm(f => ({ ...f, allowedCities: (f.allowedCities || []).includes(c) ? (f.allowedCities || []).filter(x => x !== c) : [...(f.allowedCities || []), c] })),
                          )}</div>
                        ) : (
                          <p className="text-xs text-gray-500">Администратору доступны все разделы.</p>
                        )}
                        <div className="flex gap-2 justify-end">
                          <button onClick={cancelEditUser} className="btn-secondary text-xs">Отмена</button>
                          <button onClick={() => saveEditUser(u.id)} className="btn-primary text-xs"><Save size={12} /> Сохранить</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <p className="text-sm font-semibold">{u.name}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>{u.role === 'admin' ? 'Администратор' : `Менеджер${u.note ? ` (${u.note})` : ''}`}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${u.status === 'active' ? 'bg-green-100 text-green-700' : u.status === 'blocked' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-500'}`}>{u.status === 'active' ? 'Активен' : u.status === 'blocked' ? 'Заблокирован' : 'Уволен'}</span>
                          </div>
                          <p className="text-xs text-gray-400">{u.email}</p>
                          {u.role === 'manager' && (u.allowedCities && u.allowedCities.length > 0) && (
                            <div className="flex flex-wrap gap-1 mt-2">
                              {u.allowedCities.map(city => (
                                <span key={city} className="text-xs px-1.5 py-0.5 rounded border bg-gray-50 border-gray-200 text-gray-500">{city}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => startEditUser(u)} className="p-1.5 text-gray-400 hover:text-brand-black rounded" title="Редактировать"><Edit2 size={14} /></button>
                          {u.status === 'active'
                            ? <button onClick={() => updateUserStatus(u.id, 'blocked')} className="p-1.5 text-gray-400 hover:text-amber-500 rounded" title="Заблокировать"><Ban size={14} /></button>
                            : u.status === 'blocked'
                              ? <button onClick={() => updateUserStatus(u.id, 'active')} className="p-1.5 text-amber-500 hover:text-green-500 rounded" title="Разблокировать"><CheckCircle2 size={14} /></button>
                              : null}
                          {u.status !== 'fired' && <button onClick={() => updateUserStatus(u.id, 'fired')} className="p-1.5 text-gray-400 hover:text-brand-red rounded" title="Уволить"><UserX size={14} /></button>}
                          <GuardedDelete inUse={itemInUse('user', u.id, u.name)} onClick={() => deleteUser(u.id)} title={u.name} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ── */}
          {tab === 'Уведомления' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="section-title flex items-center gap-2"><Megaphone size={16} className="text-brand-red" /> Уведомления о заявках</h3>
              </div>
              <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
                Каналы включаются здесь, а <b>токены и ключи</b> хранятся только на сервере — Supabase Dashboard →
                Edge Functions → Manage Secrets → функция <code>public-form</code>. Помимо общих чатов каждый
                менеджер может получать заявки «своих» разделов лично — настройте канал в его карточке (Настройки → Пользователи).
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {notifChannels.map(ch => (
                  <div key={ch.key} className={`card-base p-4 border-2 transition-colors ${ch.enabled ? 'border-green-300 bg-green-50/40' : 'border-transparent'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-sm">{ch.title}</p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <span className="text-xs text-gray-500">{ch.enabled ? 'Вкл' : 'Выкл'}</span>
                        <input type="checkbox" checked={ch.enabled} onChange={e => saveNotif(ch.key, { enabled: e.target.checked })} className="rounded" />
                      </label>
                    </div>
                    {ch.fields.map(f => (
                      <div key={f.label} className="mb-3">
                        <label className="form-label">{f.label}</label>
                        <input className="form-input" value={f.value} onChange={e => f.save(e.target.value)} placeholder="—" />
                      </div>
                    ))}
                    <p className="text-[10px] text-gray-400 leading-relaxed">{ch.secretHint}</p>
                  </div>
                ))}
              </div>
              <div className="card-base p-4 bg-gray-50">
                <h4 className="text-sm font-semibold mb-2">Проверка подключения</h4>
                <p className="text-xs text-gray-500">Отправьте тестовую заявку через публичную форму (Настройки → Формы → открыть форму).
                Уведомления придут во все включённые каналы в течение нескольких секунд. Если канал молчит —
                смотрите логи сервиса API в Coolify → public-form → Logs.</p>
              </div>
            </div>
          )}

          {/* ── TYPES & CITIES ── */}
          {tab === 'Типы и города' && (
            <div className="space-y-6">
              <div><h3 className="section-title flex items-center gap-2 mb-3"><Settings2 size={16} className="text-brand-red" /> Типы поставщиков</h3><div className="flex gap-2 mb-3"><input className="form-input flex-1" value={newSupplierType} onChange={e => setNewSupplierType(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSupplierType()} /><button onClick={addSupplierType} className="btn-primary text-xs"><Plus size={14} /></button></div><div className="flex flex-wrap gap-2">{(freshStore.settings.supplierTypes || []).map(t => renaming?.list === 'supplierTypes' && renaming.old === t ? (
                    <input key={t} className="form-input text-sm px-2 py-1 w-44" autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyRename()} onBlur={applyRename} />
                  ) : (
                    <span key={t} className="inline-flex items-center gap-1 bg-brand-gray border border-brand-gray-mid text-sm px-3 py-1.5 rounded-full">{t}
                      <button onClick={() => startRename('supplierTypes', t)} className="text-gray-400 hover:text-brand-black" title="Переименовать"><Edit2 size={12} /></button>
                      <ChipDelete inUse={itemInUse('supplierType', t)} onClick={() => removeSupplierType(t)} /></span>
                  ))}</div></div>
              <div><h3 className="section-title flex items-center gap-2 mb-3"><Settings2 size={16} className="text-brand-red" /> Типы покупателей</h3><div className="flex gap-2 mb-3"><input className="form-input flex-1" value={newBuyerType} onChange={e => setNewBuyerType(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBuyerType()} /><button onClick={addBuyerType} className="btn-primary text-xs"><Plus size={14} /></button></div><div className="flex flex-wrap gap-2">{(freshStore.settings.buyerTypes || []).map(t => renaming?.list === 'buyerTypes' && renaming.old === t ? (
                    <input key={t} className="form-input text-sm px-2 py-1 w-44" autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyRename()} onBlur={applyRename} />
                  ) : (
                    <span key={t} className="inline-flex items-center gap-1 bg-brand-gray border border-brand-gray-mid text-sm px-3 py-1.5 rounded-full">{t}
                      <button onClick={() => startRename('buyerTypes', t)} className="text-gray-400 hover:text-brand-black" title="Переименовать"><Edit2 size={12} /></button>
                      <ChipDelete inUse={itemInUse('buyerType', t)} onClick={() => removeBuyerType(t)} /></span>
                  ))}</div></div>
              <div><h3 className="section-title flex items-center gap-2 mb-3"><MapPin size={16} className="text-brand-red" /> Города (для поставщиков и покупателей)</h3>
                <div className="flex gap-2 mb-3"><input className="form-input flex-1" placeholder="Новый город..." value={newCityName} onChange={e => setNewCityName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCity()} /><button onClick={addCity} className="btn-primary text-xs"><Plus size={14} /></button></div>
                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">{(freshStore.settings.cities || []).map(c => renaming?.list === 'cities' && renaming.old === c ? (
                    <input key={c} className="form-input text-sm px-2 py-1 w-44" autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyRename()} onBlur={applyRename} />
                  ) : (
                    <span key={c} className="inline-flex items-center gap-1 bg-brand-gray border border-brand-gray-mid text-sm px-3 py-1.5 rounded-full">{c}
                      <button onClick={() => startRename('cities', c)} className="text-gray-400 hover:text-brand-black" title="Переименовать"><Edit2 size={12} /></button>
                      <ChipDelete inUse={itemInUse('city', c)} onClick={() => removeCity(c)} /></span>
                  ))}
                  {(freshStore.settings.cities || []).length === 0 && <p className="text-sm text-gray-400">Список пуст — добавьте города, они появятся в выпадающих списках в карточках</p>}</div>
              </div>
                          </div>
          )}

          {/* ── PRODUCT GROUPS ── */}
          {tab === 'Кнопки' && (
            <div className="max-w-2xl space-y-4">
              <div className="card-base p-4">
                <h3 className="section-title mb-1">Быстрые кнопки в шапке</h3>
                <p className="text-xs text-gray-400 mb-4">Две иконки справа вверху рядом с колокольчиком. Кнопка появляется только если ссылка заполнена; открывается в новой вкладке.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Почта — ссылка</label>
                    <input className="form-input" placeholder="https://mail.ru/..." value={(freshStore.settings.quickLinks || { mail: '', platform: '' }).mail}
                      onChange={e => updateStore(st => ({ ...st, settings: { ...st.settings, quickLinks: { ...(st.settings.quickLinks || { mail: '', platform: '' }), mail: e.target.value } } }))} />
                  </div>
                  <div>
                    <label className="form-label">Платформа — ссылка</label>
                    <input className="form-input" placeholder="https://vsemzapchasti.ru" value={(freshStore.settings.quickLinks || { mail: '', platform: '' }).platform}
                      onChange={e => updateStore(st => ({ ...st, settings: { ...st.settings, quickLinks: { ...(st.settings.quickLinks || { mail: '', platform: '' }), platform: e.target.value } } }))} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === 'Товары' && (
            <div className="space-y-4">
              <h3 className="section-title flex items-center gap-2"><Package size={16} className="text-brand-red" /> Группы товаров</h3>
              <div className="flex gap-2"><input className="form-input flex-1" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Название группы..." /><button onClick={addProductGroup} className="btn-primary text-xs"><Plus size={14} /> Добавить</button></div>
              <div className="space-y-2">
                {activeProductGroups.map(g => (
                  <div key={g.id} className="card-base p-3">
                    {editingGroupId === g.id ? (
                      <div className="flex gap-2"><input className="form-input flex-1" value={editGroupForm.name || ''} onChange={e => setEditGroupForm(f => ({ ...f, name: e.target.value }))} /><button onClick={saveEditGroup} className="btn-primary text-xs"><Save size={12} /></button><button onClick={() => setEditingGroupId(null)} className="btn-secondary text-xs">Отмена</button></div>
                    ) : (
                      <div className="flex items-center justify-between"><p className="text-sm font-medium">{g.name}</p><div className="flex gap-1"><button onClick={() => { setEditingGroupId(g.id); setEditGroupForm({ name: g.name }); }} className="p-1.5 text-gray-400 hover:text-brand-black rounded"><Edit2 size={14} /></button><GuardedDelete inUse={itemInUse('productGroup', g.id, g.name)} onClick={() => deleteProductGroup(g.id)} title={g.name} /></div></div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── SOURCES ── */}
          {tab === 'Источники' && (
            <div className="space-y-4">
              <h3 className="section-title flex items-center gap-2"><Megaphone size={16} className="text-brand-red" /> Источники привлечения</h3>
              <div>
                <h4 className="text-xs font-semibold text-gray-600 mb-2">Операторы ЭДО</h4>
                <div className="flex gap-2 mb-3"><input className="form-input flex-1" value={newEdoOp} onChange={e => setNewEdoOp(e.target.value)} onKeyDown={e => e.key === 'Enter' && addEdoOperator()} placeholder="Новый оператор ЭДО..." /><button onClick={addEdoOperator} className="btn-primary text-xs"><Plus size={14} /> Добавить</button></div>
                <div className="flex flex-wrap gap-2">
                  {(store.settings.edoOperators || []).map(o => <span key={o} className="inline-flex items-center gap-1 bg-brand-gray border border-brand-gray-mid text-sm px-3 py-1.5 rounded-full">{o}<ChipDelete inUse={false} onClick={() => removeEdoOperator(o)} /></span>)}
                  {!(store.settings.edoOperators || []).length && <p className="text-xs text-gray-400">Операторы не добавлены.</p>}
                </div>
              </div>
              <div className="flex gap-2"><input className="form-input flex-1" value={newSourceName} onChange={e => setNewSourceName(e.target.value)} placeholder="Новый источник..." /><button onClick={addSource} className="btn-primary text-xs"><Plus size={14} /> Добавить</button></div>
              <div className="space-y-2">
                {activeSources.map(src => (
                  <div key={src.id} className="card-base p-3">
                    {editingSourceId === src.id ? (
                      <div className="flex gap-2"><input className="form-input flex-1" value={editSourceForm.name || ''} onChange={e => setEditSourceForm(f => ({ ...f, name: e.target.value }))} /><button onClick={saveEditSource} className="btn-primary text-xs"><Save size={12} /></button><button onClick={() => setEditingSourceId(null)} className="btn-secondary text-xs">Отмена</button></div>
                    ) : (
                      <div className="flex items-center justify-between"><p className="text-sm font-medium">{src.name}</p><div className="flex gap-1"><button onClick={() => { setEditingSourceId(src.id); setEditSourceForm({ name: src.name }); }} className="p-1.5 text-gray-400 hover:text-brand-black rounded"><Edit2 size={14} /></button><GuardedDelete inUse={itemInUse('source', src.id, src.name)} onClick={() => deleteSource(src.id)} title={src.name} /></div></div>
                    )}
                  </div>
                ))}
              </div>

              {/* СВЯЗЬ: способы связи для выпадающих списков «Связь» (карточки поставщиков/покупателей/обращений) */}
              <div className="card-base p-4 space-y-3">
                <h4 className="text-sm font-semibold">Связь</h4>
                <p className="text-xs text-gray-400">Способы связи для выпадающих списков «Связь». Используемые в карточках способы можно только переименовать.</p>
                <div className="space-y-2">
                  {(freshStore.settings.contactPrefs || []).map((cp, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input className="form-input text-sm" value={cp} onChange={e => {
                        const next = [...(freshStore.settings.contactPrefs || [])];
                        next[idx] = e.target.value;
                        updateStore(s => ({ ...s, settings: { ...s.settings, contactPrefs: next } }));
                        forceUpdate(n => n + 1);
                      }} />
                      {SYSTEM_CONTACT_PREFS.includes(cp.toLowerCase())
                        ? <span className="text-xs text-gray-400 whitespace-nowrap">системный</span>
                        : <GuardedDelete inUse={itemInUse('contactPref', cp)} onClick={() => {
                            updateStore(s => ({ ...s, settings: { ...s.settings, contactPrefs: (s.settings.contactPrefs || []).filter((_, i) => i !== idx) } }));
                            forceUpdate(n => n + 1);
                          }} title={cp} />}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input className="form-input text-sm" placeholder="Новый способ связи" value={newContactPref} onChange={e => setNewContactPref(e.target.value)} />
                  <button onClick={() => {
                    const v = newContactPref.trim();
                    if (!v) { toast.error('Введите название'); return; }
                    updateStore(s => ({ ...s, settings: { ...s.settings, contactPrefs: [...(s.settings.contactPrefs || []), v] } }));
                    setNewContactPref(''); forceUpdate(n => n + 1);
                  }} className="btn-primary text-xs"><Plus size={14} /> Добавить</button>
                </div>
              </div>

              {/* ТЗ v1.22.30: РОЛИ КОНТАКТОВ — справочник для карточек и форм сайта «Должность контакта» */}
              <div className="card-base p-4 space-y-3">
                <h4 className="text-sm font-semibold">Роль</h4>
                <p className="text-xs text-gray-400">Роли контактов для выпадающих списков «Должность контакта» в карточках поставщиков/покупателей и в формах для сайта. Названия можно редактировать.</p>
                <div className="space-y-2">
                  {(freshStore.settings.roleTypes || []).map((rt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input className="form-input text-sm" value={rt} onChange={e => {
                        const next = [...(freshStore.settings.roleTypes || [])];
                        next[idx] = e.target.value;
                        updateStore(s => ({ ...s, settings: { ...s.settings, roleTypes: next } }));
                        forceUpdate(n => n + 1);
                      }} />
                      <GuardedDelete inUse={itemInUse('roleType', rt)} onClick={() => {
                        updateStore(s => ({ ...s, settings: { ...s.settings, roleTypes: (s.settings.roleTypes || []).filter((_, i) => i !== idx) } }));
                        forceUpdate(n => n + 1);
                      }} title={rt} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input className="form-input text-sm" placeholder="Новая роль" value={newRoleType} onChange={e => setNewRoleType(e.target.value)} />
                  <button onClick={() => {
                    const v = newRoleType.trim();
                    if (!v) { toast.error('Введите название'); return; }
                    updateStore(s => ({ ...s, settings: { ...s.settings, roleTypes: [...(s.settings.roleTypes || []), v] } }));
                    setNewRoleType(''); forceUpdate(n => n + 1);
                  }} className="btn-primary text-xs"><Plus size={14} /> Добавить</button>
                </div>
              </div>

              {/* ТЗ 1.8: КАТЕГОРИИ ПОСТАВЩИКОВ — пороги годового оборота (редактируемые) */}
              <div className="card-base p-4 space-y-3">
                <h4 className="text-sm font-semibold">Категории поставщиков</h4>
                <p className="text-xs text-gray-400">Системные категории. Категория ставится в зависимости от годового оборота компании.</p>
                <div className="space-y-2 max-w-md">
                  {(['A', 'B', 'C'] as const).map(c => (
                    <div key={c} className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                        style={c === 'A' ? { background: 'rgb(209,250,229)', color: 'rgb(6,95,70)' } : c === 'B' ? { background: 'rgb(239,246,255)', color: 'rgb(30,64,175)' } : { background: 'rgb(254,243,199)', color: 'rgb(180,83,9)' }}>{c}</span>
                      <input type="number" className="form-input" value={(freshStore.settings.supplierCategoryTurnover?.[c]) ?? { A: 50000000, B: 30000000, C: 10000000 }[c]}
                        onChange={e => {
                          const cur = freshStore.settings.supplierCategoryTurnover || { A: 50000000, B: 30000000, C: 10000000 };
                          updateStore(s => ({ ...s, settings: { ...s.settings, supplierCategoryTurnover: { ...cur, [c]: Number(e.target.value) || 0 } } }));
                          forceUpdate(n => n + 1);
                        }} />
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400">По умолчанию: A — 50 000 000, B — 30 000 000, C — 10 000 000.</p>
              </div>
              {/* ТЗ 1.8: КАТЕГОРИИ ПОКУПАТЕЛЕЙ — комментарии месячного оборота (редактируемые) */}
              <div className="card-base p-4 space-y-3">
                <h4 className="text-sm font-semibold">Категории покупателей</h4>
                <p className="text-xs text-gray-400">Системные категории. Каждая категория ставится в зависимости от оборота компании.</p>
                <div className="space-y-2 max-w-md">
                  {(['A', 'B', 'C'] as const).map(c => (
                    <div key={c} className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
                        style={c === 'A' ? { background: 'rgb(209,250,229)', color: 'rgb(6,95,70)' } : c === 'B' ? { background: 'rgb(239,246,255)', color: 'rgb(30,64,175)' } : { background: 'rgb(254,243,199)', color: 'rgb(180,83,9)' }}>{c}</span>
                      <input type="text" className="form-input" value={(freshStore.settings.buyerCategoryComment?.[c]) ?? { A: '1 500 000 и больше', B: '500 000 – 1 500 000', C: '50 000 – 500 000' }[c]}
                        onChange={e => {
                          const cur = freshStore.settings.buyerCategoryComment || { A: '1 500 000 и больше', B: '500 000 – 1 500 000', C: '50 000 – 500 000' };
                          updateStore(s => ({ ...s, settings: { ...s.settings, buyerCategoryComment: { ...cur, [c]: e.target.value } } }));
                          forceUpdate(n => n + 1);
                        }} />
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* ── TASK ENTITY TYPES ── */}
          {tab === 'Задачи' && (
            <div className="space-y-4">
              <h3 className="section-title flex items-center gap-2"><List size={16} className="text-brand-red" /> Типы сущностей задач</h3>
              <div className="card-base p-4 bg-blue-50 border-blue-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><div><label className="form-label">Ключ (латиница)</label><input className="form-input" value={newTaskEntityKey} onChange={e => setNewTaskEntityKey(e.target.value.replace(/\s/g, '_'))} placeholder="partner" /></div><div><label className="form-label">Название</label><input className="form-input" value={newTaskEntityLabel} onChange={e => setNewTaskEntityLabel(e.target.value)} placeholder="Партнёр" /></div></div>
                <div className="flex justify-end mt-3"><button onClick={addTaskEntityType} className="btn-primary text-xs"><Plus size={14} /> Добавить</button></div>
              </div>
              <div className="space-y-2">
                {taskEntityTypes.map((t: TaskEntityType) => (
                  <div key={t.id} className="card-base p-3 flex items-center justify-between">
                    <div><p className="text-sm font-medium">{t.label}</p><p className="text-xs text-gray-400 font-mono">{t.key}</p></div>
                    <GuardedDelete inUse={itemInUse('taskEntityType', t.key, t.label)} onClick={() => deleteTaskEntityType(t.id)} title={t.label} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── MEDIA SERVICE SETTINGS ── */}

        {tab === 'Медиа' && (
            <div className="space-y-4">
              <h3 className="section-title flex items-center gap-2"><Video size={16} className="text-brand-red" /> Настройки медиа сервиса</h3>
              <div className="flex flex-wrap gap-2">
                {MEDIA_SUB_TABS.map(st => <button key={st} onClick={() => setMediaSubTab(st)} className={`text-xs px-3 py-1.5 rounded-full border min-h-[36px] transition-colors ${mediaSubTab === st ? 'bg-brand-black text-white border-brand-black' : 'border-brand-gray-mid text-gray-500'}`}>{st}</button>)}
              </div>

              {/* Formats & Tariffs */}
              {mediaSubTab === 'Форматы и тарифы' && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">Каждый формат имеет цену в месяц и количество мест. Для каждого формата настраиваются доступные сроки размещения с ценами и скидками.</p>
                  <button onClick={() => { setShowAdTypeForm(v => !v); setEditingAdTypeId(null); setAdTypeForm({ name: '', spotsCount: 1, pricePerMonth: 0 }); }} className="btn-primary text-xs"><Plus size={14} /> Добавить формат</button>

                  {showAdTypeForm && !editingAdTypeId && (
                    <form onSubmit={saveAdType} className="card-base p-4 bg-blue-50 border-blue-200 animate-fade-in">
                      <h4 className="text-sm font-semibold mb-3">Новый формат размещения</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div><label className="form-label">Название *</label><input required className="form-input" value={adTypeForm.name || ''} onChange={e => setAdTypeForm(f => ({ ...f, name: e.target.value }))} placeholder="Спонсоры платформы" /></div>
                        <div><label className="form-label">Всего мест</label><input type="number" min="1" className="form-input" value={adTypeForm.spotsCount || 1} onChange={e => setAdTypeForm(f => ({ ...f, spotsCount: parseInt(e.target.value) || 1 }))} /></div>
                        <div><label className="form-label">Цена в месяц (₽)</label><input type="number" min="0" className="form-input" value={adTypeForm.pricePerMonth || 0} onChange={e => setAdTypeForm(f => ({ ...f, pricePerMonth: parseInt(e.target.value) || 0 }))} /></div>
                      </div>
                      {/* v1.30.63: описание формата */}
                      <label className="block mt-3"><span className="form-label">Описание</span><textarea className="form-input" rows={2} value={adTypeForm.description || ''} onChange={e => setAdTypeForm(f => ({ ...f, description: e.target.value }))} /></label>
                      <div className="flex gap-2 justify-end"><button type="button" onClick={() => setShowAdTypeForm(false)} className="btn-secondary text-xs">Отмена</button><button type="submit" className="btn-primary text-xs"><Save size={12} /> Сохранить</button></div>
                    </form>
                  )}

                  {mediaAdTypes.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Нет форматов</p>}

                  {mediaAdTypes.map(at => (
                    <div key={at.id} className="card-base overflow-hidden">
                      {/* Ad type header */}
                      <div className="p-4 bg-brand-gray border-b border-brand-gray-mid">
                                                {editingAdTypeId === at.id && showAdTypeForm ? (
                          <form onSubmit={saveAdType}>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                              <div><label className="form-label">Название</label><input required className="form-input" value={adTypeForm.name || ''} onChange={e => setAdTypeForm(f => ({ ...f, name: e.target.value }))} /></div>
                              <div><label className="form-label">Мест</label><input type="number" min="1" className="form-input" value={adTypeForm.spotsCount || 1} onChange={e => setAdTypeForm(f => ({ ...f, spotsCount: parseInt(e.target.value) || 1 }))} /></div>
                              <div><label className="form-label">Цена/мес. (₽)</label><input type="number" min="0" className="form-input" value={adTypeForm.pricePerMonth || 0} onChange={e => setAdTypeForm(f => ({ ...f, pricePerMonth: parseInt(e.target.value) || 0 }))} /></div>
                            </div>
                            {/* v1.30.64: описание формата в редактировании */}
                            <label className="block mt-3"><span className="form-label">Описание</span><textarea className="form-input" rows={2} value={adTypeForm.description || ''} onChange={e => setAdTypeForm(f => ({ ...f, description: e.target.value }))} /></label>
                            <div className="flex gap-2 justify-end"><button type="button" onClick={() => { setEditingAdTypeId(null); setShowAdTypeForm(false); }} className="btn-secondary text-xs">Отмена</button><button type="submit" className="btn-primary text-xs"><Save size={12} /></button></div>
                          </form>
                        ) : (
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold">{at.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">Мест: <strong>{at.spotsCount}</strong> · Цена: <strong>{at.pricePerMonth.toLocaleString('ru')} ₽/мес.</strong></p>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => setExpandedAdTypeId(expandedAdTypeId === at.id ? null : at.id)} className="p-1.5 text-gray-400 hover:text-brand-black rounded text-xs border border-brand-gray-mid px-2">{expandedAdTypeId === at.id ? 'Скрыть тарифы' : `Тарифы (${at.durationOptions.length})`}</button>
                              <button onClick={() => { setEditingAdTypeId(at.id); setAdTypeForm({ name: at.name, spotsCount: at.spotsCount, pricePerMonth: at.pricePerMonth, description: at.description || '' }); setShowAdTypeForm(true); }} className="p-1.5 text-gray-400 hover:text-brand-black rounded"><Edit2 size={14} /></button>
                              <GuardedDelete inUse={itemInUse('adType', at.id, at.name)} onClick={() => deleteAdType(at.id)} title={at.name} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Duration options */}
                      {expandedAdTypeId === at.id && (
                        <div className="p-3">
                          <table className="w-full text-xs mb-3">
                            <thead><tr className="border-b border-brand-gray-mid"><th className="text-left py-1.5 px-2 text-gray-500">Срок, мес.</th><th className="text-right py-1.5 px-2 text-gray-500">₽/мес.</th><th className="text-right py-1.5 px-2 text-gray-500">Скидка</th><th className="text-right py-1.5 px-2 text-gray-500">Итого ₽</th><th className="py-1.5 px-2 text-gray-500">Бонус</th><th className="w-8"></th></tr></thead>
                            <tbody>
                              {at.durationOptions.length === 0 && <tr><td colSpan={6} className="text-center py-3 text-gray-400">Нет тарифов. Добавьте срок размещения.</td></tr>}
                              {at.durationOptions.map(opt => (
                                <tr key={opt.id} className="border-b border-brand-gray-mid hover:bg-brand-gray">
                                  <td className="py-1.5 px-2 font-medium">{opt.periodMonths} мес.</td>
                                  <td className="py-1.5 px-2 text-right">{at.pricePerMonth.toLocaleString('ru')} ₽</td>
                                  <td className="py-1.5 px-2 text-right">{opt.discount > 0 ? <span className="text-green-600 font-medium">−{opt.discount}%</span> : '—'}</td>
                                  <td className="py-1.5 px-2 text-right font-semibold text-brand-red">{opt.totalPrice.toLocaleString('ru')} ₽</td>
                                  <td className="py-1.5 px-2 text-gray-500">{opt.bonus || '—'}</td>
                                  <td className="py-1.5 px-2">
                                    {/* v_1.9: Вкл/Выкл формата */}
                                    <button type="button" title={opt.enabled !== false ? 'Выключить формат' : 'Включить формат'}
                                      onClick={() => { updateStore(s => ({ ...s, settings: { ...s.settings, mediaAdTypes: (s.settings.mediaAdTypes || []).map(t => t.id === at.id ? { ...t, durationOptions: t.durationOptions.map(o => o.id === opt.id ? { ...o, enabled: o.enabled === false } : o) } : t) } })); forceUpdate(n => n + 1); }}
                                      className={`text-[10px] px-1.5 py-0.5 rounded-full border mr-1 ${opt.enabled !== false ? 'bg-green-100 text-green-700 border-green-300' : 'bg-gray-200 text-gray-500 border-gray-300'}`}>
                                      {opt.enabled !== false ? 'Вкл' : 'Выкл'}
                                    </button>
                                    <GuardedDelete inUse={itemInUse('durationOption', opt.id) || getStore().mediaRecords.some(r => r.durationOptionId === opt.id)} onClick={() => deleteDurationOption(at.id, opt.id)} title={opt.periodLabel} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {/* Add duration option */}
                          {addingDurationForId === at.id ? (
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 animate-fade-in">
                              {/* v1.30.48: столбец «Срок *» убран; «Срок Мес» обязателен (ввод цифрами); «Итого ₽» — авторасчёт */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                                <div><label className="form-label text-xs">Срок Мес *</label><input type="number" min="1" required className="form-input text-xs" value={newDurationForm.periodMonths || 1} onChange={e => setNewDurationForm(f => ({ ...f, periodMonths: parseInt(e.target.value) || 1 }))} /></div>
                                <div><label className="form-label text-xs">Скидка %</label><input type="number" min="0" max="100" className="form-input text-xs" value={newDurationForm.discount || 0} onChange={e => setNewDurationForm(f => ({ ...f, discount: parseInt(e.target.value) || 0 }))} /><p className="text-[10px] text-gray-400 mt-0.5">% скидки от суммы за весь срок</p></div>
                                <div><label className="form-label text-xs">Итого ₽</label><div className="form-input text-xs bg-gray-50 text-gray-800 font-semibold">{Math.max(0, Math.round((at.pricePerMonth || 0) * (newDurationForm.periodMonths || 1) * (1 - (newDurationForm.discount || 0) / 100))).toLocaleString('ru')}</div></div>
                                <div><label className="form-label text-xs">Бонус</label><input className="form-input text-xs" value={newDurationForm.bonus || ''} onChange={e => setNewDurationForm(f => ({ ...f, bonus: e.target.value }))} placeholder="2 новости" /></div>
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => setAddingDurationForId(null)} className="btn-secondary text-xs">Отмена</button>
                                <button onClick={() => addDurationOption(at.id)} className="btn-primary text-xs"><Save size={12} /> Сохранить</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setAddingDurationForId(at.id)} className="btn-secondary text-xs w-full justify-center"><Plus size={12} /> Добавить срок размещения</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Media Statuses */}
              {mediaSubTab === 'Статусы медиа' && (
                <div className="space-y-3">
                  <button onClick={() => { setShowMediaStatusForm(v => !v); setEditingMediaStatusId(null); setMediaStatusForm(emptyMediaStatus()); }} className="btn-primary text-xs"><Plus size={14} /> Добавить статус</button>
                  {showMediaStatusForm && !editingMediaStatusId && (
                    <div className="card-base p-4 bg-blue-50 border-blue-200 animate-fade-in">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                        <div><label className="form-label">Название *</label><input className="form-input" value={mediaStatusForm.name || ''} onChange={e => setMediaStatusForm(f => ({ ...f, name: e.target.value }))} /></div>
                        <div><label className="form-label">Фон</label><div className="flex gap-2"><input type="color" className="w-10 h-10 rounded border" value={mediaStatusForm.bgColor || '#ECFDF5'} onChange={e => setMediaStatusForm(f => ({ ...f, bgColor: e.target.value }))} /><input className="form-input flex-1" value={mediaStatusForm.bgColor || ''} onChange={e => setMediaStatusForm(f => ({ ...f, bgColor: e.target.value }))} /></div></div>
                        <div><label className="form-label">Цвет текста</label><div className="flex gap-2"><input type="color" className="w-10 h-10 rounded border" value={mediaStatusForm.textColor || '#065F46'} onChange={e => setMediaStatusForm(f => ({ ...f, textColor: e.target.value }))} /><input className="form-input flex-1" value={mediaStatusForm.textColor || ''} onChange={e => setMediaStatusForm(f => ({ ...f, textColor: e.target.value }))} /></div></div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mb-3">{STATUS_PRESETS.map(p => <button key={p.name} onClick={() => setMediaStatusForm(f => ({ ...f, bgColor: p.bg, textColor: p.text }))} className="text-xs px-2 py-1 rounded border border-brand-gray-mid" style={{ background: p.bg, color: p.text }}>{p.name}</button>)}</div>
                      {mediaStatusForm.name && <div className="flex items-center gap-2 mb-3"><span className="text-xs text-gray-500">Превью:</span><span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: mediaStatusForm.bgColor, color: mediaStatusForm.textColor }}>{mediaStatusForm.name}</span></div>}
                      <div className="flex gap-2 justify-end"><button onClick={() => setShowMediaStatusForm(false)} className="btn-secondary text-xs">Отмена</button><button onClick={saveMediaStatus} className="btn-primary text-xs"><Save size={12} /> Сохранить</button></div>
                    </div>
                  )}
                  {mediaStatuses.length === 0 && <p className="text-center text-gray-400 py-6 text-sm">Нет статусов</p>}
                  {mediaStatuses.map(ms => (
                    <div key={ms.id} className="card-base p-3">
                      {editingMediaStatusId === ms.id && showMediaStatusForm ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div><input className="form-input" value={mediaStatusForm.name || ''} onChange={e => setMediaStatusForm(f => ({ ...f, name: e.target.value }))} /></div>
                          <div className="flex gap-2"><input type="color" className="w-10 h-10 rounded border" value={mediaStatusForm.bgColor || ''} onChange={e => setMediaStatusForm(f => ({ ...f, bgColor: e.target.value }))} /><input className="form-input flex-1" value={mediaStatusForm.bgColor || ''} onChange={e => setMediaStatusForm(f => ({ ...f, bgColor: e.target.value }))} /></div>
                          <div className="flex gap-2"><input type="color" className="w-10 h-10 rounded border" value={mediaStatusForm.textColor || ''} onChange={e => setMediaStatusForm(f => ({ ...f, textColor: e.target.value }))} /><input className="form-input flex-1" value={mediaStatusForm.textColor || ''} onChange={e => setMediaStatusForm(f => ({ ...f, textColor: e.target.value }))} /></div>
                          <div className="sm:col-span-3 flex gap-2 justify-end"><button onClick={() => { setEditingMediaStatusId(null); setShowMediaStatusForm(false); }} className="btn-secondary text-xs">Отмена</button><button onClick={saveMediaStatus} className="btn-primary text-xs"><Save size={12} /></button></div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          {/* v1.30.49: под чипом — описание (для статусов с автоматическим действием) */}
                          <div className="flex-1 min-w-0">
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: ms.bgColor, color: ms.textColor }}>{ms.name}</span>
                            {ms.description ? <p className="text-[10px] text-gray-400 mt-1.5 leading-snug">{ms.description}</p> : null}
                          </div>
                          <div className="flex gap-1">{/* v_1.9: системные статусы — без редактирования/удаления */}
                            {MEDIA_SYSTEM_STATUSES.includes(ms.name) ? <span className="text-[10px] text-gray-400 px-1" title="Системный статус">системный</span> : (<><button onClick={() => { setEditingMediaStatusId(ms.id); setMediaStatusForm({ ...ms }); setShowMediaStatusForm(true); }} className="p-1.5 text-gray-400 hover:text-brand-black rounded"><Edit2 size={14} /></button><GuardedDelete inUse={itemInUse('mediaStatus', ms.name)} onClick={() => deleteMediaStatus(ms.id)} title={ms.name} /></>)}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

                    {tab === 'API' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className="section-title mb-1">API Checko (скоринг поставщиков)</h3>
                <p className="text-xs text-gray-400 mb-3">Ключ берётся на checko.ru → «Интеграция и API». Ключ отключён — данные скоринга в карточке поставщика вводятся вручную.</p>
                {apiEditing ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="form-input flex-1 min-w-[200px]" type="text" placeholder="API-ключ (checko)" value={apiKeyDraft} onChange={e => setApiKeyDraft(e.target.value)} />
                    <button className="btn-primary text-xs" onClick={() => { updateStore(s => ({ ...s, settings: { ...s.settings, checkoApiKey: apiKeyDraft.trim(), checkoApiEnabled: true } })); forceUpdate(n => n + 1); setApiEditing(false); toast.success('API-ключ сохранён и включён'); }}>Сохранить</button>
                    <button className="btn-secondary text-xs" onClick={() => setApiEditing(false)}>Отмена</button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <input className="form-input flex-1 min-w-[200px]" type="text" readOnly value={checkoEnabled ? '••••••••' + (checkoSettings.checkoApiKey || '').slice(-4) : '(не задан)'} />
                    <button className="btn-secondary text-xs" onClick={() => { setApiKeyDraft(checkoSettings.checkoApiKey || ''); setApiEditing(true); }}>Редактировать</button>
                    {checkoEnabled
                      ? <button className="btn-secondary text-xs" onClick={() => { updateStore(s => ({ ...s, settings: { ...s.settings, checkoApiEnabled: false } })); forceUpdate(n => n + 1); toast('API Checko отключён — ручной ввод скоринга'); }}>Отключить</button>
                      : <button className="btn-primary text-xs" disabled={!(checkoSettings.checkoApiKey || '').trim()} onClick={() => { updateStore(s => ({ ...s, settings: { ...s.settings, checkoApiEnabled: true } })); forceUpdate(n => n + 1); toast.success('API Checko включён — автоматический скоринг по ИНН'); }}>Включить</button>}
                  </div>
                )}
                <p className="text-[11px] mt-2">
                  Статус: {checkoEnabled
                    ? <span className="text-green-600 font-medium">включён — автоматический скоринг по ИНН (раздел «Поставщики»)</span>
                    : <span className="text-gray-400">отключён — ручной ввод данных скоринга</span>}
                </p>
              </div>
            </div>
          )}

{tab === 'ЛК Поставщик' && (
            <div className="space-y-4">
              <div className="flex gap-2 flex-wrap">
                {[['manager', 'Оператор'], ['dashboard', 'Дашборд ЛК'], ['banner', 'Банеры'], ['news', 'Новости'], ['greeting', 'Приветствия'], ['links', 'Ссылки офер'], ['titul', 'Титул']].map(([k, l]) => (
                  <button key={k} onClick={() => setLkTab(k as typeof lkTab)} className={`btn-secondary text-xs ${lkTab === k ? '!border-red-600 !text-red-600' : ''}`}>{l}</button>
                ))}
              </div>


                {lkTab === 'manager' && (
            <div className="card-base p-5 space-y-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Персональный менеджер</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input className="form-input" placeholder="ФИО *" value={opName} onChange={e => setOpName(e.target.value)} />
                <input className="form-input" placeholder="Телефон" value={opPhone} onChange={e => setOpPhone(e.target.value)} />
                <input className="form-input" placeholder="Email" value={opEmail} onChange={e => setOpEmail(e.target.value)} />
                <input className="form-input" placeholder="MAX — ссылка на аккаунт (https://...)" value={opMaxLink} onChange={e => setOpMaxLink(e.target.value)} />
                <label className="form-input flex items-center gap-2 cursor-pointer text-xs text-gray-500">
                  {opAvatarBusy ? 'Загрузка…' : 'Аватар: загрузить изображение'}
                  <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadOperatorAvatar(f); e.target.value = ''; }} />
                </label>
                <select className="form-input" value={opUserId} onChange={e => setOpUserId(e.target.value)}>
                  <option value="">Роль * (выберите пользователя)</option>
                  {(store.settings.users || []).map(u => <option key={u.id} value={u.id}>{u.name}{u.role === 'admin' ? ' · Администратор' : ' · Менеджер'}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                {opAvatar.trim() && <img src={opAvatar.trim()} alt="" className="w-10 h-10 rounded-full object-cover border border-gray-200" onError={e => (e.currentTarget.style.display = 'none')} />}
                {editingOpId && <button type="button" onClick={() => { setEditingOpId(null); setOpName(''); setOpPhone(''); setOpEmail(''); setOpAvatar(''); setOpUserId(''); setOpMaxLink(''); }} className="btn-secondary text-xs">Отмена</button>}
                  <button onClick={addOperator} className="btn-primary text-xs">{editingOpId ? 'Сохранить изменения' : 'Создать оператора'}</button>
              </div>
              <div className="space-y-2">
                {(store.settings.lkOperators || []).map(op => {
                  const linked = (store.settings.users || []).find(u => u.id === op.userId);
                  return (
                    <div key={op.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2.5 flex-wrap">
                      {op.avatar ? <img src={op.avatar} alt="" className="w-9 h-9 rounded-full object-cover border border-gray-200" onError={e => (e.currentTarget.style.display = 'none')} /> : <span className="w-9 h-9 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold">{(op.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')}</span>}
                      <span className="text-sm font-medium text-gray-800">{op.name}</span>
                      <span className="text-xs text-gray-500">{op.phone || '—'}</span>
                      {op.email && <span className="text-xs text-gray-500">{op.email}</span>}
                      <span className="text-xs text-gray-400">Роль: {linked?.name || '—'}</span>
                      {/* v1.30.92: редактирование и удаление с подтверждением */}
                      <button onClick={() => { setEditingOpId(op.id); setOpName(op.name); setOpPhone(op.phone); setOpEmail(op.email || ''); setOpAvatar(op.avatar || ''); setOpUserId(op.userId); setOpMaxLink(op.maxLink || ''); }} className="text-xs text-gray-500 hover:text-gray-800">Редактировать</button>
                      <GuardedDelete inUse={false} onClick={() => removeOperator(op.id)} />
                    </div>
                  );
                })}
                {!(store.settings.lkOperators || []).length && <p className="text-xs text-gray-400">Операторы не созданы.</p>}
              </div>
            </div>
            )}
          {lkTab === 'dashboard' && (
                <div className="card-base p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Счётчики дашборда</h3>
                  <p className="text-[11px] text-gray-400">«Из базы» — значение считается автоматически из данных CRM. Города считаются из базы всегда.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {([
                      ['buyers', 'Магазинов и СТО', true],
                      ['requests', 'Запросов в день', false],
                      ['warehouses', 'Складов', true],
                      ['sku', 'SKU на платформе', true],
                    ] as const).map(([key, label, hasDb]) => {
                      const ld = freshStore.settings.lkDashboard;
                      const mode = key === 'buyers' ? ld?.buyersMode : key === 'warehouses' ? ld?.warehousesMode : key === 'sku' ? ld?.skuMode : 'manual';
                      const val = key === 'buyers' ? ld?.buyersCount : key === 'warehouses' ? ld?.warehousesCount : key === 'sku' ? ld?.skuCount : ld?.requestsPerDay;
                      const patch = (p: Record<string, unknown>) => { updateStore(s => ({ ...s, settings: { ...s.settings, lkDashboard: { buyersMode: 'manual', buyersCount: 500, warehousesMode: 'db', warehousesCount: 500, skuMode: 'manual', skuCount: 350000, requestsPerDay: 1000, ...s.settings.lkDashboard, ...p } } })); forceUpdate(n => n + 1); };
                      return (
                        <div key={key} className="border border-gray-200 rounded-xl p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-semibold text-gray-600">{label}</label>
                            {hasDb && (
                              <span className="flex gap-1">
                                <button onClick={() => patch({ [key + 'Mode']: 'manual' })} className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${mode !== 'db' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Вручную</button>
                                <button onClick={() => patch({ [key + 'Mode']: 'db' })} className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${mode === 'db' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>Из базы</button>
                              </span>
                            )}
                          </div>
                          <input className="form-input text-xs" inputMode="numeric" disabled={mode === 'db'} value={val ?? 0}
                            onChange={e => patch({ [key === 'buyers' ? 'buyersCount' : key === 'warehouses' ? 'warehousesCount' : key === 'sku' ? 'skuCount' : 'requestsPerDay']: Math.max(0, parseInt(e.target.value.replace(/\D/g, '')) || 0) })} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

          {lkTab === 'banner' && (
                <div className="card-base p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Баннер дашборда</h3>
                  <p className="text-[11px] text-gray-400">Рекомендуемый размер баннера: <b>1200 × 800 px</b> (3:2).</p>
                  <div className="flex gap-2 flex-wrap">
                    <label className="btn-secondary text-xs cursor-pointer">
                      Загрузить баннер
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLkBanner(f); e.target.value = ''; }} />
                    </label>
                    {freshStore.settings.lkBanner?.image && <button onClick={() => { updateStore(s => ({ ...s, settings: { ...s.settings, lkBanner: { image: '', link: '' } } })); forceUpdate(n => n + 1); }} className="btn-secondary text-xs !text-red-600">Удалить баннер</button>}
                  </div>
                  {freshStore.settings.lkBanner?.image && <img src={freshStore.settings.lkBanner.image} alt="Баннер" className="max-h-40 rounded-xl border border-gray-200 object-cover" />}
                  <input className="form-input text-xs" placeholder="Ссылка при клике на баннер (https://...)" value={freshStore.settings.lkBanner?.link || ''} onChange={e => { updateStore(s => ({ ...s, settings: { ...s.settings, lkBanner: { image: s.settings.lkBanner?.image || '', link: e.target.value } } })); forceUpdate(n => n + 1); }} />
                </div>
              )}

              {lkTab === 'news' && (
                <div className="card-base p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-800 mb-1">Новости платформы</h3>
                  <div className="space-y-2">
                    <input className="form-input text-xs" placeholder="Заголовок новости" value={lkNewsTitle} onChange={e => setLkNewsTitle(e.target.value)} />
                    <input className="form-input text-xs" placeholder="Тег (по умолчанию «Новая функция»)" value={lkNewsTag} onChange={e => setLkNewsTag(e.target.value)} />
                    <input className="form-input text-xs" placeholder="Ссылка (при клике на новость, https://...)" value={lkNewsLink} onChange={e => setLkNewsLink(e.target.value)} />
                    <textarea className="form-input text-xs min-h-[60px]" placeholder="Короткий текст" value={lkNewsText} onChange={e => setLkNewsText(e.target.value)} />
                      <textarea className="form-input text-xs min-h-[100px]" placeholder="Полный текст (можно HTML)" value={lkNewsFull} onChange={e => setLkNewsFull(e.target.value)} />
                    {editingNews && editingNews.list === 'p' && <button type="button" onClick={() => { setEditingNews(null); clearNewsForm(); }} className="btn-secondary text-xs">Отмена</button>}
                        <button onClick={addLkNews} className="btn-primary text-xs">{editingNews && editingNews.list === 'p' ? 'Сохранить изменения' : 'Создать новость'}</button>
                  </div>
                  <div className="space-y-2">
                    {(freshStore.settings.lkNews || []).map(item => (
                      <div key={item.id} className="border border-gray-200 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {/* v1.30.92: публикация/правка/удаление-модалка */}
                          <span className="text-sm font-semibold text-gray-800 flex-1">{item.title}</span>
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{item.published ? 'опубликована' : 'черновик'}</span>
                          <span className="text-[11px] text-gray-400">{item.date}</span>
                          <button onClick={() => toggleNewsPublished('p', item.id)} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.published ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>{item.published ? 'Снять' : 'Опубликовать'}</button>
                          <button onClick={() => openNewsEdit(item, 'p')} className="text-xs text-gray-500 hover:text-gray-800">Редактировать</button>
                          <GuardedDelete inUse={false} onClick={() => removeLkNews(item.id)} />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{item.text}</p>
                      </div>
                    ))}
                    {!(freshStore.settings.lkNews || []).length && <p className="text-xs text-gray-400">Новости не созданы.</p>}
                  </div>

                  <div className="border-t border-gray-100 pt-4 space-y-2">
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Новости рынка</h3>
                    <div className="space-y-2">
                      <input className="form-input text-xs" placeholder="Заголовок" value={lkNewsTitle} onChange={e => setLkNewsTitle(e.target.value)} />
                      <input className="form-input text-xs" placeholder="Тег (по умолчанию «Новая функция»)" value={lkNewsTag} onChange={e => setLkNewsTag(e.target.value)} />
                      <input className="form-input text-xs" placeholder="Ссылка (при клике, https://...)" value={lkNewsLink} onChange={e => setLkNewsLink(e.target.value)} />
                      <textarea className="form-input text-xs min-h-[60px]" placeholder="Короткий текст (3 строки в ЛК)" value={lkNewsText} onChange={e => setLkNewsText(e.target.value)} />
                      <textarea className="form-input text-xs min-h-[100px]" placeholder="Полный текст (можно HTML)" value={lkNewsFull} onChange={e => setLkNewsFull(e.target.value)} />
                      {editingNews && editingNews.list === 'v' && <button type="button" onClick={() => { setEditingNews(null); clearNewsForm(); }} className="btn-secondary text-xs">Отмена</button>}
                        <button onClick={addLkVendorNews} className="btn-primary text-xs">{editingNews && editingNews.list === 'v' ? 'Сохранить изменения' : 'Создать новость'}</button>
                    </div>
                    <div className="space-y-2">
                      {(freshStore.settings.lkVendorNews || []).map(item => (
                        <div key={item.id} className="border border-gray-200 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {/* v1.30.92: публикация/правка/удаление-модалка */}
                            <span className="text-sm font-semibold text-gray-800 flex-1">{item.title}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${item.published ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>{item.published ? 'опубликована' : 'черновик'}</span>
                            <span className="text-[11px] text-gray-400">{item.date}</span>
                            <button onClick={() => toggleNewsPublished('v', item.id)} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${item.published ? 'bg-gray-100 text-gray-500 hover:bg-gray-200' : 'bg-green-600 text-white hover:bg-green-700'}`}>{item.published ? 'Снять' : 'Опубликовать'}</button>
                            <button onClick={() => openNewsEdit(item, 'v')} className="text-xs text-gray-500 hover:text-gray-800">Редактировать</button>
                          <GuardedDelete inUse={false} onClick={() => removeLkVendorNews(item.id)} />
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{item.text}</p>
                        </div>
                      ))}
                      {!(freshStore.settings.lkVendorNews || []).length && <p className="text-xs text-gray-400">Записи не созданы.</p>}
                    </div>
                  </div>
                </div>
              )}

              {lkTab === 'greeting' && (
              <div className="card-base p-4 space-y-3">
                <h3 className="section-title">Поставщик</h3>
                <p className="text-xs text-gray-400">Текст для кнопки «Копировать приветствие» в карточке поставщика (Анкета → ЛК поставщика). Плейсхолдеры: {'{tradeName}'} — название, {'{link}'} — ссылка, {'{pin}'} — PIN-код.</p>
                <textarea className="form-input min-h-[160px]" value={freshStore.settings.greetings?.supplier || ''} onChange={e => { updateStore(s => ({ ...s, settings: { ...s.settings, greetings: { ...s.settings.greetings, supplier: e.target.value } } })); forceUpdate(n => n + 1); }} />
                <button onClick={() => { updateStore(s => ({ ...s, settings: { ...s.settings, greetings: { ...s.settings.greetings, supplier: DEFAULT_SUPPLIER_GREETING } } })); forceUpdate(n => n + 1); toast.success('Возвращён текст по умолчанию'); }} className="btn-secondary text-xs">Сбросить по умолчанию</button>
              </div>
              )}
              {lkTab === 'links' && (
                <div className="card-base p-4 space-y-3">
                  <div>
                    <h3 className="section-title">Ссылки офер</h3>
                    <p className="text-xs text-gray-400">Ссылки для кнопок «Маркет Подробнее», «Продвижение Подробнее» и «Подробнее про форматы» в ЛК поставщика.</p>
                  </div>
                  {([['crossdock', 'Маркет Подробнее'], ['promo', 'Продвижение Подробнее'], ['formats', 'Подробнее про форматы']] as const).map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="form-label">{label}</span>
                      <input className="form-input" value={freshStore.settings.lkLinks?.[k] || ''} onChange={e => updateStore(s => ({ ...s, settings: { ...s.settings, lkLinks: { crossdock: '', promo: '', formats: '', ...s.settings.lkLinks, [k]: e.target.value } } }))} placeholder="https://" />
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ ДОГОВОРА И ОФЕРТЫ (v1.30.55) ═══ */}
          {tab === 'Договора и оферты' && (
            <div className="card-base">
              {/* v1.30.56: кнопки как в других разделах (стиль ЛК Поставщик) */}
              <div className="flex flex-wrap gap-2 px-4 pt-4">
                {([['offer', 'Договор оферты']] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setDocTab(k)}
                    className={`btn-secondary text-xs ${docTab === k ? '!border-red-600 !text-red-600' : ''}`}>{l}</button>
                ))}
              </div>
              <div className="p-4 space-y-4">
                {docTab === 'offer' && (
                  <div className="space-y-4">
                    <div className="card-base p-4 space-y-3">
                      <h3 className="section-title">{editingOcId ? 'Редактирование договора' : 'Новый договор оферты'}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="block"><span className="form-label">Название договора *</span><input className="form-input" value={ocName} onChange={e => setOcName(e.target.value)} /></label>
                        <label className="block"><span className="form-label">Редакция *</span><input className="form-input" value={ocEdition} onChange={e => setOcEdition(e.target.value)} placeholder="напр. 1.0" /></label>
                        <label className="block"><span className="form-label">Дата публикации *</span><input type="date" className="form-input" value={ocPublishedAt} onChange={e => setOcPublishedAt(e.target.value)} /></label>
                        <label className="block"><span className="form-label">Дата вступления в силу *</span><input type="date" className="form-input" value={ocEffectiveAt} onChange={e => setOcEffectiveAt(e.target.value)} /></label>
                      </div>
                      <label className="block"><span className="form-label">Текст договора *</span><textarea className="form-input" rows={8} value={ocText} onChange={e => setOcText(e.target.value)} /></label>
                      <div className="flex gap-2">
                        <button type="button" onClick={saveOfferContract} className="btn-primary text-xs">{editingOcId ? 'Сохранить изменения' : 'Создать договор'}</button>
                        {editingOcId && <button type="button" onClick={() => { setEditingOcId(null); setOcName(''); setOcEdition(''); setOcPublishedAt(''); setOcEffectiveAt(''); setOcText(''); }} className="btn-secondary text-xs">Отмена</button>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(store.settings.offerContracts || []).map(c => (
                        <div key={c.id} className="card-base p-4 flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-gray-800">{c.name}</p>
                              <span className="text-[11px] text-gray-400">редакция {c.edition}</span>
                              {c.enabled ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Включён</span> : null}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Публикация: {c.publishedAt ? c.publishedAt.split('-').reverse().join('.') : '—'} · В силе с: {c.effectiveAt ? c.effectiveAt.split('-').reverse().join('.') : '—'}</p>
                            <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap line-clamp-2">{c.text}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {!c.enabled && <button type="button" onClick={() => enableOfferContract(c.id)} className="text-xs font-semibold px-2.5 py-1 rounded-md bg-green-50 text-green-700 transition-colors">Сделать включённым</button>}
                            <button type="button" onClick={() => { setEditingOcId(c.id); setOcName(c.name); setOcEdition(c.edition); setOcPublishedAt(c.publishedAt); setOcEffectiveAt(c.effectiveAt); setOcText(c.text); }} className="text-xs font-semibold px-2.5 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Редактировать</button>
                            <GuardedDelete inUse={false} onClick={() => deleteOfferContract(c.id)} />
                          </div>
                        </div>
                      ))}
                      {!(store.settings.offerContracts || []).length && <p className="text-xs text-gray-400 text-center py-6">Договоры не созданы.</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* v1.30.103: ТИТУЛ ДЛЯ КАБИНЕТА */}
          {lkTab === 'titul' && (
            <div className="card-base p-4 space-y-3">
              <h3 className="section-title">Титул для кабинета</h3>
              <p className="text-xs text-gray-400">Заголовок, который поставщик видит в верхней части своего кабинета (ЛК → Кабинет).</p>
              <textarea className="form-input" rows={2} value={freshStore.settings.cabinetTitle || ''} onChange={e => updateStore(s => ({ ...s, settings: { ...s.settings, cabinetTitle: e.target.value } }))} placeholder="Например: Личный кабинет поставщика Автозапчасти" />
            </div>
          )}

          {tab === 'Формы' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <h3 className="section-title flex items-center gap-2"><FileEdit size={16} className="text-brand-red" /> Формы для сайта</h3>
              </div>
              <p className="text-xs text-gray-400 -mt-2">
                Выберите поля анкеты и получите код для вставки на внешний сайт — заявки с формы автоматически попадают в CRM со статусом «Новый с сайта».
              </p>

              <div className="flex gap-2 border-b border-brand-gray-mid overflow-x-auto">
                {FORMS_SUB_TABS.map(t => (
                  <button key={t.key} onClick={() => setFormsSubTab(t.key)} className={`tab-button flex-shrink-0 ${formsSubTab === t.key ? 'tab-active' : 'tab-inactive'}`}>{t.label}</button>
                ))}
              </div>

              {(() => {
                const config = freshStore.settings.forms[formsSubTab];
                const fieldDefs = FORM_FIELD_DEFINITIONS[formsSubTab] || []; // защита от undefined
                const coreDefs = fieldDefs.filter(d => d.core);
                const optionalDefs = fieldDefs.filter(d => !d.core);
                const includedKeys = new Set(config.fields.map(f => f.key));
                const requiredKeys = new Set(config.fields.filter(f => f.required).map(f => f.key));
                const embedCode = `<script src="${window.location.origin}/embed.js" data-vz-form="${formsSubTab}" data-vz-base="${window.location.origin}"></script>`;
                const previewUrl = `${window.location.origin}/forms/${formsSubTab}`;

                return (
                  <div className="space-y-4">
                    <div className="card-base p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-brand-black">Форма {config.enabled ? 'включена' : 'отключена'}</p>
                        <p className="text-xs text-gray-400">Отключённая форма показывает посетителю сообщение о недоступности вместо полей</p>
                      </div>
                      <button onClick={() => updateFormConfig(formsSubTab, { enabled: !config.enabled })} className={`p-1.5 rounded ${config.enabled ? 'text-green-500 hover:text-gray-400' : 'text-gray-300 hover:text-green-500'}`}>
                        {config.enabled ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Заголовок формы</label>
                        <input className="form-input" value={config.title} onChange={e => updateFormConfig(formsSubTab, { title: e.target.value })} />
                      </div>
                      <div>
                        <label className="form-label">Описание (необязательно)</label>
                        <input className="form-input" value={config.description || ''} onChange={e => updateFormConfig(formsSubTab, { description: e.target.value })} />
                      </div>
                    </div>

                    <div>
                      <p className="form-label mb-2">Поля анкеты</p>
                      <div className="space-y-1.5">
                        {/* v1.33.0: фиксированная анкета marketingKit вырезана — универсальный рендер полей. */}
                  {coreDefs.map(def => (
                          <div key={def.key} className="flex items-center justify-between px-3 py-2 bg-brand-gray rounded-lg opacity-70">
                            <div className="flex items-center gap-2">
                              <input type="checkbox" checked disabled className="rounded" />
                              <span className="text-xs">{def.label}</span>
                            </div>
                            <span className="text-[10px] text-gray-400">обязательное поле формы</span>
                          </div>
                        ))}
                        {optionalDefs.map(def => {
                          const included = includedKeys.has(def.key);
                          return (
                            <div key={def.key} className="flex items-center justify-between px-3 py-2 border border-brand-gray-mid rounded-lg">
                              <label className="flex items-center gap-2 cursor-pointer flex-1">
                                <input type="checkbox" checked={included} onChange={e => toggleFormField(formsSubTab, def.key, e.target.checked)} className="rounded" />
                                <span className="text-xs">{def.label}</span>
                              </label>
                              {included && (
                                <label className="flex items-center gap-1.5 cursor-pointer flex-shrink-0">
                                  <input type="checkbox" checked={requiredKeys.has(def.key)} onChange={e => toggleFormFieldRequired(formsSubTab, def.key, e.target.checked)} className="rounded" />
                                  <span className="text-[10px] text-gray-400">обязательное</span>
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="card-base p-4 border-l-2 border-l-brand-red">
                      <p className="text-xs font-semibold text-brand-black mb-1">Согласие на обработку персональных данных</p>
                      <p className="text-[11px] text-gray-400 mb-3">Галочка обязательна и всегда показывается в форме — без неё отправка невозможна. Здесь настраиваются только текст и ссылка на документ.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="sm:col-span-2">
                          <label className="form-label">Текст согласия</label>
                          <input className="form-input" value={(config.consent || DEFAULT_FORM_CONSENT).label}
                            onChange={e => updateFormConfig(formsSubTab, { consent: { ...(config.consent || DEFAULT_FORM_CONSENT), label: e.target.value } })} />
                        </div>
                        <div>
                          <label className="form-label">Ссылка на документ</label>
                          <input className="form-input" placeholder="https://.../privacy.pdf" value={(config.consent || DEFAULT_FORM_CONSENT).documentUrl}
                            onChange={e => updateFormConfig(formsSubTab, { consent: { ...(config.consent || DEFAULT_FORM_CONSENT), documentUrl: e.target.value } })} />
                        </div>
                        <div>
                          <label className="form-label">Текст ссылки</label>
                          <input className="form-input" value={(config.consent || DEFAULT_FORM_CONSENT).documentLabel}
                            onChange={e => updateFormConfig(formsSubTab, { consent: { ...(config.consent || DEFAULT_FORM_CONSENT), documentLabel: e.target.value } })} />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="form-label">Текст после успешной отправки</label>
                        <textarea rows={2} className="form-input" value={config.successMessage} onChange={e => updateFormConfig(formsSubTab, { successMessage: e.target.value })} />
                      </div>
                      <div>
                        <label className="form-label">Текст при ошибке отправки</label>
                        <textarea rows={2} className="form-input" value={config.errorMessage} onChange={e => updateFormConfig(formsSubTab, { errorMessage: e.target.value })} />
                      </div>
                    </div>

                    <div className="card-base p-4 bg-brand-gray">
       
                                     <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-brand-black">Код для вставки на сайт</p>
                        <div className="flex gap-2">
                          <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs py-1"><ExternalLink size={12} /> Предпросмотр</a>
                          <button onClick={() => copyEmbedCode(formsSubTab)} className="btn-primary text-xs py-1"><Copy size={12} /> Скопировать</button>
                        </div>
                      </div>
                      <pre className="text-[11px] bg-white border border-brand-gray-mid rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all text-gray-500">{embedCode}</pre>
                      <p className="text-[11px] text-gray-400 mt-2">
                        Вставьте этот код в HTML любой страницы, где должна появиться форма. Изменения полей и текстов применяются сразу везде, где вставлен код — переустанавливать его не нужно.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
