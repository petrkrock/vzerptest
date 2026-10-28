import type {FormConfig, FormConsentConfig, StatusColor} from '@/types';

/** Системные статусы базы лидов — нельзя переименовать/удалить в Настройках */
export const SYSTEM_LEAD_STATUSES = ['ЛИД', 'Рассылка', 'Обзвон', 'Отписался', 'Архив дублей', 'АРХИВ'];

/** Статусы базы лидов (ТЗ): все системные (защищены от редактирования/удаления).
 * «Найден в базе» УДАЛЁН (ТЗ) — совпадения по телефону/email идут в «Архив дублей». */
export const DEFAULT_LEAD_STATUSES: StatusColor[] = [
  { id: 'lead_new',     name: 'ЛИД',            color: '#2E90FA', order: 0, entityTypes: ['lead'] },
  { id: 'lead_mailing', name: 'Рассылка',       color: '#6172F3', order: 1, entityTypes: ['lead'] },
  { id: 'lead_call',    name: 'Обзвон',         color: '#EAAA08', order: 2, entityTypes: ['lead'] },
  { id: 'lead_unsub',   name: 'Отписался',      color: '#F04438', order: 3, entityTypes: ['lead'] },
  { id: 'lead_dup',     name: 'Архив дублей',   color: '#6B7280', order: 4, entityTypes: ['lead'] },
  { id: 'lead_archive', name: 'АРХИВ',          color: '#374151', order: 5, entityTypes: ['lead'] },
];

/** Системные статусы поставщиков — нельзя переименовать/удалить в Настройках */
export const SYSTEM_SUPPLIER_STATUSES = ['Активный', 'Архив дублей'];

export const DEFAULT_STATUSES: StatusColor[] = [
  { id: 'from_site',   name: 'Новый с сайта',  color: '#2E90FA', order: 0, entityTypes: ['supplier', 'buyer'] }, // ТЗ v1.22.3: каноническое имя статуса заявок с формы
  { id: 'in_work',     name: 'Лид CRM',        color: '#6172F3', order: 1, entityTypes: ['supplier', 'buyer'] },
  { id: 'negotiation', name: 'Переговоры',          color: '#DD2590', order: 2, entityTypes: ['supplier', 'buyer'] },
  { id: 'price_setup', name: 'Приветствие',         color: '#EAAA08', order: 3, entityTypes: ['supplier'] },
  { id: 'active',      name: 'Активный',            color: '#12B76A', order: 4, entityTypes: ['supplier', 'buyer'] }, // СИСТЕМНЫЙ: привязана функция «активировать на платформе»
  { id: 'problem',     name: 'Проблемный',          color: '#F04438', order: 5, entityTypes: ['supplier', 'buyer'] },
  { id: 'dup_archive', name: 'Архив дублей',        color: '#6B7280', order: 6, entityTypes: ['supplier', 'buyer'] }, // СИСТЕМНЫЙ: дубль по ИНН/телефону/email — автоархив
  { id: 'archive',     name: 'АРХИВ',               color: '#374151', order: 7, entityTypes: ['supplier', 'buyer'] },
];

// v1.31.12: убраны DEFAULT_SUPPLIER_TYPES / DEFAULT_BUYER_TYPES — нигде не использовались.
export const ROLE_TYPES = ['директор', 'менеджер', 'собственник', 'РОП', 'ТП'] as const;
export const CONTACT_PREFS = ['почта', 'телефон', 'MAX'] as const;
/** Типы обращений (Поддержка). Системные защищены от удаления в Настройках. */
export const SYSTEM_TICKET_TYPES = ['Обратная связь', 'Техподдержка', 'Регистрация', 'Партнерство', 'Пожелания']; // v_1.9: системные типы обращений
export const TICKET_TYPES = ['Обратная связь', 'Техподдержка', 'Маркетинг-кит', 'Партнерство'] as const;

// Системные статусы Поддержки (ТЗ): «Новый запрос» — при создании в CRM,
// «Новый запрос с формы» — с сайта, «Решаю» — промежуточный,
// «Решено»/«Без решения» — финальные архивные (кнопками действия). Не редактируются.
export const TICKET_STATUSES = ['Новый запрос', 'Новый запрос с формы', 'Решаю', 'Отправлен в задачи', 'Решено', 'Без решения'] as const;
export const TASK_STATUSES: readonly string[] = ['Новая', 'Решаю', 'Решено', 'Без решения'];

