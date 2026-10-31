import type {Supplier,
  Buyer,
  Task,
  Ticket,
  AppSettings,
  AppUser,
  HistoryEntry,
  FormConfig,
  FormConsentConfig,
  SyncLogEntry,
  ProductGroup,
  Source,
  PlanCity,
  PlanFactEntry,
  SupplierService,
  MediaAdType,
  MediaStatus,
  MediaRecord,
  KnowledgeCategory,
  KnowledgeItem} from '@/types';
import { useEffect, useState } from 'react';
import {DEFAULT_STATUSES, DEFAULT_LEAD_STATUSES, DEFAULT_TASK_ENTITY_TYPES, SYSTEM_TASK_TYPE, CONTACT_PREFS, DEFAULT_SUPPLIER_GREETING, DEFAULT_FORM_CONFIGS, DEFAULT_TASK_TYPES, DEFAULT_FORM_CONSENT} from '@/constants';
import { EMPTY_ACCESS } from '@/types';
import { generateId } from './utils';
import {
  pullRemoteSnapshot,
  saveSettings,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  createBuyer,
  updateBuyer,
  deleteBuyer,
  createTask,
  updateTask,
  deleteTask,
  createTicket,
  updateTicket,
  deleteTicket,
  createMediaRecord,
  updateMediaRecord,
  deleteMediaRecord,
  remoteSyncEnabled,
} from './remote';

const STORE_KEY = 'vz_crm_data';

const SYNC_LOG_KEY = 'vz_crm_sync_log';
const SYNC_ERRORS_KEY = 'vz_crm_sync_errors';
let syncLogEntries: SyncLogEntry[] = (() => { try { return JSON.parse(localStorage.getItem(SYNC_LOG_KEY) || '[]'); } catch { return []; } })();
let syncErrorEntries: SyncLogEntry[] = (() => { try { return JSON.parse(localStorage.getItem(SYNC_ERRORS_KEY) || '[]'); } catch { return []; } })();
const syncLogListeners = new Set<() => void>();

export function getSyncLog(): SyncLogEntry[] { return syncLogEntries; }
export function getSyncErrors(): SyncLogEntry[] { return syncErrorEntries; }
export function clearSyncLog(): void {
  syncLogEntries = [];
  syncErrorEntries = [];
  try { localStorage.setItem(SYNC_LOG_KEY, '[]'); localStorage.setItem(SYNC_ERRORS_KEY, '[]'); } catch { /* noop */ }
  syncLogListeners.forEach(f => f());
}
function logSync(e: Omit<SyncLogEntry, 'id' | 'ts'>): void {
  const entry: SyncLogEntry = { ...e, id: generateId(), ts: new Date().toISOString() };
  syncLogEntries.push(entry);
  if (e.status === 'error') {
    syncErrorEntries.push(entry);
    if (syncErrorEntries.length > 500) syncErrorEntries = syncErrorEntries.slice(-500);
  }
  if (syncLogEntries.length > 300) {
    const removed = syncLogEntries.slice(0, syncLogEntries.length - 200);
    for (const r of removed) if (r.status === 'error' && !syncErrorEntries.includes(r)) syncErrorEntries.push(r);
    if (syncErrorEntries.length > 500) syncErrorEntries = syncErrorEntries.slice(-500);
    syncLogEntries = syncLogEntries.slice(-200);
  }
  try { localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(syncLogEntries)); localStorage.setItem(SYNC_ERRORS_KEY, JSON.stringify(syncErrorEntries)); } catch { /* noop */ }
  syncLogListeners.forEach(f => f());
}

export interface CRMStore {
  suppliers: Supplier[];
  buyers: Buyer[];
  tasks: Task[];
  tickets: Ticket[];
  mediaRecords: MediaRecord[];
  settings: AppSettings;
}

