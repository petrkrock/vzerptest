import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService, RequestUser } from '../database/database.service';
import { randomBytes } from 'crypto';

// v1.34.6: синк стора. Единственный транспорт к своему API (Supabase вырезан).
// Контракт: snapshot / saveSettings / applyOps (create|update|delete × 5 сущностей).
// Всё в одной транзакции: либо весь пакет, либо откат.
// PIN — только ручной (из карточки/выдачи ссылки). Автогенерации PIN нет.
// Токен ЛК генерируется только если его нет (для новых поставщиков).
// UUID-колонки (*_by, responsible_id) — не-UUID значения превращаются в NULL (иначе 500).

export interface SyncOp {
  entity: 'suppliers' | 'buyers' | 'tasks' | 'tickets' | 'mediaRecords';
  op: 'create' | 'update' | 'delete';
  id: string;
  data?: Record<string, unknown>;
}

const ENTITY_TABLE: Record<SyncOp['entity'], string> = {
  suppliers: 'public.suppliers',
  buyers: 'public.buyers',
  tasks: 'public.tasks',
  tickets: 'public.tickets',
  mediaRecords: 'public.media_records',
};
const DOMAIN_TABLES = new Set(['public.suppliers', 'public.buyers']);
const SOFT_DELETE_TABLES = new Set(Object.values(ENTITY_TABLE));

