// ============================================================
// TYPES — ВСЕМЗАПЧАСТИ CRM
// ============================================================

export type EntityType = 'supplier' | 'buyer' | 'task' | 'ticket';

type SupplierType = string;
type BuyerType = string;
type RoleType = 'директор' | 'менеджер' | 'собственник' | 'РОП' | 'ТП';
type ContactPref = 'почта' | 'телефон' | 'WhatsApp' | 'Telegram';

export type TaskStatus = 'Новая' | 'Решаю' | 'Решено' | 'Без решения' | (string & {});
export type TicketStatus = 'Новый запрос' | 'Новый запрос с формы' | 'Решаю' | 'Отправлен в задачи' | 'Решено' | 'Без решения' | (string & {});

export interface StatusConfig {
  id: string;
  name: string;
  color: string;
  bgColor: string;
  textColor: string;
  entityTypes: string[];
  order: number;
}

export interface HistoryEntry {
  id: string;
  date: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  comment?: string;
  userId: string;
  userName: string;
}

export interface ScoreData {
  annualRevenue?: string;
  employees?: string;
  yearsOnMarket?: string;
  apiLoaded?: boolean;
  apiLoadedAt?: string;
  // ── этап 1.8 — финансовые показатели из Checko API (строки отчёта) ──
  year?: number;         // год отчёта
  revenue?: number;      // строка 2110 «Выручка»
  inventory?: number;    // строка 1210 «Запасы»
  grossProfit?: number;  // строка 2100 «Валовая прибыль»
  marginPct?: number;    // Маржа = 2100 / 2110 × 100% (Запасы 1210 не участвуют)
  companyName?: string;  // наименование из Checko
}

export interface RequisitesData {
  bank?: string;
  bik?: string;
  accountNumber?: string;
  corrAccount?: string;
  legalName?: string;
  legalAddress?: string;
  ogrn?: string;
  kpp?: string;
  director?: string;
}

/** Лид в базе лидов. Хранится в app_settings.settings.leads (JSONB). */
export interface Lead {
  id: string;
  /** Чья база: поставщики или покупатели */
  type: 'supplier' | 'buyer';
  /** Торговое название (обязательное) */
  tradeName: string;
  /** ИНН / ОГРНИП (системное поле) */
  inn?: string;
  /** Подтип: тип поставщика/покупателя из справочников Настроек */
  subType?: string;
  city: string;
  /** ФИО контакта */
  contactName: string;
  status: string;
  /** Обязательное */
  phone: string;
  /** Обязательное */
  email: string;
  comment: string;
  createdAt: string;
  createdBy?: string;
  updatedAt?: string;
  /** Софт-архив (удалённые/дубли/найденные в базе) */
  deletedAt?: string;
}

/** Системные статусы проверки склада. Менять могут только администратор/менеджер в CRM;
 * через ссылку самообслуживания смена статусов недоступна. «Заморожен» — склад не участвует
 * в аналитике и считается несуществующим, но в базе остаётся. */
export type WarehouseStatus = 'Новый' | 'Проверен' | 'Заморожен';

export interface WarehouseLocation {
  id: string;
  city: string;
  skuCount: number;
  /** Склад проверен менеджером (да/нет). Ставит ТОЛЬКО менеджер в CRM; по умолчанию false */
  verified?: boolean;
  /** Статус проверки. По умолчанию «Новый» — ставится системой при создании склада */
  status?: WarehouseStatus;

  /** Адрес склада (ТЗ v1.25.0, зеркально ЛК) */
  address?: string;
}

export interface ServiceSearchCondition {
  id: string;
  city: string;
  warehouseName: string;
  representative: string;
  contacts: string;
  email: string;
  deliverySchedule: string;
  orderUnloadSchedule: string;
  returnConditions: string;
  officialWarehouse: string;
  deliveryTime?: string; // v_1.9: срок поставки до выбранного города (Сегодня/Завтра/N дней)
  /** Статус условия: Новое (добавил поставщик) / Загружено (на платформе) / Есть изменения (поставщик правил). Меняет только менеджер в CRM */
  status?: 'Новое' | 'Загружено' | 'Есть изменения' | 'Удаление';
  createdAt: string;
  updatedAt: string;
}

