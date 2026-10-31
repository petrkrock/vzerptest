import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService, RequestUser } from '../database/database.service';

@Injectable()
export class TicketService {
  constructor(private db: DatabaseService) {}

  async createCrm(user: RequestUser): Promise<{ ticket: string }> {
    const id = await this.db.withClaims(user, async c => {
      const { rows } = await c.query(
        `INSERT INTO sse_tickets (domain_id, expires_at) VALUES ($1, now() + interval '5 minutes') RETURNING id`,
        [user.domain_id],
      );
      return rows[0].id as string;
    });
    return { ticket: id };
  }

  async createLk(token: string): Promise<{ ticket: string }> {
    const { rows: srows } = await this.db.withAdmin(c =>
      c.query(
        `SELECT id, domain_id FROM public.suppliers WHERE service_access ->> 'token' = $1 AND coalesce((service_access ->> 'enabled')::boolean, false) = true LIMIT 1`,
        [token],
      ),
    );
    if (!srows[0]) throw new BadRequestException('Недействительная ссылка');
    const supplier = srows[0] as { id: string; domain_id: string };
    const { rows } = await this.db.withAdmin(c =>
      c.query(
        `INSERT INTO sse_tickets (domain_id, supplier_id, expires_at) VALUES ($1, $2, now() + interval '5 minutes') RETURNING id`,
        [supplier.domain_id, supplier.id],
      ),
    );
    return { ticket: rows[0].id as string };
  }

  async consume(ticketId: string): Promise<{ domain_id: string; supplier_id: string | null } | null> {
    const { rows } = await this.db.withAdmin(c =>
      c.query(
        `UPDATE sse_tickets SET used_at = now()
         WHERE id = $1 AND used_at IS NULL AND expires_at > now()
         RETURNING domain_id, supplier_id`,
        [ticketId],
      ),
    );
    if (!rows[0]) return null;
    return { domain_id: rows[0].domain_id as string, supplier_id: rows[0].supplier_id as string | null };
  }
}
