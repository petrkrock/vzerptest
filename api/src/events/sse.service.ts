import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { TicketService } from './ticket.service';
import { DatabaseService } from '../database/database.service';

interface SseClient {
  id: string;
  domainId: string;
  supplierId: string | null;
  res: any;
  lastId: number;
  addedAt: number;
}

const LK_GLOBAL_ENTITIES = new Set(['suppliers', 'settings', 'mediaRecords']);

@Injectable()
export class SseService implements OnModuleDestroy {
  private clients = new Map<string, SseClient>();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private seq = 0;

  constructor(private ticket: TicketService, private db: DatabaseService) {
    this.heartbeatTimer = setInterval(() => this.ping(), 25000);
  }

  onModuleDestroy() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const c of this.clients.values()) {
      try { c.res.destroy(); } catch {}
    }
    this.clients.clear();
  }

  stats() {
    const keys = new Map<string, number>();
    for (const c of this.clients.values()) {
      const key = `${c.domainId}:${c.supplierId ?? 'crm'}`;
      keys.set(key, (keys.get(key) ?? 0) + 1);
    }
    return { clients: this.clients.size, keys: Object.fromEntries(keys) };
  }

  async connectCrm(ticketId: string, lastId: number, res: any, origin?: string) {
    const t = await this.ticket.consume(ticketId);
    if (!t || t.supplier_id !== null) {
      this.writeHead(res, 403, origin).end();
      return;
    }
    await this.setupStream({ domainId: t.domain_id, supplierId: null, lastId, res, origin });
  }

  async connectLk(ticketId: string, lastId: number, res: any, origin?: string) {
    const t = await this.ticket.consume(ticketId);
    if (!t || t.supplier_id === null) {
      this.writeHead(res, 403, origin).end();
      return;
    }
    await this.setupStream({ domainId: t.domain_id, supplierId: t.supplier_id, lastId, res, origin });
  }

  onEvent(row: { id: number; domain_id: string; supplier_id: string | null; entity: string; op: string; entity_id: string | null }) {
    for (const client of this.clients.values()) {
      if (client.domainId !== row.domain_id) continue;
      if (client.supplierId) {
        if (row.supplier_id && row.supplier_id !== client.supplierId) continue;
        if (!row.supplier_id && !LK_GLOBAL_ENTITIES.has(row.entity)) continue;
      }
      this.writeEvent(client, row);
    }
  }

  private async setupStream(opts: { domainId: string; supplierId: string | null; lastId: number; res: any; origin?: string }) {
    const id = `${++this.seq}`;
    const client: SseClient = { id, domainId: opts.domainId, supplierId: opts.supplierId, res: opts.res, lastId: opts.lastId, addedAt: Date.now() };
    const key = `${opts.domainId}:${opts.supplierId ?? 'crm'}`;
    const same = [...this.clients.values()].filter(c => `${c.domainId}:${c.supplierId ?? 'crm'}` === key).sort((a, b) => a.addedAt - b.addedAt);
    while (same.length >= 5) {
      const old = same.shift()!;
      this.removeClient(old.id);
    }
    this.clients.set(id, client);
    this.writeHead(opts.res, 200, opts.origin, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    if (client.lastId > 0) {
      await this.sendBacklog(client);
    }
    opts.res.on('close', () => this.removeClient(id));
    opts.res.on('error', () => this.removeClient(id));
  }

  private writeHead(res: any, status: number, origin?: string, headers: Record<string, string> = {}) {
    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': origin || '*',
    };
    if (origin) corsHeaders['Access-Control-Allow-Credentials'] = 'true';
    res.writeHead(status, { ...corsHeaders, ...headers });
    return res;
  }

  private async sendBacklog(client: SseClient) {
    const rows = await this.db.withAdmin(async c => {
      if (client.supplierId) {
        return (await c.query(
          `SELECT id, entity, op, entity_id FROM sync_events
           WHERE domain_id = $1 AND (supplier_id = $2 OR (supplier_id IS NULL AND entity = ANY($3)))
             AND id > $4
           ORDER BY id ASC LIMIT 500`,
          [client.domainId, client.supplierId, ['suppliers', 'settings', 'mediaRecords'], client.lastId],
        )).rows;
      }
      return (await c.query(
        `SELECT id, entity, op, entity_id FROM sync_events
         WHERE domain_id = $1 AND id > $2
         ORDER BY id ASC LIMIT 500`,
        [client.domainId, client.lastId],
      )).rows;
    });
    const minRows = await this.db.withAdmin(c =>
      c.query(`SELECT MIN(id)::bigint AS min_id FROM sync_events`),
    );
    const minId = minRows.rows[0]?.min_id == null ? null : Number(minRows.rows[0].min_id);
    if (client.lastId > 0 && (minId === null || minId > client.lastId + 1)) {
      this.write(client, 'message', JSON.stringify({ type: 'resync_required' }));
      return;
    }
    if (rows.length) {
      const firstId = rows[0].id as number;
      if (firstId > client.lastId + 1) {
        this.write(client, 'message', JSON.stringify({ type: 'resync_required' }));
        return;
      }
    }
    for (const r of rows) {
      this.writeEvent(client, r);
    }
  }

  private writeEvent(client: SseClient, row: any) {
    const payload = JSON.stringify({ type: 'change', entity: row.entity, op: row.op, entityId: row.entity_id });
    this.writeRaw(client, `id: ${row.id}\nevent: message\ndata: ${payload}\n\n`);
  }

  private write(client: SseClient, event: string, data: string) {
    this.writeRaw(client, `event: ${event}\ndata: ${data}\n\n`);
  }

  private writeRaw(client: SseClient, chunk: string) {
    if (client.res.writableEnded || client.res.destroyed) {
      this.removeClient(client.id);
      return;
    }
    try {
      client.res.write(chunk);
    } catch {
      this.removeClient(client.id);
    }
  }

  private ping() {
    for (const client of this.clients.values()) {
      if (client.res.writableEnded || client.res.destroyed) {
        this.removeClient(client.id);
        continue;
      }
      try {
        client.res.write(': ping\n\n');
      } catch {
        this.removeClient(client.id);
      }
    }
  }

  private removeClient(id: string) {
    const c = this.clients.get(id);
    if (!c) return;
    this.clients.delete(id);
    try { c.res.destroy(); } catch {}
  }
}
