import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { EventLogService } from '../events/event-log.service';
import {
  ActiveField, CATEGORY_KEYS, DEFAULT_CONSENT, FormFieldConfig, PublicFormType,
  activeFields, buyerCategoryComments, resolveOptions,
} from './field-defs';
import { notify } from './notify';

// Публичные формы (Настройки → Формы → код для сайта). Порт supabase/functions/public-form (v1.31.18).
// GET  /forms?type=…  — конфиг формы: поля (core + alwaysShow + выбранные админом), обязательность, опции.
// POST /forms         — {type, values, consent, honeypot, renderedAt}: заявка в раздел CRM
//                       со статусом «Новый с сайта» (обращения — «Новый запрос с формы»), from_api = true.
// Публичный доступ: rate-limit, honeypot, задержка ≥ 2 сек, согласие на обработку ПДн, дедуп по таблицам.
// Фронт (PublicFormPage) читает текст ошибки из поля `error` — поэтому все ошибки отдаём как { error }.

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const MIN_SUBMIT_MS = 2000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_FIELD_LEN = 2000;

const SITE_STATUS = 'Новый с сайта';
const SITE_TICKET_STATUS = 'Новый запрос с формы';
const SITE_SOURCE = 'Форма с сайта';
const DEFAULT_SERVICE = 'DBS'; // ТЗ v1.22.41: поставщик с формы получает сервис продаж DBS

// Единственный домен (single-tenant): заявки с публичных форм всегда попадают в него.
// domain_id пишем ЯВНО — на боевой БД у колонки может не быть DEFAULT/NOT NULL (иначе NULL → ломается ЛК и realtime).
const DEFAULT_DOMAIN_ID = '00000000-0000-4000-8000-000000000001';
// Имена сущностей — как в /sync/ops (фронт по ним обновляет данные).
const SYNC_ENTITY = { supplier: 'suppliers', buyer: 'buyers', ticket: 'tickets' } as const;

const TABLES = { supplier: 'public.suppliers', buyer: 'public.buyers', ticket: 'public.tickets' } as const;
const WHO = { supplier: 'Поставщик', buyer: 'Покупатель' } as const;

export function fail(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST): HttpException {
  return new HttpException({ error: message }, status);
}

const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_MAX;
}

interface StoredForm {
  enabled?: boolean;
  title?: string;
  description?: string;
  successMessage?: string;
  errorMessage?: string;
  consent?: typeof DEFAULT_CONSENT;
  fields?: FormFieldConfig[];
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

@Injectable()
export class PublicService {
  constructor(private db: DatabaseService, private eventLog: EventLogService) {}