export const TICKET_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Новый запрос':        { bg: '#EFF6FF', text: '#1D4ED8' },
  'Новый запрос с формы': { bg: '#F5F3FF', text: '#6D28D9' },
  'Решаю':               { bg: '#FFFBEB', text: '#92400E' },
  'Отправлен в задачи':  { bg: '#E0E7FF', text: '#4338CA' },
  'Решено':              { bg: '#ECFDF5', text: '#065F46' },
  'Без решения':         { bg: '#F9FAFB', text: '#374151' },
  // legacy compat
  'Новая':        { bg: '#EFF6FF', text: '#1D4ED8' },
  'Новый с сайта': { bg: '#F5F3FF', text: '#6D28D9' },
  // legacy compat
  'Новое':            { bg: '#EFF6FF', text: '#1D4ED8' },
  'В обработке':      { bg: '#FFFBEB', text: '#92400E' },
  'Ожидание ответа':  { bg: '#F5F3FF', text: '#6D28D9' },
  'Закрыто':          { bg: '#F9FAFB', text: '#374151' },
};

export const TASK_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  'Новая':        { bg: '#EFF6FF', text: '#1D4ED8' },
  'Решаю':        { bg: '#FFFBEB', text: '#92400E' },
  'Решено':       { bg: '#ECFDF5', text: '#065F46' },
  'Без решения':  { bg: '#F9FAFB', text: '#374151' },
};

// Системный тип задачи — постоянный, не удаляется; автозадача при активации поставщика/покупателя
export const SYSTEM_TASK_TYPE = 'Ждет активации';

// Системные статусы задач (ТЗ): «Новая» — при создании, «Закрыта» — при закрытии.
// Не удаляются, не переименовываются; защищены в Настройки → Статусы → Задачи.
export const SYSTEM_TASK_STATUSES = ['Новая', 'Закрыта'];

// Типы задач — дефолтный список, редактируется в Настройки → Статусы → Задачи
/** Системные типы задач (защищены от удаления). */
export const SYSTEM_TASK_TYPES = [SYSTEM_TASK_TYPE, 'От поддержки', 'Обратная связь', 'Техподдержка'];
export const DEFAULT_TASK_TYPES = [...SYSTEM_TASK_TYPES, 'Документы', 'Отправить КП'];

// Company score 0-10
export const COMPANY_SCORE_COLORS: Record<number, { bg: string; text: string; label: string }> = {
  10: { bg: '#ECFDF5', text: '#065F46', label: '10' },
  9:  { bg: '#D1FAE5', text: '#065F46', label: '9' },
  8:  { bg: '#A7F3D0', text: '#065F46', label: '8' },
  7:  { bg: '#EFF6FF', text: '#1E40AF', label: '7' },
  6:  { bg: '#DBEAFE', text: '#1D4ED8', label: '6' },
  5:  { bg: '#FFFBEB', text: '#92400E', label: '5' },
  4:  { bg: '#FEF3C7', text: '#B45309', label: '4' },
  3:  { bg: '#FFEDD5', text: '#C2410C', label: '3' },
  2:  { bg: '#FEE2E2', text: '#B91C1C', label: '2' },
  1:  { bg: '#FEE2E2', text: '#991B1B', label: '1' },
  0:  { bg: '#F3F4F6', text: '#9CA3AF', label: '—' },
};



export const DEFAULT_TASK_ENTITY_TYPES = [
  { id: 'tet-1', key: 'supplier', label: 'Поставщик' },
  { id: 'tet-2', key: 'buyer',    label: 'Покупатель' },
  { id: 'tet-3', key: 'ticket',   label: 'Обращение' },
  { id: 'tet-6', key: 'none',     label: 'Без привязки' },
];

// Helper: get status color from store statuses + fallback

// ── PUBLIC FORMS (Настройки → Формы) ────────────────────────
//
// Definitions for the public embeddable forms — one per entity type
// (supplier/buyer/ticket). A handful of fields are "core": the database
// requires them (NOT NULL columns — see supabase/schema.sql), so they're
// always present on the form and can't be unchecked, only reordered
// conceptually by how the builder lists them. Everything else is optional
// and the admin picks what to include + whether it's required.
//
// IMPORTANT: the option lists marked "dynamic" below (type, productGroups,
// services) are resolved at submission time from live settings by the
// public-form Edge Function (supabase/functions/public-form/index.ts) —
// this file only describes the field metadata for the Настройки → Формы
// builder UI. If you rename a field key here, update that Edge Function's
// matching CORE_FIELDS/FIELD_DEFS to keep them in sync (it can't import
// from this file directly — see the function's own comments).