const SAFE_COL = /^[a-z][a-z0-9_]*$/;
const SYSTEM_COLS = new Set(['id', 'domain_id', 'deleted_at', 'created_at', 'updated_at']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUIRED_CREATE: Record<string, string[]> = {
  'public.suppliers': ['type', 'trade_name', 'city', 'contact_name', 'phone', 'email'],
  'public.buyers': ['type', 'trade_name', 'city', 'contact_name', 'phone', 'email'],
  'public.tasks': ['title', 'due_date'],
  'public.tickets': ['subject', 'text'],
  'public.media_records': ['supplier_id', 'supplier_name', 'ad_type_id', 'ad_type_name', 'status'],
};

const ARRAY_COLUMNS: Record<string, Set<string>> = {
  'public.suppliers': new Set(['product_groups', 'own_brands', 'services']),
  'public.buyers': new Set(),
  'public.tasks': new Set(),
  'public.tickets': new Set(),
  'public.media_records': new Set(),
};

const JSONB_COLUMNS = new Set([
  'contact_prefs', 'scoring', 'requisites', 'history', 'service_search', 'service_access', 'material',
]);

function snakize(data: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(data || {})
    .map(([k, v]) => [k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`), v] as [string, unknown])
    .filter(([k]) => SAFE_COL.test(k));
}

function toPgValue(col: string, v: unknown, arrayCols: Set<string>): unknown {
  // UUID-колонки: если пришла не-UUID строка (например, «АДМИН») — NULL, иначе 500.
  if (col.endsWith('_by') || col === 'responsible_id') {
    if (v == null) return null;
    const s = String(v);
    return UUID_RE.test(s) ? s : null;
  }
  if (arrayCols.has(col)) {
    if (v == null) return null;
    if (Array.isArray(v)) return v.map(x => String(x));
    return v;
  }
  if (JSONB_COLUMNS.has(col)) {
    return v == null ? null : JSON.stringify(v);
  }
  if (v && typeof v === 'object') return JSON.stringify(v);
  return v;
}

function paramExpr(col: string, idx: number, arrayCols: Set<string>): string {
  if (arrayCols.has(col)) return `$${idx}::text[]`;
  if (JSONB_COLUMNS.has(col)) return `$${idx}::jsonb`;
  return `$${idx}`;
}

@Injectable()
export class SyncService {
  constructor(private db: DatabaseService) {}

  // v1.35.3-fix5: реальные колонки таблиц (information_schema, кеш на процесс).
  // UPDATE/INSERT собираются по ключам данных фронта — если в БД нет хоть одной
  // колонки из пакета, вся запись молча не сохранялась (ссылка ЛК, PIN и пр.).
  // Теперь отсутствующие колонки пропускаются и пишутся в errors как инфо-запись.
  private tableColsCache = new Map<string, Set<string>>();
  private async tableCols(c: { query: (t: string, p?: unknown[]) => Promise<{ rows: Array<{ column_name: string }> }> }, table: string): Promise<Set<string>> {
    const hit = this.tableColsCache.get(table);
    if (hit) return hit;
    const [schema, name] = table.split('.');
    const { rows } = await c.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
      [schema, name],
    );
    const cols = new Set(rows.map(r => r.column_name));
    this.tableColsCache.set(table, cols);
    return cols;
  }

  async snapshot(user: RequestUser) {
    return this.db.withClaims(user, async c => {
      const { rows: s } = await c.query(
        `SELECT settings FROM public.app_settings WHERE id = 'global'`,
      );
      const one = async (table: string): Promise<unknown[]> => {
        const { rows } = await c.query(
          `SELECT * FROM public.${table} WHERE deleted_at IS NULL`,
        );
        return rows;
      };
      const [suppliers, buyers, tasks, tickets, mediaRecords] = await Promise.all([
        one('suppliers'), one('buyers'), one('tasks'), one('tickets'), one('media_records'),
      ]);
      return { settings: s[0]?.settings ?? null, suppliers, buyers, tasks, tickets, mediaRecords };
    });
  }

  saveSettings(user: RequestUser, settings: unknown) {
    if (!settings || typeof settings !== 'object') {
      throw new BadRequestException('Некорректные настройки');
    }
    return this.db.withClaims(user, async c => {
      await c.query(
        `INSERT INTO public.app_settings (id, settings)
         VALUES ('global', $1::jsonb)
         ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`,
        [JSON.stringify(settings)],
      );
      return { ok: true };
    });
  }

  async applyOps(user: RequestUser, ops: SyncOp[]) {
    if (!ops.length) return { ok: true, applied: 0 };
    if (ops.length > 200) throw new BadRequestException('Слишком большой пакет операций');

    return this.db.withClaims(user, async c => {
      let applied = 0;
      // v1.35.0: изоляция операций — SAVEPOINT на каждую запись. Одна битая строка
      // больше не откатывает весь пакет (симптомы «всё слетает при обновлении»);
      // ошибки возвращаются и уходят в журнал, причина видна текстом.
      const errors: Array<{ entity: string; op: string; id: string; error: string }> = [];
      await c.query('BEGIN');
      try {
        for (const raw of ops) {
          const sp = `sp_${applied}`;
          await c.query(`SAVEPOINT ${sp}`);
          let op: SyncOp;
          try {
            op = this.validateOp(raw);
          const table = ENTITY_TABLE[op.entity];
          const arrayCols = ARRAY_COLUMNS[table] ?? new Set<string>();
          // v1.35.3-fix5: сверяемся с РЕАЛЬНОЙ схемой БД. Колонки, которых в таблице
          // нет (дрейф схемы между миграциями), пропускаем — иначе падал весь
          // INSERT/UPDATE и запись не сохранялась (ссылка ЛК, PIN «слетали»).
          const realCols = await this.tableCols(c, table);
          const skippedCols: string[] = [];
          const knownFields = (entries: Array<[string, unknown]>) =>
            entries.filter(([k]) => {
              if (SYSTEM_COLS.has(k)) return false;
              if (realCols.has(k)) return true;
              skippedCols.push(k);
              return false;
            });

          if (op.op === 'create') {
            const data = { ...(op.data || {}) };
            this.assertRequiredFields(table, data);

            // v1.34.6: для поставщика генерируем ТОЛЬКО service_access.token,
            // если его нет (для ссылки ЛК). PIN не генерируем — он ручной.
            // v1.35.3: enabled НЕ ставим — самообслуживание активируется только
            // кнопкой «Выдать ссылку» в CRM (иначе доступ выдавался автоматически).
            if (table === 'public.suppliers') {
              const sa = data.serviceAccess as Record<string, unknown> | undefined;
              if (!sa || !sa.token) {
                data.serviceAccess = { ...(sa || {}), token: randomBytes(16).toString('hex') };
              }
            }

            const fields = knownFields(snakize(data));
            if (skippedCols.length) {
              errors.push({ entity: op.entity, op: op.op, id: op.id,
                error: `Пропущены отсутствующие в БД колонки: ${skippedCols.join(', ')}` });
            }
            const cols = ['id', ...(DOMAIN_TABLES.has(table) ? ['domain_id'] : []), ...fields.map(([k]) => k)];
            const placeholders: string[] = ['$1'];
            const vals: unknown[] = [op.id];

            if (DOMAIN_TABLES.has(table)) {
              if (!user.domain_id) throw new BadRequestException('Не задан домен пользователя');
              placeholders.push('$2');
              vals.push(user.domain_id);
            }
            fields.forEach(([k, v]) => {
              const idx = vals.length + 1;
              placeholders.push(paramExpr(k, idx, arrayCols));
              vals.push(toPgValue(k, v, arrayCols));
            });

            const updateSet = fields.length
              ? fields.map(([k]) => `${k} = EXCLUDED.${k}`).join(', ') + ', updated_at = now()'
              : 'updated_at = now()';

            await c.query(
              `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
               ON CONFLICT (id) DO UPDATE SET ${updateSet}`,
              vals,
            );
          } else if (op.op === 'update') {
            const fields = knownFields(snakize(op.data || {}));
            if (skippedCols.length) {
              // Инфо-запись в журнал CRM: какие колонки пропущены (схема БД старше кода).
              errors.push({ entity: op.entity, op: op.op, id: op.id,
                error: `Пропущены отсутствующие в БД колонки: ${skippedCols.join(', ')}` });
            }
            if (!fields.length) {
              applied++;
              continue;
            }

            const sets = fields.map(([k], i) => `${k} = ${paramExpr(k, i + 2, arrayCols)}`).join(', ');
            const vals: unknown[] = [op.id, ...fields.map(([k, v]) => toPgValue(k, v, arrayCols))];

            await c.query(`UPDATE ${table} SET ${sets} WHERE id = $1`, vals);
          } else {
            if (SOFT_DELETE_TABLES.has(table)) {
              if (user.role === 'admin') {
                await c.query(`DELETE FROM ${table} WHERE id = $1`, [op.id]);
              } else {
                await c.query(`UPDATE ${table} SET deleted_at = now() WHERE id = $1`, [op.id]);
              }
            } else {
              await c.query(`DELETE FROM ${table} WHERE id = $1`, [op.id]);
            }
          }
            applied++;
          } catch (e) {
            await c.query(`ROLLBACK TO SAVEPOINT ${sp}`);
            errors.push({
              entity: String(raw?.entity ?? '?'), op: String(raw?.op ?? '?'), id: String(raw?.id ?? '?'),
              error: String(e).slice(0, 300),
            });
          }
        }
        await c.query('COMMIT');
        return { ok: true, applied, errors };
      } catch (err) {
        await c.query('ROLLBACK');
        throw err;
      }
    });
  }

  private assertRequiredFields(table: string, data: Record<string, unknown>): void {
    const required = REQUIRED_CREATE[table] || [];
    for (const field of required) {
      const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const value = data[camel] ?? data[field];
      if (value == null || (typeof value === 'string' && !value.trim())) {
        throw new BadRequestException(`Не заполнено обязательное поле: ${field}`);
      }
    }
  }

  private validateOp(raw: SyncOp): SyncOp {
    if (!raw || typeof raw !== 'object') throw new BadRequestException('Некорректная операция');
    const entity = raw.entity;
    const op = raw.op;
    let id = raw.id as unknown;
    let data = raw.data as unknown;

    if ((id == null || id === '') && typeof data === 'string') {
      id = data;
      data = {};
    }
    if (typeof data === 'string') data = {};

    if (!entity || !(entity in ENTITY_TABLE)) throw new BadRequestException('Неизвестная сущность');
    if (op !== 'create' && op !== 'update' && op !== 'delete') {
      throw new BadRequestException('Неизвестная операция');
    }
    if (typeof id !== 'string' || !id) throw new BadRequestException('Нет id операции');
    if (data !== undefined && (typeof data !== 'object' || data === null || Array.isArray(data))) {
      throw new BadRequestException('data должен быть объектом');
    }

    return { entity, op, id, data: data as Record<string, unknown> | undefined };
  }
}