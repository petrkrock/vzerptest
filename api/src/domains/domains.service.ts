import { BadRequestException, Injectable } from '@nestjs/common';
import { DatabaseService, RequestUser } from '../database/database.service';

// Дефолтный домен — не выключается и не удаляется (инвариант приложения, v1.31.18).
const DEFAULT_DOMAIN_ID = '00000000-0000-4000-8000-000000000001';

@Injectable()
export class DomainsService {
  constructor(private db: DatabaseService) {}

  list(user: RequestUser) {
    return this.db.withClaims(user, c =>
      c.query(`SELECT * FROM public.domains ORDER BY host`).then(r => r.rows),
    );
  }

  async create(user: RequestUser, body: { host?: string; name?: string; id?: string }) {
    const host = (body.host || '').trim().toLowerCase();
    if (!host) throw new BadRequestException('Укажите домен');
    const { rows } = await this.db.withClaims(user, c =>
      c.query(
        `INSERT INTO public.domains (id, host, name, is_active)
         VALUES (coalesce($1, gen_random_uuid()), $2, $3, true) RETURNING *`,
        [body.id || null, host, (body.name || '').trim()],
      ),
    );
    return rows[0];
  }

  async update(user: RequestUser, id: string, body: { is_active?: boolean }) {
    if (id === DEFAULT_DOMAIN_ID) {
      throw new BadRequestException('Дефолтный домен всегда активен');
    }
    const { rows } = await this.db.withClaims(user, c =>
      c.query(
        `UPDATE public.domains SET is_active = $2 WHERE id = $1 RETURNING *`,
        [id, Boolean(body.is_active)],
      ),
    );
    return rows[0];
  }

  // Удаление «с концами» (логика 1.31.18 перенесена в API, атомарно):
  // арендаторы (suppliers/buyers) перепривязываются на дефолт, затем домен удаляется.
  async remove(user: RequestUser, id: string) {
    if (id === DEFAULT_DOMAIN_ID) {
      throw new BadRequestException('Дефолтный домен не удаляется');
    }
    return this.db.withClaims(user, async c => {
      await c.query(
        `UPDATE public.suppliers SET domain_id = $1 WHERE domain_id = $2`,
        [DEFAULT_DOMAIN_ID, id],
      );
      await c.query(
        `UPDATE public.buyers SET domain_id = $1 WHERE domain_id = $2`,
        [DEFAULT_DOMAIN_ID, id],
      );
      await c.query(`DELETE FROM public.domains WHERE id = $1`, [id]);
      return { ok: true };
    });
  }
}
