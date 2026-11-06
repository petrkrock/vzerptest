// FIELD_DEFS публичных форм — 1:1 с FORM_FIELD_DEFINITIONS во фронте (src/constants/index.ts):
// те же ключи, подписи и порядок. Менять только вместе с фронтом.
// Типы форм: supplier / buyer / ticket (marketingKit вырезан в v1.33.0).

export type PublicFormType = 'supplier' | 'buyer' | 'ticket';

export interface FieldDef {
  key: string;
  label: string;
  inputType: 'text' | 'textarea' | 'tel' | 'email' | 'number' | 'select' | 'multiselect';
  core?: boolean;
  defaultValue?: string | number;
  alwaysShow?: boolean;
  optionsSource?: 'supplierTypes' | 'buyerTypes' | 'productGroups' | 'supplierServices' | 'roleTypes' | 'contactPrefs' | 'ticketTypes' | 'sources' | 'buyerCategoryComments';
}

// Keep in sync with src/constants/index.ts FORM_FIELD_DEFINITIONS.
export const FIELD_DEFS: Record<PublicFormType, FieldDef[]> = {
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
    { key: 'locationCount', label: 'Количество торговых точек', inputType: 'number', defaultValue: 1, alwaysShow: true }, // ТЗ v1.22.31: по умолчанию 1
    { key: 'category', label: 'Примерный оборот в мес.', inputType: 'select', optionsSource: 'buyerCategoryComments' }, // ТЗ v1.22.25
  ],
  ticket: [
    { key: 'type', label: 'Тип обращения', inputType: 'select', core: true, optionsSource: 'ticketTypes' },
    { key: 'contactName', label: 'Контактное лицо', inputType: 'text' },
    { key: 'contactPhone', label: 'Телефон', inputType: 'tel' },
    { key: 'contactEmail', label: 'Email', inputType: 'email' },
    { key: 'contactPref', label: 'Способ связи', inputType: 'multiselect', optionsSource: 'contactPrefs' },
    { key: 'text', label: 'Текст обращения', inputType: 'textarea', core: true },
  ],
};

const STATIC_OPTIONS: Record<string, string[]> = {
  roleTypes: ['директор', 'менеджер', 'собственник', 'РОП', 'ТП'],
  contactPrefs: ['почта', 'телефон', 'WhatsApp', 'Telegram'],
};

export const DEFAULT_CONSENT = {
  label: 'Я согласен на обработку персональных данных',
  documentUrl: '',
  documentLabel: 'Политика обработки персональных данных',
};

export const CATEGORY_KEYS = ['A', 'B', 'C'] as const;

// Категория покупателя A/B/C ↔ подпись («оборот»), которую видит посетитель формы.
export function buyerCategoryComments(settings: Record<string, unknown>): Record<string, string> {
  return (settings.buyerCategoryComment as Record<string, string>) ||
    { A: '1 500 000 и больше', B: '500 000 – 1 500 000', C: '50 000 – 500 000' };
}

// Конфиг формы в app_settings.settings.forms[type].fields: {key, required} — так его сохраняет SettingsPage.
export interface FormFieldConfig { key: string; required?: boolean }

export interface ActiveField extends FieldDef { required: boolean }

// Поля, которые реально есть в форме: core + alwaysShow + выбранные админом, в порядке FIELD_DEFS.
// Обязательны: core или отмеченные админом. Один источник и для GET (показ), и для POST (whitelist + проверка).
export function activeFields(type: PublicFormType, chosen: FormFieldConfig[] | undefined): ActiveField[] {
  const required = new Map((chosen || []).map(f => [f.key, Boolean(f.required)]));
  return FIELD_DEFS[type]
    .filter(d => d.core || d.alwaysShow || required.has(d.key))
    .map(d => ({ ...d, required: Boolean(d.core || required.get(d.key)) }));
}

export function resolveOptions(source: string | undefined, settings: Record<string, unknown>): string[] | undefined {
  if (!source) return undefined;
  if (source === 'contactPrefs') {
    const cp = settings.contactPrefs as string[] | undefined;
    return Array.isArray(cp) && cp.length ? cp : STATIC_OPTIONS.contactPrefs;
  }
  if (source === 'roleTypes') {
    const rt = settings.roleTypes as string[] | undefined;
    return Array.isArray(rt) && rt.length ? rt : STATIC_OPTIONS.roleTypes;
  }
  if (source === 'sources') {
    const srcs = (settings.sources as Array<{ name: string; deletedAt?: string }>) || [];
    return srcs.filter(x => !x.deletedAt).map(x => x.name);
  }
  if (source === 'buyerCategoryComments') {
    const c = buyerCategoryComments(settings);
    return CATEGORY_KEYS.map(k => c[k]).filter(Boolean);
  }
  if (source === 'supplierTypes') return (settings.supplierTypes as string[]) || [];
  if (source === 'buyerTypes') return (settings.buyerTypes as string[]) || [];
  if (source === 'ticketTypes') return (settings.ticketTypes as string[]) || [];
  if (source === 'productGroups') {
    const groups = (settings.productGroups as Array<{ name: string; deletedAt?: string }>) || [];
    return groups.filter(g => !g.deletedAt).map(g => g.name);
  }
  if (source === 'supplierServices') {
    const services = (settings.supplierServices as Array<{ name: string; deletedAt?: string }>) || [];
    return services.filter(s => !s.deletedAt).map(s => s.name);
  }
  return undefined;
}
