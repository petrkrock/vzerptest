import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, RequestUser } from './database/database.service';

// v1.32.3: общий CRUD поверх таблицы с RLS. Модули (suppliers/buyers) подключают его
// без дублирования кода. Расширение — только когда у сущности появится своя логика.
const SAFE_COL = /^[a-z][a-z0-9_]*$/;
const SYSTEM_COLS = new Set(['id', 'domain_id', 'deleted_at', 'created_at', 'updated_at']);

function editableEntries(body: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(body || {}).filter(
    ([k]) => SAFE_COL.test(k) && !SYSTEM_COLS.has(k),
  );
}

@Injectable()
export class DataAccess {
  constructor(protected db: DatabaseService) {}

  list(user: RequestUser, table: 'suppliers' | 'buyers') {
    return this.db
      .withClaims(user, c =>
        c.query(`SELECT * FROM public.${table} WHERE deleted_at IS NULL ORDER BY name`),
      )
      .then(r => r.rows);
  }

  async get(user: RequestUser, table: 'suppliers' | 'buyers', id: string) {
    const { rows } = await this.db.withClaims(user, c =>
      c.query(`SELECT * FROM public.${table} WHERE id = $1 AND deleted_at IS NULL`, [id]),
    );
    if (!rows[0]) throw new NotFoundException('Запись не найдена');
    return rows[0];
  }

  async create(user: RequestUser, table: 'suppliers' | 'buyers', body: Record<string, unknown>) {
    const fields = editableEntries(body);
    const names = fields.map(([k]) => k);
    const cols = ['id', 'domain_id', ...names].join(', ');
    const vals = ['gen_random_uuid()', '$1', ...names.map((_, i) => `$${i + 2}`)].join(', ');
    const { rows } = await this.db.withClaims(user, c =>
      c.query(
        `INSERT INTO public.${table} (${cols}) VALUES (${vals}) RETURNING *`,
        [user.domain_id, ...fields.map(([, v]) => v)],
      ),
    );
    return rows[0];
  }

  async update(user: RequestUser, table: 'suppliers' | 'buyers', id: string, body: Record<string, unknown>) {
    const fields = editableEntries(body);
    if (!fields.length) throw new NotFoundException('Нет полей для обновления');
    const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
    const { rows } = await this.db.withClaims(user, c =>
      c.query(
        `UPDATE public.${table} SET ${sets} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
        [id, ...fields.map(([, v]) => v)],
      ),
    );
    if (!rows[0]) throw new NotFoundException('Запись не найдена');
    return rows[0];
  }

  async remove(user: RequestUser, table: 'suppliers' | 'buyers', id: string) {
    const { rows } = await this.db.withClaims(user, c =>
      c.query(
        `UPDATE public.${table} SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL RETURNING id`,
        [id],
      ),
    );
    if (!rows[0]) throw new NotFoundException('Запись не найдена');
    return { ok: true };
  }
}