function defaultAdmin(): AppUser {
  return {
    id: 'admin-1', name: 'Администратор', email: 'admin@vz.tech',
    password: '', // v1.34.0: хардкод-пароль удалён. Пароль живёт в БД (profiles.password_hash, bcrypt).
    role: 'admin',
    permissions: { dashboard: true, suppliers: true, buyers: true, tasks: true, support: true, leads: false, media: true, pricing: true, planfact: true, analytics: true, knowledge: true, planfactEdit: true },
    access: { ...EMPTY_ACCESS },
    note: '',
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}

const DEFAULT_PRODUCT_GROUPS: ProductGroup[] = [
  { id: 'pg-1',  name: 'Легковые иномарки',            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-2',  name: 'Грузовые иномарки',            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-3',  name: 'Китайские иномарки',           createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-4',  name: 'Легковые отечественные',       createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-5',  name: 'Грузовые отечественные',       createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-6',  name: 'Мототовары',                   createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-7',  name: 'Масла и автохимия (ГСМ)',      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-8',  name: 'Авто аксессуары',              createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-9',  name: 'Инструменты и товары СТО',     createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-10', name: 'Шины и диски',                 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-11', name: 'Автозвук',                     createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'pg-12', name: 'Аккумуляторы',                 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const DEFAULT_SOURCES: Source[] = [
  { id: 'src-1', name: 'реклама в интернете', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'src-2', name: 'email',               createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'src-3', name: 'звонок менеджера',    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'src-4', name: 'рекомендации',        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

// v1.35.2: FBS исключён из дефолтов (сервис удалён из продукта давно; дефолты
// воскрешали его в настройках при каждом пустом пуше/слиянии).
const DEFAULT_SUPPLIER_SERVICES: SupplierService[] = [
  { id: 'svc-1',  name: 'DBS',   createdAt: new Date().toISOString(), system: true },
  { id: 'svc-4',  name: 'MEDIA', createdAt: new Date().toISOString(), system: true },
];

const DEFAULT_TICKET_TYPES: string[] = ['Вопрос', 'Проблема', 'Предложение', 'Жалоба', 'Другое'];
const DEFAULT_CITIES: string[] = [];
const DEFAULT_MEDIA_AD_TYPES: MediaAdType[] = [];

const DEFAULT_MEDIA_STATUSES: MediaStatus[] = [
  { id: 'mst-1', name: 'Заявка создана',          bgColor: '#FEF3C7', textColor: '#B45309', createdAt: new Date().toISOString() },
  { id: 'mst-4', name: 'Счёт отправлен',       bgColor: '#FFF7ED', textColor: '#C2410C', createdAt: new Date().toISOString() },
  { id: 'mst-5', name: 'Опубликовано', bgColor: '#D1FAE5', textColor: '#065F46', createdAt: new Date().toISOString() },
  { id: 'mst-6', name: 'Запланировано',   bgColor: '#FCE7F3', textColor: '#9D174D', createdAt: new Date().toISOString() },
  { id: 'mst-7', name: 'Отменено',          bgColor: '#FEE2E2', textColor: '#B91C1C', createdAt: new Date().toISOString() },
  { id: 'mst-8', name: 'Завершается',   bgColor: '#F3F4F6', textColor: '#6B7280', description: 'Автоматический статус: выставляется системой при приближении даты окончания размещения.', createdAt: new Date().toISOString() },
  { id: 'mst-9', name: 'Выполнено',       bgColor: '#DCFCE7', textColor: '#15803D', createdAt: new Date().toISOString() },
];

const DEFAULT_KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [];
const DEFAULT_KNOWLEDGE_ITEMS: KnowledgeItem[] = [];

function defaultStore(): CRMStore {
  const admin = defaultAdmin();

  const defaultPlanCities: PlanCity[] = [
    { id: generateId(), name: 'Москва', createdAt: new Date().toISOString() },
    { id: generateId(), name: 'Санкт-Петербург', createdAt: new Date().toISOString() },
    { id: generateId(), name: 'Екатеринбург', createdAt: new Date().toISOString() },
  ];

  return {
    suppliers: [],
    buyers: [],
    tasks: [],
    tickets: [],
    mediaRecords: [],
    settings: {
      statuses: DEFAULT_STATUSES,
      serviceSearchLists: [],
      users: [admin],
      planFact: [],
      supplierTypes: ['Поставщик/склад', 'Производитель/бренд'],
      buyerTypes: ['магазин', 'СТО', 'организация'],
      ticketTypes: [...DEFAULT_TICKET_TYPES],
      cities: [...DEFAULT_CITIES],
      quickLinks: { mail: '', platform: '' },
      planCities: defaultPlanCities,
      productGroups: DEFAULT_PRODUCT_GROUPS,
      sources: DEFAULT_SOURCES,
      supplierServices: DEFAULT_SUPPLIER_SERVICES,
      dbLogs: [],
      taskEntityTypes: DEFAULT_TASK_ENTITY_TYPES,
      taskTypes: [...DEFAULT_TASK_TYPES],
      contactPrefs: [...CONTACT_PREFS],
      greetings: { supplier: DEFAULT_SUPPLIER_GREETING },
      mediaAdTypes: DEFAULT_MEDIA_AD_TYPES,
      mediaStatuses: DEFAULT_MEDIA_STATUSES,
      knowledgeItems: DEFAULT_KNOWLEDGE_ITEMS,
      knowledgeCategories: DEFAULT_KNOWLEDGE_CATEGORIES,
      forms: DEFAULT_FORM_CONFIGS,
    },
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === STORE_KEY && e.newValue) {
      try {
        if (e.newValue !== lastSavedJson) { lastSavedJson = e.newValue; notifyStoreChange(); }
      } catch { /* ignore */ }
    }
  });
}

let leadMigrationDone = false;

export function getStore(): CRMStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) { const s = defaultStore(); ensureSystemStatuses(s.settings); saveStore(s); return s; }
    const parsed = JSON.parse(raw) as CRMStore;

    const p = parsed as unknown as Record<string, unknown>;
    if (p['supplierLeads']) delete p['supplierLeads'];
    if (p['buyerLeads']) delete p['buyerLeads'];

    if (!parsed.mediaRecords) parsed.mediaRecords = [];

    const settings = parsed.settings;
    if (!settings.productGroups) settings.productGroups = DEFAULT_PRODUCT_GROUPS;
    if (!settings.sources) settings.sources = DEFAULT_SOURCES;
    if (!settings.dbLogs) settings.dbLogs = [];
    if (!settings.taskEntityTypes) settings.taskEntityTypes = DEFAULT_TASK_ENTITY_TYPES;
    {
      const MEDIA_RENAME: Record<string, string> = { 'Запрос МК': 'Новый заказ', 'Ожидает места (предоплата)': 'Ожидает размещения', 'Новый заказ': 'Заявка создана', 'Отправлен счет': 'Счёт отправлен', 'Отправлен счёт': 'Счёт отправлен', 'Активен на платформе': 'Опубликовано', 'Ожидает размещения': 'Запланировано', 'Аннулирован': 'Отменено', 'Заканчивается срок': 'Завершается', 'Заказ выполнен': 'Выполнено' };
      const MEDIA_REMOVE = ['Отправлен МК', 'Переговоры'];
      settings.mediaStatuses = (settings.mediaStatuses || [])
        .filter(st => !MEDIA_REMOVE.includes(st.name))
        .map(st => ({ ...st, name: MEDIA_RENAME[st.name] || st.name, description: st.name === 'Заканчивается срок' ? 'Автоматический статус: выставляется системой при приближении даты окончания размещения.' : st.description }));
    }

    if (!settings.mediaStatuses) settings.mediaStatuses = DEFAULT_MEDIA_STATUSES;
    {
      const have = new Set((settings.mediaStatuses || []).map(s => s.name));
      for (const s of DEFAULT_MEDIA_STATUSES) {
        if (!have.has(s.name)) settings.mediaStatuses = [...(settings.mediaStatuses || []), { ...s, id: `${s.id}-${Date.now().toString(36)}` }];
      }
    }
    if (!settings.knowledgeItems) settings.knowledgeItems = DEFAULT_KNOWLEDGE_ITEMS;
    if (!settings.knowledgeCategories) settings.knowledgeCategories = DEFAULT_KNOWLEDGE_CATEGORIES;

    const ps = settings as unknown as Record<string, unknown>;
    if (Array.isArray(ps.mediaRecords)) ps.mediaRecords = (ps.mediaRecords as Array<{ status?: string }>).map(r => {
      const MEDIA_RENAME: Record<string, string> = { 'Запрос МК': 'Новый заказ', 'Ожидает места (предоплата)': 'Ожидает размещения' };
      const MEDIA_REMOVE = ['Отправлен МК', 'Переговоры'];
      const mapped = MEDIA_RENAME[r.status || ''] || (MEDIA_REMOVE.includes(r.status || '') ? 'Новый заказ' : r.status);
      return mapped === r.status ? r : { ...r, status: mapped };
    });
    if (!settings.supplierServices) {
      const oldTags = ps['supplierTags'] as Array<{ id: string; name: string; createdAt: string }> | undefined;
      settings.supplierServices = (oldTags && Array.isArray(oldTags) && oldTags.length > 0) ? oldTags : DEFAULT_SUPPLIER_SERVICES;
    }
    {
      const SYS_SVC: Array<{ name: string; publicName: string }> = [
        { name: 'DBS', publicName: 'проценка' },
        { name: 'MARKET', publicName: 'маркетплейс' },
        { name: 'MEDIA', publicName: 'реклама' },
      ];
      if (!Array.isArray(settings.supplierServices)) settings.supplierServices = [];
      {
        const seen = new Set<string>();
        settings.supplierServices = (settings.supplierServices || []).filter(sv => {
          const id = String(sv.id); const nm = String(sv.name);
          const isCanonicalPair = (id === 'svc-dbs' && nm === 'DBS') || (id === 'svc-market' && nm === 'MARKET') || (id === 'svc-media' && nm === 'MEDIA');
          const isSystemName = ['DBS', 'MARKET', 'MEDIA'].includes(nm);
          const isCanonicalId = ['svc-dbs', 'svc-market', 'svc-media'].includes(id);
          if (isSystemName || isCanonicalId) return isCanonicalPair;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      }
      SYS_SVC.forEach(({ name, publicName }) => {
        const canonicalId = `svc-${name.toLowerCase()}`;
        const existing = settings.supplierServices.find(s => s.id === canonicalId) || settings.supplierServices.find(s => s.name === name);
        if (existing) {
          existing.system = true;
          if (!existing.publicName) existing.publicName = publicName;
        } else {
          settings.supplierServices.push({ id: canonicalId, name, publicName, createdAt: new Date().toISOString(), system: true });
        }
      });
    }

    if (!settings.mediaAdTypes || settings.mediaAdTypes.length === 0) {
      settings.mediaAdTypes = DEFAULT_MEDIA_AD_TYPES;
    } else {
      settings.mediaAdTypes = (Array.isArray(settings.mediaAdTypes) ? settings.mediaAdTypes : []).map(at => ({
        enabled: true,
        ...at,
        durationOptions: (at.durationOptions || []).map(o => ({ enabled: true, ...o })),
        spotsCount: at.spotsCount || 1,
        pricePerMonth: at.pricePerMonth || 0,
      }));
    }

    if (!settings.planCities || !Array.isArray(settings.planCities) || typeof (settings.planCities as unknown[])[0] === 'string') {
      const oldCities = ((settings.planCities as unknown) as string[] | undefined) || [];
      settings.planCities = oldCities.map((c: string) => ({ id: generateId(), name: c, createdAt: new Date().toISOString() }));
    }

    if (!leadMigrationDone) {
      leadMigrationDone = true;
    if (!settings.statuses.some(s => s.id === 'dup_archive' || s.name === 'Архив дублей')) {
      settings.statuses.push({ id: 'dup_archive', name: 'Архив дублей', color: '#6B7280', order: 6, entityTypes: ['supplier', 'buyer'], bgColor: '#F3F4F6', textColor: '#6B7280' });
    }

    if (!settings.statuses) settings.statuses = [];
    for (const ls of DEFAULT_LEAD_STATUSES) {
      if (!settings.statuses.some(s => s.id === ls.id || s.name === ls.name)) {
        settings.statuses.push({ ...ls, bgColor: ls.bgColor || '#F3F4F6', textColor: ls.textColor || '#374151' });
      }
    }
    const LEAD_STATUS_BY_ID: Record<string, string> = {
      lead_new: 'ЛИД', lead_mailing: 'Рассылка', lead_call: 'Обзвон',
      lead_found: 'Найден в базе', lead_unsub: 'Отписался',
      lead_dup: 'Архив дублей', lead_archive: 'АРХИВ',
    };
    for (const s of settings.statuses) {
      const canonicalName = LEAD_STATUS_BY_ID[s.id];
      const canonicalOrder = DEFAULT_LEAD_STATUSES.find(d => d.id === s.id)?.order;
      if (canonicalName && (s.name !== canonicalName || s.order !== canonicalOrder)) {
        s.name = canonicalName;
        s.order = canonicalOrder ?? s.order;
      }
    }
    if (Array.isArray(settings.leads)) {
      settings.leads = settings.leads.map(l => l.status === 'Найден в базе' ? { ...l, status: 'Архив дублей', deletedAt: l.deletedAt || new Date().toISOString() } : l);
    } else {
      settings.leads = [];
    }
    }

    const NEW_TASK_TYPES = ['Ждет активации', 'От поддержки', 'Обратная связь', 'Техподдержка', 'Документы', 'Отправить КП'];
    const NEW_TICKET_TYPES = ['Обратная связь', 'Техподдержка', 'Регистрация', 'Партнерство', 'Пожелания'];
    settings.ticketTypes = (settings.ticketTypes || []).map(t => t === 'Маркетинг-кит' ? 'Регистрация' : t);
    for (const t of NEW_TICKET_TYPES) { if (!(settings.ticketTypes || []).includes(t)) settings.ticketTypes = [...(settings.ticketTypes || []), t]; }
settings.taskTypes = Array.from(new Set([...(settings.taskTypes || []).filter((t: string) => NEW_TASK_TYPES.includes(t)), ...NEW_TASK_TYPES]));
    settings.ticketTypes = Array.from(new Set([...(settings.ticketTypes || []).filter((t: string) => NEW_TICKET_TYPES.includes(t)), ...NEW_TICKET_TYPES]));
    if (!settings.ticketTypes || !Array.isArray(settings.ticketTypes)) settings.ticketTypes = [...DEFAULT_TICKET_TYPES];
    if (!settings.cities || !Array.isArray(settings.cities)) settings.cities = [...DEFAULT_CITIES];
    if (!settings.lkDashboard) settings.lkDashboard = { buyersMode: 'manual', buyersCount: 500, warehousesMode: 'db', warehousesCount: 500, skuMode: 'manual', skuCount: 350000, requestsPerDay: 1000 };
    else {
      const ld = settings.lkDashboard as Record<string, unknown>;
      settings.lkDashboard = {
        buyersMode: (ld.countersMode === 'database' ? 'db' : (ld.buyersMode as 'manual' | 'db')) || 'manual',
        buyersCount: Number(ld.buyersCount ?? 500),
        warehousesMode: (ld.warehousesMode as 'manual' | 'db') || 'db',
        warehousesCount: Number(ld.warehousesCount ?? 500),
        skuMode: (ld.skuMode as 'manual' | 'db') || 'manual',
        skuCount: Number(ld.skuCount ?? 350000),
        requestsPerDay: Number(ld.requestsPerDay ?? 1000),
      };
    }
    if (!settings.lkBanner) settings.lkBanner = { image: '', link: '' };
    if (!Array.isArray(settings.lkNews)) settings.lkNews = [];
    if (!Array.isArray(settings.lkVendorNews)) settings.lkVendorNews = [];
    if (!settings.lkLinks) settings.lkLinks = { crossdock: '', promo: '', formats: '' };
    if (!Array.isArray(settings.lkOperators)) settings.lkOperators = [];
    if (!Array.isArray(settings.offerContracts)) settings.offerContracts = [];
    if (!Array.isArray(settings.mediaContracts)) settings.mediaContracts = [];
    if (!Array.isArray(settings.marketNews)) settings.marketNews = [];
    if (Array.isArray(settings.lkNews)) settings.lkNews = settings.lkNews.map(n2 => n2.published === undefined ? { ...n2, published: true } : n2);
    if (Array.isArray(settings.lkVendorNews)) settings.lkVendorNews = settings.lkVendorNews.map(n2 => n2.published === undefined ? { ...n2, published: true } : n2);
    if (!Array.isArray(settings.edoOperators)) settings.edoOperators = [];

    if (!settings.quickLinks || typeof settings.quickLinks !== 'object') {
      settings.quickLinks = { mail: '', platform: '' };
    }

    if (!settings.statuses.find(s => s.name === 'Лид')) {
      settings.statuses.unshift({ id: 'lead', name: 'Лид', color: '#888888', bgColor: '#F3F4F6', textColor: '#374151', entityTypes: ['supplier', 'buyer'], order: 0 });
    }
    if (!settings.statuses.find(s => s.name === 'Настройка прайса')) {
      const idx = settings.statuses.findIndex(s => s.name === 'Активный');
      const entry = { id: 'price_setup', name: 'Настройка прайса', color: '#F97316', bgColor: '#FFF7ED', textColor: '#C2410C', entityTypes: ['supplier'], order: 3.5 };
      if (idx >= 0) settings.statuses.splice(idx + 1, 0, entry);
      else settings.statuses.push(entry);
    }
    if (!settings.statuses.find(s => s.name === 'Новый с сайта')) {
      settings.statuses.push({ id: 'from_site', name: 'Новый с сайта', color: '#6D28D9', bgColor: '#F5F3FF', textColor: '#6D28D9', entityTypes: ['supplier', 'buyer'], order: settings.statuses.length });
    }
    if (!settings.forms) {
      settings.forms = DEFAULT_FORM_CONFIGS;
    }
    const NEW_SUCCESS: Record<string, string> = {
      supplier: 'Поздравляем с успешной регистрацией на платформе!\n\nВ течение 24 часов мы отправим вам на почту Приглашение и ПИН-КОД для самостоятельной настройки вашего склада в системе.\n\nЭто будет просто - не переживайте! Если что, мы всегда рядом.\n\nС уважением, команда ВсемЗапчасти.',
      buyer: 'Поздравляем с успешной регистрацией на платформе!\n\nВ течение 24 часов мы отправим вам на почту доступ в Ваш личный кабинет. Ожидайте! Если что, мы всегда рядом.\n\nС уважением, команда ВсемЗапчасти.',
      ticket: 'Благодарим за обращение!\n\nВаше сообщение уже в поддержке.\n\nОжидайте ответа! Если что, мы всегда рядом.\n\nС уважением, команда ВсемЗапчасти.',
    };
    const OLD_GENERIC = ['Спасибо! Заявка отправлена, мы свяжемся с вами в ближайшее время.', 'Заявка на Маркетинг-кит отправлена!', ''];
    (Object.keys(settings.forms) as string[]).forEach(k => {
      const cfg = settings.forms[k] as FormConfig | undefined;
      if (cfg && OLD_GENERIC.includes((cfg.successMessage || '').trim()) && NEW_SUCCESS[k]) {
        cfg.successMessage = NEW_SUCCESS[k];
      }
    });
    (Object.keys(settings.forms) as Array<'supplier' | 'buyer' | 'ticket'>).forEach(k => {
      const cfg = settings.forms[k] as FormConfig & { consent?: FormConsentConfig };
      if (!cfg.consent) cfg.consent = { ...DEFAULT_FORM_CONSENT };
    });

    settings.users = (settings.users || []).map(rawUser => {
      const u = rawUser as AppUser & { active?: boolean };
      const migrated = { ...u } as AppUser & { active?: boolean };
      delete migrated.active;
      if (!migrated.status) migrated.status = u.active === false ? 'blocked' : 'active';
      const perms = { ...(migrated.permissions || {}) } as unknown as Record<string, unknown>;
      delete perms['leads'];
      if (perms['dashboard'] === undefined) perms['dashboard'] = true;
      if (perms['knowledge'] === undefined) perms['knowledge'] = true;
      if (perms['planfactEdit'] === undefined) perms['planfactEdit'] = migrated.role === 'admin';
      if (migrated.note === undefined) migrated.note = '';
      migrated.permissions = perms as AppUser['permissions'];
      if (!migrated.access) migrated.access = { ...EMPTY_ACCESS };
      if (migrated.password === undefined) migrated.password = '';
      return migrated;
    });

    const STATUS_RENAMES: Record<string, string> = {
      from_site: 'Новый с сайта',
      in_work: 'Лид CRM', registered: 'Лид CRM',
      negotiation: 'Переговоры', commercial: 'Переговоры',
      price_setup: 'Приветствие',
      problem: 'Проблемный', inactive: 'АРХИВ',
    };
    const FUNNEL_ORDER: Record<string, number> = {
      from_site: 0, in_work: 1, negotiation: 2,
      price_setup: 3, active: 4, problem: 5, dup_archive: 6, archive: 7,
    };
    const oldNames: Record<string, string> = {
      'Зарег. с формы': 'Новый с сайта',
      'Зарег. в CRM': 'Лид CRM',
    };
    settings.statuses = (settings.statuses || []).map(s => {
      const next = { ...s };
      if (next.id === 'lead') { oldNames[next.name] = 'Зарег. в CRM'; next.id = '__remove__'; }
      if (STATUS_RENAMES[next.id]) { oldNames[next.name] = STATUS_RENAMES[next.id]; next.name = STATUS_RENAMES[next.id]; }
      if (next.id === 'active' && next.name !== 'Активный') { oldNames[next.name] = 'Активный'; next.name = 'Активный'; }
      if (next.id === 'inactive') next.id = 'archive';
      next.order = FUNNEL_ORDER[next.id] ?? (next.order ?? 99);
      return next;
    }).filter(s => s.id !== '__remove__');
    const byName = new Set<string>();
    settings.statuses = settings.statuses.filter(s => byName.has(s.name) ? false : (byName.add(s.name), true));
    if (!settings.statuses.some(s => s.id === 'archive')) {
      settings.statuses.push({ id: 'archive', name: 'АРХИВ', color: '#6B7280', order: 7, entityTypes: ['supplier', 'buyer'], bgColor: '#F3F4F6', textColor: '#6B7280' });
    }
    parsed.suppliers = (parsed.suppliers || []).map(s => oldNames[s.status] ? { ...s, status: oldNames[s.status] } : s);
    parsed.buyers = (parsed.buyers || []).map(b => oldNames[b.status] ? { ...b, status: oldNames[b.status] } : b);

    if (!Array.isArray(settings.taskTypes) || !settings.taskTypes.length) settings.taskTypes = [...DEFAULT_TASK_TYPES];
    else {
      const sysTypes = [SYSTEM_TASK_TYPE, 'От поддержки'].filter(x => !(settings.taskTypes || []).includes(x));
      if (sysTypes.length) settings.taskTypes = [...sysTypes, ...settings.taskTypes];
    }

    if (!Array.isArray(settings.contactPrefs) || !settings.contactPrefs.length) settings.contactPrefs = [...CONTACT_PREFS];
    else {
      const sysMissing = SYSTEM_CONTACT_PREFS.filter(x => !settings.contactPrefs!.some(p => p.toLowerCase() === x));
      if (sysMissing.length) settings.contactPrefs = [...sysMissing, ...settings.contactPrefs];
      if (!Array.isArray(settings.roleTypes) || !settings.roleTypes.length) settings.roleTypes = ['Директор', 'Менеджер', 'Собственник', 'РОП', 'ТП'];
    }

    if (!settings.greetings) settings.greetings = {};
    if (typeof settings.cabinetTitle !== 'string') settings.cabinetTitle = '';
    if (typeof settings.greetings.supplier !== 'string' || !settings.greetings.supplier) settings.greetings.supplier = DEFAULT_SUPPLIER_GREETING;

    settings.planFact = (settings.planFact || []).map(raw => {
      const e = raw as PlanFactEntry & { year?: number; month?: number; factSuppliers?: number; factBuyers?: number };
      if (!e.startDate && e.year && e.month) {
        e.startDate = `${e.year}-${String(e.month).padStart(2, '0')}-01`;
        e.endDate = new Date(e.year, e.month, 0).toISOString().slice(0, 10);
      }
      delete e.year; delete e.month; delete e.factSuppliers; delete e.factBuyers;
      return e;
    });
    settings.planFact = (settings.planFact || []).flatMap(raw => {
      const e = raw as PlanFactEntry & { planSuppliers?: number; planBuyers?: number; kind?: 'suppliers' | 'buyers' };
      if (e.kind) { delete e.planSuppliers; delete e.planBuyers; return [e]; }
      const out: PlanFactEntry[] = [];
      if ((e.planSuppliers || 0) > 0) out.push({ ...e, id: e.id, kind: 'suppliers', plan: e.planSuppliers! });
      if ((e.planBuyers || 0) > 0) out.push({ ...e, id: `${e.id}-b`, kind: 'buyers', plan: e.planBuyers! });
      if (!out.length) out.push({ ...e, kind: 'suppliers', plan: 0 });
      delete e.planSuppliers; delete e.planBuyers;
      return out;
    });

    (settings.knowledgeItems || []).forEach(i => { if (i.availableToManagers === undefined) i.availableToManagers = true; });

    parsed.suppliers = parsed.suppliers.map(s => {
      const a = s as unknown as Record<string, unknown>;
      let updated = { ...s };
      if (a['companyScore'] === undefined && a['priority'] !== undefined) updated = { ...updated, companyScore: Math.min(10, Number(a['priority']) * 2) };
      if (a['companyScore'] === undefined) updated = { ...updated, companyScore: 5 };
      if (!updated.services) { updated = { ...updated, services: (a['tags'] as string[] | undefined) || [] }; }
      return updated;
    });

    parsed.buyers = parsed.buyers.map(b => {
      const a = b as unknown as Record<string, unknown>;
      if (a['companyScore'] === undefined && a['priority'] !== undefined) return { ...b, companyScore: Math.min(10, Number(a['priority']) * 2) };
      if (a['companyScore'] === undefined) return { ...b, companyScore: 5 };
      return b;
    });

    parsed.tasks = parsed.tasks.map(t => {
      const a = t as unknown as Record<string, unknown>;
      const taskStatus = a['taskStatus'] ?? (t.completed ? 'Решено' : 'Новая');
      return { ...t, taskStatus: taskStatus as import('@/types').TaskStatus, priority: Number(a['priority'] ?? 3) };
    });

    parsed.tickets = parsed.tickets.map(tk => {
      const statusMap: Record<string, string> = { 'Новое': 'Новая', 'В обработке': 'Решаю', 'Ожидание ответа': 'Решаю', 'Закрыто': 'Без решения' };
      return { ...tk, status: (statusMap[tk.status] ?? tk.status) as import('@/types').TicketStatus };
    });

    settings.users = settings.users.map(u => ({ ...u, permissions: { ...u.permissions, media: true } }));

    parsed.mediaRecords = (parsed.mediaRecords || []).map(r => ({
      ...r,
      pricePerMonth: r.pricePerMonth,
      totalPrice: r.totalPrice,
      durationLabel: r.durationLabel,
      expandedNotes: r.expandedNotes || '',
    }));

    ensureSystemStatuses(parsed.settings);
    return parsed;
  } catch (e) {
    console.error('[store] ОШИБКА загрузки/миграции localStorage — данные НЕ затираются:', e);
    try {
      const raw2 = localStorage.getItem(STORE_KEY);
      if (raw2) {
        const p2 = JSON.parse(raw2) as CRMStore;
        ensureSystemStatuses(p2.settings);
        return p2;
      }
    } catch { /* совсем битый JSON — идём в дефолт ниже */ }
    return defaultStore();
  }
}

export function clearLocalStoreCache() {
  console.warn('[store] clearLocalStoreCache вызван:', new Error('trace').stack);
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null; }
  localStorage.removeItem(STORE_KEY);
  lastSavedJson = '';
}

export let lastSavedJson = '';
function saveStore(store: CRMStore, previousStore?: CRMStore) {
  const json = JSON.stringify(store);
  if (json === lastSavedJson) return;
  lastSavedJson = json;
  localStorage.setItem(STORE_KEY, json);
  notifyStoreChange();
  if (previousStore) scheduleRemoteSync(previousStore, store);
}

export function updateStore(updater: (store: CRMStore) => CRMStore) {
  const store = getStore();
  const updated = updater(store);
  saveStore(updated, store);
  return updated;
}

type StoreListener = () => void;
const storeListeners = new Set<StoreListener>();

let notifyScheduled = false;
let notifyCount = 0;
let notifyWindowStart = 0;
function notifyStoreChange() {
  if (notifyScheduled) return;
  notifyScheduled = true;
  queueMicrotask(() => {
    notifyScheduled = false;
    const now = Date.now();
    if (now - notifyWindowStart > 1000) { notifyWindowStart = now; notifyCount = 0; }
    notifyCount++;
    if (notifyCount > 50) {
      console.error('[store] Шторм уведомлений (>50/сек) — тик пропущен.');
      return;
    }
    const fns = Array.from(storeListeners);
    for (const fn of fns) fn();
  });
}

function subscribeToStoreChanges(fn: StoreListener): () => void {
  storeListeners.add(fn);
  return () => { storeListeners.delete(fn); };
}

export function useStoreVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeToStoreChanges(() => setVersion(v => v + 1)), []);
  return version;
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 250;
let lastSyncVersion = '0';

