import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

export interface RequestUser {
  sub: string;
  email: string;
  role: string;
  domain_id: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 10),
  });

  // v1.32.4: пул служебного доступа (аналог service_role Supabase) — для ЛК по токену,
  // где авторизация = токен+PIN, а не JWT сотрудника. Роль с BYPASSRLS (app_admin),
  // строка подключения — DATABASE_URL_ADMIN. RLS не применяется, отвественность — в коде ЛК.
  private adminPool = new Pool({
    connectionString: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX || 10),
  });

  // v1.32.2: каждый запрос сотрудника — в транзакции с клеймами JWT (как request.jwt.claims
  // у Supabase). RLS-политики и хелперы (is_admin, current_domain_id, access_*)
  // работают без изменений. set_config(..., true) — клейм живёт только в транзакции.
  async withClaims<T>(user: RequestUser | null, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return this.run(this.pool, user, fn);
  }

  // Служебный доступ без клеймов (внутри транзакции).
  async withAdmin<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
    return this.run(this.adminPool, null, fn);
  }

  private async run<T>(
    pool: Pool,
    user: RequestUser | null,
    fn: (c: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const claims = user
        ? JSON.stringify({ sub: user.sub, email: user.email, role: user.role, domain_id: user.domain_id })
        : '{}';
      await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [claims]);
      if (user?.domain_id) {
        await client.query(`SELECT set_config('app.domain_id', $1, true)`, [user.domain_id]);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await Promise.all([this.pool.end(), this.adminPool.end()]);
  }
}