export interface ProductGroup {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface Source {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SupplierService {
  id: string;
  name: string;
  createdAt: string;
  /** Системный сервис (ТЗ v1.29.0): нельзя удалить, только переименовать. */
  system?: boolean;
  /** v1.30.100: публичное название для ЛК поставщика (внутри — системное name) */
  publicName?: string;
}

// ── MEDIA SERVICE ──────────────────────────────────────────

/** One duration/price option within an ad type tariff */
export interface MediaDurationOption {
  id: string;
  periodLabel: string;   // "6 мес."
  periodMonths: number;  // 6
  discount: number;      // 0-100 %
  totalPrice: number;    // итоговая цена
  bonus?: string;        // "2 новости" | ""
  enabled?: boolean;     // v_1.9: выкл → формат недоступен к выбору
}

/** Ad format / placement type with embedded tariff options */
export interface MediaAdType {
  id: string;
  name: string;
  /** v1.30.63: описание формата размещения */
  description?: string;
  spotsCount: number;       // всего мест
  pricePerMonth: number;    // базовая цена в месяц
  durationOptions: MediaDurationOption[];
  enabled?: boolean;      // v_1.9: выкл → недоступен к выбору в «Новом размещении»
  createdAt: string;
}

/** Legacy tariff (kept for backward compat migration) */
interface MediaTariff {
  id: string;
  name: string;
  period: string;
  pricePerMonth: number;
  discount: number;
  totalPrice: number;
  createdAt: string;
}

export interface MediaStatus {
  id: string;
  name: string;
  bgColor: string;
  textColor: string;
  /** v1.30.49: описание — если у статуса есть автоматическое действие */
  description?: string;
  createdAt: string;
}

export interface MediaRecord {
  id: string;
  supplierId: string;
  supplierName: string;
  adTypeId: string;
  adTypeName: string;
  durationOptionId?: string;
  durationLabel?: string;    // "6 мес."
  pricePerMonth?: number;
  totalPrice?: number;
  status: string;
  startDate: string;
  endDate: string;
  notes?: string;            // краткая заметка (список)
  /** Ответственный (ТЗ: ответственные во всех разделах) */
  responsibleId?: string;
  responsibleName?: string;
  expandedNotes?: string;    // подробные заметки (раскрытая карточка)
  // v1.30.61: договор размещения + история изменений записи
  contractNo?: string;
  contractDate?: string;
  // v1.30.67: скидка по тарифу (%)
  discount?: number;
  history?: { at: string; by: string; action: string }[];
  // v1.30.63: материал размещения (описание + файлы-картинки)
  material?: { description: string; files: string[] };
  // legacy
  tariffId?: string;
  tariffName?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

// ── KNOWLEDGE BASE ─────────────────────────────────────────

export type KnowledgeItemType = 'file' | 'link' | 'note';

export interface KnowledgeComment {
  id: string;
  text: string;
  authorId: string;
  authorName: string;
  createdAt: string;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  type: KnowledgeItemType;
  description?: string;
  content?: string;   // URL для link, текст для note
  fileName?: string;
  fileSize?: string;
  fileUrl?: string;   // public Supabase Storage URL, set when the file was actually uploaded
  tags: string[];
  authorId: string;
  authorName: string;
  comments: KnowledgeComment[];
  /** Доступен менеджерам (ТЗ). Не выбрано → видят только админы. */
  availableToManagers?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface KnowledgeCategory {
  id: string;
  name: string;
  createdAt: string;
  deletedAt?: string;
}

// ── MISC ───────────────────────────────────────────────────

export interface DbLog {
  id: string;
  userId: string;
  userEmail: string;
  action: 'DELETE' | 'EXPORT' | 'VIEW';
  entityType: string;
  entityIds: string[];
  details: string;
  createdAt: string;
}

export interface TaskEntityType {
  id: string;
  key: string;
  label: string;
}

// v1.31.12: убран алиас SupplierScoring — использовался ScoreData напрямую.
export interface Supplier {
  id: string;
  type: SupplierType;
  tradeName: string;
  city: string;
  address?: string;
  website?: string;
  /** v1.29.33: ЭДО — оператор и токен */
  edoOperator?: string;
  edoToken?: string;
  /** v1.30.0: Email отправки прайсов */
  priceEmail?: string;
  inn?: string;
  contactRole: RoleType;
  contactName: string;
  phone: string;
  email: string;
  status: string;
  source?: string;
  contactPref?: ContactPref;
  /** Способы связи (мультивыбор), колонка contact_prefs в БД */
  contactPrefs?: string[];
  warehouseCount?: number;
  skuCount?: number;
  warehouseLocations?: WarehouseLocation[];
  productGroups: string[];
  ownBrands: string[];
  services?: string[];
  companyScore: number;
  category?: 'A' | 'B' | 'C'; // этап 1.8 — категория поставщика (A/B/C, по умолчанию C)
  comment?: string;
  /** v1.30.98: внешние ID (1С/API/прайсы) — пара источник+ID уникальна */
  externalId?: string;
  externalSource?: string;
  /** v1.30.99: читаемый бизнес-ID (S000001/B000001) */
  publicId?: string;
  /** v1.31.11: домен-арендатор (изоляция данных) */
  domainId?: string;
  scoring?: ScoreData;
  requisites?: RequisitesData;
  serviceSearch?: ServiceSearchCondition[];
  /** Доступ к самообслуживанию: поставщик сам заполняет склады и условия сервиса поиска по ссылке /s/<token> */
  serviceAccess?: { token: string; pin?: string; enabled: boolean; createdAt: string; /** v1.30.56: редакция оферты, принятой поставщиком в ЛК */ offerAcceptedEdition?: string };
  history: HistoryEntry[];
  additionalContacts?: string;
  additionalComment?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  /** Ответственный (ТЗ: ответственные во всех разделах) */
  responsibleId?: string;
  responsibleName?: string;
  fromApi?: boolean;
  createdBy?: string;
  /** Функция «Мультисклад»: false = максимум 1 склад. Включает только менеджер/админ в CRM */
  multiWarehouse?: boolean;
}

export interface Buyer {
  id: string;
  type: BuyerType;
  tradeName: string;
  city: string;
  address?: string;
  website?: string;
  inn?: string;
  contactRole: RoleType;
  contactName: string;
  phone: string;
  email: string;
  status: string;
  source?: string;
  contactPref?: ContactPref;
  /** Способы связи (мультивыбор), колонка contact_prefs в БД */
  contactPrefs?: string[];
  locationCount?: number;
  /** Колонка locations_count в БД (синоним locationCount, оба поддерживаются) */
  locationsCount?: number;
  companyScore: number;
  category?: 'A' | 'B' | 'C'; // этап 1.8 — категория покупателя (A/B/C, по умолчанию C)
  comment?: string;
  /** v1.30.98: внешние ID (1С/API/прайсы) — пара источник+ID уникальна */
  externalId?: string;
  externalSource?: string;
  /** v1.30.99: читаемый бизнес-ID (S000001/B000001) */
  publicId?: string;
  /** v1.31.11: домен-арендатор (изоляция данных) */
  domainId?: string;
  scoring?: ScoreData;
  requisites?: RequisitesData;
  history: HistoryEntry[];
  additionalContacts?: string;
  additionalComment?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
  /** Ответственный (ТЗ: ответственные во всех разделах) */
  responsibleId?: string;
  responsibleName?: string;
  fromApi?: boolean;
  createdBy?: string;
}

export interface Task {
  id: string;
  entityType: string;
  entityId?: string;
  entityName?: string;
  title: string;
  description?: string;
  dueDate: string;
  taskStatus: TaskStatus;
  completed: boolean;
  /** Дата и время перехода в системный статус «Решено» (ставится автоматически) */
  resolvedAt?: string;
  /** Мягкое удаление: безвозвратного удаления задач нет — удалённая задача
   *  помечается и фиксируется в журнале (Настройки/БД → Логи). */
  deletedAt?: string;
  /** Ответственный (ТЗ: ответственные во всех разделах) */
  responsibleId?: string;
  responsibleName?: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  /** История: кто и когда создал/редактировал/менял статус (как у поставщиков) */
  history?: HistoryEntry[];
  /** Экспорт из базы лидов: id лидов, включённых в задачу (скачивание Excel по ссылке) */
  leadIds?: string[];
  exportKind?: 'leads' | 'suppliers';
  /** Экспорт из списков поставщиков/покупателей: id записей + вид списка */
  entityIds?: string[];
  entityKind?: 'suppliers' | 'buyers';
}

// Тип обращения редактируется в настройках (Настройки → Типы и города),
// дефолтный список — TICKET_TYPES в constants (используется как фолбэк)
type TicketType = string;

export interface Ticket {
  id: string;
  type: TicketType;
  category?: string;
  status: TicketStatus;
  /** Способ связи — справочник CONTACT_PREFS, как у поставщиков/покупателей */
  contactPref?: string;
  /** Способы связи (мультивыбор) */
  contactPrefs?: string[];
  /** Созданная из обращения задача (кнопка «Создать задачу» в Поддержке) */
  taskId?: string;
  priority: number;
  subject: string;
  text: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  entityType?: string;
  entityId?: string;
  /** Ответственный (ТЗ: ответственные во всех разделах) */
  responsibleId?: string;
  responsibleName?: string;
  history: HistoryEntry[];
  fromApi?: boolean;
  createdBy?: string; // v1.35.3: автор обращения (SupportPage пишет u.id)
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface PlanFactEntry {
  id: string;
  /** Период плана, YYYY-MM-DD */
  startDate: string;
  endDate: string;
  cityId?: string;
  cityName?: string;
  /** Тип плана: поставщики или покупатели — отдельные планы разным менеджерам (ТЗ) */
  kind: 'suppliers' | 'buyers';
  /** Значение плана по этому типу */
  plan: number;
  /** Уточнение плана: тип поставщика/покупателя (не задано = все типы, ТЗ) */
  filterType?: string;
  /** Уточнение плана (только поставщики): сервис продаж (не задано = все сервисы, ТЗ) */
  filterService?: string;
  /** ТЗ 1.7.9 (этап 3): сервисы продаж (множественный выбор, обязательно для поставщиков) */
  serviceIds?: string[];
  /** ТЗ: заметки к записи плана */
  notes?: string;
  /** ТЗ: отчёт о проделанной работе (редактируется, кнопка ОТЧЁТ красная/зелёная) */
  report?: string;
  /** ТЗ (этап 3): история плана — кто создал/редактировал/отчёт */
  history?: HistoryEntry[]; /* planFactHistory */
  responsibleId?: string;
  responsibleName?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

/** Статус учётной записи: active — работает, blocked — временная блокировка, fired — уволен (доступа нет). */
export type UserStatus = 'active' | 'blocked' | 'fired';

/**
 * Фильтры видимости для роли «Менеджер» (ТЗ «Управление пользователями»).
 * Пустой массив = без ограничений (видит всё внутри доступного раздела);
 * заполненный — только выбранные типы/города.
 */
export interface UserAccess {
  supplierTypes: string[];
  supplierCities: string[];
  buyerTypes: string[];
  buyerCities: string[];
  ticketTypes: string[];
  planCities: string[];
  // НОВОЕ (v1.20.9): фильтры разделов Дашборд, Задачи, Медиа сервис, Аналитика, База знаний —
  // та же логика: пустой массив = без ограничений внутри доступного раздела.
  dashboardCities: string[];
  taskTypes: string[];
  taskEntityTypes: string[];
  mediaAdTypes: string[];
  mediaDurationOptions: string[];
  mediaStatuses: string[];
  analyticsCities: string[];
  knowledgeCategories: string[];
}

export const EMPTY_ACCESS: UserAccess = {
  supplierTypes: [],
  supplierCities: [],
  buyerTypes: [],
  buyerCities: [],
  ticketTypes: [],
  planCities: [],
  dashboardCities: [],
  taskTypes: [],
  taskEntityTypes: [],
  mediaAdTypes: [],
  mediaDurationOptions: [],
  mediaStatuses: [],
  analyticsCities: [],
  knowledgeCategories: [],
};

/** Разделы, доступные для выдачи менеджеру. «Настройки» и «База данных» сюда НЕ входят — они только для администратора. */
export interface AppUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'manager';
  /** Комментарий в скобках после роли, напр. «Отдел закупок» */
  note?: string;
  /** Личный chat_id для уведомлений (Telegram или MAX — см. notifyChannel) */
  notifyChatId?: string;
  /** Канал личных уведомлений (ТЗ): telegram / max / email; пусто — не получает */
  notifyChannel?: NotifyChannel;
  /** Почта для личных уведомлений, если канал = email */
  notifyEmail?: string;
  permissions: {
    dashboard: boolean;
    suppliers: boolean;
    buyers: boolean;
    tasks: boolean;
    support: boolean;
    /** База лидов (v1.21.0): отдельный раздел с собственной галочкой доступа */
    leads: boolean;
    media: boolean;
    /** Проценка (ТЗ v1.24.0): единое управление условиями DBS всех поставщиков. */
    pricing: boolean;
    planfact: boolean;
    analytics: boolean;
    knowledge: boolean;
    /** Право редактировать и создавать записи План/Факт (просмотр раздела — галочка planfact) */
    planfactEdit: boolean;
  };
  access: UserAccess;
  /** Тип дашборда менеджера (v1.21.3): 'mop' — МОП (продажи, покупатели), 'moz' — МОЗ (закупки, поставщики).
   *  Только для роли manager; выбирается ровно один. */
  dashboardType?: 'mop' | 'moz';
  /** База План/Факт для менеджера (v1.21.5): если задана — менеджер видит только её, переключатель заблокирован. */
  planfactBase?: 'buyers' | 'suppliers';
  /** Чья база лидов доступна менеджеру (v1.21.5): 'buyers' — покупатели, 'suppliers' — поставщики. */
  leadsBase?: 'buyers' | 'suppliers';
  /** Доступные города менеджера с дашбордом МОП (v1.21.6): список названий городов из «Типы и города»;
   *  пустой список/не задано = все города. Работает только при dashboardType === 'mop'. */
  allowedCities?: string[];
  /** Дата блокировки или увольнения (ТЗ v1.22.5): ставится при увольнении/блокировке, снимается при разблокировке. */
  firedAt?: string;
  status: UserStatus;
  createdAt: string;
}

interface ServiceSearchList {
  id: string;
  category: string;
  value: string;
  createdAt: string;
}

export interface PlanCity {
  id: string;
  name: string;
  createdAt: string;
  deletedAt?: string;
}

export interface FormFieldConfig {
  key: string;
  required: boolean;
}

// v1.33.0: форма «Маркетинг-кит» (только ИНН) вырезана полностью.
export type PublicFormEntityType = 'supplier' | 'buyer' | 'ticket'; // v_1.9

/** Согласие на обработку персональных данных — обязательная галочка в публичной форме */
export interface FormConsentConfig {
  label: string;         // текст рядом с галочкой
  documentUrl: string;   // ссылка на документ (политика ПДн); пусто — ссылка не показывается
  documentLabel: string; // подпись ссылки
}

export interface FormConfig {
  entityType: PublicFormEntityType;
  enabled: boolean;
  title: string;
  description?: string;
  fields: FormFieldConfig[]; // additional (non-core) fields the admin chose to include, in order
  successMessage: string;
  errorMessage: string;
  consent: FormConsentConfig; // всегда обязательна в публичной форме
  updatedAt: string;
}

/** v1.30.0: Новость платформы для ЛК поставщика */
interface LkNews {
  id: string;
  title: string;
  date: string;
  text: string;
  createdAt: string;
  /** Своя фраза-тег (по умолчанию «Новая функция») */
  tag?: string;
  /** Ссылка при клике на новость */
  link?: string;
  /** Полный текст (можно HTML) — открывается модалкой по клику */
  fullText?: string;
  /** v1.30.92: публикация — новость видна в ЛК только при published */
  published?: boolean;
}

/** v1.30.43: Оператор (персональный менеджер) ЛК поставщика */
interface LkOperator {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  /** Связанный пользователь CRM (выбор из существующих) */
  userId: string;
  /** Ссылка на аккаунт в MAX */
  maxLink?: string;
  createdAt: string;
}

/** v1.30.55: Договор оферты */
interface OfferContract {
  id: string;
  name: string;
  edition: string;
  /** Дата публикации */
  publishedAt: string;
  /** Дата вступления в силу */
  effectiveAt: string;
  text: string;
  /** Только один договор может быть включён */
  enabled: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** v1.30.62: Договор размещения (Медиа сервис → Договора) */
export interface MediaContract {
  id: string;
  supplierId: string;
  contractNo: string;
  contractDate: string;
  status: 'Новый' | 'Активный' | 'Не активный';
  history?: { at: string; by: string; action: string }[];
  createdAt: string;
  updatedAt?: string;
}

/** v1.30.69: Новость рынка */
export interface MarketNewsItem {
  id: string;
  supplierId: string;
  title: string;
  link?: string;
  text?: string;
  imageUrl?: string;
  status: 'Новая' | 'Опубликована' | 'Аннулирована';
  /** Дата новости */
  date: string;
  createdAt: string;
}

/** Цветовой статус справочника (Настройки → Статусы). v1.35.3: интерфейс восстановлен —
 * constants использует его с v1.34, тип терялся при переезде. */
export interface StatusColor {
  id: string;
  name: string;
  color: string;
  order: number;
  entityTypes: string[];
}

export interface AppSettings {
  statuses: StatusConfig[];
  buyerCategoryComment?: { A: string; B: string; C: string }; // этап 1.8 — комментарии оборота категорий покупателей
  supplierCategoryTurnover?: { A: number; B: number; C: number }; // этап 1.8 — пороги оборота категорий
  checkoApiKey?: string; // этап 1.8 — API-ключ Checko
  checkoApiEnabled?: boolean; // этап 1.8 — автоматический скоринг
  serviceSearchLists: ServiceSearchList[];
  users: AppUser[];
  planFact: PlanFactEntry[];
  supplierTypes: string[];
  buyerTypes: string[];
  ticketTypes: string[];
  cities: string[];
  /** v1.30.0: Дашборд ЛК поставщика (счётчики: manual/database) */
  lkDashboard?: {
    buyersMode: 'manual' | 'db'; buyersCount: number;
    warehousesMode: 'manual' | 'db'; warehousesCount: number;
    skuMode: 'manual' | 'db'; skuCount: number;
    requestsPerDay: number;
  };
  /** v1.30.0: Баннер дашборда ЛК (изображение + ссылка) */
  lkBanner?: { image: string; link: string };
  /** v1.30.0: Новости платформы для ЛК (показываем последние 3) */
  lkNews?: LkNews[];
  /** v1.30.0: «От поставщиков поставщикам» — слайдер новостей в ЛК */
  lkVendorNews?: LkNews[];
  /** v1.30.0: Ссылки офер для кнопок Кросс-докинг / Продвижение */
  lkLinks?: { crossdock?: string; promo?: string; /** v1.30.76: кнопка «Подробнее про форматы» в ЛК */ formats?: string };
  /** v1.30.43: Операторы (персональные менеджеры) ЛК поставщика — настройка в Настройки → ЛК Поставщик */
  lkOperators?: LkOperator[];
  /** v1.30.55: Договоры оферты (Настройки → Договора и оферты); включённым может быть только один */
  offerContracts?: OfferContract[];
  /** v1.30.62: Договора размещений (Медиа сервис → Договора) */
  mediaContracts?: MediaContract[];
  /** v1.30.69: Новости рынка (Медиа сервис → Новости) */
  marketNews?: MarketNewsItem[];
  /** v1.29.33: Справочник операторов ЭДО (Настройки → Источники) */
  edoOperators?: string[];
  /** Быстрые кнопки в шапке (иконки «Почта» и «Платформа»); пустая строка — кнопка скрыта */
  quickLinks: { mail: string; platform: string };
  planCities: PlanCity[];
  productGroups: ProductGroup[];
  sources: Source[];
  supplierServices: SupplierService[];
  dbLogs: DbLog[];
  taskEntityTypes: TaskEntityType[];
  /** Типы задач — выпадающий список в форме задачи; редактируются в Настройки → Статусы → Задачи */
  taskTypes?: string[];
  /** Способы связи («Связь») — редактируются в Настройки → Источники; константа CONTACT_PREFS — фолбэк */
  contactPrefs?: string[];
  /** Роли контактов (ТЗ v1.22.30): справочник Настройки → Источники → «Роль». Директор, Менеджер, Собственник, РОП, ТП — названия редактируемые. */
  roleTypes?: string[];
  /** Шаблоны приветствий (Настройки → Приветствия) */
  greetings?: { supplier?: string };
  /** v1.30.103: титул для кабинета ЛК поставщика */
  cabinetTitle?: string;
  mediaAdTypes: MediaAdType[];
  mediaTariffs?: MediaTariff[];  // legacy
  mediaStatuses: MediaStatus[];
  knowledgeItems: KnowledgeItem[];
  knowledgeCategories: KnowledgeCategory[];
  forms: {
    supplier: FormConfig;
    buyer: FormConfig;
    ticket: FormConfig;
  };
  /** Настройки уведомлений о заявках (модуль «Уведомления» в Настройках) */
  notifications?: NotificationSettings;
  /** Снимки объёма рынка (Аналитика → «Объём рынка») */
  marketVolumes?: MarketVolumeRecord[];  /** База лидов (раздел «База лидов») */
  leads?: Lead[];
}

/** Снимок объёма рынка на дату. Авто-значения (в базе/активных) фиксируются
 *  в момент создания/редактирования снимка. */
export interface MarketVolumeRecord {
  id: string;
  kind: 'suppliers' | 'buyers';
  /** Дата снимка, YYYY-MM-DD */
  date: string;
  /** Только покупатели: город из общего справочника */
  city?: string;
  /** Только поставщики: всего поставщиков на рынке (вводится вручную) */
  marketTotal?: number;
  /** Всего в базе (без удалённых) — зафиксировано при создании */
  inBase: number;
  /** Активных (статус «Активный») — зафиксировано при создании */
  active: number;
  createdAt: string;
  updatedAt: string;
}

/** Каналы уведомлений о новых заявках с публичных форм.
 *  Токены/ключи НЕ хранятся здесь — только в Supabase Secrets функции public-form. */
interface NotificationSettings {
  telegram: { enabled: boolean; globalChatId: string };
  max: { enabled: boolean; globalChatId: string };
  email: { enabled: boolean; to: string; from: string };
}

type NotifyChannel = 'telegram' | 'max' | 'email';

export interface AuthSession {
  user: AppUser;
  expiresAt: string;
}

/** Запись локального лога синхронизации (ТЗ v1.23.43). НЕ синхронизируется с сервером. */
export interface SyncLogEntry {
  id: string;
  ts: string;
  kind: 'op' | 'summary' | 'system';
  entity?: 'suppliers' | 'buyers' | 'tasks' | 'tickets' | 'mediaRecords' | 'settings' | 'system';
  op?: 'create' | 'update' | 'delete' | 'sync' | 'push' | 'pull';
  itemId?: string;
  status: 'ok' | 'error';
  message?: string;
}