export function getLastSyncVersion(): string {
  return lastSyncVersion;
}

export function setLastSyncVersion(version: string): void {
  lastSyncVersion = version;
}

type EntityName = 'suppliers' | 'buyers' | 'tasks' | 'tickets' | 'mediaRecords';

const VOLATILE_SYNC_KEYS = new Set(['updatedAt', 'updated_at', 'history',
  'serviceAccess', 'service_access', 'companyScore', 'company_score', 'scoring']);

function stableEntityJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableEntityJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (VOLATILE_SYNC_KEYS.has(k)) continue;
      out[k] = src[k];
    }
    return JSON.stringify(out);
  }
  return JSON.stringify(value ?? null);
}

async function syncEntityDiff<T extends { id: string }>(
  entity: EntityName,
  previous: T[],
  current: T[],
): Promise<void> {
  const oldById = new Map(previous.map(x => [x.id, x]));
  const newById = new Map(current.map(x => [x.id, x]));
  const operations: Promise<unknown>[] = [];
  const opsMeta: Array<{ entity: typeof entity; op: 'create' | 'update' | 'delete'; id: string }> = [];

  for (const [id, next] of newById) {
    const prev = oldById.get(id);
    if (!prev) {
      opsMeta.push({ entity, op: 'create', id });
      switch (entity) {
        case 'suppliers': operations.push(createSupplier(next as never)); break;
        case 'buyers': operations.push(createBuyer(next as never)); break;
        case 'tasks': operations.push(createTask(next as never)); break;
        case 'tickets': operations.push(createTicket(next as never)); break;
        case 'mediaRecords': operations.push(createMediaRecord(next as never)); break;
      }
    } else if (stableEntityJson(prev) !== stableEntityJson(next)) {
      opsMeta.push({ entity, op: 'update', id });
      switch (entity) {
        case 'suppliers': operations.push(updateSupplier(next as never)); break;
        case 'buyers': operations.push(updateBuyer(next as never)); break;
        case 'tasks': operations.push(updateTask(next as never)); break;
        case 'tickets': operations.push(updateTicket(next as never)); break;
        case 'mediaRecords': operations.push(updateMediaRecord(next as never)); break;
      }
    }
  }

  for (const id of oldById.keys()) {
    if (newById.has(id)) continue;
    opsMeta.push({ entity, op: 'delete', id });
    switch (entity) {
      case 'suppliers': operations.push(deleteSupplier(id)); break;
      case 'buyers': operations.push(deleteBuyer(id)); break;
      case 'tasks': operations.push(deleteTask(id)); break;
      case 'tickets': operations.push(deleteTicket(id)); break;
      case 'mediaRecords': operations.push(deleteMediaRecord(id)); break;
    }
  }

  const results = await Promise.allSettled(operations);
  let okCount = 0;
  results.forEach((r, i) => {
    const errObj = r.status === 'fulfilled' ? (r.value as { error?: { message?: string; code?: string } | null } | null)?.error : undefined;
    const rawReason = r.status === 'rejected' ? (r as PromiseRejectedResult).reason : undefined;
    const reason = rawReason
      ? (typeof rawReason === 'object' && rawReason !== null && 'message' in rawReason
          ? [ (rawReason as { code?: string }).code, (rawReason as { message?: string }).message,
              (rawReason as { details?: string }).details ].filter(Boolean).join(': ')
          : String(rawReason))
      : undefined;
    const meta = opsMeta[i];
    if (errObj || reason) {
      logSync({ kind: 'op', entity: meta.entity, op: meta.op, itemId: meta.id, status: 'error',
        message: [errObj?.code, errObj?.message || (errObj ? JSON.stringify(errObj) : reason)].filter(Boolean).join(': ') });
    } else okCount++;
  });
  logSync({ kind: 'summary', entity, op: 'sync', status: results.some((r, i) => r.status === 'rejected' || (r.value as { error?: unknown } | null)?.error) ? 'error' : 'ok',
    message: `${entity}: ${okCount} ок / ${results.length - okCount} ошибок` });
}

