import { BadRequestException, NotFoundException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  TOKEN_RE, pinOk, validateWarehouses, validateConditions, withStatuses,
} from './validators';

const DEFAULT_DOMAIN_ID = '00000000-0000-4000-8000-000000000001';

const PIN_MAX_ATTEMPTS = 5;
const PIN_BLOCK_MS = 10 * 60 * 1000;
const pinFails = new Map<string, { count: number; blockedUntil: number }>();

function pinBlocked(token: string): boolean {
  const rec = pinFails.get(token);
  return Boolean(rec && Date.now() < rec.blockedUntil);
}
function pinFail(token: string) {
  const rec = pinFails.get(token);
  if (!rec || Date.now() >= rec.blockedUntil) {
    pinFails.set(token, { count: 1, blockedUntil: 0 });
  } else {
    rec.count += 1;
    if (rec.count >= PIN_MAX_ATTEMPTS) rec.blockedUntil = Date.now() + PIN_BLOCK_MS;
  }
}

interface SupplierRow {
  id: string;
  name?: string;
  trade_name?: string;
  city?: string;
  website?: string;
  type?: string;
  product_groups?: string[];
  own_brands?: string[];
  services?: string[];
  inn?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  cab_contact?: string;
  cab_phone?: string;
  cab_email?: string;
  domain_id?: string;
  service_access?: unknown;
  pin?: string;
  status?: string;
  pricing_status?: string;
  warehouse_count?: number;
  warehouse_locations?: Array<Record<string, unknown>>;
  service_search?: Array<Record<string, unknown>>;
  service_search_conditions?: Array<Record<string, unknown>>;
  pricing_accepted_at?: string;
  lk_operator?: string;
  lk_offer?: unknown;
  history?: Array<Record<string, unknown>>;
  deleted_at?: string;
  multiWarehouse?: boolean;
  multiwarehouse?: boolean;
  edo_operator?: string;
  edo_token?: string;
  price_email?: string;
}

@Injectable()
export class LkService {
  constructor(private db: DatabaseService) {}


  // v1.35.3: мост двух моделей оферты. CRM хранит договоры в settings.offerContracts
  // (Настройки → договоры оферты), ЛК исторически читал settings.supplier_offer[0].
  // Источник истины — ВКЛЮЧЁННЫЙ договор из offerContracts; легаси — fallback.
  private resolveOffer(settings: Record<string, unknown>): Record<string, unknown> {
    const contracts = (settings.offerContracts as Array<Record<string, unknown>>) || [];
    const active = contracts.find(c => c.enabled) || contracts[contracts.length - 1];
    if (active) {
      return {
        edition: active.edition || '',
        lkTitle: settings.lkTitle || '',
        lkGreeting: settings.lkGreeting || '',
        lkOffer: active.text || '',
      };
    }
    const legacy = settings.supplier_offer as unknown;
    return (Array.isArray(legacy) ? legacy[0] : {}) as Record<string, unknown>;
  }

  async getInfo(token: string) {
    const supplier = await this.findByToken(token);
    const multiWarehouse = await this.readMultiwarehouse(supplier.id);
    const availableCities = await this.db.withAdmin(async c => {
      const { rows } = await c.query(
        `SELECT settings -> 'cities' AS cities FROM public.app_settings WHERE id = 'global'`,
      );
      return (rows[0]?.cities ?? []) as string[];
    });

    return {
      companyName: supplier.trade_name || supplier.name || '',
      inn: supplier.inn || '',
      contactName: supplier.contact_name || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      city: supplier.city || '',
      website: supplier.website || '',
      type: supplier.type || '',
      productGroups: supplier.product_groups || [],
      ownBrands: supplier.own_brands || [],
      services: supplier.services || [],
      cabContact: supplier.cab_contact || '',
      cabPhone: supplier.cab_phone || '',
      cabEmail: supplier.cab_email || '',
      domainId: supplier.domain_id || DEFAULT_DOMAIN_ID,
      // v1.35.0: resolved заголовок для первичного рендера (после дашборда перебьётся
      // точным cabinetTitle с учётом домена).
      cabinetTitle: '',
      multiWarehouse,
      hasPin: Boolean(this.readPin(supplier)),
      status: supplier.status || '',
      pricingStatus: supplier.pricing_status || '',
      warehouses: supplier.warehouse_locations || [],
      availableCities,
    };
  }

