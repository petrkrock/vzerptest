import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export interface SyncEventPayload {
  domain_id: string;
  supplier_id?: string | null;
  entity: string;
  op: string;
  entity_id?: string | null;
}

@Injectable()
export class EventLogService {
  async record(client: PoolClient, evt: SyncEventPayload): Promise<number> {
    const { rows } = await client.query(
      `INSERT INTO sync_events (domain_id, supplier_id, entity, op, entity_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [evt.domain_id, evt.supplier_id ?? null, evt.entity, evt.op, evt.entity_id ?? null],
    );
    const id = rows[0].id as number;
    await client.query(`SELECT pg_notify('sync_events', $1)`, [JSON.stringify({ id })]);
    return id;
  }
}