async function pushRemoteDiff(previous: CRMStore, current: CRMStore): Promise<void> {
  if (!remoteSyncEnabled()) return;
  const jobs: Promise<unknown>[] = [
    syncEntityDiff('suppliers', previous.suppliers, current.suppliers),
    syncEntityDiff('buyers', previous.buyers, current.buyers),
    syncEntityDiff('tasks', previous.tasks, current.tasks),
    syncEntityDiff('tickets', previous.tickets, current.tickets),
    syncEntityDiff('mediaRecords', previous.mediaRecords, current.mediaRecords),
  ];
  if (JSON.stringify(previous.settings) !== JSON.stringify(current.settings)) {
    jobs.push(saveSettings(current.settings));
  }
  try {
    await Promise.all(jobs);
    logSync({ kind: 'system', entity: 'system', op: 'push', status: 'ok', message: 'pushRemoteDiff завершён' });
  } catch (e) {
    logSync({ kind: 'system', entity: 'system', op: 'push', status: 'error', message: String(e) });
  }
}

const CRITICAL_SUPPLIER_SYNC_KEYS = new Set([
  'status', 'serviceAccess', 'warehouseLocations', 'serviceSearch',
  'serviceSearchConditions', 'edoOperator', 'edoToken', 'priceEmail', 'multiWarehouse',
]);

