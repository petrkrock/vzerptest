import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Client } from 'pg';
import { SseService } from './sse.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PgListenerService implements OnModuleInit, OnModuleDestroy {
  private listener: Client;
  private lastId = 0n;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private sse: SseService, private db: DatabaseService) {
    this.listener = new Client({ connectionString: process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL });
    this.listener.on('notification', (msg) => {
      if (msg.channel !== 'sync_events' || !msg.payload) return;
      try {
        const payload = JSON.parse(msg.payload) as { id?: string };
        const id = BigInt(payload.id || '0');
        if (id <= this.lastId) return;
        void this.readAndEmit(id);
      } catch { /* ignore malformed */ }
    });
  }

  async onModuleInit() {
    await this.listener.connect();
    // Важно: сначала LISTEN, потом catch-up. Дедупликация ниже отсекает события, пришедшие дважды.
    await this.listener.query('LISTEN sync_events');
    this.cleanupTimer = setInterval(() => void this.cleanup(), 3600000);
    this.cleanupTimer.unref?.();
    void this.cleanup();
    const rows = await this.db.withAdmin(c =>
      c.query(
        `SELECT id, domain_id, supplier_id, entity, op, entity_id FROM sync_events WHERE id > $1::bigint ORDER BY id ASC`,
        [this.lastId.toString()],
      ),
    ).then(r => r.rows);
    for (const row of rows) {
      this.sse.onEvent(row);
      this.lastId = BigInt(row.id as string);
    }
  }

  async onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    await this.listener.end().catch(() => {});
  }

  private async cleanup(): Promise<void> {
    try {
      await this.db.withAdmin(async c => {
        await c.query(`DELETE FROM sync_events WHERE created_at < now() - interval '24 hours'`);
        await c.query(`DELETE FROM sse_tickets WHERE expires_at < now() - interval '1 hour'`);
      });
    } catch { /* таблицы ещё не созданы — повторим на следующем цикле */ }
  }

  private async readAndEmit(id: bigint) {
    const { rows } = await this.db.withAdmin(c =>
      c.query(
        `SELECT id, domain_id, supplier_id, entity, op, entity_id FROM sync_events WHERE id = $1::bigint`,
        [id.toString()],
      ),
    );
    if (!rows[0]) return;
    this.sse.onEvent(rows[0]);
    this.lastId = id;
  }
}