  async post(body: Record<string, unknown>) {
    const token = String(body.token || '');
    if (!TOKEN_RE.test(token)) throw new BadRequestException('Недействительная ссылка');
    const supplier = await this.findByToken(token);

    if (supplier.deleted_at) {
      return { ok: true, dashboard: await this.dashboard(supplier, true) };
    }

    const pin = this.readPin(supplier);
    if (!pinOk(pin, body.pin)) {
      pinFail(token);
      throw new BadRequestException(
        pinBlocked(token)
          ? 'Слишком много попыток. Доступ по ссылке заблокирован на 10 минут.'
          : 'Неверный PIN-код',
      );
    }
    const settings = await this.readSettings();
    const now = new Date().toISOString();

    const patch: Record<string, unknown> = {};
    const saveWarehouseLocations = async () => {
      // v1.35.3: принимаем оба ключа (страница эволюционировала); город НЕ валидируем
      // по справочнику — склад может быть в любом городе (фикс боевого прогона).
      const locations = (supplier.warehouse_locations || []) as Array<Record<string, unknown>>;
      const input = body.warehouseLocations ?? body.warehouses;
      const checked = validateWarehouses(input, locations);
      if (typeof checked === 'string') throw new BadRequestException(checked);
      const prev = (supplier.warehouse_locations || []) as Array<Record<string, unknown>>;
      let next = checked;
      if (await this.readMultiwarehouse(supplier.id) === false) {
        const first = next.find(w => prev.some(p => p.id === w.id)) ||
          next.find(w => String(w.status || '') === 'Проверен') || next[0];
        next = first ? [first] : [];
      }
      patch.warehouse_locations = next;
      patch.warehouse_count = next.length;
    };
    const saveServiceSearch = () => {
      if (!Array.isArray(body.serviceSearch)) throw new BadRequestException('Некорректные данные проценки');
      if (body.serviceSearch.length > 50) throw new BadRequestException('Максимум 50 позиций проценки');
      for (const v of body.serviceSearch as Array<Record<string, unknown>>) {
        if (String(v?.article || '').length > 500 || String(v?.brand || '').length > 500 ||
            String(v?.name || '').length > 500) {
          throw new BadRequestException('Поле слишком длинное (макс. 500 символов)');
        }
      }
      patch.service_search = body.serviceSearch;
      patch.pricing_status = 'В работе';
    };
    const saveConditions = () => {
      const ware = (patch.warehouse_locations ?? supplier.warehouse_locations ?? []) as Array<{ city: string }>;
      const checked = validateConditions(body.conditions, ware);
      if (typeof checked === 'string') throw new BadRequestException(checked);
      const toStrRows = (arr: Array<Record<string, unknown>>) =>
        arr.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))) as Array<Record<string, string>>;
      const checkedStr = toStrRows(checked as Array<Record<string, unknown>>);
      const prevConditions = toStrRows((supplier.service_search_conditions || []) as Array<Record<string, unknown>>);
      patch.service_search_conditions = withStatuses(checkedStr, prevConditions);
    };
    const saveCabinetContacts = () => {
      for (const k of ['cabContact', 'cabPhone', 'cabEmail'] as const) {
        if (String(body[k] ?? '').length > 500) throw new BadRequestException('Поле слишком длинное (макс. 500 символов)');
      }
      patch.cab_contact = String(body.cabContact ?? '');
      patch.cab_phone = String(body.cabPhone ?? '');
      patch.cab_email = String(body.cabEmail ?? '');
    };
    const saveCabinetEdo = () => {
      const v = body.cabEdo;
      if (v !== undefined && v !== null && String(v).length > 500) {
        throw new BadRequestException('Поле слишком длинное (макс. 500 символов)');
      }
      patch.cab_edo = String(v ?? '');
    };
    const saveSupplierContacts = () => {
      if (body.contactName !== undefined) patch.contact_name = String(body.contactName ?? '');
      if (body.phone !== undefined) patch.phone = String(body.phone ?? '');
      if (body.email !== undefined) patch.email = String(body.email ?? '');
      if (body.contactRole !== undefined) patch.contact_role = String(body.contactRole ?? '');
    };
    const savePriceEmail = () => {
      if (body.priceEmail !== undefined) patch.price_email = String(body.priceEmail ?? '');
    };
    const saveEdo = () => {
      if (body.edoOperator !== undefined) patch.edo_operator = String(body.edoOperator ?? '');
      if (body.edoToken !== undefined) patch.edo_token = String(body.edoToken ?? '');
    };
    const ensurePricingAccepted = () => {
      if (!supplier.pricing_accepted_at) {
        throw new BadRequestException('Сначала примите условия оферты в ЛК поставщика');
      }
    };
    const buildOfferRows = (input: Array<Record<string, unknown>>, kinds: string[]) =>
      (Array.isArray(input) ? input : []).slice(0, 3).map(o => ({
        kind: String(o?.kind || ''),
        audience: String(o?.kind || ''),
        title: String(o?.title || ''),
        description: String(o?.description || ''),
        desiredDate: String(o?.desiredDate || ''),
        place: String(o?.place || ''),
        format: String(o?.format || ''),
        responsible: String(o?.responsible || ''),
        contact: String(o?.contact || ''),
        email: String(o?.email || ''),
        phone: String(o?.phone || ''),
      })).filter(o => kinds.includes(o.kind));

    if (body.acceptOfferEdition) {
      // v1.35.3: принятие оферты И ЕСТЬ принятие условий — предварительный гейт
      // pricing_accepted_at был замкнутым кругом (флаг не ставил никто).
      const edition = String(body.acceptOfferEdition);
      const { rows } = await this.db.withAdmin(c =>
        c.query(`SELECT settings FROM public.app_settings WHERE id = 'global'`),
      );
      const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
      const resolved = this.resolveOffer(settings);
      const acceptedEdition = String(resolved.acceptedEdition || '');
      const contracts = (settings.offerContracts as Array<Record<string, unknown>>) || [];
      const viaContracts = contracts.length > 0;
      const idx = viaContracts ? contracts.findIndex(c => c.enabled) : -1;
      const path = viaContracts && idx >= 0 ? `{offerContracts,${idx},acceptedEdition}` : '{supplier_offer,0,acceptedEdition}';
      const changed = edition !== acceptedEdition;
      const when = new Date().toISOString();
      await this.db.withAdmin(async c => {
        if (changed) {
          await c.query(
            `UPDATE public.app_settings SET settings = jsonb_set(settings, '${path}'::text[], $1::jsonb, true) WHERE id = 'global'`,
            [JSON.stringify(edition)],
          );
        }
        // v1.35.0: принятие оферты фиксирует принятие условий проценки (флаг больше не «висит»).
        await c.query(
          `UPDATE public.suppliers SET lk_offer_edition = $1, lk_offer_accepted_at = $2, pricing_accepted_at = $2 WHERE id = $3`,
          [edition, when, supplier.id],
        );
      });
      if (changed) {
        const to = process.env.OFFER_ACCEPT_NOTIFY_TO;
        if (to) {
          await this.db.withAdmin(async c => {
            const { rows: s } = await c.query(
              `SELECT trade_name FROM public.suppliers WHERE id = $1`, [supplier.id],
            );
            await c.query(
              `INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
               VALUES ('lk.offer_accepted', 'supplier', $1, $2)`,
              [supplier.id, JSON.stringify({
                edition, when,
                supplierName: s[0]?.trade_name || '',
                email: to,
                subject: `[ЛК] Принята оферта ${edition}`,
                text: `Поставщик «${s[0]?.trade_name || ''}» принял оферту ${edition}.`,
              })],
            );
          });
        }
      }
      return { ok: true, acceptedEdition: edition, alreadyAccepted: !changed, changed };
    }

    if (body.mediaRequest) {
      ensurePricingAccepted();
      const offer = (body.mediaRequest || {}) as Record<string, unknown>;
      if (!Array.isArray(offer.options) || !(offer.options as unknown[]).length) {
        throw new BadRequestException('Укажите хотя бы один формат');
      }
      if (String(offer.comment || '').length > 5000) throw new BadRequestException('Комментарий слишком длинный');
      const updates: Record<string, unknown> = {};
      if (offer.warehouseName) {
        const cities = ((settings.cities || []) as string[]).map(x => String(x).toLowerCase());
        const allowed = new Set(cities);
        const whs = (patch.warehouse_locations ?? supplier.warehouse_locations ?? []) as Array<Record<string, unknown>>;
        const wn = String(offer.warehouseName).trim();
        if (!allowed.has(wn.toLowerCase())) throw new BadRequestException(`Склад "${wn}" не входит в список доступных городов`);
        const hit = (whs || []).find(w => String(w.city).toLowerCase() === wn.toLowerCase());
        updates.media_warehouse = wn;
        updates.media_warehouse_address = hit ? String(hit.address || '') : '';
      }
      if (offer.dealerSiteUrl) {
        const ok = /^https?:\/\/[^\s/$.?#].[^\s]*$/.test(String(offer.dealerSiteUrl));
        if (!ok) throw new BadRequestException('Укажите корректный URL сайта дилера (https://…)');
      }
      await this.db.withAdmin(async c => {
        for (const [k, v] of Object.entries(updates)) {
          if (v !== undefined && v !== '') {
            await c.query(`UPDATE public.suppliers SET ${k} = $1 WHERE id = $2`, [String(v), supplier.id]);
          }
        }
        const { rows: mr } = await c.query(
          `SELECT id, history FROM public.media_records WHERE supplier_id = $1 AND status = 'Активный' AND coalesce(deleted_at::text, '') = '' ORDER BY created_at DESC LIMIT 1`,
          [supplier.id],
        );
        const rec = mr[0] as { id: string; history?: Array<Record<string, unknown>> } | undefined;
        if (rec) {
          const history = Array.isArray(rec.history) ? rec.history : [];
          const note = { id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: now, by: 'ЛК поставщика', kind: 'note', text: 'Поставщик подал заявку на продвижение' };
          await c.query(
            `UPDATE public.media_records SET history = $1, updated_at = now() WHERE id = $2`,
            [JSON.stringify([...history, note]), rec.id],
          );
        }
        await c.query(
          `INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
           VALUES ('lk.media_request', 'supplier', $1, $2)`,
          [supplier.id, JSON.stringify({ supplierId: supplier.id, supplierName: supplier.trade_name || '', contactName: supplier.cab_contact || supplier.contact_name || '', phone: supplier.cab_phone || supplier.phone || '', email: supplier.cab_email || supplier.email || '', at: now, ...offer })],
        );
      });
      return { ok: true };
    }

    if (body.marketNewsRequest) {
      ensurePricingAccepted();
      const items = ((body.marketNewsRequest as Record<string, unknown>)?.items || []) as Array<Record<string, unknown>>;
      if (!Array.isArray(items) || !items.length) throw new BadRequestException('Нет новостей для отправки');
      if (items.length > 10) throw new BadRequestException('Максимум 10 новостей за раз');
      for (const n of items) {
        if (!String(n?.title || '').trim() || !String(n?.body || '').trim()) {
          throw new BadRequestException('У каждой новости обязательны заголовок и текст');
        }
        if (String(n.title).length > 300 || String(n.body).length > 2000) {
          throw new BadRequestException('Новость слишком длинная (заголовок ≤300, текст ≤2000)');
        }
      }
      await this.db.withAdmin(async c => {
        const { rows: s } = await c.query(
          `SELECT lk_news_json, lk_news FROM public.suppliers WHERE id = $1`, [supplier.id],
        );
        let arr = [] as Array<Record<string, unknown>>;
        try {
          const parsed = JSON.parse(String(s[0]?.lk_news_json || '[]'));
          if (Array.isArray(parsed)) arr = parsed;
        } catch { arr = []; }
        const existing = Array.isArray(s[0]?.lk_news) ? (s[0]?.lk_news as Array<Record<string, unknown>>) : [];
        const next = [...arr, ...existing];
        for (const [i, n] of items.entries()) {
          next.push({
            id: `n-${Date.now()}-${i}`, title: String(n.title), body: String(n.body),
            status: 'Новая', createdAt: new Date().toISOString(),
          });
        }
        await c.query(
          `UPDATE public.suppliers SET lk_news_json = $1, lk_news = NULL WHERE id = $2`,
          [JSON.stringify(next), supplier.id],
        );
      });
      return { ok: true };
    }

    if (body.activateMediaContract) {
      ensurePricingAccepted();
      const amc = body.activateMediaContract as Record<string, unknown>;
      const code = String(amc.code || '');
      const date = String(amc.date || '');
      if (!code.trim()) throw new BadRequestException('Укажите номер договора');
      if (!date.trim()) throw new BadRequestException('Укажите дату договора');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Дата договора — формат ГГГГ-ММ-ДД');
      await this.db.withAdmin(async c => {
        const { rows: s } = await c.query(
          `SELECT media_contract_json, media_contract FROM public.suppliers WHERE id = $1`, [supplier.id],
        );
        let cur = {} as Record<string, unknown>;
        try {
          const parsed = JSON.parse(String(s[0]?.media_contract_json || '{}'));
          if (parsed && typeof parsed === 'object') cur = parsed;
        } catch { cur = {}; }
        const next = { ...cur, number: code, date, status: 'Действующий' };
        await c.query(
          `UPDATE public.suppliers SET media_contract_json = $1, media_contract = NULL WHERE id = $2`,
          [JSON.stringify(next), supplier.id],
        );
      });
      return { ok: true };
    }

    if (body.materialRequest) {
      ensurePricingAccepted();
      const request = (body.materialRequest || {}) as Record<string, unknown>;
      const at = new Date().toISOString();
      await this.db.withAdmin(async c => {
        const { rows: mr } = await c.query(
          `SELECT id, history FROM public.media_records WHERE supplier_id = $1 AND status = 'Активный' AND coalesce(deleted_at::text, '') = '' ORDER BY created_at DESC LIMIT 1`,
          [supplier.id],
        );
        const rec = mr[0] as { id: string; history?: Array<Record<string, unknown>> } | undefined;
        if (rec) {
          const history = Array.isArray(rec.history) ? rec.history : [];
          const note = { id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at, by: 'ЛК поставщика', kind: 'note', text: 'Запрошены материалы' };
          await c.query(
            `UPDATE public.media_records SET history = $1, updated_at = now() WHERE id = $2`,
            [JSON.stringify([...history, note]), rec.id],
          );
        }
        return c.query(
          `INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
           VALUES ('lk.material_request', 'supplier', $1, $2) RETURNING id`,
          [supplier.id, JSON.stringify({ supplierId: supplier.id, supplierName: supplier.trade_name || '', contactName: supplier.cab_contact || supplier.contact_name || '', phone: supplier.cab_phone || supplier.phone || '', email: supplier.cab_email || supplier.email || '', at, ...request })],
        );
      });
      return { ok: true };
    }

    if (body.newsUpdate) {
      const items = ((body.newsUpdate as Record<string, unknown>)?.items || []) as Array<Record<string, unknown>>;
      if (!Array.isArray(items)) throw new BadRequestException('Некорректный формат');
      const { rows: s } = await this.db.withAdmin(c =>
        c.query(`SELECT lk_news_json, lk_news FROM public.suppliers WHERE id = $1`, [supplier.id]),
      );
      let arr = [] as Array<Record<string, unknown>>;
      try {
        const parsed = JSON.parse(String(s[0]?.lk_news_json || '[]'));
        if (Array.isArray(parsed)) arr = parsed;
      } catch { arr = []; }
      const existing = Array.isArray(s[0]?.lk_news) ? (s[0]?.lk_news as Array<Record<string, unknown>>) : [];
      let all = [...arr, ...existing];
      for (const it of items) {
        const row = all.find(n => String(n.id) === String(it.id));
        if (row && (row.status === 'Новая' || row.status === 'Есть правки')) {
          row.title = String(it.title || row.title);
          row.body = String(it.body || row.body);
          row.status = 'Есть правки';
        }
      }
      await this.db.withAdmin(c =>
        c.query(
          `UPDATE public.suppliers SET lk_news_json = $1, lk_news = NULL WHERE id = $2`,
          [JSON.stringify(all), supplier.id],
        ),
      );
      return { ok: true };
    }

    const has = (...keys: string[]) => keys.some(k => body[k] !== undefined);
    if (has('warehouseLocations')) await saveWarehouseLocations();
    if (has('serviceSearch')) saveServiceSearch();
    if (has('conditions')) saveConditions();
    if (has('cabContact', 'cabPhone', 'cabEmail')) saveCabinetContacts();
    if (has('cabEdo')) saveCabinetEdo();
    if (has('contactName', 'phone', 'email', 'contactRole')) saveSupplierContacts();
    if (has('priceEmail')) savePriceEmail();
    if (has('edoOperator', 'edoToken')) saveEdo();

    if (body.offer) {
      const kind = String((body.offer as Record<string, unknown>)?.kind || '');
      if (!['advertising', 'news', 'b2b_activity'].includes(kind)) {
        throw new BadRequestException('Некорректный тип оферты');
      }
      const valid = ['advertising', 'news', 'b2b_activity'];
      patch.lk_offer = buildOfferRows([body.offer as Record<string, unknown>], valid)[0];
    }

    const patchKeys = Object.keys(patch);
    if (!patchKeys.length) {
      return { ok: true, dashboard: await this.dashboard(supplier) };
    }

    const history = Array.isArray(supplier.history) ? [...supplier.history] : [];
    history.push({
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: now, by: 'ЛК поставщика',
      changes: patchKeys,
    });

    const sets: string[] = ['history = $2', 'updated_at = $3'];
    const vals: unknown[] = [supplier.id, JSON.stringify(history), now];
    let idx = 4;
    for (const [k, v] of Object.entries(patch)) {
      sets.push(`${k} = $${idx++}`);
      vals.push(typeof v === 'object' && v !== null ? JSON.stringify(v) : (v as string | number | boolean | null));
    }

    await this.db.withAdmin(c =>
      c.query(
        `UPDATE public.suppliers SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        vals,
      ),
    );
    return { ok: true, saved: patchKeys };
  }

  private readPin(supplier: SupplierRow): string | undefined {
    // v1.35.3: приоритет service_access.pin (актуальное хранилище), колонка pin — fallback.
    const sa = supplier.service_access;
    if (sa && typeof sa === 'object' && 'pin' in (sa as Record<string, unknown>)) {
      const p = String((sa as Record<string, unknown>).pin ?? '').trim();
      if (p) return p;
    }
    if (supplier.pin != null && String(supplier.pin).trim()) return String(supplier.pin).trim();
    return undefined;
  }

  private async dashboard(supplier: SupplierRow, deletedView = false) {
    const settings = await this.readSettings();
    const now = new Date().toISOString();

    const [cabRes, dbRes, lkCounts, adsRes, tradeRows, pricingAgg, wareAgg, domRow] = await Promise.all([
      this.db.withAdmin(async c => {
        const { rows: u } = await c.query(
          `SELECT settings -> 'users' AS users FROM public.app_settings WHERE id = 'global'`,
        );
        const users = (u[0]?.users ?? []) as Array<Record<string, unknown>>;
        const rows = users.filter(x => x.lkCabinet === true || x.lk_cabinet === true);
        const sorted = rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
        const operator = sorted.length
          ? { name: String(sorted[0].name || ''), email: String(sorted[0].email || ''), phone: String(sorted[0].phone || '') }
          : null;
        const newsAll = users.filter(x => x.lkNews === true || x.lk_news === true);
        const tradeRows2 = users.filter(x => x.tradeCabinet === true || x.trade_cabinet === true);
        return { operator, newsAll, tradeRows2 };
      }),
      this.db.withAdmin(c =>
        c.query(`SELECT count(*)::bigint AS n FROM public.buyers`).then(r => Number(r.rows[0].n)),
      ),
      this.db.withAdmin(async c => {
        const { rows: s } = await c.query(
          `SELECT lk_news_json, lk_news FROM public.suppliers WHERE id = $1`, [supplier.id],
        );
        let arr = [] as Array<Record<string, unknown>>;
        try {
          const parsed = JSON.parse(String(s[0]?.lk_news_json || '[]'));
          if (Array.isArray(parsed)) arr = parsed;
        } catch { arr = []; }
        const existing = Array.isArray(s[0]?.lk_news) ? (s[0]?.lk_news as Array<Record<string, unknown>>) : [];
        const all = [...arr, ...existing];
        return {
          news: all.length,
          newNews: all.filter(n => n.status === 'Новая').length,
          fixNews: all.filter(n => n.status === 'Есть правки').length,
        };
      }),
      this.db.withAdmin(async c => {
        const { rows: mr } = await c.query(
          `SELECT id, contract_json, contract, history FROM public.media_records
           WHERE supplier_id = $1 AND status = 'Активный' AND coalesce(deleted_at::text, '') = ''
           ORDER BY created_at DESC LIMIT 1`, [supplier.id],
        );
        const rec = mr[0] as { id: string; contract_json?: string; contract?: unknown; history?: Array<Record<string, unknown>> } | undefined;
        if (!rec) return null;
        let contract = {} as Record<string, unknown>;
        try {
          const parsed = JSON.parse(String(rec.contract_json || '{}'));
          if (parsed && typeof parsed === 'object') contract = parsed;
        } catch { contract = {}; }
        if (!Object.keys(contract).length && rec.contract && typeof rec.contract === 'object') {
          contract = rec.contract as Record<string, unknown>;
        }
        const history = Array.isArray(rec.history) ? rec.history : [];
        return { id: rec.id, contract, history };
      }),
      this.db.withAdmin(async c => {
        const { rows: u } = await c.query(
          `SELECT settings -> 'users' AS users FROM public.app_settings WHERE id = 'global'`,
        );
        const users = (u[0]?.users ?? []) as Array<Record<string, unknown>>;
        return users.filter(x => x.tradeCabinet === true || x.trade_cabinet === true);
      }),
      this.db.withAdmin(c =>
        c.query(
          `SELECT count(*)::bigint AS offers, coalesce(sum(jsonb_array_length(coalesce(service_search, '[]'::jsonb))), 0)::bigint AS pricing_total
           FROM public.suppliers`, [],
        ).then(r => r.rows[0]),
      ),
      this.db.withAdmin(c =>
        c.query(
          `SELECT coalesce(sum(jsonb_array_length(coalesce(warehouse_locations, '[]'::jsonb))), 0)::bigint AS warehouses_total,
                  coalesce(sum((SELECT coalesce(sum((w->>'skuCount')::bigint), 0) FROM jsonb_array_elements(coalesce(warehouse_locations, '[]'::jsonb)) w)), 0)::bigint AS sku_total
           FROM public.suppliers`, [],
        ).then(r => r.rows[0]),
      ),
      this.db.withAdmin(c =>
        c.query(`SELECT * FROM commerce.domains WHERE id = $1 LIMIT 1`, [supplier.domain_id || DEFAULT_DOMAIN_ID])
          .then(r => r.rows[0]),
      ),
    ]);

    const newsAll = cabRes.newsAll;
    const sortedNews = [...newsAll].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    const sortedTrade = [...tradeRows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'));

    const offer = this.resolveOffer(settings);
    const offerAccepted = Boolean(supplier.pricing_accepted_at);
    const companiesCount = Number(pricingAgg?.offers || 0);
    const pricingTotal = Number(pricingAgg?.pricing_total || 0);
    const warehousesTotal = Number(wareAgg?.warehouses_total || 0);
    const skuTotal = Number(wareAgg?.sku_total || 0);

    const dom = domRow as Record<string, unknown> | undefined;

    return {
      ok: true,
      view: deletedView ? 'deleted' : 'active',
      companyName: supplier.trade_name || supplier.name || '',
      inn: supplier.inn || '',
      domainId: supplier.domain_id || DEFAULT_DOMAIN_ID,
      // v1.35.0: единый resolved-заголовок. Страница читает cabinetTitle (были
      // несовпадающие ключи lkDomain/cabinetTitle — заголовок не применялся никогда).
      domainTitle: dom?.title || offer.lkTitle || '',
      cabinetTitle: dom?.title || offer.lkTitle || 'Личный кабинет поставщика',
      lkOperator: supplier.lk_operator || '',
      lkCabinet: cabRes.operator,
      lkNewsAll: sortedNews,
      lkNewsTotal: sortedNews.length,
      tradeCabinet: sortedTrade.length
        ? { name: String(sortedTrade[0].name || ''), email: String(sortedTrade[0].email || ''), phone: String(sortedTrade[0].phone || '') }
        : null,
      tradeCabinetAll: sortedTrade,
      tradeTotal: sortedTrade.length,
      buyersCount: dbRes,
      status: supplier.status || '',
      statusHint: '',
      pricingStatus: supplier.pricing_status || '',
      pricingAcceptedAt: supplier.pricing_accepted_at || '',
      pricingAccepted: offerAccepted,
      offer: {
        edition: offer.edition || '',
        lkTitle: offer.lkTitle || '',
        lkGreeting: offer.lkGreeting || '',
        lkOffer: offer.lkOffer || '',
      },
      hasOfferChanges: false,
      offerChangedAt: '',
      companiesCount,
      pricingTotal,
      warehousesTotal,
      skuTotal,
      offerRows: {
        advertising: buildOfferRows(supplier.lk_offer, ['advertising']),
        news: buildOfferRows(supplier.lk_offer, ['news']),
        b2b_activity: buildOfferRows(supplier.lk_offer, ['b2b_activity']),
      },
      ads: adsRes,
      deletedView,
      multiWarehouse: await this.readMultiwarehouse(supplier.id),
      newsCount: lkCounts.news,
      newNews: lkCounts.newNews,
      fixNews: lkCounts.fixNews,
      statusCabinet: {
        status: supplier.status || '',
        pricingStatus: supplier.pricing_status || '',
        pricingAcceptedAt: supplier.pricing_accepted_at || '',
        pricingAccepted: offerAccepted,
      },
      availableCities: settings.cities || [],
      warehouses: supplier.warehouse_locations || [],
      serviceSearch: supplier.service_search || [],
      conditions: supplier.service_search_conditions || [],
      history: supplier.history || [],
      cabinetContacts: {
        contact: supplier.cab_contact || '', phone: supplier.cab_phone || '', email: supplier.cab_email || '',
      },
      cabinet: {
        tradeName: supplier.trade_name || supplier.name || '',
        city: supplier.city || '',
        inn: supplier.inn || '',
        website: supplier.website || '',
        type: supplier.type || '',
        productGroups: supplier.product_groups || [],
        ownBrands: supplier.own_brands || [],
        services: supplier.services || [],
        contactName: supplier.contact_name || '',
        contactPhone: supplier.phone || '',
        contactEmail: supplier.email || '',
        edoOperator: supplier.edo_operator || '',
        edoToken: supplier.edo_token || '',
        priceEmail: supplier.price_email || '',
        active: supplier.status === 'Активный',
      },
      createdAt: '',
      isTestCabinet: false,
      serverTime: now,
    };

    function buildOfferRows(input: unknown, kinds: string[]) {
      const arr = Array.isArray(input) ? input : input ? [input] : [];
      return arr.slice(0, 3).map(o => ({
        kind: String((o as Record<string, unknown>)?.kind || ''),
        audience: String((o as Record<string, unknown>)?.kind || ''),
        title: String((o as Record<string, unknown>)?.title || ''),
        description: String((o as Record<string, unknown>)?.description || ''),
        desiredDate: String((o as Record<string, unknown>)?.desiredDate || ''),
        place: String((o as Record<string, unknown>)?.place || ''),
        format: String((o as Record<string, unknown>)?.format || ''),
        responsible: String((o as Record<string, unknown>)?.responsible || ''),
        contact: String((o as Record<string, unknown>)?.contact || ''),
        email: String((o as Record<string, unknown>)?.email || ''),
        phone: String((o as Record<string, unknown>)?.phone || ''),
      })).filter(o => kinds.includes(o.kind));
    }
  }

  private async findByToken(token: string): Promise<SupplierRow> {
    if (!TOKEN_RE.test(token)) throw new BadRequestException('Недействительная ссылка');
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT * FROM public.suppliers WHERE service_access->>'token' = $1 LIMIT 1`, [token]),
    );
    const s = rows[0] as SupplierRow | undefined;
    if (!s) throw new NotFoundException('Ссылка недействительна или доступ отключён');
    return s;
  }

  private async readMultiwarehouse(id: string): Promise<boolean> {
    try {
      const { rows } = await this.db.withAdmin(c =>
        c.query(`SELECT multiwarehouse AS f FROM public.suppliers WHERE id = $1`, [id]),
      );
      return Boolean(rows[0]?.f);
    } catch {
      try {
        const { rows } = await this.db.withAdmin(c =>
          c.query(`SELECT multiWarehouse AS f FROM public.suppliers WHERE id = $1`, [id]),
        );
        return Boolean(rows[0]?.f);
      } catch {
        return false;
      }
    }
  }

  private async readSettings(): Promise<Record<string, unknown>> {
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT settings FROM public.app_settings WHERE id = 'global'`),
    );
    return (rows[0]?.settings ?? {}) as Record<string, unknown>;
  }
}