function hasCriticalSyncChange(previous: CRMStore, current: CRMStore): boolean {
  if (JSON.stringify(previous.settings) !== JSON.stringify(current.settings)) return true;
  if (stableEntityJson(previous.mediaRecords) !== stableEntityJson(current.mediaRecords)) return true;
  if (previous.suppliers.length !== current.suppliers.length) return true;
  const prevById = new Map(previous.suppliers.map(s => [s.id, s]));
  for (const next of current.suppliers) {
    const prev = prevById.get(next.id);
    if (!prev) return true;
    if (stableEntityJson(prev) === stableEntityJson(next)) continue;
    for (const key of CRITICAL_SUPPLIER_SYNC_KEYS) {
      if (JSON.stringify((prev as unknown as Record<string, unknown>)[key]) !==
          JSON.stringify((next as unknown as Record<string, unknown>)[key])) return true;
    }
  }
  return false;
}

let pendingSyncPrevious: CRMStore | null = null;
let pendingSyncCurrent: CRMStore | null = null;
function scheduleRemoteSync(previous: CRMStore, current: CRMStore) {
  if (!remoteSyncEnabled()) return;
  if (!pendingSyncPrevious) pendingSyncPrevious = previous;
  pendingSyncCurrent = current;
  if (syncTimer) clearTimeout(syncTimer);
  const prev = pendingSyncPrevious;
  const next = pendingSyncCurrent;
  if (prev && next && hasCriticalSyncChange(prev, next)) {
    pendingSyncPrevious = null;
    pendingSyncCurrent = null;
    void pushRemoteDiff(prev, next);
    return;
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    const prev = pendingSyncPrevious;
    const next = pendingSyncCurrent;
    pendingSyncPrevious = null;
    pendingSyncCurrent = null;
    if (prev && next) void pushRemoteDiff(prev, next);
  }, SYNC_DEBOUNCE_MS);
}