  private async loadForm(type: PublicFormType) {
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT settings FROM public.app_settings WHERE id = 'global'`),
    );
    const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
    const form = ((settings.forms ?? {}) as Record<string, StoredForm | undefined>)[type];
    return { settings, form };
  }

  // ─── GET /forms?type=… ──────────────────────────────────────────────────────
  async getConfig(type: PublicFormType) {
    const { settings, form } = await this.loadForm(type);
    if (!form) throw fail('Форма не настроена', HttpStatus.NOT_FOUND);
    return {
      enabled: form.enabled !== false,
      title: form.title || '',
      description: form.description || '',
      successMessage: form.successMessage || '',
      errorMessage: form.errorMessage || '',
      consent: form.consent || DEFAULT_CONSENT,
      fields: activeFields(type, form.fields).map(f => ({
        key: f.key,
        label: f.label,
        inputType: f.inputType,
        required: f.required,
        defaultValue: f.defaultValue,
        options: resolveOptions(f.optionsSource, settings),
      })),
    };
  }

  // Whitelist по конфигу формы + обязательность + defaultValue (ТЗ v1.22.39). Лишнее от клиента отбрасывается.
  private cleanValues(fields: ActiveField[], values: Record<string, unknown>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const f of fields) {
      let v: unknown = values[f.key] ?? f.defaultValue;
      if (Array.isArray(v)) v = v.map(x => String(x).trim()).filter(Boolean);
      else if (v !== undefined && v !== null) v = String(v).trim();
      if (isEmpty(v)) {
        if (f.required) throw fail(`Заполните обязательное поле: ${f.label}`);
        continue;
      }
      if (f.inputType === 'multiselect' && !Array.isArray(v)) v = [v];
      if (f.inputType === 'number' && !Number.isFinite(Number(v))) throw fail(`Поле «${f.label}» должно быть числом`);
      if (typeof v === 'string' && v.length > MAX_FIELD_LEN) throw fail(`Поле «${f.label}» слишком длинное`);
      clean[f.key] = v;
    }
    return clean;
  }

  // Дубликат по ИНН / телефону (последние 10 цифр) / email среди неудалённых записей раздела.
  private async findDuplicate(type: 'supplier' | 'buyer', inn: string, phoneDigits: string, email: string): Promise<string> {
    const who = WHO[type];
    const checks: Array<[boolean, string, string, string]> = [
      [Boolean(inn), 'inn = $1', inn, `${who} с таким ИНН уже существует в базе`],
      [phoneDigits.length >= 10, `regexp_replace(phone, '\\D', '', 'g') LIKE $1`, `%${phoneDigits.slice(-10)}%`, `${who} с таким телефоном уже есть в базе`],
      [Boolean(email), 'lower(email) = $1', email, `${who} с таким email уже есть в базе`],
    ];
    for (const [on, cond, val, msg] of checks) {
      if (!on) continue;
      const { rows } = await this.db.withAdmin(c =>
        c.query(`SELECT 1 FROM ${TABLES[type]} WHERE ${cond} AND deleted_at IS NULL LIMIT 1`, [val]),
      );
      if (rows[0]) return msg;
    }
    return '';
  }

  // ─── POST /forms ────────────────────────────────────────────────────────────
  async submit(type: PublicFormType, body: Record<string, unknown>, ip: string, contentLength?: number) {
    if (contentLength && contentLength > MAX_BODY_BYTES) throw fail('Запрос слишком большой', HttpStatus.PAYLOAD_TOO_LARGE);
    if (rateLimited(ip)) {
      throw fail('Форма не доступна из-за частых запросов, попробуйте зайти позднее или обратиться в поддержку', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Антибот: бот получает «успех», в БД ничего не пишется.
    if (typeof body.honeypot === 'string' && body.honeypot.trim() !== '') return { success: true };
    if (Date.now() - Number(body.renderedAt || 0) < MIN_SUBMIT_MS) {
      throw fail('Подождите пару секунд и отправьте форму ещё раз');
    }
    if (body.consent !== true && body.consent !== 'true' && body.consent !== 'on') {
      throw fail('Необходимо согласие на обработку персональных данных');
    }

    const { settings, form } = await this.loadForm(type);
    if (!form || form.enabled === false) throw fail('Форма недоступна', HttpStatus.NOT_FOUND);

    const clean = this.cleanValues(activeFields(type, form.fields), (body.values ?? {}) as Record<string, unknown>);
    const str = (k: string) => String(clean[k] ?? '').trim();
    const phone = str('phone') || str('contactPhone');
    const email = str('email') || str('contactEmail');
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw fail('Некорректный email');

    const date = new Date().toISOString();
    const notifyBase = {
      db: this.db, formType: type, settings,
      name: str('tradeName') || str('contactName'), text: str('text'),
      phone, email: email.toLowerCase(), inn: str('inn'), city: str('city'), website: str('website'),
      buyerType: str('type'), category: str('category'),
      contactPref: [clean.contactPref].flat().filter(Boolean).join(', '),
      contactName: str('contactName'), contactRole: str('contactRole'),
      ip, date,
    };

    // Дедуп: запись НЕ создаётся, менеджеру уходит уведомление, посетителю — понятный отказ.
    if (type !== 'ticket') {
      const dup = await this.findDuplicate(type, str('inn'), phone.replace(/\D/g, ''), email.toLowerCase());
      if (dup) {
        await notify({ ...notifyBase, id: '', entityStatus: '', dedupHit: dup });
        throw fail(`${dup}. Заявка направлена менеджеру`, HttpStatus.CONFLICT);
      }
    }

    const { id, status } = await this.insert(type, clean, settings, date);
    await notify({ ...notifyBase, id, entityStatus: status, dedupHit: '' });
    return { success: true };
  }

  // Одна вставка с колонками реальной схемы (migrations/prod_baseline.sql + 0007). Ошибка БД — в лог и 500:
  // раньше «ступенчатый fallback» глотал её, и заявки молча терялись.
  private async insert(type: PublicFormType, clean: Record<string, unknown>, settings: Record<string, unknown>, date: string) {
    const prefs = [clean.contactPref].flat().filter(Boolean);
    const list = (v: unknown) => (Array.isArray(v) ? v : []);
    const history = (entry: object[]) => JSON.stringify(entry);
    const createdEntry = [{
      id: randomUUID(), date, field: 'создание', newValue: 'Заявка с сайта', userId: 'public-form', userName: SITE_SOURCE,
    }];

    let status = SITE_STATUS;
    let row: Record<string, unknown>;

    if (type === 'ticket') {
      status = SITE_TICKET_STATUS;
      row = {
        type: clean.type, status,
        subject: String(clean.text).slice(0, 120), // subject NOT NULL
        text: clean.text,
        contact_name: clean.contactName ?? null,
        contact_phone: clean.contactPhone ?? null,
        contact_email: clean.contactEmail ?? null,
        contact_prefs: JSON.stringify(prefs),
        from_api: true,
        history: history([]),
      };
    } else {
      row = {
        domain_id: DEFAULT_DOMAIN_ID,
        type: clean.type,
        trade_name: clean.tradeName,
        city: clean.city,
        website: clean.website ?? null,
        inn: clean.inn ?? null,
        contact_role: clean.contactRole ?? null,
        contact_name: clean.contactName,
        phone: clean.phone,
        email: clean.email,
        status,
        source: clean.source || SITE_SOURCE,
        contact_prefs: JSON.stringify(prefs),
        from_api: true,
        history: history(createdEntry),
      };
      if (type === 'supplier') {
        row.product_groups = list(clean.productGroups);
        row.own_brands = String(clean.ownBrands ?? '').split(',').map(s => s.trim()).filter(Boolean);
        row.services = [DEFAULT_SERVICE];
      } else {
        // «Оборот» в форме — подпись категории: возвращаем букву A/B/C (колонка NOT NULL DEFAULT 'C').
        const comments = buyerCategoryComments(settings);
        row.category = CATEGORY_KEYS.find(k => k === clean.category || comments[k] === clean.category);
        row.locations_count = clean.locationCount === undefined ? undefined : Number(clean.locationCount);
      }
    }

    const cols = Object.keys(row).filter(k => row[k] !== undefined);
    try {
      const id = await this.db.withAdmin(async c => {
        const { rows } = await c.query(
          `INSERT INTO ${TABLES[type]} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
          cols.map(k => row[k]),
        );
        const newId = String(rows[0].id);
        // Событие синка → pg_notify → SSE: заявка появляется в CRM сразу, без F5 (так же пишет /sync/ops).
        // Savepoint: сбой события не должен откатывать саму заявку.
        await c.query('SAVEPOINT form_event');
        try {
          await this.eventLog.record(c, {
            domain_id: DEFAULT_DOMAIN_ID,
            supplier_id: type === 'supplier' ? newId : null,
            entity: SYNC_ENTITY[type], op: 'create', entity_id: newId,
          });
        } catch (e) {
          await c.query('ROLLBACK TO SAVEPOINT form_event');
          console.error(JSON.stringify({ level: 'error', msg: 'public-form sync event failed', type, err: String(e) }));
        }
        return newId;
      });
      return { id, status };
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'public-form insert failed', type, err: String(e) }));
      throw fail('Не удалось сохранить заявку', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
