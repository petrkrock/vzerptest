import { BadRequestException, ForbiddenException, NotFoundException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  TOKEN_RE, pinOk, validateWarehouses, validateConditions, withStatuses,
} from './validators';

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
  contact_role?: string;
  phone?: string;
  email?: string;
  cab_contact?: string;
  cab_phone?: string;
  cab_email?: string;
  cab_edo?: string;
  responsible_id?: string;
  domain_id?: string;
  service_access?: Record<string, unknown> | null;
  pin?: string;
  status?: string;
  warehouse_locations?: Array<Record<string, unknown>>;
  service_search?: Array<Record<string, unknown>>;
  service_search_conditions?: Array<Record<string, unknown>>;
  lk_news_json?: string;
  lk_news?: Array<Record<string, unknown>>;
  history?: Array<Record<string, unknown>>;
  contacts?: Array<Record<string, unknown>>;
  deleted_at?: string;
  multi_warehouse?: boolean;
  edo_operator?: string;
  edo_token?: string;
  price_email?: string;
}

@Injectable()
export class LkService {
  constructor(private db: DatabaseService) {}

  // ─────────────────────────────────────────────────────────────
  // GET /lk?token= — только публичные данные (зеркало v1.31.18).
  // Защищённые данные отдаются после проверки PIN в post().
  // ─────────────────────────────────────────────────────────────
  async getInfo(token: string) {
    const supplier = await this.findByToken(token);
    const multiWarehouse = await this.readMultiwarehouse(supplier.id);
    const availableCities = await this.readCities();
    return {
      companyName: supplier.trade_name || supplier.name || '',
      inn: supplier.inn || '',
      contactName: supplier.contact_name || '',
      contactPhone: supplier.phone || '',
      contactEmail: supplier.email || '',
      multiWarehouse,
      hasPin: Boolean(this.readPin(supplier)),
      status: supplier.status || '',
      warehouses: supplier.warehouse_locations || [],
      availableCities,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // POST /lk — зеркало edge-функции supplier-service v1.31.18.
  // ─────────────────────────────────────────────────────────────
  async post(body: Record<string, unknown>) {
    const token = String(body.token || '');
    if (!TOKEN_RE.test(token)) throw new BadRequestException('Недействительная ссылка');
    const supplier = await this.findByToken(token);
    if (supplier.deleted_at) throw new NotFoundException('Ссылка недействительна или доступ отключён');
    if (!pinOk(this.readPin(supplier), body.pin)) {
      throw new ForbiddenException('Неверный PIN-код'); // эталон: 403, без блокировок
    }

    const settings = await this.readSettings();
    const patch: Record<string, unknown> = {};

    // 1. Склады (статусы склада ставит только менеджер в CRM — сохраняются из prev)
    if (body.warehouseLocations !== undefined || body.warehouses !== undefined) {
      const prev = (supplier.warehouse_locations || []) as Array<Record<string, unknown>>;
      const checked = validateWarehouses(body.warehouseLocations !== undefined ? body.warehouseLocations : body.warehouses, prev);
      if (typeof checked === 'string') throw new BadRequestException(checked);
      let next = checked as Array<Record<string, unknown>>;
      if ((await this.readMultiwarehouse(supplier.id)) === false) {
        const first = next.find(w => prev.some(p => p.id === w.id)) ||
          next.find(w => String(w.status || '') === 'Проверен') || next[0];
        next = first ? [first] : [];
      }
      patch.warehouse_locations = next;
    }

    // 2. Условия проценки (статусы условий выставляет сервер)
    if (body.serviceSearch !== undefined) {
      const ware = (patch.warehouse_locations ?? supplier.warehouse_locations ?? []) as Array<{ city: string }>;
      const checked = validateConditions(body.serviceSearch, ware);
      if (typeof checked === 'string') throw new BadRequestException(checked);
      const toStr = (arr: Array<Record<string, unknown>>) =>
        arr.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '')]))) as Array<Record<string, string>>;
      const prevConds = toStr((supplier.service_search_conditions || []) as Array<Record<string, unknown>>);
      patch.service_search = withStatuses(toStr(checked as Array<Record<string, unknown>>), prevConds);
    }

    // 3. Контакты кабинета
    if (body.contactName !== undefined) patch.contact_name = String(body.contactName || '');
    if (body.contactRole !== undefined) patch.contact_role = String(body.contactRole || '');
    if (body.phone !== undefined) patch.phone = String(body.phone || '');
    if (body.email !== undefined) patch.email = String(body.email || '');
    if (body.priceEmail !== undefined) patch.price_email = String(body.priceEmail || '');

    // 4. Принятие оферты (bridge v1.35: пишем и в service_access — зеркало эталона,
    //    и в offerContracts[0].acceptedEdition — для CRM «Настройки → Договоры оферты»)
    if (body.acceptOfferEdition !== undefined) {
      const edition = String(body.acceptOfferEdition || '');
      const sa = { ...(supplier.service_access || {}) };
      const changed = edition !== String(sa.offerAcceptedEdition || '');
      sa.offerAcceptedEdition = edition;
      const when = new Date().toISOString();
      await this.db.withAdmin(async c => {
        await c.query(
          `UPDATE public.suppliers SET service_access = $1::jsonb WHERE id = $2`,
          [JSON.stringify(sa), supplier.id],
        );
        await c.query(
          `UPDATE public.app_settings SET settings = jsonb_set(settings, '{offerContracts,0,acceptedEdition}'::text[], $1::jsonb, true) WHERE id = 'global'`,
          [JSON.stringify(edition)],
        );
      });
      if (changed) {
        const hist = Array.isArray(supplier.history) ? [...supplier.history] : [];
        hist.push({ id: `h-${Date.now()}`, date: when, userId: 'supplier-self', userName: 'Поставщик (ЛК)', field: 'lkOffer', oldValue: '', newValue: '', comment: 'Оферта принята' });
        await this.db.withAdmin(c =>
          c.query(`UPDATE public.suppliers SET history = $1::jsonb WHERE id = $2`, [JSON.stringify(hist.slice(-200)), supplier.id]),
        );
      }
      return { ok: true, acceptedEdition: edition };
    }

    // 5. Заявка на продвижение — форматы/тарифы из settings.mediaAdTypes,
    //    договор из settings.mediaContracts (эталон v1.31.18)
    if (body.mediaRequest) {
      const offer = (body.mediaRequest || {}) as Record<string, unknown>;
      const adTypes = ((settings.mediaAdTypes || []) as Array<Record<string, unknown>>)
        .filter(t => t.enabled !== false);
      const adt = adTypes.find(x => String(x.id) === String(offer.adTypeId || ''));
      if (!adt) throw new BadRequestException('Выберите формат размещения');
      const durations = (adt.durationOptions as Array<Record<string, unknown>>) || [];
      const dur = durations.find(x => String(x.id) === String(offer.durationOptionId || '')) || durations[0];
      if (!dur) throw new BadRequestException('Выберите период размещения');
      const contracts = ((settings.mediaContracts || []) as Array<Record<string, unknown>>)
        .filter(c => String(c.supplierId) === supplier.id);
      const act = contracts.find(c => c.status === 'Активный' && String(c.contractNo || '').trim()) ||
        contracts.find(c => c.status === 'Активный') ||
        [...contracts].sort((a, b) => String(b.contractDate || '').localeCompare(String(a.contractDate || '')))[0];
      if (!act) throw new BadRequestException('Нет действующего договора. Активируйте договор в разделе «Продвижение» или обратитесь к менеджеру.');
      const pricePerMonth = Number(adt.pricePerMonth) || 0;
      const months = Number(dur.periodMonths) || 1;
      const discount = Number(dur.discount) || 0;
      const total = pricePerMonth * months;
      const totalPrice = discount > 0 ? Math.round(total * (1 - discount / 100)) : total;
      const supplierName = supplier.trade_name || supplier.name || '';
      const rec = {
        id: `mr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        supplier_id: supplier.id,
        supplier_name: supplierName,
        ad_type_id: String(adt.id || ''),
        ad_type_name: String(adt.name || ''),
        duration_option_id: String(dur.id || ''),
        duration_label: String(dur.periodLabel || ''),
        price_per_month: pricePerMonth,
        total_price: totalPrice,
        discount,
        contract_no: String(act.contractNo || ''),
        contract_date: String(act.contractDate || ''),
        start_date: null,
        status: 'Заявка создана',
        notes: 'Заявка из ЛК (Продвижение)',
        created_at: new Date().toISOString(),
        history: [{ date: new Date().toISOString(), userId: 'supplier-self', userName: 'Поставщик (ЛК)', action: `Создана заявка из ЛК: ${adt.name || ''} / ${dur.periodLabel || ''}` }],
      };
      await this.db.withAdmin(async c => {
        await c.query(
          `INSERT INTO public.media_records (id, supplier_id, supplier_name, status, created_at, history, ad_type_id, ad_type_name, duration_option_id, duration_label, price_per_month, total_price, discount, contract_no, contract_date, start_date, notes)
           VALUES ($1,$2,$3,$4,now(),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [rec.id, rec.supplier_id, rec.supplier_name, rec.status, JSON.stringify(rec.history),
           rec.ad_type_id, rec.ad_type_name, rec.duration_option_id, rec.duration_label,
           rec.price_per_month, rec.total_price, rec.discount, rec.contract_no, rec.contract_date, rec.start_date, rec.notes],
        );
      });
      return { ok: true };
    }

    // 6. Заявка на новость (эталон: обязателен заголовок)
    if (body.marketNewsRequest) {
      const item = (body.marketNewsRequest || {}) as Record<string, unknown>;
      const title = String(item.title || '').trim();
      if (!title) throw new BadRequestException('Введите заголовок новости');
      const now2 = new Date().toISOString();
      const news = ((settings.marketNews || []) as Array<Record<string, unknown>>).slice(0, 3);
      const entry: Record<string, unknown> = {
        id: `mn-${Date.now()}`,
        supplierId: supplier.id,
        supplierName: supplier.trade_name || supplier.name || '',
        title,
        link: String(item.link || '').trim(),
        text: String(item.text || '').trim(),
        imageUrl: String(item.imageUrl || '').trim(),
        status: 'Новая',
        date: String(item.date || now2),
        createdAt: now2,
      };
      await this.saveSettings({ ...settings, marketNews: [entry, ...news] });
      return { ok: true };
    }

    // 7. Активация договора из ЛК — БЕЗ номера/даты (эталон): статус «Новый»,
    //    менеджер добивает № и дату в CRM. Идемпотентно.
    if (body.activateMediaContract) {
      const contracts = ((settings.mediaContracts || []) as Array<Record<string, unknown>>).slice();
      const existingBlank = contracts.find(c => String(c.supplierId) === supplier.id && !String(c.contractNo || '').trim());
      if (existingBlank) return { ok: true };
      const nc = {
        id: `mc-${Date.now()}`,
        supplierId: supplier.id,
        contractNo: '',
        contractDate: '',
        status: 'Новый',
        createdAt: new Date().toISOString(),
        history: [{ at: new Date().toISOString(), by: 'ЛК поставщика', action: 'Договор отправлен из ЛК (статус «Новый»)' }],
      };
      await this.saveSettings({ ...settings, mediaContracts: [...contracts, nc] });
      return { ok: true };
    }

    // 8. Материалы для продвижения (эталон: по recordId, проверка владения)
    if (body.materialRequest) {
      const mr = (body.materialRequest || {}) as Record<string, unknown>;
      const recordId = String(mr.recordId || '');
      const description = String(mr.description || '').trim();
      const imageUrl = String(mr.imageUrl || '').trim();
      if (!recordId) throw new BadRequestException('Не указана заявка');
      const { rows: found } = await this.db.withAdmin(c =>
        c.query(`SELECT id, status FROM public.media_records WHERE id = $1 AND supplier_id = $2 LIMIT 1`, [recordId, supplier.id]),
      );
      if (!found[0]) throw new BadRequestException('Заявка не найдена');
      if (String(found[0].status || '') !== 'Активный') throw new BadRequestException('Материалы можно приложить только к активной заявке');
      const { rows: recRows } = await this.db.withAdmin(c =>
        c.query(`SELECT history FROM public.media_records WHERE id = $1`, [recordId]),
      );
      const hist = Array.isArray(recRows[0]?.history) ? [...recRows[0].history] : [];
      hist.push({ date: new Date().toISOString(), userId: 'supplier-self', userName: 'Поставщик (ЛК)', action: 'Материал обновлён из ЛК' });
      const material: Record<string, unknown> = {};
      if (description) material.description = description;
      if (imageUrl) material.files = [imageUrl];
      await this.db.withAdmin(c =>
        c.query(`UPDATE public.media_records SET material = $1::jsonb, history = $2::jsonb, updated_at = now() WHERE id = $3`, [JSON.stringify(material), JSON.stringify(hist.slice(-200)), recordId]),
      );
      return { ok: true };
    }

    // 9. Редактирование своих новостей
    if (body.newsUpdate) {
      const nu = (body.newsUpdate || {}) as Record<string, unknown>;
      const id = String(nu.id || '');
      const nextNews = (((settings.marketNews || []) as Array<Record<string, unknown>>)
        .map(n => (String(n.id) === id && String(n.supplierId) === supplier.id
          ? { ...n, title: String(nu.title ?? n.title ?? ''), description: String(nu.description ?? n.description ?? ''), link: String(nu.link ?? n.link ?? ''), imageUrl: String(nu.imageUrl ?? n.imageUrl ?? ''), date: String(nu.date ?? n.date ?? '') }
          : n)));
      await this.saveSettings({ ...settings, marketNews: nextNews });
      return { ok: true };
    }

    if (body.edoOperator !== undefined) patch.edo_operator = String(body.edoOperator || '');
    if (body.edoToken !== undefined) patch.edo_token = String(body.edoToken || '');

    // Пустой PATCH = проверка PIN при входе → защищённые данные (эталон).
    if (Object.keys(patch).length === 0) {
      return this.protectedData(supplier, settings);
    }

    // Финальное сохранение патча + запись в историю (эталон).
    const history = Array.isArray(supplier.history) ? [...supplier.history] : [];
    history.push({
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      date: new Date().toISOString(),
      userId: 'supplier-self',
      userName: 'Поставщик (самообслуживание)',
      field: patch.service_search !== undefined ? 'serviceSearch' : patch.service_access !== undefined ? 'serviceAccess' : 'warehouseLocations',
      oldValue: '',
      newValue: JSON.stringify(patch),
      comment: 'Изменено через ссылку самообслуживания',
    });
    patch.history = history.slice(-200);
    patch.warehouse_count = (patch.warehouse_locations as unknown[])?.length ?? (supplier.warehouse_locations || []).length;
    patch.updated_at = new Date().toISOString();

    // jsonb-колонки — только строки с явным кастом: JS-массив/объект node-pg
    // сериализует как Postgres-array '{...}' → падение "invalid input syntax for type json".
    const JSONB = new Set(['warehouse_locations', 'service_search', 'history', 'contacts', 'service_access', 'lk_news']);
    const keys = Object.keys(patch);
    const sets = keys.map((k, i) => `${k} = $${i + 1}${JSONB.has(k) ? '::jsonb' : ''}`).join(', ');
    const vals = keys.map(k => JSONB.has(k) ? JSON.stringify(patch[k] ?? null) : patch[k]);
    await this.db.withAdmin(c =>
      c.query(`UPDATE public.suppliers SET ${sets} WHERE id = $${keys.length + 1}`, [...vals, supplier.id]),
    );

    // ТЗ v1.23.39: контакты/ИНН в POST-ответ — иначе ЛК терял их после сохранения.
    const c0 = Array.isArray(supplier.contacts) ? supplier.contacts[0] : undefined;
    return {
      ok: true,
      contactName: String(c0?.name ?? '') || supplier.contact_name || '',
      contactPhone: String(c0?.phone ?? '') || supplier.phone || '',
      contactEmail: String(c0?.email ?? '') || supplier.email || '',
      inn: supplier.inn || '',
      warehouses: patch.warehouse_locations ?? supplier.warehouse_locations ?? [],
      serviceSearch: patch.service_search ?? supplier.service_search ?? [],
      multiWarehouse: await this.readMultiwarehouse(supplier.id),
      availableCities: await this.readCities(),
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Защищённые данные после проверки PIN (зеркало protected-блока эталона)
  // ─────────────────────────────────────────────────────────────
  private async protectedData(supplier: SupplierRow, settings: Record<string, unknown>) {
    const sa = supplier.service_access || {};
    const offer = this.resolveOffer(settings);
    const resolved = this.resolveMediaContract(settings, supplier.id);
    const domain = await this.readDomain(supplier.domain_id);
    const placements = await this.readPlacements(supplier.id);
    const myNews = (((settings.marketNews || []) as Array<Record<string, unknown>>)
      .filter(n => String(n.supplierId) === supplier.id));
    const now = new Date().toISOString();

    return {
      ok: true,
      pinVerified: true,
      phone: supplier.phone || '',
      myNews,
      placements,
      // v1.35.3-fix3: фронт читает d.lkDomain.title — отдаём объект домена.
      lkDomain: domain ? {
        host: String(domain.host || ''),
        title: String(domain.title || ''),
        greeting: String(domain.greeting || ''),
      } : null,
      cabinetTitle: String(settings.cabinetTitle || ''),
      services: settings.lkServices || [],
      mediaContract: resolved ? {
        contractNo: resolved.contractNo,
        contractDate: resolved.contractDate,
        status: resolved.status,
      } : null,
      adFormats: settings.mediaAdTypes || [],
      // v1.35.3-fix3: фронт читает offer как объект {edition, name, text} —
      // отдаём оферту целиком (текст — в text, как в эталоне).
      offer: {
        name: String(offer.name || ''),
        edition: String(offer.edition || ''),
        lkTitle: String(offer.lkTitle || ''),
        lkGreeting: String(offer.lkGreeting || ''),
        text: String(offer.text || offer.lkOffer || ''),
      },
      offerAcceptedEdition: String(sa.offerAcceptedEdition || ''),
      lkOperator: String(settings.lkOperator || ''),
      cabinet: {
        contact: supplier.cab_contact || '',
        phone: supplier.cab_phone || '',
        email: supplier.cab_email || '',
        edo: supplier.edo_operator || supplier.edo_token || '',
      },
      companyName: supplier.trade_name || supplier.name || '',
      inn: supplier.inn || '',
      contactName: supplier.contact_name || '',
      contactRole: supplier.contact_role || '',
      contactPhone: supplier.phone || '',
      contactEmail: supplier.email || '',
      // v1.35.3-fix3: поля для блоков «О компании» (О поставщике/Ассортимент/Представитель).
      type: supplier.type || '',
      website: supplier.website || '',
      city: supplier.city || '',
      productGroups: supplier.product_groups || [],
      ownBrands: supplier.own_brands || [],
      supplierServices: supplier.services || [],
      multiWarehouse: await this.readMultiwarehouse(supplier.id),
      warehouses: supplier.warehouse_locations || [],
      serviceSearch: supplier.service_search || [],
      dashboard: await this.buildDashboard(settings),
      availableCities: await this.readCities(),
      serverTime: now,
    };
  }

  private async buildDashboard(settings: Record<string, unknown>) {
    const dset = settings as Record<string, unknown>;
    const { rows: dbB } = await this.db.withAdmin(c => c.query(`SELECT count(*)::int AS n FROM public.buyers`));
    const { rows: dbS } = await this.db.withAdmin(c => c.query(`SELECT count(*)::int AS n FROM public.suppliers`));
    const { rows: pricing } = await this.db.withAdmin(c => c.query(`SELECT service_search FROM public.suppliers`));
    const { rows: wh } = await this.db.withAdmin(c => c.query(`SELECT warehouse_locations FROM public.suppliers`));
    const pricingTotal = pricing.reduce((a: number, r: Record<string, unknown>) => a + ((r.service_search as unknown[]) || []).length, 0);
    const warehousesTotal = wh.reduce((a: number, r: Record<string, unknown>) => a + ((r.warehouse_locations as unknown[]) || []).length, 0);
    const skuTotal = wh.reduce((a: number, r: Record<string, unknown>) =>
      a + ((r.warehouse_locations as Array<Record<string, unknown>>) || []).reduce((x: number, w) => x + (Number(w.skuCount) || 0), 0), 0);
    return {
      banner: (dset.lkBanner as Record<string, unknown>) || { image: '', link: '' },
      lkLinks: (dset.lkLinks as Record<string, unknown>) || {},
      publishedNews: ((dset.marketNews as Array<Record<string, unknown>>) || [])
        .filter(n => n.status === 'Опубликовано').slice(0, 20),
      counters: (dset.lkDashboard as Record<string, unknown>) || { countersMode: 'manual', buyersCount: 500, suppliersCount: 500, skuCount: 350000 },
      dbBuyers: dbB[0]?.n ?? 0,
      dbSuppliers: dbS[0]?.n ?? 0,
      pricingTotal,
      warehousesTotal,
      skuTotal,
    };
  }

  // ── helpers ──────────────────────────────────────────────────

  private async findByToken(token: string): Promise<SupplierRow> {
    const { rows } = await this.db.withAdmin(c =>
      c.query(
        `SELECT * FROM public.suppliers
         WHERE service_access ->> 'token' = $1
           AND coalesce((service_access ->> 'enabled')::boolean, false) = true
         LIMIT 1`,
        [token],
      ),
    );
    if (!rows[0]) throw new NotFoundException('Ссылка недействительна или доступ отключён');
    return rows[0] as SupplierRow;
  }

  private readPin(s: SupplierRow): string | undefined {
    const saPin = (s.service_access as Record<string, unknown> | null)?.pin;
    if (typeof saPin === 'string' && saPin.trim()) return saPin.trim();
    return s.pin && s.pin.trim() ? s.pin.trim() : undefined;
  }

  private async readMultiwarehouse(id: string): Promise<boolean> {
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT multi_warehouse AS f FROM public.suppliers WHERE id = $1`, [id]),
    );
    return Boolean(rows[0]?.f);
  }

  private async readCities(): Promise<string[]> {
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT settings -> 'cities' AS cities FROM public.app_settings WHERE id = 'global'`),
    );
    return (rows[0]?.cities ?? []) as string[];
  }

  private async readDomain(domainId?: string) {
    if (!domainId) return null;
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT host, title, greeting FROM public.domains WHERE id = $1 LIMIT 1`, [domainId]),
    );
    return (rows[0] as Record<string, unknown>) || null;
  }

  private async readPlacements(supplierId: string) {
    const { rows } = await this.db.withAdmin(c =>
      c.query(
        `SELECT ad_type_id, ad_type_name, duration_label, start_date, status FROM public.media_records
         WHERE supplier_id = $1 AND status IN ('Активный','Завершено')
         ORDER BY created_at DESC LIMIT 20`,
        [supplierId],
      ),
    );
    return rows;
  }

  private async readSettings(): Promise<Record<string, unknown>> {
    const { rows } = await this.db.withAdmin(c =>
      c.query(`SELECT settings FROM public.app_settings WHERE id = 'global'`),
    );
    return (rows[0]?.settings as Record<string, unknown>) || {};
  }

  private async saveSettings(next: Record<string, unknown>) {
    await this.db.withAdmin(c =>
      c.query(`UPDATE public.app_settings SET settings = $1::jsonb, updated_at = now() WHERE id = 'global'`, [JSON.stringify(next)]),
    );
  }

  // Bridge v1.35: оферта для ЛК из offerContracts (CRM «Настройки → Договоры оферты»),
  // fallback — supplier_offer[0] (легаси-хранилище).
  private resolveOffer(settings: Record<string, unknown>) {
    const contracts = (settings.offerContracts as Array<Record<string, unknown>>) || [];
    const c0 = contracts.find(c => c.enabled) || contracts[0];
    const so = ((settings.supplier_offer as Array<Record<string, unknown>>) || [])[0];
    const base = so || {};
    return {
      name: String(c0?.name ?? base.name ?? ''),
      edition: String(c0?.edition ?? base.edition ?? ''),
      lkTitle: String(c0?.lkTitle ?? base.lkTitle ?? ''),
      lkGreeting: String(c0?.lkGreeting ?? base.lkGreeting ?? ''),
      lkOffer: String(c0?.lkOffer ?? base.text ?? base.lkOffer ?? ''),
      text: String(c0?.lkOffer ?? base.text ?? base.lkOffer ?? ''),
      acceptedEdition: String(c0?.acceptedEdition ?? base.acceptedEdition ?? ''),
    };
  }

  // Активный договор поставщика из settings.mediaContracts (приоритет: Активный с №).
  private resolveMediaContract(settings: Record<string, unknown>, supplierId: string) {
    const contracts = ((settings.mediaContracts || []) as Array<Record<string, unknown>>)
      .filter(c => String(c.supplierId) === supplierId);
    return contracts.find(c => c.status === 'Активный' && String(c.contractNo || '').trim()) ||
      contracts.find(c => c.status === 'Активный') ||
      [...contracts].sort((a, b) => String(b.contractDate || '').localeCompare(String(a.contractDate || '')))[0] ||
      null;
  }
}