function mergeSettings(remote: AppSettings | null | undefined, local: AppSettings | undefined, defaults: AppSettings): AppSettings {
  const base: AppSettings = local ?? defaults;
  if (!remote) return base;
  const merged: AppSettings = { ...base };
  for (const key of Object.keys(remote) as Array<keyof AppSettings>) {
    const value = remote[key];
    if (value !== undefined && value !== null) {
      (merged as unknown as Record<string, unknown>)[key] = value;
    }
  }
  ensureSystemStatuses(merged);
  return merged;
}

export async function initRemoteSync(): Promise<void> {
  if (import.meta.env.VITE_DEMO_MODE === 'true') return;
  if (!remoteSyncEnabled()) return;

  const remote = await pullRemoteSnapshot();
  if (!remote) {
    console.warn('[store] pull не удался — локальные данные сохранены, синхронизация отложена.');
    return;
  }
  setLastSyncVersion(remote.syncVersion || '0');

  let localRaw: CRMStore | null = null;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) localRaw = JSON.parse(raw) as CRMStore;
  } catch { /* ignore corrupt local cache */ }

  const email = localSessionEmail();
  const owned = Boolean(email) && Boolean(localRaw) &&
    ((localRaw!.settings.users || []).some(u => (u.email || '').toLowerCase() === email));

  const serverHasEntities =
    remote.suppliers.length || remote.buyers.length || remote.tasks.length ||
    remote.tickets.length || remote.mediaRecords.length;
  const serverHasUsers = Boolean(remote.settings && (remote.settings.users || []).length);
  const localHasEntities = Boolean(localRaw && (localRaw.suppliers.length || localRaw.buyers.length ||
    localRaw.tasks.length || localRaw.tickets.length || localRaw.mediaRecords.length));

  if (!serverHasEntities && !serverHasUsers) {
    if (localRaw && localHasEntities) {
      if (owned) {
        clearLocalStoreCache();
        const emptyPrev: CRMStore = { ...localRaw, suppliers: [], buyers: [], tasks: [], tickets: [], mediaRecords: [] };
        saveStore(localRaw, emptyPrev);
        console.warn('[store] Сервер пуст: локальные данные приняты за истину и выгружаются на сервер.');
      } else {
        console.warn('[store] Сервер пуст; локальные данные сохранены без выгрузки (владелец не подтверждён).');
      }
    }
    return;
  }

  clearLocalStoreCache();
  const pick = <T extends { id: string }>(remoteList: T[], localList: T[] | undefined): T[] => {
    if (!owned) return remoteList;
    if (remoteList.length) return remoteList;
    return (localList && localList.length) ? localList : remoteList;
  };
  const merged: CRMStore = {
    suppliers: pick(remote.suppliers, localRaw?.suppliers),
    buyers: pick(remote.buyers, localRaw?.buyers),
    tasks: pick(remote.tasks, localRaw?.tasks),
    tickets: pick(remote.tickets, localRaw?.tickets),
    mediaRecords: pick(remote.mediaRecords, localRaw?.mediaRecords),
    settings: mergeSettings(remote.settings, localRaw?.settings, defaultStore().settings),
  };
  if (owned && localHasEntities) {
    const emptyPrev: CRMStore = { ...merged, suppliers: [], buyers: [], tasks: [], tickets: [], mediaRecords: [] };
    saveStore(merged, emptyPrev);
  } else {
    localStorage.setItem(STORE_KEY, JSON.stringify(merged));
    lastSavedJson = JSON.stringify(merged);
  }

  if (!remote.settings || !remote.settings.forms) {
    void saveSettings(merged.settings).catch(err => console.warn('[api] initial settings seed failed:', err));
  }
}