type FormFieldInputType = 'text' | 'textarea' | 'tel' | 'email' | 'number' | 'select' | 'multiselect';

interface FormFieldDefinition {
  key: string;
  label: string;
  inputType: FormFieldInputType;
  core?: boolean;
  defaultValue?: string | number; // ТЗ v1.22.31: предзаполнение поля (торговые точки = 1)
  alwaysShow?: boolean; // ТЗ v1.22.32: показывать в форме всегда (при этом необязательное)
  optionsSource?: 'supplierTypes' | 'buyerTypes' | 'productGroups' | 'supplierServices' | 'roleTypes' | 'contactPrefs' | 'ticketTypes' | 'abcCategories' | 'sources' | 'buyerCategoryComments';
}

export const FORM_FIELD_DEFINITIONS: Record<'supplier' | 'buyer' | 'ticket', FormFieldDefinition[]> = {
  supplier: [
    { key: 'tradeName', label: 'Торговое название компании', inputType: 'text', core: true }, // ТЗ v1.22.29
    { key: 'inn', label: 'ИНН', inputType: 'text', core: true }, // ТЗ v1.22.32: подпись без '*'; обязательность — через core
    { key: 'type', label: 'Тип', inputType: 'select', core: true, optionsSource: 'supplierTypes' },
    { key: 'city', label: 'Город ЦС', inputType: 'text', core: true }, // ТЗ v1.22.29
    { key: 'contactName', label: 'Контактное лицо', inputType: 'text', core: true },
    { key: 'contactRole', label: 'Должность контакта', inputType: 'select', optionsSource: 'roleTypes', alwaysShow: true }, // ТЗ v1.22.32: всегда в форме, но необязательно
    { key: 'phone', label: 'Телефон', inputType: 'tel', core: true },
    { key: 'email', label: 'Email', inputType: 'email', core: true },
    { key: 'website', label: 'Сайт', inputType: 'text' },
    { key: 'source', label: 'Откуда про нас узнали?', inputType: 'select', optionsSource: 'sources' },
    { key: 'contactPref', label: 'Предпочтительный способ связи', inputType: 'multiselect', optionsSource: 'contactPrefs' },
    { key: 'ownBrands', label: 'Собственные бренды (через запятую)', inputType: 'text' },
    { key: 'productGroups', label: 'Товарные группы', inputType: 'multiselect', optionsSource: 'productGroups' },
  ],
  buyer: [
    { key: 'tradeName', label: 'Торговое название или ИП', inputType: 'text', core: true }, // ТЗ v1.22.31
    { key: 'inn', label: 'ИНН/ОГРНИП', inputType: 'text' },
    { key: 'type', label: 'Тип', inputType: 'select', core: true, optionsSource: 'buyerTypes' },
    { key: 'city', label: 'Город нахождения', inputType: 'text', core: true }, // ТЗ v1.22.31
    { key: 'contactName', label: 'Контактное лицо', inputType: 'text', core: true },
    { key: 'contactRole', label: 'Должность контакта', inputType: 'select', optionsSource: 'roleTypes', alwaysShow: true }, // ТЗ v1.22.32: всегда в форме, но необязательно
    { key: 'phone', label: 'Телефон', inputType: 'tel', core: true },
    { key: 'email', label: 'Email', inputType: 'email', core: true },
    { key: 'website', label: 'Сайт', inputType: 'text' },
    { key: 'source', label: 'Откуда про нас узнали?', inputType: 'select', optionsSource: 'sources' },
    { key: 'contactPref', label: 'Предпочтительный способ связи', inputType: 'multiselect', optionsSource: 'contactPrefs' },
    { key: 'locationCount', label: 'Количество торговых точек', inputType: 'number', defaultValue: 1, alwaysShow: true }, // ТЗ v1.22.32 // ТЗ v1.22.31: по умолчанию 1
    { key: 'category', label: 'Примерный оборот в мес.', inputType: 'select', optionsSource: 'buyerCategoryComments' },
  ],
  // Форма сайта (новая): без ответственного и выбора из списка — только контакт, тип, текст, способ связи
  ticket: [
    { key: 'type', label: 'Тип обращения', inputType: 'select', optionsSource: 'ticketTypes', core: true }, // ТЗ v1.22.32: первым и обязательным
    { key: 'contactName', label: 'Контактное лицо', inputType: 'text' },
    { key: 'contactPhone', label: 'Телефон', inputType: 'tel' },
    { key: 'contactEmail', label: 'Email', inputType: 'email' },
    { key: 'contactPref', label: 'Способ связи', inputType: 'multiselect', optionsSource: 'contactPrefs' }, // ТЗ v1.22.32: как в формах поставщик/покупатель
    { key: 'text', label: 'Текст обращения', inputType: 'textarea', core: true },
  ],
};

