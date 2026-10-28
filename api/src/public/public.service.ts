import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FIELD_DEFS, DEFAULT_CONSENT, resolveOptions, PublicFormType } from './field-defs';
import { notify } from './notify';

// v1.33.1: публичные формы (лиды) — порт supabase/functions/public-form.
// Публичный доступ: rate-limit (10/мин/IP, скользящее окно), honeypot, задержка ≥2 сек,
// подтверждение согласия, дедуп ИНН/телефон/email по таблицам, 3-ступенчатый INSERT
// (полный → core → минимум), принудительный статус «Новый», уведомления (см. notify.ts).
// marketingKit вырезан (v1.33.0) — типов supplier/buyer/ticket.

const DEFAULT_DOMAIN_ID = '00000000-0000-4000-8000-000000000001';
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

interface FieldDefLite { key: string; label?: string; core?: boolean; alwaysShow?: boolean; defaultValue?: string | number; optionsSource?: string; inputType?: string; }

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

interface SettingsLeads { items?: Array<Record<string, unknown>>; }

@Injectable()
export class PublicService {
  constructor(private db: DatabaseService) {}

  private async readSettings() {
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT settings FROM public.app_settings WHERE id = 'global'`),
    );
    return (rows[0]?.settings ?? {}) as Record<string, unknown>;
  }

  // ─── GET /forms/:type/config ────────────────────────────────────────────────
  async getConfig(type: PublicFormType) {
    const settings = await this.readSettings();
    const forms = (settings.forms || {}) as Record<string, unknown>;
    const cfg = (forms[type] || {}) as Record<string, unknown>;
    const fieldDefs = FIELD_DEFS[type] || [];
    const visibleFields = (cfg.fields as Array<Record<string, unknown>> | undefined) ||
      fieldDefs.map(f => ({ key: f.key, visible: Boolean(f.core || f.alwaysShow) }));
    // v1.35.0: нормализация видимости. Core-поля видимы ВСЕГДА (иначе форма «теряла»
    // поля при старых конфигах, где visible стоял только у пары — симптом «формы из
    // двух полей»). Остальные — по флагу visible (не false).
    const fields = visibleFields
      .filter(f => fieldDefs.some(d => d.key === f.key))
      .map(f => {
        const def = fieldDefs.find(d => d.key === f.key) as FieldDefLite;
        const visible = Boolean(def.core) || (f.visible !== undefined ? f.visible !== false : Boolean(def.alwaysShow));
        // v1.35.2: подпись из дефиниции поля — старые конфиги хранили только key/visible.
        return { ...f, label: def.label || def.key, visible, options: resolveOptions(def.optionsSource, settings) };
      });
    return {
      enabled: cfg.enabled !== false,
      title: cfg.title || '',
      description: cfg.description || '',
      successMessage: cfg.successMessage || '',
      errorMessage: cfg.errorMessage || '',
      consent: cfg.consent || DEFAULT_CONSENT,
      fields,
    };
  }

  // ─── POST /forms/:type/submit ───────────────────────────────────────────────
  async submit(type: PublicFormType, body: Record<string, unknown>, ip: string, contentLength?: number) {
    if (contentLength && contentLength > 256 * 1024) {
      throw new BadRequestException('Слишком большой запрос');
    }
    if (rateLimited(ip)) {
      throw new BadRequestException('Слишком много запросов. Подождите минуту и попробуйте снова.');
    }
    const settings = await this.readSettings();
    const forms = (settings.forms || {}) as Record<string, unknown>;
    const cfg = (forms[type] || {}) as Record<string, unknown>;
    if (cfg.enabled === false) throw new BadRequestException('Форма отключена');

    const fieldDefs = FIELD_DEFS[type] || [];
    const now = new Date();

    // Совместимость двух контрактов: embed.js шлёт {data, loadedAt, website},
    // PublicFormPage — {values, renderedAt, honeypot} (в edge-функции совпадало только с embed.js).
    const data = (body.data ?? body.values ?? {}) as Record<string, unknown>;
    const loadedAt = Number(body.loadedAt ?? body.renderedAt ?? 0);
    const honeypot = body.website ?? body.honeypot;

    if (now.getTime() - loadedAt < 2000) {
      throw new BadRequestException('Подождите пару секунд и отправьте форму ещё раз');
    }
    if (typeof honeypot === 'string' && honeypot.trim() !== '') {
      return { success: true }; // honeypot — молча "успех"
    }

    const consentGiven = body.consent === true || body.consent === 'true';
    const leadDefaultStatus = (settings.leadDefaultStatus as string) || 'Новый';
    const leadDefaultType = (settings.leadDefaultType as string) || 'Поставщик/склад';

    if (cfg.requireConsent !== false && !consentGiven) {
      throw new BadRequestException('Необходимо подтвердить согласие на обработку персональных данных');
    }

    const visibleFields = ((cfg.fields as Array<Record<string, unknown>> | undefined) ||
      fieldDefs.map(f => ({ key: f.key, visible: Boolean(f.core || f.alwaysShow) })))
      .filter(f => fieldDefs.some(d => d.key === f.key));

    const values: Record<string, unknown> = {};
    for (const f of visibleFields) {
      const def = fieldDefs.find(d => d.key === f.key) as FieldDefLite;
      const value = data[f.key as string];
      if (value === undefined || value === null) continue;
      if (def.inputType === 'number') {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new BadRequestException(`Поле "${f.key}" должно быть числом`);
        values[f.key as string] = n;
      } else if (def.inputType === 'multiselect') {
        if (!Array.isArray(value)) throw new BadRequestException(`Поле "${f.key}" должно быть списком`);
        values[f.key as string] = value.map(v => String(v).trim()).filter(Boolean);
      } else {
        const s = String(value).trim();
        if (s.length > 2000) throw new BadRequestException(`Поле "${f.key}" слишком длинное`);
        values[f.key as string] = s;
      }
    }
    for (const def of fieldDefs) {
      if (def.core && !(def.key in values)) {
        throw new BadRequestException(`Заполните обязательное поле: ${def.key}`);
      }
    }

    const name = String(values.tradeName || values.companyName || values.contactName || '').trim();
    const text = String(values.text || '').trim();
    const phoneRaw = String(values.phone || values.contactPhone || '').trim();
    const phoneDigits = phoneRaw.replace(/\D/g, '');
    const emailRaw = String(values.email || values.contactEmail || '').trim().toLowerCase();
    const emailOk = !emailRaw || /^\S+@\S+\.\S+$/.test(emailRaw);
    const inn = String(values.inn || '').trim();
    const source = String(values.source || '').trim();
    const contactPref = Array.isArray(values.contactPref)
      ? (values.contactPref as string[]).join(', ')
      : String(values.contactPref || '').trim();
    const buyerType = String(values.type || leadDefaultType).trim();
    const category = String(values.category || '').trim();
    const responsibleId = typeof cfg.responsibleId === 'string' ? cfg.responsibleId : null;
    const date = now.toISOString();

    if (!name && !text) throw new BadRequestException('Заполните обязательные поля');
    if (!emailOk) throw new BadRequestException('Некорректный email');

    let dedupHit = '';
    const checkLeads = async (field: string, value: string) => {
      const { leads } = settings as { leads?: SettingsLeads };
      const items = leads?.items || [];
      const hit = items.find(l =>
        l.source === 'website' &&
        String(l[field] || '').trim() === value &&
        String(l.status || '') !== 'Отклонён' &&
        String(l.status || '') !== 'Отклонено');
      if (hit) dedupHit = `Лид ${field === 'inn' ? 'с таким ИНН' : field === 'phone' ? 'с таким телефоном' : 'с таким email'} уже есть в базе`;
    };
    // v1.33.3: дедуп unified — раньше блоки supplier/buyer дублировали друг друга (DRY).
    if ((type === 'supplier' || type === 'buyer') && inn) {
      const table = type === 'supplier' ? 'public.suppliers' : 'public.buyers';
      const who = type === 'supplier' ? 'Поставщик' : 'Покупатель';
      const hit = async (sql: string, val: string, msg: string) => {
        if (dedupHit) return;
        const { rows } = await this.db.withAdmin(c => c.query(sql, [val]));
        if (rows[0]) dedupHit = msg;
      };
      await hit(`SELECT id FROM ${table} WHERE inn = $1 AND deleted_at IS NULL LIMIT 1`, inn, `${who} с таким ИНН уже существует в базе`);
      if (phoneDigits.length >= 10) {
        await hit(`SELECT id FROM ${table} WHERE regexp_replace(phone, '\\D', '', 'g') LIKE $1 AND deleted_at IS NULL LIMIT 1`,
          `%${phoneDigits.slice(-10)}%`, `${who} с таким телефоном уже есть в базе`);
      }
      if (emailRaw) {
        await hit(`SELECT id FROM ${table} WHERE lower(email) = $1 AND deleted_at IS NULL LIMIT 1`, emailRaw, `${who} с таким email уже есть в базе`);
      }
      if (!dedupHit) await checkLeads('inn', inn);
      if (!dedupHit && phoneDigits) await checkLeads('phone', phoneDigits);
      if (!dedupHit && emailRaw) await checkLeads('email', emailRaw);
    }

    // Дедуп (как в edge function): БЕЗ создания записи — только уведомление менеджеру.
    if (dedupHit) {
      await notify({
        db: this.db, formType: type, id: '', entityStatus: '',
        settings, cfg, name, text, phone: phoneRaw, email: emailRaw, inn,
        city: String(values.city || '').trim(), website: String(values.website || '').trim(),
        buyerType, category, contactPref,
        contactName: String(values.contactName || '').trim(),
        contactRole: String(values.contactRole || '').trim(),
        leadType: type, dedupHit, ip, date,
      });
      throw new BadRequestException(`${dedupHit}. Заявка направлена менеджеру`);
    }

    let id = '';
    let entityStatus = type === 'ticket' ? 'Новый' : '';
    if (type === 'supplier' || type === 'buyer') {
      const history = {
        id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: date, by: 'Форма на сайте', changes: ['created'],
      };
      const base = {
        token: Math.random().toString(16).slice(2) + Date.now().toString(16),
        name, trade_name: name, type: buyerType, city: String(values.city || '').trim(),
        inn: inn || null, address: String(values.address || '').trim() || null,
        website: String(values.website || '').trim() || null, contact_name: String(values.contactName || '').trim() || null,
        contact_role: String(values.contactRole || '').trim() || null,
        phone: phoneRaw || null, email: emailRaw || null, contact_pref: contactPref || null,
        responsible_id: responsibleId, source: source || null,
        own_brands: Array.isArray(values.ownBrands) ? values.ownBrands : String(values.ownBrands || '').trim() || null,
        product_groups: Array.isArray(values.productGroups) ? values.productGroups : null,
        supplier_services: Array.isArray(values.services) ? values.services : null,
        buyer_category_comment: category || null,
        history: [history], status: leadDefaultStatus,
      };
      const table = type === 'supplier' ? 'public.suppliers' : 'public.buyers';
      const extra = type === 'buyer'
        ? { location_count: Number.isFinite(Number(values.locationCount)) ? Number(values.locationCount) : null }
        : { warehouse_count: Number.isFinite(Number(values.warehouseCount)) ? Number(values.warehouseCount) : null };
      const core = {
        token: base.token, name: base.name, trade_name: base.name, type: base.type, city: base.city,
        contact_name: base.contact_name, phone: base.phone, email: base.email,
        responsible_id: responsibleId, history: [history], status: leadDefaultStatus,
      };
      const min = {
        token: base.token, name: base.name, type: base.type, city: base.city,
        contact_name: base.contact_name, phone: base.phone, email: base.email,
      };
      const tryInsert = async (row: Record<string, unknown>): Promise<boolean> => {
        try {
          const cols = Object.keys(row);
          const r = await this.db.withAdmin(c =>
            c.query(
              `INSERT INTO ${table} (id, domain_id, ${cols.join(', ')}) VALUES (gen_random_uuid(), $1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING id`,
              [DEFAULT_DOMAIN_ID, ...cols.map(k => row[k])],
            ),
          );
          id = String(r.rows[0].id);
          return true;
        } catch {
          return false;
        }
      };
      if (!(await tryInsert({ ...base, ...extra }))) {
        if (!(await tryInsert(core))) {
          if (!(await tryInsert(min))) throw new BadRequestException('Не удалось сохранить заявку');
        }
      }
      entityStatus = leadDefaultStatus;
    } else if (type === 'ticket') {
      const r = await this.db.withAdmin(c =>
        c.query(
          `INSERT INTO public.tickets (id, type, status, source, contact_name, contact_phone, contact_email, contact_pref, text, created_at)
           VALUES (gen_random_uuid(), $1, 'Новый', 'website', $2, $3, $4, $5, $6, now()) RETURNING id`,
          [String(values.type || '').trim(), String(values.contactName || '').trim(), phoneRaw, emailRaw, contactPref, text],
        ),
      );
      id = String(r.rows[0].id);
      entityStatus = 'Новый';
    }

    await notify({
      db: this.db,
      formType: type,
      id, entityStatus,
      settings,
      cfg,
      name, text,
      phone: phoneRaw, email: emailRaw,
      inn, city: String(values.city || '').trim(),
      website: String(values.website || '').trim(),
      buyerType, category,
      contactPref,
      contactName: String(values.contactName || '').trim(),
      contactRole: String(values.contactRole || '').trim(),
      leadType: type,
      dedupHit,
      ip,
      date,
    });

    if (dedupHit) {
      throw new BadRequestException(`${dedupHit}. Заявка направлена менеджеру`);
    }
    return { success: true };
  }
}