function localSessionEmail(): string | null {
  try {
    const raw = localStorage.getItem('vz_crm_session');
    const s = raw ? (JSON.parse(raw) as { user?: { email?: string } }).user?.email : undefined;
    return s ? s.toLowerCase() : null;
  } catch { return null; }
}

function ensureSystemStatuses(settings: AppSettings): void {
  if (!settings.statuses) settings.statuses = [];
  settings.statuses = settings.statuses.filter(s => s.id !== 'lead_found' && s.name !== 'Найден в базе');
  for (const ls of DEFAULT_LEAD_STATUSES) {
    const existing = settings.statuses.find(x => x.id === ls.id || x.name === ls.name);
    if (!existing) {
      settings.statuses.push({ ...ls, bgColor: ls.bgColor || '#F3F4F6', textColor: ls.textColor || '#374151' });
    } else if (!existing.entityTypes.includes('lead')) {
      existing.entityTypes = Array.from(new Set([...existing.entityTypes, 'lead']));
    }
  }
  if (!settings.statuses.some(s => s.id === 'dup_archive' || s.name === 'Архив дублей')) {
    settings.statuses.push({ id: 'dup_archive', name: 'Архив дублей', color: '#6B7280', order: 6, entityTypes: ['supplier', 'buyer'], bgColor: '#F3F4F6', textColor: '#6B7280' });
  }
  const SYS_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
    'Активный': { bg: '#D1FAE5', text: '#065F46' },
    'Лид форма': { bg: '#EFF6FF', text: '#1D4ED8' },
    'Новый с сайта': { bg: '#EFF6FF', text: '#1D4ED8' },
    'Лид CRM': { bg: '#F5F3FF', text: '#6D28D9' },
    'Переговоры': { bg: '#FEF3C7', text: '#B45309' },
    'Приветствие': { bg: '#FCE7F3', text: '#9D174D' },
    'Проблемный': { bg: '#FEE2E2', text: '#B91C1C' },
    'Настройка прайса': { bg: '#FFF7ED', text: '#C2410C' },
    'Архив дублей': { bg: '#F3F4F6', text: '#6B7280' },
    'АРХИВ': { bg: '#F3F4F6', text: '#6B7280' },
    'Лид': { bg: '#F3F4F6', text: '#374151' },
  };
  settings.statuses.forEach(s => {
    const stl = SYS_STATUS_STYLES[s.name];
    if (stl) { if (!s.bgColor) s.bgColor = stl.bg; if (!s.textColor) s.textColor = stl.text; }
  });
  if (!Array.isArray(settings.leads)) settings.leads = [];
}