export const DEFAULT_FORM_CONSENT: FormConsentConfig = {
  label: 'Я согласен на обработку персональных данных',
  documentUrl: '',
  documentLabel: 'Политика обработки персональных данных',
};

function defaultFormConfig(entityType: 'supplier' | 'buyer' | 'ticket', title: string, extraFields: string[], successMessage?: string): FormConfig {
  return {
    entityType,
    enabled: true,
    title,
    consent: { ...DEFAULT_FORM_CONSENT },
    fields: extraFields.map(key => ({ key, required: false })),
    successMessage: successMessage || 'Спасибо! Заявка отправлена, мы свяжемся с вами в ближайшее время.',
    errorMessage: 'Не удалось отправить форму. Проверьте заполненные поля и попробуйте ещё раз.',
    updatedAt: new Date().toISOString(),
  };
}

export const DEFAULT_FORM_CONFIGS = {
  supplier: defaultFormConfig('supplier', 'Стать поставщиком', ['website', 'inn', 'contactRole', 'productGroups'],
    'Поздравляем с успешной регистрацией на платформе!\n\nВ течение 24 часов мы отправим вам на почту Приглашение и ПИН-КОД для самостоятельной настройки вашего склада в системе.\n\nЭто будет просто - не переживайте! Если что, мы всегда рядом.\n\nС уважением, команда ВсемЗапчасти.'), // ТЗ v1.22.36
  buyer: defaultFormConfig('buyer', 'Заявка на сотрудничество', ['website', 'inn', 'contactRole'],
    'Поздравляем с успешной регистрацией на платформе!\n\nВ течение 24 часов мы отправим вам на почту доступ в Ваш личный кабинет. Ожидайте! Если что, мы всегда рядом.\n\nС уважением, команда ВсемЗапчасти.'), // ТЗ v1.22.37
  ticket: defaultFormConfig('ticket', 'Обратная связь', ['type', 'contactPhone', 'contactEmail'],
    'Благодарим за обращение!\n\nВаше сообщение уже в поддержке.\n\nОжидайте ответа! Если что, мы всегда рядом.\n\nС уважением, команда ВсемЗапчасти.'), // ТЗ v1.22.37
};

// v_1.9: системные статусы медиа — редактирование/удаление запрещены
export const MEDIA_SYSTEM_STATUSES = ['Заявка создана', 'Счёт отправлен', 'Опубликовано', 'Запланировано', 'Отменено', 'Завершается', 'Выполнено']; // v1.30.81 (константа была протухшей с 1.30.48 — исправлено)

// Приветствие поставщику для самообслуживания (Настройки → Приветствия).
// Плейсхолдеры: {tradeName} — название, {link} — ссылка, {pin} — PIN-код.
export const DEFAULT_SUPPLIER_GREETING = 'Уважаемый поставщик Автозапчасти, {tradeName}. Самообслуживание активно. Перейдите по ссылке {link}, введите пин-код {pin} и создайте Ваш склад на платформе, заполните условия для витрины поиска в доступных городах. Данные можно менять в любое время, все склады и условия проходят модерацию 1–3 дня, проверку склада сделает Менеджер платформы и поставит отметку «Склад проверен». По возникшим вопросам обращайтесь в техподдержку. Удачных цифровых продаж.';

/** Версия сборки — дублируется на экраны (логин, ЛК) для однозначной диагностики деплоя. */
export const APP_VERSION = '1.35.3';

// v1.31.11: дефолт-домен (домен по умолчанию, пока CRM однодоменная)
export const DEFAULT_DOMAIN_ID = '00000000-0000-4000-8000-000000000001';