export function applyRemoteSettingsPatch(patch: Partial<AppSettings>): CRMStore {
  const store = getStore();
  const merged: CRMStore = { ...store, settings: { ...store.settings, ...patch } };
  ensureSystemStatuses(merged.settings);
  const json = JSON.stringify(merged);
  if (json !== lastSavedJson) {
    lastSavedJson = json;
    localStorage.setItem(STORE_KEY, json);
    notifyStoreChange();
  }
  return merged;
}

type EntityListKey = 'suppliers' | 'buyers' | 'tasks' | 'tickets' | 'mediaRecords';

export function applyRemoteEntityChange<T extends { id: string }>(
  key: EntityListKey,
  event: 'INSERT' | 'UPDATE' | 'DELETE',
  entity: T,
): CRMStore {
  const store = getStore();
  const list = store[key] as unknown as T[];
  const list_ = event === 'DELETE'
    ? list.filter(item => item.id !== entity.id)
    : (list.some(item => item.id === entity.id)
      ? list.map(item => (item.id === entity.id ? entity : item))
      : [...list, entity]);
  const merged: CRMStore = { ...store, [key]: list_ };
  localStorage.setItem(STORE_KEY, JSON.stringify(merged));
  notifyStoreChange();
  return merged;
}

export function makeHistoryEntry(
  field: string,
  oldValue: string | undefined,
  newValue: string | undefined,
  comment: string | undefined,
  userId: string,
  userName: string,
): HistoryEntry {
  return { id: generateId(), date: new Date().toISOString(), field, oldValue, newValue, comment, userId, userName };
}

export const SYSTEM_CONTACT_PREFS = ['почта', 'телефон', 'max'];

export function getContactPrefs(): string[] {
  const list = getStore().settings.contactPrefs;
  return Array.isArray(list) && list.length ? list : [...CONTACT_PREFS];
}